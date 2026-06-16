"""CLI entry point.

  python -m projections backtest --season 2024 [--start-week 5 --end-week 17] [--write-readme]
  python -m projections project  --season 2024 --week 6 [--blend 0.8] [--top 25]
  python -m projections project  --season 2025 --week 1            # preseason works too
  python -m projections publish   --season 2025 --week <auto> [--blend 0.8]

`project` prints a spot-check; `publish` writes to Supabase (needs the
service-role key in python/.env). `--week auto` (publish default) uses the
current NFL state. Week 1 / preseason is supported: with no current-season data
the model backfills from prior seasons, places players on their current team,
and fills rookies from Sleeper's projection.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

import pandas as pd

from . import sleeper as sl
from .usage import add_usage_shares
from .advanced import maybe_attach_nflverse
from .defense import defense_multipliers
from .environment import projected_denominators
from .model import project_week, EWMA_HALFLIFE
from .backtest import run_backtest

EARLY_WEEK_CUTOFF = 3       # weeks 1-3: backfill with the prior season
PRESEASON_HALFLIFE = 9.0    # flatter recency so a whole prior season counts


def _current_team_map(state) -> dict[str, str]:
    """player_id -> current NFL team, from the live players feed. Maps offseason
    movers onto their new team for opponent / team-volume lookups."""
    players = sl.get_players()
    return {pid: p.get("team") for pid, p in players.items() if p.get("team")}


def build_projection(season: int, week: int, blend_alpha: float = 0.8):
    """Assemble history and project the target week.

    In-season this is just the current season's prior weeks. For week 1 (and
    early weeks) there's little or no current-season data, so we backfill with
    the prior season(s): players' last-season production anchors the projection,
    their CURRENT team (from the live roster feed) sets the matchup, and rookies
    / movers with no usable history come straight from Sleeper's projection.
    """
    state = sl.get_state()
    cur_p, cur_t = (sl.load_weeks(season, list(range(1, week)), state)
                    if week > 1 else (pd.DataFrame(), pd.DataFrame()))
    preseason = cur_p.empty

    frames = []  # (player_df, team_df), most-recent season first
    if not cur_p.empty:
        frames.append((cur_p, cur_t))
    if preseason or week <= EARLY_WEEK_CUTOFF:
        back = [season - 1, season - 2] if preseason else [season - 1]
        for s in back:
            pp, tt = sl.load_weeks(s, list(range(1, 19)), state)
            if not pp.empty:
                frames.append((pp, tt))
    if not frames:
        raise SystemExit(f"No stats available to anchor {season} week {week}.")

    player_df = add_usage_shares(
        pd.concat([f[0] for f in frames], ignore_index=True),
        pd.concat([f[1] for f in frames], ignore_index=True),
    )
    player_df = maybe_attach_nflverse(player_df)
    # Team volume + defense come from the single most-recent season with data.
    recent_p, recent_t = frames[0]
    recent_p = add_usage_shares(recent_p, recent_t)

    sleeper_df = sl.load_sleeper_projection(season, week, state)
    opp_map = sl.opponent_map(season, week) or sl.opponent_map_from_projection(sleeper_df)
    if not opp_map:
        raise SystemExit(f"No schedule or Sleeper opponents for season {season} week {week}.")

    team_vol = projected_denominators(recent_t, opp_map)
    def_mults = defense_multipliers(recent_p)
    # The live roster feed only matches the current/upcoming season — use it to
    # place offseason movers then, but not when projecting a past season.
    use_current_rosters = season >= int(state.get("season") or 0)
    team_override = (_current_team_map(state)
                     if use_current_rosters and (preseason or week <= EARLY_WEEK_CUTOFF) else None)

    return project_week(
        player_df, team_vol, def_mults, opp_map, season, week,
        sleeper_df=sleeper_df, blend_alpha=blend_alpha,
        halflife=PRESEASON_HALFLIFE if preseason else EWMA_HALFLIFE,
        team_override=team_override, include_sleeper_only=preseason,
    )


def _resolve_week(args) -> int:
    if args.week and args.week != "auto":
        return int(args.week)
    state = sl.get_state()
    wk = int(state.get("week") or 0)
    if wk <= 0:
        raise SystemExit("NFL state has no active week (offseason). Pass --week explicitly.")
    return wk


def _resolve_season(args) -> int:
    if getattr(args, "season", None):
        return int(args.season)
    return int(sl.get_state().get("season") or 0)


def cmd_nflverse_check(args):
    """Self-test the nflverse connection end to end: pull a season, build the ID
    crosswalk, join, and report coverage. No model wiring — just proves the data
    layer fetches, caches, and maps to Sleeper IDs."""
    from . import nflverse as nv
    from .advanced import advanced_features

    seasons = list(range(args.season - 2, args.season + 1))
    print(f"nflverse connection check — seasons {seasons[0]}-{seasons[-1]}\n")

    xwalk = nv.id_crosswalk(seasons)
    gsis = xwalk["gsis_id"].notna().sum() if "gsis_id" in xwalk.columns else 0
    pfr = xwalk["pfr_id"].notna().sum() if "pfr_id" in xwalk.columns else 0
    print(f"crosswalk: {len(xwalk)} sleeper ids  |  gsis linked {gsis}  |  pfr linked {pfr}")

    feats = advanced_features(seasons)
    if feats.empty:
        print("\nNo features produced — check upstream availability.")
        return
    cols = [c for c in feats.columns if c.startswith("nflv_")]
    print(f"\nfeatures: {len(feats):,} player-week rows  |  {len(cols)} nflv_* columns")
    print(f"unique players mapped to a sleeper id: {feats['sleeper_id'].nunique()}")
    print("\nper-column non-null coverage:")
    for c in cols:
        nn = feats[c].notna().sum()
        print(f"  {c:32s} {nn:6,d}  ({100*nn/len(feats):4.0f}%)")

    # Spot-check: most-targeted receivers in the target season by nflverse share.
    tgt = feats[feats["season"] == args.season]
    if "nflv_target_share" in tgt.columns and not tgt.empty:
        top = (tgt.groupby("sleeper_id")["nflv_target_share"].mean()
               .sort_values(ascending=False).head(8))
        names = _sleeper_names()
        print(f"\ntop avg target share — {args.season} (sleeper_id -> name):")
        for sid, v in top.items():
            print(f"  {sid:>8s}  {names.get(sid, '?'):24s} {v:.3f}")


def _sleeper_names() -> dict:
    try:
        players = sl.get_players()
        return {pid: (p.get("full_name") or "") for pid, p in players.items()}
    except Exception:
        return {}


def cmd_scheme_check(args):
    """Self-test the pbp scheme + coach aggregation: build fingerprints for a
    couple seasons and print spot-checks that should match the eye test."""
    from .scheme import team_scheme_seasons, coach_history, player_utilization_seasons

    seasons = [args.season - 1, args.season]
    print(f"scheme fingerprints — seasons {seasons[0]}-{seasons[-1]}\n")
    sf = team_scheme_seasons(seasons)
    if sf.empty:
        print("No scheme rows produced — check upstream availability.")
        return
    cur = sf[sf["season"] == args.season].copy()
    print(f"{len(sf)} team-season rows  |  {len(cur)} teams in {args.season}\n")

    def top(col, label, n=5, asc=False):
        s = cur.sort_values(col, ascending=asc).head(n)
        print(f"-- {label} ({args.season}) --")
        for _, r in s.iterrows():
            print(f"   {r['team']:>3}  {col}={r[col]}  coach={r['head_coach']}")
        print()

    top("proe", "Most pass-over-expected (PROE)")
    top("adot", "Deepest avg air yards (aDOT)")
    top("epa_play", "Best offensive EPA/play")
    top("no_huddle_rate", "Most no-huddle")

    ch = coach_history(seasons)
    primary = ch[ch["primary"]]
    print(f"coach history: {len(ch)} stints, {primary['head_coach'].nunique()} primary HCs")
    # Spot-check a few stable franchises against known coaches.
    for team in ("KC", "BAL", "SF", "PHI"):
        row = primary[(primary["season"] == args.season) & (primary["team"] == team)]
        if not row.empty:
            print(f"   {team} {args.season}: {row.iloc[0]['head_coach']}")

    # Historical utilization — true pbp shares. Test a recent + a deep-history
    # season (pre-Sleeper) to prove 1999+ reach and the sleeper_id linkage.
    print()
    for yr in (args.season, 2005):
        util = player_utilization_seasons([yr])
        if util.empty:
            print(f"utilization {yr}: no rows")
            continue
        linked = util["sleeper_id"].notna().sum() if "sleeper_id" in util.columns else 0
        top = util.sort_values("target_share", ascending=False).head(3)
        print(f"utilization {yr}: {len(util)} player-team rows, {linked} sleeper-linked. Top target shares:")
        for _, r in top.iterrows():
            sid = r.get("sleeper_id")
            print(f"   {r['team']:>3} {r['name']:<22} tgt%={r['target_share']:.3f} air%={r['air_yard_share']:.3f}"
                  f"{'  sleeper=' + str(sid) if pd.notna(sid) else ''}")


def cmd_publish_oc(args):
    """Build scheme fingerprints, coach history, and player utilization from pbp
    for [start, end] and upsert all three to Supabase (service-role key)."""
    from .scheme import team_scheme_seasons, coach_history, player_utilization_seasons
    from .store import publish_scheme, publish_coach_history, publish_player_utilization

    end = args.end or int(sl.get_state().get("season") or 0) or args.start
    args = argparse.Namespace(**{**vars(args), "end": end})
    seasons = list(range(args.start, args.end + 1))
    print(f"Building OC history for {args.start}-{args.end} ({len(seasons)} seasons)…")
    print("\n[1/3] scheme fingerprints (downloads play-by-play; cached after first run)…")
    publish_scheme(team_scheme_seasons(seasons))
    print("\n[2/3] coach history…")
    publish_coach_history(coach_history(seasons))
    print("\n[3/3] player utilization…")
    publish_player_utilization(player_utilization_seasons(seasons))
    print("\nDone.")


def cmd_backtest(args):
    report = run_backtest(args.season, args.start_week, args.end_week)
    if args.write_readme:
        _write_readme_metrics(report)
    out = Path(args.out) if args.out else None
    if out:
        out.write_text(json.dumps(report, indent=2))
        print(f"\nWrote full report to {out}")


def cmd_project(args):
    season, week = _resolve_season(args), _resolve_week(args)
    df = build_projection(season, week, args.blend)
    df = df.sort_values("proj_ppr", ascending=False)
    print(f"\nTop {args.top} projections — {season} week {week} (blend alpha={args.blend}):")
    cols = ["name", "position", "team", "opponent", "proj_ppr", "floor", "ceiling"]
    print(df[cols].head(args.top).to_string(index=False))
    if args.publish:
        from .store import publish_projections
        publish_projections(df)


def cmd_publish(args):
    from .store import publish_projections
    # Offseason: the weekly cron still fires, so exit cleanly instead of failing.
    if (not args.week or args.week == "auto") and int(sl.get_state().get("week") or 0) <= 0:
        print("Offseason — NFL state reports week 0; nothing to publish.")
        return
    season, week = _resolve_season(args), _resolve_week(args)
    df = build_projection(season, week, args.blend)
    publish_projections(df)


def _write_readme_metrics(report: dict) -> None:
    """Drop the headline backtest numbers into python/README.md between markers."""
    readme = Path(__file__).resolve().parent.parent / "README.md"
    if not readme.exists():
        return
    o = report["overall"]
    lines = [f"<!-- BACKTEST:START -->",
             f"_Latest walk-forward backtest — season {report['season']}, "
             f"weeks {report['weeks'][0]}-{report['weeks'][1]} "
             f"(best Sleeper blend alpha = {report['best_blend_alpha']}):_",
             "",
             "Lower MAE is better; higher ρ (Spearman rank correlation) is better. "
             "**shipped** = our model ensembled with Sleeper; **model** = our model standalone.",
             "",
             "| set | shipped MAE | shipped ρ | model MAE | Sleeper MAE | naive MAE | coverage |",
             "|---|---|---|---|---|---|---|"]
    def row(label, e):
        return (f"| {label} | {e['blend']['mae']} | {e['blend']['spearman']} | "
                f"{e['model']['mae']} | {e['sleeper']['mae']} | "
                f"{e['naive']['mae']} | {e['coverage']} |")
    lines.append(row("overall", o))
    for p, e in report["by_position"].items():
        lines.append(row(p, e))
    lines.append("<!-- BACKTEST:END -->")
    block = "\n".join(lines)

    text = readme.read_text()
    import re
    if "<!-- BACKTEST:START -->" in text:
        text = re.sub(r"<!-- BACKTEST:START -->.*<!-- BACKTEST:END -->", block, text, flags=re.S)
    else:
        text += "\n\n## Latest backtest\n\n" + block + "\n"
    readme.write_text(text)
    print("Updated python/README.md backtest table.")


def main(argv=None):
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    p = argparse.ArgumentParser(prog="projections", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("backtest", help="walk-forward backtest with metrics")
    b.add_argument("--season", type=int, required=True)
    b.add_argument("--start-week", type=int, default=5)
    b.add_argument("--end-week", type=int, default=17)
    b.add_argument("--write-readme", action="store_true")
    b.add_argument("--out", type=str, default=None, help="write full JSON report here")
    b.set_defaults(func=cmd_backtest)

    pr = sub.add_parser("project", help="project a week and print a spot-check")
    pr.add_argument("--season", type=int, default=None, help="defaults to the current NFL season")
    pr.add_argument("--week", default="auto")
    pr.add_argument("--blend", type=float, default=0.8,
                    help="model<->Sleeper ensemble weight; 0.8 is the backtested optimum (alpha curve is flat 0.7-1.0)")
    pr.add_argument("--top", type=int, default=25)
    pr.add_argument("--publish", action="store_true")
    pr.set_defaults(func=cmd_project)

    pb = sub.add_parser("publish", help="project the (current) week and upsert to Supabase")
    pb.add_argument("--season", type=int, default=None, help="defaults to the current NFL season")
    pb.add_argument("--week", default="auto")
    pb.add_argument("--blend", type=float, default=0.8,
                    help="model<->Sleeper ensemble weight; 0.8 is the backtested optimum")
    pb.set_defaults(func=cmd_publish)

    nv = sub.add_parser("nflverse-check", help="self-test the nflverse data connection + crosswalk coverage")
    nv.add_argument("--season", type=int, default=2024, help="target season (also pulls the prior 2 for the crosswalk)")
    nv.set_defaults(func=cmd_nflverse_check)

    sc = sub.add_parser("scheme-check", help="self-test the pbp scheme + coach aggregation")
    sc.add_argument("--season", type=int, default=2024, help="target season (also pulls the prior for context)")
    sc.set_defaults(func=cmd_scheme_check)

    oc = sub.add_parser("publish-oc", help="build + publish scheme/coach/utilization history to Supabase")
    oc.add_argument("--start", type=int, default=2016, help="first season (pbp goes back to 1999)")
    oc.add_argument("--end", type=int, default=None, help="last season (defaults to the current NFL season)")
    oc.set_defaults(func=cmd_publish_oc)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
