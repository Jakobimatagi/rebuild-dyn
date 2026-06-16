"""nflverse data layer: fetch + on-disk cache of the free, unauthenticated
nflverse-data GitHub *release* assets the projector uses to go beyond Sleeper's
box score. Everything is distributed as gzipped CSV (pandas reads `.csv.gz`
natively, so no new deps), mirroring the same delivery channel the JS app's
`api/historical-rosters.js` already proxies.

Datasets (all verified live):
  player_stats/player_stats_{year}.csv.gz          weekly advanced player stats —
                                                   true target_share, air_yards_share,
                                                   wopr, racr, pacr, *_epa, dakota.
                                                   Keyed by gsis player_id.
  nextgen_stats/ngs_{year}_{passing|receiving|     Next Gen Stats — separation,
    rushing}.csv.gz                                cushion, YAC-over-expected, CPOE,
                                                   time-to-throw, rush-yds-over-exp.
                                                   Keyed by player_gsis_id.
  snap_counts/snap_counts_{year}.csv.gz            true snap share (offense_pct).
                                                   Keyed by pfr_player_id.
  rosters/roster_{year}.csv                        the ID crosswalk — every rostered
                                                   player's sleeper_id + gsis_id +
                                                   pfr_id together on one row.
  pbp/play_by_play_{year}.csv.gz                   full nflfastR play-by-play (heavy;
                                                   fetched column-subset on demand).

The crosswalk is the whole game: nflverse keys on gsis_id (and pfr_id for snaps),
the projector keys on Sleeper player_id. The roster files carry all three on the
same row, so `id_crosswalk()` resolves Sleeper -> {gsis_id, pfr_id} for the
projector's entire universe (anyone rostered in the lookback window).
"""

from __future__ import annotations

import io
import os
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

RELEASES = "https://github.com/nflverse/nflverse-data/releases/download"

# nflverse seasons finalize a few months after the season ends; treat any season
# strictly before the current calendar year as immutable (cache forever), and the
# current/future season as live (short TTL). Same logic as historical-rosters.js.
_CURRENT_YEAR = datetime.now().year
_LIVE_TTL = 12 * 3600


def _cache_dir() -> Path:
    d = Path(os.environ.get("PROJECTIONS_CACHE_DIR", Path(__file__).resolve().parent.parent / ".cache"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def _get_csv(url: str, cache_key: str, ttl_seconds: float, **read_csv_kwargs) -> pd.DataFrame:
    """Fetch a (possibly gzipped) CSV release asset with a simple on-disk cache.

    ttl_seconds <= 0 means cache forever (settled past seasons). Caches the raw
    bytes verbatim under `.cache/<cache_key>` so the parse stays identical to a
    cold fetch and `read_csv_kwargs` (e.g. usecols) can change without a refetch.
    """
    suffix = ".csv.gz" if url.endswith(".gz") else ".csv"
    fp = _cache_dir() / f"{cache_key}{suffix}"
    fresh = fp.exists() and (ttl_seconds <= 0 or (time.time() - fp.stat().st_mtime) < ttl_seconds)
    if not fresh:
        # Progress feedback: play-by-play files are ~50 MB each, so a multi-season
        # pull is slow — without this it looks frozen. Streamed so large files show
        # a running byte count instead of one long silent block.
        name = url.rsplit("/", 1)[-1]
        print(f"[nflverse] downloading {name} …", end="", flush=True)
        resp = requests.get(url, timeout=120, stream=True)
        if resp.status_code == 404:
            print(" not published yet")
            raise FileNotFoundError(f"nflverse asset not published yet: {url}")
        resp.raise_for_status()
        chunks, total = [], 0
        for chunk in resp.iter_content(chunk_size=1 << 20):  # 1 MB
            chunks.append(chunk)
            total += len(chunk)
            print(f"\r[nflverse] downloading {name} … {total / 1e6:.0f} MB", end="", flush=True)
        fp.write_bytes(b"".join(chunks))
        print(f"\r[nflverse] downloaded  {name}  ({total / 1e6:.0f} MB)      ", flush=True)
    try:
        return pd.read_csv(fp, low_memory=False, **read_csv_kwargs)
    except Exception:
        # Corrupt/partial cache — drop it so the next call refetches clean.
        fp.unlink(missing_ok=True)
        raise


def _ttl_for(season: int) -> float:
    return 0 if season < _CURRENT_YEAR else _LIVE_TTL


# ── Raw dataset fetchers ──────────────────────────────────────────────────────

def player_stats(season: int) -> pd.DataFrame:
    """Weekly advanced player stats for one season (offense). gsis `player_id`."""
    return _get_csv(
        f"{RELEASES}/player_stats/player_stats_{season}.csv.gz",
        f"nflv_player_stats_{season}", _ttl_for(season),
    )


def ngs(season: int, kind: str) -> pd.DataFrame:
    """Next Gen Stats for one season. kind in {passing, receiving, rushing}.
    Includes week==0 season-aggregate rows — filter to week>0 for a weekly join."""
    if kind not in ("passing", "receiving", "rushing"):
        raise ValueError(f"ngs kind must be passing/receiving/rushing, got {kind!r}")
    return _get_csv(
        f"{RELEASES}/nextgen_stats/ngs_{season}_{kind}.csv.gz",
        f"nflv_ngs_{season}_{kind}", _ttl_for(season),
    )


def snap_counts(season: int) -> pd.DataFrame:
    """Per-game snap counts/percentages for one season. `pfr_player_id`."""
    return _get_csv(
        f"{RELEASES}/snap_counts/snap_counts_{season}.csv.gz",
        f"nflv_snap_counts_{season}", _ttl_for(season),
    )


def rosters(season: int) -> pd.DataFrame:
    """Weekly roster file for one season — the source of the ID crosswalk."""
    # Roster releases are plain .csv (no .gz), same asset api/historical-rosters.js uses.
    return _get_csv(
        f"{RELEASES}/rosters/roster_{season}.csv",
        f"nflv_roster_{season}", _ttl_for(season),
    )


def play_by_play(season: int, usecols: list[str] | None = None) -> pd.DataFrame:
    """nflfastR play-by-play for one season. Heavy (~50k rows, ~390 cols), so pass
    `usecols` to keep only what you need — the on-disk cache holds the full file."""
    return _get_csv(
        f"{RELEASES}/pbp/play_by_play_{season}.csv.gz",
        f"nflv_pbp_{season}", _ttl_for(season),
        usecols=usecols,
    )


# ── ID crosswalk ──────────────────────────────────────────────────────────────

def id_crosswalk(seasons: list[int]) -> pd.DataFrame:
    """sleeper_id -> {gsis_id, pfr_id} for everyone rostered in `seasons`.

    Built from the roster files, which carry all three IDs on one row. Later
    seasons win on conflict (a player keeps the most recent id linkage). Returns a
    frame indexed by a clean string sleeper_id with `gsis_id` and `pfr_id` columns
    (either may be NaN if nflverse never linked it).
    """
    rows = []
    for season in sorted(seasons):  # ascending so later seasons overwrite earlier
        try:
            df = rosters(season)
        except FileNotFoundError:
            continue
        cols = {c: c for c in ("sleeper_id", "gsis_id", "pfr_id", "position") if c in df.columns}
        if "sleeper_id" not in cols or "gsis_id" not in cols:
            continue
        sub = df[list(cols)].copy()
        rows.append(sub)
    if not rows:
        return pd.DataFrame(columns=["gsis_id", "pfr_id"]).rename_axis("sleeper_id")

    allrows = pd.concat(rows, ignore_index=True)
    for c in ("sleeper_id", "gsis_id", "pfr_id"):
        if c in allrows.columns:
            allrows[c] = allrows[c].astype("string").str.strip()
    # sleeper_id arrives numeric -> pandas renders it "11632.0"; Sleeper keys on
    # the bare integer string "11632". Drop the trailing ".0" so joins line up.
    if "sleeper_id" in allrows.columns:
        allrows["sleeper_id"] = allrows["sleeper_id"].str.replace(r"\.0$", "", regex=True)
    allrows = allrows[allrows["sleeper_id"].notna() & (allrows["sleeper_id"] != "")]
    # Keep the last (most recent season) linkage per sleeper_id.
    allrows = allrows.drop_duplicates(subset="sleeper_id", keep="last").set_index("sleeper_id")
    keep = [c for c in ("gsis_id", "pfr_id") if c in allrows.columns]
    return allrows[keep]
