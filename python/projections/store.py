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
    """Recursively replace NaN/Inf with None so a record serializes to valid JSON.

    Supabase's client rejects non-compliant floats (``nan``/``inf``), and a single
    one anywhere in a batch fails the whole upsert. numpy/pandas NaNs are floats,
    so the float branch catches them (incl. NaN left in object/string columns).
    """
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {k: _json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_json_safe(v) for v in o]
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
