"""Defensive-scheme fingerprints from nflverse play-by-play — the DC Blueprint.

The exact mirror of scheme.py flipped to the defense: every play carries
`defteam`, so the same pbp that powers the OC tool's offensive fingerprints
yields one defensive-identity row per (season, team) — what a defense allows
(EPA/play, success rate, CPOE), what offenses choose to do against it
(pass-rate-over-expected faced — the run/pass funnel signal), how it attacks
the QB (sack / QB-hit rate per dropback), and how deep offenses test it
(aDOT faced, deep-ball rate allowed). `home_coach`/`away_coach` give the
defense's head coach the same way they do the offense's.

Coverage scheme (man/zone, blitz counts) lives in the separate nflverse
participation and FTN charting releases — a phase-2 join, not base pbp.

Everything aggregates to one row per (season, team) and publishes to the
`defense_scheme_seasons` table (docs/migrations/dc_history_schema.sql).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import nflverse as nv
from .scheme import _norm_team, _modal_coach, _safe_mean

# Minimal pbp column set for the defensive aggregation. All verified present in
# the pbp release (same file scheme.py reads; only the grouping side changes).
_PBP_COLS = [
    "season", "week", "season_type",
    "home_team", "away_team", "defteam",
    "play_type", "pass", "rush", "qb_dropback",
    "air_yards", "epa", "success", "cpoe",
    "pass_oe", "xpass",
    "sack", "interception", "qb_hit",
    "home_coach", "away_coach",
]


def _load_defense_pbp(season: int) -> pd.DataFrame:
    """Regular-season scrimmage plays keyed to the DEFENSE on the field, with the
    defteam's head coach attached from home_coach/away_coach."""
    df = nv.play_by_play(season, usecols=_PBP_COLS)
    df = df[df["season_type"].astype("string").str.upper().eq("REG")]
    df = df[df["defteam"].notna() & (df["defteam"].astype("string").str.strip() != "")]
    df = df[(df["pass"] == 1) | (df["rush"] == 1)].copy()

    df["team"] = _norm_team(df["defteam"])
    home = _norm_team(df["home_team"])
    # defteam's coach = home_coach when it's the home team, else away_coach.
    df["head_coach"] = np.where(df["team"].eq(home), df["home_coach"], df["away_coach"])
    return df


def defense_scheme_seasons(seasons: list[int]) -> pd.DataFrame:
    """One defensive-identity fingerprint per (season, team). Columns:
      plays, epa_play_allowed, pass_epa_allowed, rush_epa_allowed,
      success_rate_allowed, cpoe_allowed, pass_rate_faced, proe_faced,
      adot_faced, deep_rate_allowed, sack_rate, int_rate, qb_hit_rate,
      head_coach.
    Rate denominators: *_allowed / faced are per relevant play; sack/int/qb_hit
    are per dropback (dropbacks include sacks and scrambles).
    """
    rows = []
    for season in sorted(set(int(s) for s in seasons)):
        try:
            df = _load_defense_pbp(season)
        except FileNotFoundError:
            continue
        if df.empty:
            continue

        for team, g in df.groupby("team"):
            gp = g["pass"] == 1
            dropback = pd.to_numeric(g["qb_dropback"], errors="coerce").fillna(0).eq(1)
            n_dropbacks = int(dropback.sum())
            gair = pd.to_numeric(g["air_yards"], errors="coerce")
            gepa = pd.to_numeric(g["epa"], errors="coerce")
            n_pass = int(gp.sum())

            def per_dropback(col):
                if n_dropbacks == 0:
                    return None
                v = pd.to_numeric(g[col], errors="coerce").fillna(0)
                return round(float(v[dropback].sum() / n_dropbacks), 4)

            rows.append({
                "season": season,
                "team": team,
                "plays": len(g),
                "epa_play_allowed": _safe_mean(gepa),
                "pass_epa_allowed": _safe_mean(gepa[gp]),
                "rush_epa_allowed": _safe_mean(gepa[~gp]),
                "success_rate_allowed": _safe_mean(g["success"]),
                "cpoe_allowed": _safe_mean(g.loc[gp, "cpoe"]),
                "pass_rate_faced": round(float(gp.mean()), 4),
                "proe_faced": _safe_mean(g["pass_oe"]),
                "adot_faced": _safe_mean(gair[gp]),
                "deep_rate_allowed": round(float((gair[gp] >= 20).mean()), 4) if n_pass else None,
                "sack_rate": per_dropback("sack"),
                "int_rate": per_dropback("interception"),
                "qb_hit_rate": per_dropback("qb_hit"),
                "head_coach": _modal_coach(g),
            })
    return pd.DataFrame(rows)
