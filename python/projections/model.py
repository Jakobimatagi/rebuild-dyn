"""The projection model.

    projected box line = volume x efficiency
    points             = score(box line) x opponent_defense_multiplier

with Bayesian shrinkage on every share and efficiency rate, regressed toward
position priors by its own sample size (targets for receiving rates, carries for
rushing rates, games for usage shares). TD rates — the noisiest, least
predictive week-to-week quantity — carry the heaviest priors.

Volume comes from recency-weighted usage shares (usage.py) multiplied by the
projected team pie (environment.py). Opponent strength comes from defense.py.
Everything is transparent: each projection ships the component breakdown it was
built from, stored in `components` for the UI and for debugging.

Nothing here fetches data or knows about the target week's actuals — the caller
hands in history strictly before the target week, so a walk-forward backtest is
honest by construction.
"""

from __future__ import annotations

import os

import numpy as np
import pandas as pd
from scipy.stats import norm

from . import MODEL_VERSION, USAGE_POSITIONS
from .scoring import score_all
from .defense import get_multiplier

EWMA_HALFLIFE = 3.0  # weeks; player form decays a touch faster than team volume

# Position priors that small samples regress toward. Shares are league-typical
# fractions for a rotational player; efficiencies are league averages.
PRIORS = {
    "QB": dict(qb_pass_share=0.55, carry_share=0.05, ypa=7.0, pass_td_per_att=0.045,
               int_per_att=0.025, cmp_rate=0.64, ypc=4.5, rush_td_per_carry=0.05),
    "RB": dict(carry_share=0.12, target_share=0.06, snap_share=0.35, ypc=4.3,
               rush_td_per_carry=0.030, catch_rate=0.74, ypt=6.0, rec_td_per_tgt=0.020),
    "WR": dict(target_share=0.10, carry_share=0.005, snap_share=0.55, catch_rate=0.62,
               ypt=8.0, rec_td_per_tgt=0.045, air_yard_share=0.10,
               ypc=5.5, rush_td_per_carry=0.05),
    "TE": dict(target_share=0.08, carry_share=0.002, snap_share=0.55, catch_rate=0.65,
               ypt=7.2, rec_td_per_tgt=0.050, air_yard_share=0.06,
               ypc=3.0, rush_td_per_carry=0.02),
}

# Shrinkage strengths (pseudo-counts). Higher => regress harder to the prior.
K_SHARE = 2.5          # usage shares, in games
K_EFF = 12.0           # yards-per-opportunity / catch rate, in opportunities
K_TD = 60.0            # TD rates, in opportunities — heaviest by far
K_QB_VOL = 6.0         # QB attempt volume, in games

# A player's own recency-weighted PPG is a strong signal; a pure structural
# reconstruction throws it away and underperforms it. So the projection ANCHORS
# on recent PPG and lets the structural volume x efficiency model refine it:
#   base = STRUCT_WEIGHT * structural + (1 - STRUCT_WEIGHT) * recent_ppg
#   projection = base * opponent_multiplier (dampened by OPP_STRENGTH)
# Both are env-overridable so the backtest can grid-search them without edits.
STRUCT_WEIGHT = float(os.environ.get("PROJ_STRUCT_WEIGHT", 0.20))
OPP_STRENGTH = float(os.environ.get("PROJ_OPP_STRENGTH", 0.5))

# nflverse advanced-stat adjustments (see advanced.py). Default 0 = OFF, so the
# model is byte-identical to the Sleeper-only baseline unless explicitly enabled;
# the backtest grids these to decide whether they earn their place.
#   TGT_BLEND: weight given to nflverse's recency-weighted target share when
#              blended with the Sleeper-derived share (Sleeper already uses the
#              true team denominator, so this is expected to be ~neutral).
#   SNAP_ADJ:  exponent on (recent snap% / position snap prior) applied to
#              projected opportunity — the model otherwise ignores snaps entirely.
# SNAP_ADJ default 0.3 is validated by the walk-forward backtest (improves the
# standalone model across all positions, lifts the shipped blend, and shifts the
# optimal Sleeper alpha 0.9->0.8). TGT_BLEND defaults off — nflverse target share
# is redundant with Sleeper's (which already uses the true team denominator).
NFLV_TGT_BLEND = float(os.environ.get("PROJ_NFLV_TGT_BLEND", 0.0))
NFLV_SNAP_ADJ = float(os.environ.get("PROJ_NFLV_SNAP_ADJ", 0.3))

# nflverse per-week rate fields recency-weighted in weighted_features (weighted
# MEAN over weeks where present, not a sum — they're already rates/shares).
_NFLV_RATE_FIELDS = ("nflv_target_share", "nflv_snap_pct")

# Week-to-week residual spread per position, as a CV on the projection plus a
# small additive floor. Drives floor (p15) / ceiling (p85). Calibratable by the
# backtest (coverage report); these defaults sit near observed NFL variance.
POS_CV = {"QB": 0.34, "RB": 0.55, "WR": 0.62, "TE": 0.70}
POS_SD_FLOOR = {"QB": 3.0, "RB": 2.2, "WR": 2.2, "TE": 1.8}
Z_15_85 = float(norm.ppf(0.85))  # ~1.036

# Recency-weighted raw fields we accumulate per player.
_SUM_FIELDS = [
    "rec_tgt", "rush_att", "rec", "rec_yd", "rec_td", "rush_yd", "rush_td",
    "pass_att", "pass_cmp", "pass_yd", "pass_td", "pass_int", "fum_lost",
    "off_snp", "tm_off_snp", "rec_air_yd", "rec_rz_tgt", "rush_rz_att",
    "tm_rec_tgt", "tm_rush_att", "tm_rec_air_yd", "tm_rec_rz_tgt",
    "tm_rush_rz_att", "tm_pass_att",
]


def _shrink(obs, prior, n, k):
    """Bayesian-style shrinkage of an observed rate toward a prior by sample n."""
    return (n * obs + k * prior) / (n + k) if (n + k) > 0 else prior


def _safe_div(n, d):
    return n / d if d and d > 0 else 0.0


WEEKS_PER_SEASON = 22  # regular season + playoffs; spaces seasons on one timeline


def global_week(season: int, week: int) -> int:
    """A single monotonic week index across seasons, so recency weighting works
    when prior-season data is used as preseason history (2024 wk18 sits 5 'weeks'
    before 2025 wk1, not 17 weeks after it)."""
    return int(season) * WEEKS_PER_SEASON + int(week)


def weighted_features(history: pd.DataFrame, target_gweek: int,
                      halflife: float = EWMA_HALFLIFE) -> pd.DataFrame:
    """Recency-weighted accumulation of each player's raw volume from every week
    strictly before `target_gweek` (global week index), plus their latest
    position/name/team. One row per player. History may span multiple seasons."""
    if history.empty:
        return pd.DataFrame()
    df = history.copy()
    df["_gw"] = df["season"] * WEEKS_PER_SEASON + df["week"]
    df = df[df["_gw"] < target_gweek]
    if df.empty:
        return pd.DataFrame()
    df["_w"] = 0.5 ** ((target_gweek - df["_gw"]) / halflife)
    df["_n"] = np.where(df["gp"] > 0, df["_w"], 0.0)
    for f in _SUM_FIELDS:
        col = df[f] if f in df else 0.0
        df["wf_" + f] = pd.to_numeric(col, errors="coerce").fillna(0.0) * df["_w"]
    # Points sums use the games-played weight (_n) so inactive weeks don't drag
    # the recency-weighted PPG anchor toward zero.
    for f in ("pts_ppr", "pts_half_ppr", "pts_std"):
        df["wf_" + f] = pd.to_numeric(df[f], errors="coerce").fillna(0.0) * df["_n"]

    agg = {f"wf_{f}": "sum" for f in _SUM_FIELDS}
    agg.update({f"wf_{f}": "sum" for f in ("pts_ppr", "pts_half_ppr", "pts_std")})
    agg["_n"] = "sum"

    # nflverse rate fields: recency-weighted MEAN. Accumulate weight*value and
    # weight only over weeks where the value is actually present (a missing NGS or
    # snap row mustn't pull the mean toward zero), then divide after the groupby.
    nflv_present = [f for f in _NFLV_RATE_FIELDS if f in df.columns]
    for f in nflv_present:
        v = pd.to_numeric(df[f], errors="coerce")
        pres = v.notna()
        df[f"_nv_{f}"] = np.where(pres, v.fillna(0.0) * df["_w"], 0.0)
        df[f"_nd_{f}"] = np.where(pres, df["_w"], 0.0)
        agg[f"_nv_{f}"] = "sum"
        agg[f"_nd_{f}"] = "sum"

    feats = df.groupby("player_id").agg(agg)

    for f in nflv_present:
        nd = feats[f"_nd_{f}"]
        feats[f] = np.where(nd > 0, feats[f"_nv_{f}"] / nd, np.nan)
        feats[f"{f}_n"] = nd
        feats = feats.drop(columns=[f"_nv_{f}", f"_nd_{f}"])

    # Latest identity (most recent global week wins).
    latest = (df.sort_values("_gw").groupby("player_id")
                .agg(pos=("pos", "last"), name=("name", "last"), team=("team", "last")))
    return feats.join(latest).reset_index().rename(columns={"_n": "n_eff"})


def _project_player(row, team_vol, def_mults, opp) -> dict | None:
    pos = row["pos"]
    if pos not in USAGE_POSITIONS:
        return None
    pri = PRIORS[pos]
    n = float(row["n_eff"])

    # nflverse opportunity nudge from recent snap share — the model is otherwise
    # snap-blind. >1 lifts projected volume for locked-in high-snap roles, <1
    # trims rotational ones. Clamped so a noisy snap read can't blow up volume.
    snap_factor = 1.0
    if NFLV_SNAP_ADJ > 0:
        snap = row.get("nflv_snap_pct")
        base_snap = pri.get("snap_share", 0.95) or 0.95
        if snap is not None and not pd.isna(snap) and base_snap > 0:
            snap_factor = float(np.clip((float(snap) / base_snap) ** NFLV_SNAP_ADJ, 0.7, 1.3))

    def share(num_f, den_f, prior_key, k=K_SHARE):
        obs = _safe_div(row[f"wf_{num_f}"], row[f"wf_{den_f}"])
        return _shrink(obs, pri.get(prior_key, 0.0), n, k)

    def eff(num_f, den_f, prior_key, k):
        vol = row[f"wf_{den_f}"]
        obs = _safe_div(row[f"wf_{num_f}"], vol)
        return _shrink(obs, pri[prior_key], vol, k)

    tv = team_vol  # projected team denominators for this player's team
    line: dict[str, float] = {}
    comp: dict[str, float] = {}

    if pos == "QB":
        qb_pass_share = share("pass_att", "tm_pass_att", "qb_pass_share", K_QB_VOL)
        pass_att = qb_pass_share * tv.get("pass_att", 0.0)
        ypa = eff("pass_yd", "pass_att", "ypa", K_EFF)
        td_pa = eff("pass_td", "pass_att", "pass_td_per_att", K_TD)
        int_pa = eff("pass_int", "pass_att", "int_per_att", K_TD)
        line["pass_yd"] = pass_att * ypa
        line["pass_td"] = pass_att * td_pa
        line["pass_int"] = pass_att * int_pa
        comp.update(qb_pass_share=round(qb_pass_share, 3), proj_pass_att=round(pass_att, 1),
                    ypa=round(ypa, 2), pass_td_per_att=round(td_pa, 4))
    else:
        obs_ts = _safe_div(row["wf_rec_tgt"], row["wf_tm_rec_tgt"])
        nflv_ts = row.get("nflv_target_share")
        if NFLV_TGT_BLEND > 0 and nflv_ts is not None and not pd.isna(nflv_ts):
            obs_ts = (1 - NFLV_TGT_BLEND) * obs_ts + NFLV_TGT_BLEND * float(nflv_ts)
        comp["target_share"] = round(_shrink(obs_ts, pri["target_share"], n, K_SHARE), 3)
        comp["air_yard_share"] = round(share("rec_air_yd", "tm_rec_air_yd", "air_yard_share"), 3)
        targets = comp["target_share"] * tv.get("rec_tgt", 0.0) * snap_factor
        catch_rate = eff("rec", "rec_tgt", "catch_rate", K_EFF)
        ypt = eff("rec_yd", "rec_tgt", "ypt", K_EFF)
        rec_td_pt = eff("rec_td", "rec_tgt", "rec_td_per_tgt", K_TD)
        line["rec"] = targets * catch_rate
        line["rec_yd"] = targets * ypt
        line["rec_td"] = targets * rec_td_pt
        comp.update(proj_targets=round(targets, 1), catch_rate=round(catch_rate, 3),
                    ypt=round(ypt, 2), wopr=round(comp["target_share"] * 1.5
                                                  + comp["air_yard_share"] * 0.7, 3))

    # Rushing (RB/QB mainly, but WR/TE jet sweeps too).
    carry_share = share("rush_att", "tm_rush_att", "carry_share")
    carries = carry_share * tv.get("rush_att", 0.0) * snap_factor
    ypc = eff("rush_yd", "rush_att", "ypc", K_EFF)
    rush_td_pc = eff("rush_td", "rush_att", "rush_td_per_carry", K_TD)
    line["rush_yd"] = carries * ypc
    line["rush_td"] = carries * rush_td_pc
    if carries > 0.3:
        comp.update(carry_share=round(carry_share, 3), proj_carries=round(carries, 1))

    # Fumbles lost: tiny rate on touches, heavily regressed.
    touches_vol = row["wf_rush_att"] + row["wf_rec"]
    fum_rate = _shrink(_safe_div(row["wf_fum_lost"], touches_vol), 0.01, touches_vol, K_TD)
    proj_touches = line.get("rec", 0.0) + carries
    line["fum_lost"] = fum_rate * proj_touches

    comp["n_eff"] = round(n, 2)
    if snap_factor != 1.0:
        comp["nflv_snap_factor"] = round(snap_factor, 3)

    # The structural box line above is opponent-NEUTRAL — store it as-is so the
    # `box` shown in the UI stays interpretable. Score it for the structural
    # estimate, then combine with the player's recency-weighted PPG anchor and
    # apply the (dampened) opponent multiplier once, at the points level.
    struct = score_all(line)
    ppg = {
        "proj_ppr": _safe_div(row["wf_pts_ppr"], n),
        "proj_half": _safe_div(row["wf_pts_half_ppr"], n),
        "proj_std": _safe_div(row["wf_pts_std"], n),
    }
    mult = get_multiplier(def_mults, opp, pos)
    eff_mult = 1.0 + OPP_STRENGTH * (mult - 1.0)
    comp.update(def_mult=round(mult, 3), struct_ppr=struct["proj_ppr"],
                recent_ppg=round(ppg["proj_ppr"], 2), struct_weight=STRUCT_WEIGHT)

    scores = {}
    for k in ("proj_ppr", "proj_half", "proj_std"):
        base = STRUCT_WEIGHT * struct[k] + (1.0 - STRUCT_WEIGHT) * ppg[k]
        scores[k] = round(base * eff_mult, 2)
    return {**scores, "box": {k: round(v, 2) for k, v in line.items()}, "components": comp}


def _band(ppr: float, pos: str) -> tuple[float, float]:
    """Floor (p15) / ceiling (p85) from the position residual CV."""
    cv, sd0 = POS_CV[pos], POS_SD_FLOOR[pos]
    sigma = cv * max(ppr, 0.0) + sd0
    return round(max(0.0, ppr - Z_15_85 * sigma), 2), round(ppr + Z_15_85 * sigma, 2)


def project_week(history: pd.DataFrame, team_vol: dict[str, dict[str, float]],
                 def_mults: dict, opp_map: dict[str, str], season: int, week: int,
                 sleeper_df: pd.DataFrame | None = None, blend_alpha: float = 0.0,
                 min_n_eff: float = 0.4, halflife: float = EWMA_HALFLIFE,
                 team_override: dict[str, str] | None = None,
                 include_sleeper_only: bool = False) -> pd.DataFrame:
    """Project every active skill player for (season, week).

    blend_alpha: weight on Sleeper's own projection in the final number (0 = pure
        model). The backtest searches for the alpha that minimises MAE.
    halflife: recency half-life in weeks. Preseason uses a larger value so a full
        prior season counts, not just its final few weeks.
    team_override: player_id -> current team. In preseason, history carries last
        season's team; this maps offseason movers onto their new team (and thus
        the right opponent / team volume).
    include_sleeper_only: also emit players who have a Sleeper projection but no
        usable history (rookies, deep movers) straight from Sleeper, so the slate
        is complete before week 1.
    """
    target_gweek = global_week(season, week)
    feats = weighted_features(history, target_gweek, halflife)
    team_override = team_override or {}

    ppr_lk, half_lk, std_lk, meta = {}, {}, {}, {}
    if sleeper_df is not None and not sleeper_df.empty:
        for _, s in sleeper_df.iterrows():
            pid = str(s["player_id"])
            ppr_lk[pid] = s.get("sleeper_ppr")
            half_lk[pid] = s.get("sleeper_half")
            std_lk[pid] = s.get("sleeper_std")
            meta[pid] = s

    out = []
    projected = set()
    for _, row in (feats.iterrows() if not feats.empty else iter(())):
        pid = str(row["player_id"])
        if row["pos"] not in USAGE_POSITIONS or float(row["n_eff"]) < min_n_eff:
            continue
        team = team_override.get(pid, row["team"])
        opp = opp_map.get(team)
        if team is None or opp is None:  # team on bye / not scheduled this week
            continue
        tv = team_vol.get(team)
        if not tv:
            continue
        proj = _project_player(row, tv, def_mults, opp)
        if proj is None:
            continue

        ppr, half, std = proj["proj_ppr"], proj["proj_half"], proj["proj_std"]
        sleeper_ppr = ppr_lk.get(pid)
        if sleeper_ppr is not None and blend_alpha > 0:
            # Blend ALL three scoring formats with Sleeper, consistently, so a
            # Sleeper near-zero (unsettled preseason depth chart) can't leave
            # proj_ppr and proj_half/std wildly out of sync.
            a = blend_alpha
            proj["components"]["model_ppr"] = ppr
            proj["components"]["sleeper_ppr"] = round(sleeper_ppr, 2)
            ppr = round((1 - a) * ppr + a * sleeper_ppr, 2)
            half = round((1 - a) * half + a * float(half_lk.get(pid) or 0.0), 2)
            std = round((1 - a) * std + a * float(std_lk.get(pid) or 0.0), 2)
        elif sleeper_ppr is not None:
            proj["components"]["sleeper_ppr"] = round(sleeper_ppr, 2)

        floor, ceiling = _band(ppr, row["pos"])
        out.append({
            "season": season, "week": week, "player_id": pid,
            "position": row["pos"], "name": row["name"], "team": team, "opponent": opp,
            "proj_ppr": ppr, "proj_half": half, "proj_std": std,
            "floor": floor, "ceiling": ceiling,
            "components": {**proj["components"], "box": proj["box"]},
            "model_version": MODEL_VERSION,
        })
        projected.add(pid)

    # Preseason fill: players Sleeper projects but we have no history for.
    if include_sleeper_only:
        for pid, s in meta.items():
            if pid in projected:
                continue
            pos = s.get("position")
            if pos not in USAGE_POSITIONS:
                continue
            team = team_override.get(pid, s.get("team"))
            opp = opp_map.get(team) or s.get("opponent")
            if not team or not opp:
                continue
            ppr = round(float(s.get("sleeper_ppr") or 0.0), 2)
            floor, ceiling = _band(ppr, pos)
            out.append({
                "season": season, "week": week, "player_id": pid,
                "position": pos, "name": s.get("name"), "team": team, "opponent": opp,
                "proj_ppr": ppr,
                "proj_half": round(float(s.get("sleeper_half") or 0.0), 2),
                "proj_std": round(float(s.get("sleeper_std") or 0.0), 2),
                "floor": floor, "ceiling": ceiling,
                "components": {"source": "sleeper", "sleeper_ppr": ppr},
                "model_version": MODEL_VERSION,
            })
    return pd.DataFrame(out)
