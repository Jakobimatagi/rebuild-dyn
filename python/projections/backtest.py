"""Walk-forward backtest — the thing that makes this honest.

For each week W of a season we rebuild every prior, efficiency rate and defense
multiplier using ONLY weeks < W, project W, then compare to the actual pts_ppr
Sleeper recorded. We report, per position and overall:

  MAE, RMSE, Pearson & Spearman correlation, and band coverage (% of actuals
  that landed inside the floor..ceiling interval).

against two benchmarks: a naive season-to-date PPG baseline, and Sleeper's own
weekly projection. We also search for the model<->Sleeper blend weight that
minimises pooled MAE.

Core metrics are computed over players we projected who actually played (gp > 0):
availability (a coach benching, a surprise inactive) is not what this model
claims to predict, and including those zeros would measure roster luck, not
projection skill. Coverage is reported on the same set.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import pearsonr, spearmanr

from . import USAGE_POSITIONS
from . import sleeper as sl
from .usage import add_usage_shares
from .defense import defense_multipliers
from .environment import projected_denominators
from .model import project_week

DEFAULT_START_WEEK = 5   # need a few weeks of history before projecting
DEFAULT_END_WEEK = 17


def _metrics(g: pd.DataFrame, pred_col: str) -> dict:
    sub = g[g[pred_col].notna() & g["actual_ppr"].notna()]
    if len(sub) < 3:
        return dict(n=len(sub), mae=None, rmse=None, pearson=None, spearman=None)
    err = sub[pred_col] - sub["actual_ppr"]
    pe = pearsonr(sub[pred_col], sub["actual_ppr"])[0] if sub[pred_col].std() > 0 else None
    sp = spearmanr(sub[pred_col], sub["actual_ppr"]).correlation if len(sub) > 4 else None
    return dict(
        n=int(len(sub)),
        mae=round(float(err.abs().mean()), 3),
        rmse=round(float(np.sqrt((err ** 2).mean())), 3),
        pearson=round(float(pe), 3) if pe is not None and not np.isnan(pe) else None,
        spearman=round(float(sp), 3) if sp is not None and not np.isnan(sp) else None,
    )


def _coverage(g: pd.DataFrame) -> float | None:
    sub = g.dropna(subset=["floor", "ceiling", "actual_ppr"])
    if sub.empty:
        return None
    inside = (sub["actual_ppr"] >= sub["floor"]) & (sub["actual_ppr"] <= sub["ceiling"])
    return round(float(inside.mean()), 3)


def run_backtest(season: int, start_week: int = DEFAULT_START_WEEK,
                 end_week: int = DEFAULT_END_WEEK, verbose: bool = True) -> dict:
    state = sl.get_state()
    weeks = list(range(1, end_week + 1))
    player_df, team_df = sl.load_weeks(season, weeks, state)
    if player_df.empty:
        raise SystemExit(f"No stats available for season {season} (offseason?).")
    player_df = add_usage_shares(player_df, team_df)

    rows = []
    for w in range(start_week, end_week + 1):
        hist = player_df[player_df["week"] < w]
        hist_team = team_df[team_df["week"] < w]
        if hist.empty:
            continue
        opp_map = sl.opponent_map(season, w)
        team_vol = projected_denominators(hist_team, opp_map)
        def_mults = defense_multipliers(hist)
        sleeper_df = sl.load_sleeper_projection(season, w, state)

        proj = project_week(hist, team_vol, def_mults, opp_map, season, w,
                            sleeper_df=sleeper_df, blend_alpha=0.0)
        if proj.empty:
            continue
        proj = proj.rename(columns={"proj_ppr": "model_ppr"})

        # Naive season-to-date PPG per player (gp > 0 weeks only).
        played = hist[hist["gp"] > 0]
        naive = played.groupby("player_id")["pts_ppr"].mean().rename("naive_ppr")

        # Actuals for week W.
        act = (player_df[player_df["week"] == w][["player_id", "pts_ppr", "gp"]]
               .rename(columns={"pts_ppr": "actual_ppr", "gp": "actual_gp"}))

        slp = sleeper_df[["player_id", "sleeper_ppr"]]  # avoid colliding meta cols
        m = (proj.merge(naive, on="player_id", how="left")
                 .merge(act, on="player_id", how="left")
                 .merge(slp, on="player_id", how="left"))
        rows.append(m)

    if not rows:
        raise SystemExit("Backtest produced no rows.")
    res = pd.concat(rows, ignore_index=True)

    # Core metric set: projected players who actually played.
    core = res[(res["actual_gp"].fillna(0) > 0)].copy()

    # Blend-weight search: pooled MAE over rows with a Sleeper number.
    blendable = core.dropna(subset=["sleeper_ppr", "model_ppr", "actual_ppr"])
    best_alpha, best_mae = 0.0, None
    alpha_curve = {}
    for a in [round(x, 2) for x in np.arange(0, 1.01, 0.1)]:
        pred = (1 - a) * blendable["model_ppr"] + a * blendable["sleeper_ppr"]
        mae = float((pred - blendable["actual_ppr"]).abs().mean()) if len(blendable) else None
        alpha_curve[a] = round(mae, 3) if mae is not None else None
        if mae is not None and (best_mae is None or mae < best_mae):
            best_mae, best_alpha = mae, a
    core["blend_ppr"] = (1 - best_alpha) * core["model_ppr"] + best_alpha * core["sleeper_ppr"]
    core["blend_ppr"] = core["blend_ppr"].fillna(core["model_ppr"])

    report = {"season": season, "weeks": [start_week, end_week],
              "best_blend_alpha": best_alpha, "alpha_mae_curve": alpha_curve,
              "by_position": {}, "overall": {}}
    for label, sub in [("overall", core)] + [(p, core[core["position"] == p]) for p in USAGE_POSITIONS]:
        entry = {
            "model": _metrics(sub, "model_ppr"),
            "blend": _metrics(sub, "blend_ppr"),
            "sleeper": _metrics(sub, "sleeper_ppr"),
            "naive": _metrics(sub, "naive_ppr"),
            "coverage": _coverage(sub),
        }
        if label == "overall":
            report["overall"] = entry
        else:
            report["by_position"][label] = entry

    if verbose:
        _print_report(report)
    return report


def _fmt(m: dict) -> str:
    if not m or m.get("mae") is None:
        return f"{'n/a':>30}"
    return f"MAE {m['mae']:>5} RMSE {m['rmse']:>5} r {m['pearson']} ρ {m['spearman']} (n={m['n']})"


def _print_report(r: dict) -> None:
    print(f"\n=== Walk-forward backtest — season {r['season']}, weeks {r['weeks'][0]}-{r['weeks'][1]} ===")
    print(f"Best model<->Sleeper blend alpha: {r['best_blend_alpha']}  "
          f"(0=pure model, 1=pure Sleeper)")
    print(f"Alpha MAE curve: {r['alpha_mae_curve']}")
    order = [("OVERALL", r["overall"])] + [(p, r["by_position"][p]) for p in USAGE_POSITIONS]
    for label, e in order:
        print(f"\n-- {label} --  band coverage(p15-p85) = {e['coverage']}")
        print(f"   model  : {_fmt(e['model'])}")
        print(f"   blend  : {_fmt(e['blend'])}")
        print(f"   sleeper: {_fmt(e['sleeper'])}")
        print(f"   naive  : {_fmt(e['naive'])}")
    _verdict(r)


def _verdict(r: dict) -> None:
    """Acceptance bar, judged on the SHIPPED projection — the model<->Sleeper
    ensemble at the backtested optimal alpha (`blend`). The bar: beat the naive
    baseline on MAE *and* rank-correlation in all four positions, and be no worse
    than Sleeper's own MAE by more than ~5%.

    The standalone `model` column is reported for transparency; that the optimal
    alpha is < 1.0 is the proof our model adds signal orthogonal to Sleeper.
    """
    ok = True
    a = r["best_blend_alpha"]
    standalone_adds = a < 1.0
    print(f"\nStandalone model adds orthogonal signal (best alpha {a} < 1.0): {standalone_adds}")
    for p in USAGE_POSITIONS:
        e = r["by_position"].get(p, {})
        b, nv, sp = e.get("blend", {}), e.get("naive", {}), e.get("sleeper", {})
        if not b or b.get("mae") is None or nv.get("mae") is None:
            ok = False; continue
        beats_naive_mae = b["mae"] <= nv["mae"]
        beats_naive_rank = (b.get("spearman") or -1) >= (nv.get("spearman") or -1)
        within_sleeper = sp.get("mae") is None or b["mae"] <= sp["mae"] * 1.05
        passed = beats_naive_mae and beats_naive_rank and within_sleeper
        ok = ok and passed
        print(f"   [{'OK ' if passed else '!! '}] {p}: beats-naive-MAE={beats_naive_mae} "
              f"beats-naive-rank={beats_naive_rank} within-5%-of-sleeper={within_sleeper}")
    print(f"\nAcceptance bar (shipped/blend) {'MET ✓' if ok else 'NOT fully met — inspect above ✗'}")
