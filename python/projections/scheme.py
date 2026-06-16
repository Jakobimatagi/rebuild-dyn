"""Offensive scheme fingerprints + coach history from nflverse play-by-play.

This is the offline foundation for the OC tool's deeper, longer-history data
(Track B). nflfastR pbp goes back to 1999 and carries true scheme signal the
Sleeper season-stats the OC page uses today cannot: real intended air yards
(aDOT across ALL pass attempts, not completed-only), pass-rate-over-expected,
EPA/play, success rate, CPOE, shotgun/no-huddle tempo — plus `home_coach` /
`away_coach`, which give a head coach per team-season for free (the seed of the
coach-tree lineage).

Everything aggregates to one row per (season, team). Heavy pbp is fetched
column-subset and disk-cached by nflverse.play_by_play, so re-runs are cheap.
Pure pandas; publishes to Supabase elsewhere (store/migrations), like the
projections pipeline — Python never runs in the Vercel path.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import nflverse as nv

# Minimal pbp column set for scheme + coach aggregation (keeps the ~390-col,
# 50k-row/season file light). All verified present in the pbp release.
_PBP_COLS = [
    "season", "week", "season_type",
    "home_team", "away_team", "posteam",
    "play_type", "pass", "rush", "qb_dropback", "qb_scramble",
    "air_yards", "epa", "success", "cpoe",
    "shotgun", "no_huddle", "pass_oe", "xpass",
    "home_coach", "away_coach",
]

# nflfastR team abbreviation drift → the abbreviations Sleeper / the app use
# (matches the TEAM_FIXUPS spirit in api/historical-rosters.js). Applied to
# posteam so scheme rows join cleanly to the rest of the app.
_TEAM_FIXUPS = {"OAK": "LV", "SD": "LAC", "STL": "LAR", "LA": "LAR"}


def _norm_team(s: pd.Series) -> pd.Series:
    s = s.astype("string").str.strip().str.upper()
    return s.replace(_TEAM_FIXUPS)


def _load_offense_pbp(season: int) -> pd.DataFrame:
    """Regular-season offensive plays (a posteam + a real pass/run) for a season,
    with the posteam's head coach attached from home_coach/away_coach."""
    df = nv.play_by_play(season, usecols=_PBP_COLS)
    df = df[df["season_type"].astype("string").str.upper().eq("REG")]
    df = df[df["posteam"].notna() & (df["posteam"].astype("string").str.strip() != "")]
    # Scrimmage plays only: nflfastR `pass`/`rush` flag dropbacks (incl. sacks &
    # scrambles) and designed runs; together they exclude ST, kneels, spikes.
    df = df[(df["pass"] == 1) | (df["rush"] == 1)].copy()

    df["team"] = _norm_team(df["posteam"])
    home = _norm_team(df["home_team"])
    # posteam's coach = home_coach when it's the home team, else away_coach.
    df["head_coach"] = np.where(df["team"].eq(home), df["home_coach"], df["away_coach"])
    return df


def _modal_coach(group: pd.DataFrame) -> str | None:
    """The coach who ran the most plays for this team-season (handles mid-season
    changes by attributing the season to the dominant coach)."""
    coaches = group["head_coach"].dropna()
    if coaches.empty:
        return None
    return coaches.value_counts().idxmax()


def team_scheme_seasons(seasons: list[int]) -> pd.DataFrame:
    """One offensive-identity fingerprint per (season, team). Columns:
      plays, pass_rate, proe (pass-rate-over-expected, %), adot (true intended air
      yards/att), deep_rate (att w/ air_yards>=20), shotgun_rate, no_huddle_rate,
      epa_play, pass_epa, rush_epa, success_rate, cpoe, scramble_rate, head_coach.
    """
    rows = []
    for season in sorted(set(int(s) for s in seasons)):
        try:
            df = _load_offense_pbp(season)
        except FileNotFoundError:
            continue
        if df.empty:
            continue

        is_pass = df["pass"] == 1
        air = pd.to_numeric(df["air_yards"], errors="coerce")
        epa = pd.to_numeric(df["epa"], errors="coerce")

        for team, g in df.groupby("team"):
            gp = g["pass"] == 1
            gair = pd.to_numeric(g["air_yards"], errors="coerce")
            gepa = pd.to_numeric(g["epa"], errors="coerce")
            n = len(g)
            n_pass = int(gp.sum())
            rows.append({
                "season": season,
                "team": team,
                "plays": n,
                "pass_rate": round(float(gp.mean()), 4),
                "proe": _safe_mean(g.loc[gp, "pass_oe"]),
                "adot": _safe_mean(gair[gp]),
                "deep_rate": round(float((gair[gp] >= 20).mean()), 4) if n_pass else None,
                "shotgun_rate": _safe_mean(g["shotgun"]),
                "no_huddle_rate": _safe_mean(g["no_huddle"]),
                "epa_play": _safe_mean(gepa),
                "pass_epa": _safe_mean(gepa[gp]),
                "rush_epa": _safe_mean(gepa[~gp]),
                "success_rate": _safe_mean(g["success"]),
                "cpoe": _safe_mean(g.loc[gp, "cpoe"]),
                "scramble_rate": round(float(g["qb_scramble"].fillna(0).mean()), 4),
                "head_coach": _modal_coach(g),
            })
    return pd.DataFrame(rows)


def coach_history(seasons: list[int]) -> pd.DataFrame:
    """Every (season, team, head_coach) stint with its play count and a `primary`
    flag for the team-season's dominant coach. Mid-season changes surface as two
    rows; the lineage builder (coach-tree) consumes this."""
    rows = []
    for season in sorted(set(int(s) for s in seasons)):
        try:
            df = _load_offense_pbp(season)
        except FileNotFoundError:
            continue
        if df.empty:
            continue
        for team, g in df.groupby("team"):
            counts = g["head_coach"].dropna().value_counts()
            if counts.empty:
                continue
            top = counts.idxmax()
            for coach, plays in counts.items():
                rows.append({
                    "season": season, "team": team, "head_coach": coach,
                    "plays": int(plays), "primary": coach == top,
                })
    return pd.DataFrame(rows)


def _safe_mean(s) -> float | None:
    v = pd.to_numeric(s, errors="coerce")
    m = v.mean()
    return round(float(m), 4) if pd.notna(m) else None


# ── Historical player utilization (1999+) ─────────────────────────────────────

# pbp columns for per-player usage shares. The OC tool's utilization (ocUtilization.js)
# only reaches Sleeper's 2009+ and uses *completed* air yards; pbp gives true
# intended air yards (every target) back to 1999.
_PBP_USAGE_COLS = [
    "season", "week", "season_type", "posteam",
    "pass_attempt", "rush_attempt", "complete_pass", "air_yards", "yardline_100",
    "receiver_player_id", "receiver_player_name",
    "rusher_player_id", "rusher_player_name",
    "touchdown",
]


def player_utilization_seasons(seasons: list[int], rz_yardline: int = 20) -> pd.DataFrame:
    """Per (season, team, player) usage shares mined from pbp, with EXACT team
    denominators from the same play data (the OC tool's exact-share goal). Columns:
      player_id (gsis), name, targets, receptions, rec_air_yards, carries,
      rz_targets, rz_carries, target_share, carry_share, air_yard_share,
      rz_target_share, rz_carry_share, sleeper_id (when linkable; null for deep
      history before Sleeper existed).
    """
    xwalk = nv.id_crosswalk(seasons)
    gsis_to_sleeper = (
        {g: s for s, g in xwalk["gsis_id"].dropna().items()}
        if not xwalk.empty and "gsis_id" in xwalk.columns else {}
    )

    out = []
    for season in sorted(set(int(s) for s in seasons)):
        try:
            df = nv.play_by_play(season, usecols=_PBP_USAGE_COLS)
        except FileNotFoundError:
            continue
        df = df[df["season_type"].astype("string").str.upper().eq("REG")]
        df = df[df["posteam"].notna() & (df["posteam"].astype("string").str.strip() != "")]
        if df.empty:
            continue
        df = df.copy()
        df["team"] = _norm_team(df["posteam"])
        df["air_yards"] = pd.to_numeric(df["air_yards"], errors="coerce")
        df["yardline_100"] = pd.to_numeric(df["yardline_100"], errors="coerce")
        df["is_pass"] = pd.to_numeric(df["pass_attempt"], errors="coerce").fillna(0).eq(1)
        df["is_rush"] = pd.to_numeric(df["rush_attempt"], errors="coerce").fillna(0).eq(1)
        df["is_rz"] = df["yardline_100"] <= rz_yardline

        tgt = df[df["is_pass"] & df["receiver_player_id"].notna()]
        car = df[df["is_rush"] & df["rusher_player_id"].notna()]

        # Exact team denominators from the same plays.
        team_tot = pd.DataFrame({
            "tm_targets": tgt.groupby("team").size(),
            "tm_air_yards": tgt.groupby("team")["air_yards"].sum(min_count=1),
            "tm_rz_targets": tgt[tgt["is_rz"]].groupby("team").size(),
            "tm_carries": car.groupby("team").size(),
            "tm_rz_carries": car[car["is_rz"]].groupby("team").size(),
        })

        rec = tgt.groupby(["team", "receiver_player_id"]).agg(
            name=("receiver_player_name", "last"),
            targets=("receiver_player_id", "size"),
            receptions=("complete_pass", lambda s: int(pd.to_numeric(s, errors="coerce").fillna(0).sum())),
            rec_air_yards=("air_yards", "sum"),
            rz_targets=("is_rz", "sum"),
        ).reset_index().rename(columns={"receiver_player_id": "player_id"})

        rush = car.groupby(["team", "rusher_player_id"]).agg(
            name=("rusher_player_name", "last"),
            carries=("rusher_player_id", "size"),
            rz_carries=("is_rz", "sum"),
        ).reset_index().rename(columns={"rusher_player_id": "player_id"})

        merged = rec.merge(rush, on=["team", "player_id"], how="outer", suffixes=("", "_r"))
        merged["name"] = merged["name"].fillna(merged.pop("name_r"))
        for c in ("targets", "receptions", "rec_air_yards", "rz_targets", "carries", "rz_carries"):
            merged[c] = pd.to_numeric(merged.get(c), errors="coerce").fillna(0)

        merged = merged.join(team_tot, on="team")
        merged["target_share"] = _ratio(merged["targets"], merged["tm_targets"])
        merged["carry_share"] = _ratio(merged["carries"], merged["tm_carries"])
        merged["air_yard_share"] = _ratio(merged["rec_air_yards"], merged["tm_air_yards"])
        merged["rz_target_share"] = _ratio(merged["rz_targets"], merged["tm_rz_targets"])
        merged["rz_carry_share"] = _ratio(merged["rz_carries"], merged["tm_rz_carries"])
        merged["season"] = season
        merged["sleeper_id"] = merged["player_id"].map(gsis_to_sleeper)
        out.append(merged.drop(columns=[c for c in merged.columns if c.startswith("tm_")]))

    if not out:
        return pd.DataFrame()
    res = pd.concat(out, ignore_index=True)
    keep = [
        "season", "team", "player_id", "sleeper_id", "name",
        "targets", "receptions", "rec_air_yards", "carries", "rz_targets", "rz_carries",
        "target_share", "carry_share", "air_yard_share", "rz_target_share", "rz_carry_share",
    ]
    return res[[c for c in keep if c in res.columns]].sort_values(
        ["season", "team", "target_share"], ascending=[True, True, False]
    ).reset_index(drop=True)


def _ratio(num, den):
    n = pd.to_numeric(num, errors="coerce")
    d = pd.to_numeric(den, errors="coerce")
    return (n / d).where(d > 0).round(4)
