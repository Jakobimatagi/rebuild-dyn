"""Active-player contract table from nflverse's OverTheCap (OTC) feed.

Turns the raw `contracts` release (one cumulative file of every historical + active
deal) into one clean, app-ready row per active player, keyed by `otc_id` and linked to
a Sleeper id + current team where possible.

Two facts about the raw OTC file shape this module:
  • Dollar figures (`value`, `apy`, `guaranteed`, `inflated_*`) are in MILLIONS in the
    Parquet (e.g. 64.0 = $64M). We keep them as-is — formatting is the frontend's job.
  • It carries a `gsis_id` but no Sleeper id, and its `team` is a messy nickname/slash
    string ("Packers", "ARI/BAL"). So we resolve `sleeper_id` through the roster
    crosswalk (gsis → sleeper), fall back to a name match, and take the authoritative
    current team from the live Sleeper feed (OTC string as a last resort).

Read from the Parquet asset, not CSV: nflverse froze the contracts `.csv.gz` mirror in
2022 while the `.parquet` stays current (see nflverse.contracts()).

Consumed by the `contracts-check` / `publish-contracts` CLI commands, which publish to
the `player_contracts` Supabase table (see docs/migrations/player_contracts_schema.sql).
Contract signals (years_remaining, guaranteed money) are most useful as
opportunity/role-stability and dynasty-value features — not direct weekly predictors.
"""

from __future__ import annotations

import re
from datetime import datetime

import pandas as pd

from . import nflverse as nv
from . import sleeper as sl

# Columns pulled from the raw OTC frame, mapped to clean output names.
_RENAME = {"player": "player_name", "value": "total_value", "apy": "avg_annual_value"}
_KEEP_AS_IS = [
    "position", "years", "year_signed", "guaranteed", "apy_cap_pct",
    "inflated_apy", "gsis_id", "otc_id",
]
_NUMERIC = [
    "total_value", "avg_annual_value", "years", "year_signed", "guaranteed",
    "apy_cap_pct", "inflated_apy",
]

# OTC labels single-team contracts by full nickname; map to the Sleeper abbreviation
# the rest of the app uses. (Multi-team slash strings like "ARI/BAL" are already
# abbreviations and are handled separately.)
_NICKNAME_TO_ABBR = {
    "49ers": "SF", "Bears": "CHI", "Bengals": "CIN", "Bills": "BUF", "Broncos": "DEN",
    "Browns": "CLE", "Buccaneers": "TB", "Cardinals": "ARI", "Chargers": "LAC",
    "Chiefs": "KC", "Colts": "IND", "Commanders": "WAS", "Cowboys": "DAL",
    "Dolphins": "MIA", "Eagles": "PHI", "Falcons": "ATL", "Giants": "NYG",
    "Jaguars": "JAX", "Jets": "NYJ", "Lions": "DET", "Packers": "GB", "Panthers": "CAR",
    "Patriots": "NE", "Raiders": "LV", "Rams": "LAR", "Ravens": "BAL", "Saints": "NO",
    "Seahawks": "SEA", "Steelers": "PIT", "Texans": "HOU", "Titans": "TEN",
    "Vikings": "MIN",
}

_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def _resolve_league_year(league_year: int | None) -> int:
    """Current NFL league year for the years-remaining math. Falls back to the calendar
    year if Sleeper state is unavailable (offseason / network), never crashing."""
    if league_year is not None:
        return int(league_year)
    try:
        season = int(sl.get_state().get("season") or 0)
        if season:
            return season
    except Exception:
        pass
    return datetime.now().year


def _norm_name(name) -> str:
    """Lowercase, strip punctuation and a trailing generational suffix, collapse
    spaces — so 'A.J. Brown' and 'Marvin Harrison Jr.' match Sleeper's spelling."""
    if not isinstance(name, str):
        return ""
    s = re.sub(r"[^a-z0-9 ]", "", name.lower())
    toks = [t for t in s.split() if t]
    if len(toks) > 2 and toks[-1] in _SUFFIXES:
        toks = toks[:-1]
    return " ".join(toks)


def _otc_team_to_abbr(raw) -> str | None:
    """Best-effort current-team abbreviation from OTC's team string. Used only for
    players we couldn't match to Sleeper (Sleeper's live team wins when available)."""
    if not isinstance(raw, str) or not raw.strip():
        return None
    raw = raw.strip()
    if raw in _NICKNAME_TO_ABBR:
        return _NICKNAME_TO_ABBR[raw]
    if "/" in raw:  # path like "ARI/BAL" — tokens are abbreviations; last is most recent
        return raw.split("/")[-1].strip().upper()
    return raw.upper()


def _gsis_to_sleeper() -> pd.Series:
    """gsis_id -> sleeper_id from the roster crosswalk (last few seasons cover every
    currently-rostered player). Empty Series on failure, so the link degrades to a
    name-based fallback rather than crashing."""
    current = datetime.now().year
    try:
        xwalk = nv.id_crosswalk(list(range(current - 3, current + 1)))
    except Exception:
        return pd.Series(dtype="string")
    if xwalk.empty or "gsis_id" not in xwalk.columns:
        return pd.Series(dtype="string")
    rev = xwalk.reset_index()[["gsis_id", "sleeper_id"]].copy()
    rev["gsis_id"] = rev["gsis_id"].astype("string").str.strip()
    rev = rev[rev["gsis_id"].notna() & (rev["gsis_id"] != "")]
    return rev.drop_duplicates(subset="gsis_id", keep="last").set_index("gsis_id")["sleeper_id"]


def _sleeper_maps() -> tuple[dict[str, str], dict[str, str | None]]:
    """From the live Sleeper players feed, build (name -> sleeper_id) and
    (sleeper_id -> current_team). The name map is the fallback link for players the
    gsis crosswalk misses; it prefers rostered players and drops ambiguous names (two
    rostered players sharing a normalized name) so we never attach a wrong id. Both
    empty on failure."""
    try:
        players = sl.get_players()
    except Exception:
        return {}, {}
    sid_team = {pid: p.get("team") for pid, p in players.items()}
    cands: dict[str, list[tuple[str, str | None]]] = {}
    for pid, p in players.items():
        nm = _norm_name(p.get("full_name"))
        if not nm:
            continue
        cands.setdefault(nm, []).append((pid, p.get("team")))
    name_sid: dict[str, str] = {}
    for nm, lst in cands.items():
        teamed = [c for c in lst if c[1]]
        pick = teamed or lst
        if len(pick) == 1:                       # unambiguous → safe to link
            name_sid[nm] = pick[0][0]
    return name_sid, sid_team


def active_contracts(league_year: int | None = None) -> pd.DataFrame:
    """One cleaned row per active player's current contract.

    Filters the raw OTC feed to `is_active`, renames to clean columns, coerces numerics
    (bad/missing → NaN, then null at publish), computes years_remaining vs the current
    league year, and links each player to a Sleeper id + current team by name.
    """
    raw = nv.contracts()

    # `is_active` flags each player's current deal — one row per active player.
    active = raw[raw["is_active"].astype("boolean").fillna(False)].copy()

    keep = list(_RENAME) + _KEEP_AS_IS + ["team"]
    df = active[[c for c in keep if c in active.columns]].rename(columns=_RENAME)

    # otc_id is the upsert key — a row without it is unusable.
    df = df[df["otc_id"].notna()].copy()
    df["otc_id"] = df["otc_id"].astype("string").str.strip()

    for c in _NUMERIC:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    # A contract with neither a total value nor an AAV carries no financial signal.
    if "total_value" in df.columns and "avg_annual_value" in df.columns:
        df = df[df["total_value"].notna() | df["avg_annual_value"].notna()]

    for c in ("player_name", "position", "gsis_id"):
        if c in df.columns:
            df[c] = df[c].astype("string").str.strip()

    # years_remaining: a 4-yr deal signed in 2023 runs 2023–2026, so in the 2026 league
    # year it has 1 left (2023+4-2026). Expired clamps to 0; unknowns stay null.
    ly = _resolve_league_year(league_year)
    df["years_remaining"] = (df["year_signed"] + df["years"] - ly).clip(lower=0).astype("Int64")

    # Link to Sleeper: gsis_id via the roster crosswalk first (no name ambiguity), then
    # a name match for whoever it missed. Current team comes from Sleeper's live feed by
    # the resolved id; the OTC team string is a best-effort fallback for the unmatched.
    g2s = _gsis_to_sleeper()
    name_sid, sid_team = _sleeper_maps()
    sid = df["gsis_id"].map(g2s) if not g2s.empty else pd.Series(pd.NA, index=df.index, dtype="object")
    need = sid.isna()
    sid = sid.where(~need, df["player_name"].map(lambda n: name_sid.get(_norm_name(n), pd.NA)))
    df["sleeper_id"] = sid
    sleeper_team = df["sleeper_id"].map(lambda s: sid_team.get(s) if pd.notna(s) else None)
    df["team"] = sleeper_team.where(sleeper_team.notna(), df["team"].map(_otc_team_to_abbr))

    # A few players carry more than one active row; otc_id is the upsert key, so keep
    # one per player — the most recently signed (then richest) deal.
    df = (df.sort_values(["year_signed", "total_value"], ascending=False, na_position="last")
            .drop_duplicates(subset="otc_id", keep="first"))

    return df.reset_index(drop=True)
