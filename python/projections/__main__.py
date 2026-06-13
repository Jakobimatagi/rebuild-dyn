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

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
