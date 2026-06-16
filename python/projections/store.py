"""Publish projections to Supabase.

Writes use the service-role key (server-side only — never the anon key the
browser uses, never committed). The browser reads these rows with the anon key
under an RLS policy that allows SELECT only. See the migration in
docs/sql/projections.sql.
"""

from __future__ import annotations

import math
import os
from datetime import datetime, timezone

import pandas as pd


def _json_safe(o):
    """Coerce a value into something that serializes to valid JSON for Supabase.

    - NaN/Inf → None: the client rejects non-compliant floats, and a single one
      anywhere in a batch fails the whole upsert (incl. NaN in object/string cols).
    - Whole-valued floats → int: pandas ``iterrows`` upcasts integer columns to
      float (0 → 0.0), and Postgres int columns reject "0.0". Numeric columns
      accept an int just fine, so this is safe across both.
    - numpy/pandas scalars (int64, bool_, …) → python natives, so json can encode
      them.
    """
    if isinstance(o, float):
        if math.isnan(o) or math.isinf(o):
            return None
        return int(o) if o.is_integer() else o
    if isinstance(o, dict):
        return {k: _json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_json_safe(v) for v in o]
    if hasattr(o, "item"):  # numpy/pandas scalar → python native, then re-check
        try:
            return _json_safe(o.item())
        except Exception:
            return o
    return o

try:
    from supabase import create_client
except ImportError:  # keep import-light for backtest-only use
    create_client = None


def _client():
    if create_client is None:
        raise RuntimeError("supabase package not installed: pip install -r requirements.txt")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see python/.env.example).")
    return create_client(url, key)


def _records(df: pd.DataFrame) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    recs = []
    for _, r in df.iterrows():
        recs.append({
            "season": int(r["season"]),
            "week": int(r["week"]),
            "player_id": str(r["player_id"]),
            "position": r["position"],
            "team": r["team"],
            "opponent": r["opponent"],
            "name": r.get("name"),
            "proj_ppr": float(r["proj_ppr"]),
            "proj_half": float(r["proj_half"]),
            "proj_std": float(r["proj_std"]),
            "floor": float(r["floor"]),
            "ceiling": float(r["ceiling"]),
            "components": r["components"],  # jsonb
            "model_version": r["model_version"],
            "updated_at": now,
        })
    return [_json_safe(rec) for rec in recs]


def publish_projections(df: pd.DataFrame, run_metrics: dict | None = None) -> int:
    """Upsert projection rows; optionally log a projection_runs row. Returns count."""
    if df.empty:
        print("Nothing to publish (empty projection).")
        return 0

    # A weekly projection needs a team and an opponent. Preseason backfill projects
    # every player with usable history — including retired/free-agent players who
    # aren't on a current roster, so they carry no team, no opponent, and 0 points.
    # Drop them so we only publish players actually slated to play that week.
    before = len(df)
    df = df[df["team"].notna() & df["opponent"].notna()]
    dropped = before - len(df)
    if dropped:
        print(f"Skipped {dropped} players with no current team/opponent.")
    if df.empty:
        print("Nothing to publish after filtering.")
        return 0

    client = _client()
    recs = _records(df)
    # Chunk to stay well under payload limits.
    for i in range(0, len(recs), 500):
        client.table("player_projections").upsert(
            recs[i:i + 500], on_conflict="season,week,player_id,model_version"
        ).execute()

    if run_metrics is not None:
        client.table("projection_runs").insert({
            "season": int(df["season"].iloc[0]),
            "week": int(df["week"].iloc[0]),
            "model_version": df["model_version"].iloc[0],
            "backtest_metrics": run_metrics,
        }).execute()

    print(f"Published {len(recs)} projections to Supabase.")
    return len(recs)


# ── OC history (scheme / coach / utilization) ─────────────────────────────────

def _upsert_df(table: str, df: pd.DataFrame, on_conflict: str, columns: list[str]) -> int:
    """Generic chunked upsert of a DataFrame's `columns` into `table`. NaN/Inf are
    coerced to null so a single bad float can't fail the batch (see _json_safe)."""
    if df is None or df.empty:
        print(f"Nothing to publish to {table} (empty).")
        return 0
    now = datetime.now(timezone.utc).isoformat()
    recs = []
    for _, r in df.iterrows():
        rec = {c: (r[c] if c in df.columns else None) for c in columns}
        rec["updated_at"] = now
        recs.append(_json_safe(rec))
    client = _client()
    for i in range(0, len(recs), 500):
        client.table(table).upsert(recs[i:i + 500], on_conflict=on_conflict).execute()
    print(f"Published {len(recs)} rows to {table}.")
    return len(recs)


_SCHEME_COLS = [
    "season", "team", "plays", "pass_rate", "proe", "adot", "deep_rate",
    "shotgun_rate", "no_huddle_rate", "epa_play", "pass_epa", "rush_epa",
    "success_rate", "cpoe", "scramble_rate", "head_coach",
]
_COACH_COLS = ["season", "team", "head_coach", "plays", "is_primary"]
_UTIL_COLS = [
    "season", "team", "player_id", "sleeper_id", "name", "targets", "receptions",
    "rec_air_yards", "carries", "rz_targets", "rz_carries", "target_share",
    "carry_share", "air_yard_share", "rz_target_share", "rz_carry_share",
]


def publish_scheme(df: pd.DataFrame) -> int:
    return _upsert_df("team_scheme_seasons", df, "season,team", _SCHEME_COLS)


def publish_coach_history(df: pd.DataFrame) -> int:
    # `primary` is a reserved word in Postgres → the column is is_primary.
    if df is not None and not df.empty and "primary" in df.columns:
        df = df.rename(columns={"primary": "is_primary"})
    return _upsert_df("coach_seasons", df, "season,team,head_coach", _COACH_COLS)


def publish_player_utilization(df: pd.DataFrame) -> int:
    return _upsert_df("player_utilization_seasons", df, "season,team,player_id", _UTIL_COLS)
