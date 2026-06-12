"""Publish projections to Supabase.

Writes use the service-role key (server-side only — never the anon key the
browser uses, never committed). The browser reads these rows with the anon key
under an RLS policy that allows SELECT only. See the migration in
docs/sql/projections.sql.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import pandas as pd

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
    return recs


def publish_projections(df: pd.DataFrame, run_metrics: dict | None = None) -> int:
    """Upsert projection rows; optionally log a projection_runs row. Returns count."""
    if df.empty:
        print("Nothing to publish (empty projection).")
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
