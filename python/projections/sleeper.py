"""Sleeper data layer: fetch + on-disk cache of the free, unauthenticated
endpoints the projection engine needs, normalised into tidy pandas frames.

Endpoints (verified live, all free):
  /v1/state/nfl                                  current season / week
  /v1/players/nfl                                player metadata (big, ~5 MB)
  /stats/nfl/{season}/{week}?season_type=regular LIST of player-week rows with
                                                 team, opponent, embedded player
                                                 metadata, usage fields, pts_*,
                                                 and TEAM_{abbr} aggregate rows
  /projections/nfl/{season}/{week}?...           Sleeper's own projections (same
                                                 rich shape; multiple companies)
  /schedule/nfl/regular/{season}                 game schedule (future opponents)

The dict-form /v1/stats/nfl/regular/{year}/{week} endpoint is intentionally NOT
used: its rows carry no team/opponent attribution. The list endpoint above does,
and it still includes the TEAM_ aggregate rows for exact share denominators.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pandas as pd
import requests

BASE = "https://api.sleeper.app"

# Box-score / usage fields we keep off each player-week row. Sleeper returns
# many more (IDP, special teams, kicking); we only mine offense.
STAT_FIELDS = [
    # usage
    "off_snp", "tm_off_snp", "rec_tgt", "rush_att", "rec_air_yd",
    "rec_rz_tgt", "rush_rz_att", "rec",
    # receiving box
    "rec_yd", "rec_td", "rec_2pt",
    # rushing box
    "rush_yd", "rush_td", "rush_2pt",
    # passing box
    "pass_att", "pass_cmp", "pass_yd", "pass_td", "pass_int", "pass_2pt",
    # turnovers
    "fum_lost",
    # availability + ground-truth points
    "gp", "pts_ppr", "pts_half_ppr", "pts_std",
]

# Team-aggregate denominators (the TEAM_{abbr} rows), used for exact shares and
# the team-volume environment model.
TEAM_FIELDS = [
    "rec_tgt", "rush_att", "rec_air_yd", "rec_rz_tgt", "rush_rz_att",
    "pass_att", "pass_cmp", "pass_yd", "rush_yd", "off_yd",
    "pts_ppr", "gp",
]


def _cache_dir() -> Path:
    d = Path(os.environ.get("PROJECTIONS_CACHE_DIR", Path(__file__).resolve().parent.parent / ".cache"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def _get_json(path: str, cache_key: str, ttl_seconds: float, params: dict | None = None):
    """Fetch JSON with a simple on-disk cache. ttl_seconds <= 0 means cache forever
    (used for fully-settled past weeks that never change)."""
    fp = _cache_dir() / f"{cache_key}.json"
    if fp.exists():
        if ttl_seconds <= 0 or (time.time() - fp.stat().st_mtime) < ttl_seconds:
            try:
                return json.loads(fp.read_text())
            except json.JSONDecodeError:
                pass  # corrupt cache; refetch
    resp = requests.get(f"{BASE}{path}", params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    fp.write_text(json.dumps(data))
    return data


# ── Raw endpoints ────────────────────────────────────────────────────────────

def get_state() -> dict:
    return _get_json("/v1/state/nfl", "state_nfl", ttl_seconds=3600)


def get_players() -> dict:
    # Metadata drifts slowly (teams, injuries); a day is plenty.
    return _get_json("/v1/players/nfl", "players_nfl", ttl_seconds=24 * 3600)


def get_schedule(season: int) -> list[dict]:
    return _get_json(f"/schedule/nfl/regular/{season}", f"schedule_{season}", ttl_seconds=3600)


def _week_is_settled(season: int, week: int, state: dict | None) -> bool:
    """A week's results/projections are immutable once it's fully in the past."""
    if state is None:
        return False
    cur_season = int(state.get("season") or 0)
    cur_week = int(state.get("week") or 0)
    if season < cur_season:
        return True
    return season == cur_season and week < cur_week


def get_week_stats_raw(season: int, week: int, state: dict | None = None) -> list[dict]:
    ttl = 0 if _week_is_settled(season, week, state) else 6 * 3600
    return _get_json(
        f"/stats/nfl/{season}/{week}",
        f"stats_{season}_{week}",
        ttl_seconds=ttl,
        params={"season_type": "regular"},
    )


def get_week_projections_raw(season: int, week: int, state: dict | None = None) -> list[dict]:
    ttl = 0 if _week_is_settled(season, week, state) else 3 * 3600
    return _get_json(
        f"/projections/nfl/{season}/{week}",
        f"proj_{season}_{week}",
        ttl_seconds=ttl,
        params={"season_type": "regular"},
    )


# ── Normalised frames ──────────────────────────────────────────────────────────

def _player_meta(row: dict) -> dict:
    pl = row.get("player") or {}
    pos = pl.get("position")
    if not pos:
        fps = pl.get("fantasy_positions") or []
        pos = fps[0] if fps else None
    name = " ".join(p for p in (pl.get("first_name"), pl.get("last_name")) if p).strip()
    return {
        "pos": pos,
        "name": name or str(row.get("player_id")),
        "years_exp": pl.get("years_exp"),
        "injury_status": pl.get("injury_status"),
    }


def _rows_to_frame(rows: list[dict]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split a stats/projections list into (player_weeks, team_totals) frames."""
    players, teams = [], []
    for row in rows:
        pid = str(row.get("player_id", ""))
        stats = row.get("stats") or {}
        if pid.startswith("TEAM_"):
            team = pid.replace("TEAM_", "")
            rec = {"season": int(row["season"]), "week": int(row["week"]), "team": team}
            for f in TEAM_FIELDS:
                rec[f] = float(stats.get(f) or 0.0)
            teams.append(rec)
            continue
        meta = _player_meta(row)
        rec = {
            "player_id": pid,
            "season": int(row["season"]),
            "week": int(row["week"]),
            "team": row.get("team"),
            "opp": row.get("opponent"),
            **meta,
        }
        for f in STAT_FIELDS:
            rec[f] = float(stats.get(f) or 0.0)
        players.append(rec)
    pf = pd.DataFrame(players)
    tf = pd.DataFrame(teams)
    return pf, tf


def load_weeks(season: int, weeks: list[int], state: dict | None = None):
    """Load actual results for a set of weeks.

    Returns (player_weeks_df, team_weeks_df). Empty frames if nothing has been
    played yet (e.g. offseason)."""
    if state is None:
        state = get_state()
    pfs, tfs = [], []
    for w in weeks:
        rows = get_week_stats_raw(season, w, state)
        if not rows:
            continue
        pf, tf = _rows_to_frame(rows)
        pfs.append(pf)
        tfs.append(tf)
    player_df = pd.concat(pfs, ignore_index=True) if pfs else pd.DataFrame()
    team_df = pd.concat(tfs, ignore_index=True) if tfs else pd.DataFrame()
    return player_df, team_df


def load_sleeper_projection(season: int, week: int, state: dict | None = None,
                            company: str = "rotowire") -> pd.DataFrame:
    """Sleeper's own per-player projection for one week, one source — the
    benchmark, the ensemble feature, AND (for preseason) the way rookies and
    offseason movers enter the projection set.

    Columns: player_id, sleeper_ppr, sleeper_half, sleeper_std, position, team,
    opponent, name. Team/opponent come straight from the projection row, so an
    upcoming-week opponent map can be derived from this even before Sleeper
    publishes the season schedule endpoint.
    """
    if state is None:
        state = get_state()
    rows = get_week_projections_raw(season, week, state)

    def _extract(filter_company):
        recs = []
        for row in rows:
            if filter_company and (row.get("company") or "").lower() != company.lower():
                continue
            pid = str(row.get("player_id", ""))
            if pid.startswith("TEAM_"):
                continue
            stats = row.get("stats") or {}
            meta = _player_meta(row)
            recs.append({
                "player_id": pid,
                "sleeper_ppr": float(stats.get("pts_ppr") or 0.0),
                "sleeper_half": float(stats.get("pts_half_ppr") or 0.0),
                "sleeper_std": float(stats.get("pts_std") or 0.0),
                "position": meta["pos"],
                "team": row.get("team"),
                "opponent": row.get("opponent"),
                "name": meta["name"],
            })
        return recs

    out = _extract(filter_company=True) or _extract(filter_company=False)
    df = pd.DataFrame(out)
    if df.empty:
        return df
    # One row per player (collapse if multiple sources slipped through).
    return df.groupby("player_id", as_index=False).agg(
        sleeper_ppr=("sleeper_ppr", "mean"),
        sleeper_half=("sleeper_half", "mean"),
        sleeper_std=("sleeper_std", "mean"),
        position=("position", "first"),
        team=("team", "first"),
        opponent=("opponent", "first"),
        name=("name", "first"),
    )


def opponent_map_from_projection(sleeper_df: pd.DataFrame) -> dict[str, str]:
    """team -> opponent derived from a week's Sleeper projection rows. A fallback
    for when the schedule endpoint isn't populated yet (e.g. a not-yet-released
    upcoming season)."""
    out: dict[str, str] = {}
    if sleeper_df is None or sleeper_df.empty:
        return out
    for _, r in sleeper_df.iterrows():
        t, o = r.get("team"), r.get("opponent")
        if t and o:
            out[t] = o
    return out


def opponent_map(season: int, week: int) -> dict[str, str]:
    """team_abbr -> opponent_abbr for an upcoming (or any) week, from the schedule.
    Used to project future weeks before games are played."""
    sched = get_schedule(season)
    out: dict[str, str] = {}
    for g in sched:
        if int(g.get("week", -1)) != week:
            continue
        home, away = g.get("home"), g.get("away")
        if home and away:
            out[home] = away
            out[away] = home
    return out
