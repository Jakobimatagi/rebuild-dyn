"""Advanced per-player-week features from nflverse, keyed by Sleeper player_id so
they line up 1:1 with the projector's existing Sleeper frames (usage.py / model.py).

This is the *feature* layer on top of the raw nflverse.py fetchers. It resolves
nflverse's gsis/pfr IDs back to Sleeper IDs via the roster crosswalk and emits a
tidy (sleeper_id, season, week) frame of `nflv_*` columns. These are raw weekly
observations — recency-weighting and Bayesian shrinkage stay in the model layer
(model.py), exactly like the Sleeper usage shares, so a player's nflverse history
is combined the same honest, walk-forward way.

Why each feature earns its place (signal Sleeper's box score can't give you):
  target_share / air_yards_share / wopr / racr  true team-denominator usage &
                                                efficiency (Sleeper's air yards
                                                are completed-only — see usage.py)
  *_epa, dakota                                 play-value quality, not just volume
  avg_separation / avg_yac_above_expectation    receiver skill that predicts
  avg_cushion / pct_share_intended_air_yards    target & efficiency sustainability
  cpoe / avg_time_to_throw / aggressiveness     QB accuracy & play-style
  ryoe_per_att / rush_efficiency                RB talent independent of blocking
  snap_pct                                      true playing-time denominator
"""

from __future__ import annotations

import os

import numpy as np
import pandas as pd

from . import nflverse as nv

# Columns the model actually consumes (model._NFLV_RATE_FIELDS). Kept minimal so
# merging onto the Sleeper history frame doesn't bloat it.
MODEL_FIELDS = ["nflv_target_share", "nflv_snap_pct"]

# (output column, source column) pulled straight off player_stats (gsis-keyed).
_PLAYER_STATS_COLS = [
    ("nflv_target_share", "target_share"),
    ("nflv_air_yards_share", "air_yards_share"),
    ("nflv_wopr", "wopr"),
    ("nflv_racr", "racr"),
    ("nflv_pacr", "pacr"),
    ("nflv_receiving_epa", "receiving_epa"),
    ("nflv_rushing_epa", "rushing_epa"),
    ("nflv_passing_epa", "passing_epa"),
    ("nflv_dakota", "dakota"),
]

_NGS_RECEIVING_COLS = [
    ("nflv_avg_separation", "avg_separation"),
    ("nflv_avg_cushion", "avg_cushion"),
    ("nflv_yac_above_expected", "avg_yac_above_expectation"),
    ("nflv_pct_intended_air_yards", "percent_share_of_intended_air_yards"),
]

_NGS_PASSING_COLS = [
    ("nflv_cpoe", "completion_percentage_above_expectation"),
    ("nflv_time_to_throw", "avg_time_to_throw"),
    ("nflv_aggressiveness", "aggressiveness"),
]

_NGS_RUSHING_COLS = [
    ("nflv_ryoe_per_att", "rush_yards_over_expected_per_att"),
    ("nflv_rush_efficiency", "efficiency"),
    ("nflv_rush_pct_over_expected", "rush_pct_over_expected"),
]


def _reverse_map(crosswalk: pd.DataFrame, id_col: str) -> pd.Series:
    """Map an nflverse id column value -> sleeper_id (drops blanks/dupes)."""
    s = crosswalk[id_col].dropna()
    s = s[s != ""]
    # crosswalk is indexed by sleeper_id; invert it. On the rare duplicate nflverse
    # id, keep the first (crosswalk already kept the most-recent linkage per sleeper).
    inv = pd.Series(s.index.values, index=s.values)
    return inv[~inv.index.duplicated(keep="first")]


def _attach_sleeper(df: pd.DataFrame, id_col: str, rev: pd.Series) -> pd.DataFrame:
    out = df.copy()
    out["sleeper_id"] = out[id_col].astype("string").str.strip().map(rev)
    return out[out["sleeper_id"].notna()]


def _rename_keep(df: pd.DataFrame, mapping: list[tuple[str, str]]) -> pd.DataFrame:
    present = [(o, s) for o, s in mapping if s in df.columns]
    keep = ["sleeper_id", "season", "week"] + [s for _, s in present]
    out = df[keep].rename(columns={s: o for o, s in present})
    return out


def advanced_features(seasons: list[int]) -> pd.DataFrame:
    """Return a tidy (sleeper_id, season, week)-indexed frame of nflv_* features
    for the given seasons. Missing datasets/seasons degrade gracefully to NaN."""
    seasons = sorted(set(int(s) for s in seasons))
    xwalk = nv.id_crosswalk(seasons)
    if xwalk.empty:
        return pd.DataFrame()

    rev_gsis = _reverse_map(xwalk, "gsis_id") if "gsis_id" in xwalk.columns else pd.Series(dtype="object")
    rev_pfr = _reverse_map(xwalk, "pfr_id") if "pfr_id" in xwalk.columns else pd.Series(dtype="object")

    # One list of frames per feature GROUP. Seasons within a group share a schema
    # and get stacked vertically (concat); the distinct groups get merged
    # horizontally on the (sleeper_id, season, week) grain. Mixing the two — as a
    # flat outer-merge would — collides same-named columns across seasons into
    # _x/_y pairs, so keep them separate.
    groups: dict[str, list[pd.DataFrame]] = {}

    def add(name: str, frame: pd.DataFrame):
        groups.setdefault(name, []).append(frame)

    for season in seasons:
        # player_stats — gsis player_id
        try:
            ps = nv.player_stats(season)
            ps = ps[ps["week"] > 0]
            ps = _attach_sleeper(ps, "player_id", rev_gsis)
            add("player_stats", _rename_keep(ps, _PLAYER_STATS_COLS))
        except FileNotFoundError:
            pass

        # NGS — player_gsis_id, week>0 (week==0 are season aggregates)
        for kind, cols in (("receiving", _NGS_RECEIVING_COLS),
                            ("passing", _NGS_PASSING_COLS),
                            ("rushing", _NGS_RUSHING_COLS)):
            try:
                g = nv.ngs(season, kind)
                g = g[g["week"] > 0]
                g = _attach_sleeper(g, "player_gsis_id", rev_gsis)
                add(f"ngs_{kind}", _rename_keep(g, cols))
            except FileNotFoundError:
                pass

        # snap_counts — pfr_player_id; offense_pct is the snap share
        try:
            sc = nv.snap_counts(season)
            sc = sc[sc["week"] > 0] if "week" in sc.columns else sc
            sc = _attach_sleeper(sc, "pfr_player_id", rev_pfr)
            if "offense_pct" in sc.columns:
                snap = sc[["sleeper_id", "season", "week", "offense_pct"]].rename(
                    columns={"offense_pct": "nflv_snap_pct"})
                add("snap", snap)
        except FileNotFoundError:
            pass

    if not groups:
        return pd.DataFrame()

    # Stack seasons within each group, dedupe to one row per player-week, then
    # outer-merge the groups together.
    out = None
    for frames in groups.values():
        block = pd.concat(frames, ignore_index=True).dropna(subset=["sleeper_id"])
        block = block.groupby(["sleeper_id", "season", "week"], as_index=False).first()
        out = block if out is None else out.merge(block, on=["sleeper_id", "season", "week"], how="outer")

    # snap_pct arrives as a 0-100 percentage; everything else is already a rate.
    if "nflv_snap_pct" in out.columns:
        out["nflv_snap_pct"] = pd.to_numeric(out["nflv_snap_pct"], errors="coerce") / 100.0

    out["season"] = out["season"].astype(int)
    out["week"] = out["week"].astype(int)
    return out.sort_values(["sleeper_id", "season", "week"]).reset_index(drop=True)


# Validated default for the snap-share opportunity nudge (PROJ_NFLV_SNAP_ADJ). Set
# >0 to enable; 0 disables nflverse entirely. Keep in sync with model.NFLV_SNAP_ADJ.
_DEFAULT_SNAP_ADJ = "0.3"


def nflverse_enabled() -> bool:
    """Whether to pay the nflverse fetch cost. On by default (the snap adjustment
    is validated), but set PROJ_USE_NFLVERSE=0 — or PROJ_NFLV_SNAP_ADJ=0 with no
    other flag — to fall back to the pure Sleeper pipeline."""
    use = os.environ.get("PROJ_USE_NFLVERSE", "").strip().lower()
    if use in ("0", "false", "no"):
        return False
    if use in ("1", "true", "yes"):
        return True
    for k, default in (("PROJ_NFLV_SNAP_ADJ", _DEFAULT_SNAP_ADJ), ("PROJ_NFLV_TGT_BLEND", "0")):
        try:
            if float(os.environ.get(k, default) or 0) > 0:
                return True
        except ValueError:
            pass
    return False


def maybe_attach_nflverse(history: pd.DataFrame, seasons=None) -> pd.DataFrame:
    """Left-merge the model's nflverse feature columns onto a Sleeper history
    frame (keyed by player_id == Sleeper id, season, week). No-op when nflverse is
    disabled. Never raises: any upstream failure (network, schema drift) falls back
    to the un-enriched history so the weekly publish cron can't break on it."""
    if history is None or history.empty or not nflverse_enabled():
        return history
    try:
        seasons = seasons or sorted(int(s) for s in history["season"].dropna().unique())
        feats = advanced_features(seasons)
        if feats.empty:
            return history
        keep = ["sleeper_id", "season", "week"] + [c for c in MODEL_FIELDS if c in feats.columns]
        feats = feats[keep].rename(columns={"sleeper_id": "player_id"})
        feats["player_id"] = feats["player_id"].astype(str)
        out = history.copy()
        out["player_id"] = out["player_id"].astype(str)
        return out.merge(feats, on=["player_id", "season", "week"], how="left")
    except Exception as e:  # pragma: no cover - defensive; pipeline must not break
        print(f"[nflverse] enrichment skipped ({type(e).__name__}: {e}); using Sleeper-only history")
        return history
