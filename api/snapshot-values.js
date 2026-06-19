// ── Daily value snapshot cron ────────────────────────────────────────────────
// Captures point-in-time dynasty values into Supabase so the Trade Report Card can
// show what assets were worth *at the time* of a trade. Neither FantasyCalc nor
// RosterAudit exposes a dated historical endpoint, so we snapshot the current
// values once a day and accumulate our own history going forward.
//
// Scheduled via vercel.json crons. Writes with the Supabase service-role key
// (bypasses RLS — see docs/migrations/value_snapshots_schema.sql).
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: CRON_SECRET.

import { createClient } from "@supabase/supabase-js";

// Canonical formats we snapshot. Most leagues fall into one of these; off-format
// leagues reprice against the nearest match. Add formats here when needed — the
// schema needs no migration.
const FORMATS = [
  { key: "sf_12", numQbs: 2, numTeams: 12, raFormat: "sf" },
  { key: "1qb_12", numQbs: 1, numTeams: 12, raFormat: "1qb" },
];

const FC_BASE = "https://api.fantasycalc.com";
const RA_BASE = "https://rosteraudit.com/wp-json/ra/v1";

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── FantasyCalc players ───────────────────────────────────────────────────────
async function fetchFcRows(format, snapDate) {
  const q = new URLSearchParams({
    isDynasty: "true",
    numQbs: String(format.numQbs),
    numTeams: String(format.numTeams),
    ppr: "1",
  });
  const res = await fetch(`${FC_BASE}/values/current?${q}`);
  if (!res.ok) throw new Error(`FC ${format.key}: ${res.status}`);
  const data = await res.json();
  const rows = [];
  for (const entry of Array.isArray(data) ? data : []) {
    const sid = entry?.player?.sleeperId;
    const pos = entry?.player?.position;
    const value = Number(entry?.value || 0);
    if (!sid || pos === "PICK" || !(value > 0)) continue; // picks handled via RA
    rows.push({
      snap_date: snapDate,
      source: "fc",
      format: format.key,
      sleeper_id: String(sid),
      name: entry.player.name || null,
      position: pos || null,
      value: Math.round(value),
      trend_30d: null,
    });
  }
  return rows;
}

// ── RosterAudit players (paginated) ──────────────────────────────────────────
async function fetchRaRows(format, snapDate) {
  const buildUrl = (page) =>
    `${RA_BASE}/rankings?format=${format.raFormat}&position=all&per_page=100&page=${page}&league_size=${format.numTeams}`;
  const first = await (await fetch(buildUrl(1))).json();
  const totalPages = Number(first.total_pages || 1);
  const rest = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          fetch(buildUrl(i + 2)).then((r) => r.json()),
        ),
      )
    : [];
  const all = [...(first.players || []), ...rest.flatMap((p) => p.players || [])];

  const rows = [];
  for (const p of all) {
    const sid = p?.sleeper_id;
    const value = Number(p?.value || 0);
    if (!sid || !(value > 0)) continue;
    rows.push({
      snap_date: snapDate,
      source: "ra",
      format: format.key,
      sleeper_id: String(sid),
      name: p.name || null,
      position: p.position || null,
      value: Math.round(value),
      trend_30d: p.trend_30d != null ? Math.round(Number(p.trend_30d)) : null,
    });
  }
  return rows;
}

// ── RosterAudit picks ─────────────────────────────────────────────────────────
async function fetchRaPickRows(format, snapDate) {
  const res = await fetch(`${RA_BASE}/picks`);
  if (!res.ok) return [];
  const data = await res.json();
  const valKey = format.raFormat === "sf" ? "val_sf" : "val_1qb";
  const rows = [];
  for (const pk of data?.picks || []) {
    const value = Number(pk[valKey] || 0);
    if (!(value > 0)) continue;
    rows.push({
      snap_date: snapDate,
      source: "ra",
      format: format.key,
      season: String(pk.pick_season),
      round: Number(pk.pick_round),
      slot: String(pk.pick_slot),
      value: Math.round(value),
    });
  }
  return rows;
}

async function upsertChunked(supabase, table, rows, conflict) {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: conflict });
    if (error) throw error;
  }
}

export default async function handler(req, res) {
  // Optional shared-secret guard for the cron endpoint.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers?.authorization || "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: "Supabase env not configured" });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const snapDate = today();

  try {
    const playerRows = [];
    const pickRows = [];
    for (const format of FORMATS) {
      const [fc, ra, raPicks] = await Promise.all([
        fetchFcRows(format, snapDate).catch(() => []),
        fetchRaRows(format, snapDate).catch(() => []),
        fetchRaPickRows(format, snapDate).catch(() => []),
      ]);
      playerRows.push(...fc, ...ra);
      pickRows.push(...raPicks);
    }

    await upsertChunked(
      supabase, "value_snapshots", playerRows,
      "snap_date,source,format,sleeper_id",
    );
    await upsertChunked(
      supabase, "pick_value_snapshots", pickRows,
      "snap_date,source,format,season,round,slot",
    );

    return res.status(200).json({
      ok: true,
      snap_date: snapDate,
      players: playerRows.length,
      picks: pickRows.length,
    });
  } catch (err) {
    return res.status(502).json({ error: String(err?.message || err) });
  }
}
