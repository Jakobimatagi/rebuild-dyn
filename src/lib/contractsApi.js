// Read-only access to the player_contracts table published by the offline Python
// pipeline (python/projections/contracts_table.py → store.py) from the nflverse
// `contracts` release (OverTheCap). One row per active player's current deal.
//
// Browser reads with the anon key under RLS (SELECT only); the pipeline writes with
// the service-role key. Degrades to an empty Map if the table isn't migrated/published
// yet, so the roster/deep-dive never hard-fails. See
// docs/migrations/player_contracts_schema.sql.
//
// Dollar fields (total_value, avg_annual_value, guaranteed) are in MILLIONS.

import { supabase } from "./supabase.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_KEY = "dyn_player_contracts";

const COLUMNS =
  "sleeper_id, player_name, position, team, total_value, years, avg_annual_value, year_signed, years_remaining, guaranteed";

function readCache(maxAgeMs) {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const { timestamp, rows } = JSON.parse(cached);
    if (Date.now() - timestamp < maxAgeMs) return rows;
  } catch {
    // ignore cache read issues
  }
  return null;
}

function writeCache(rows) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), rows }));
  } catch {
    // quota / private mode — non-fatal
  }
}

// Supabase caps a select at 1000 rows by default; page through so the full
// ~2.9k-row table comes back complete.
async function fetchAll(table, columns) {
  const pageSize = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

// sleeper_id -> contract row, for rows that linked to a Sleeper id (most do).
function toMap(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (r.sleeper_id != null) m.set(String(r.sleeper_id), r);
  }
  return m;
}

/** Map of sleeper_id → current contract (player_contracts). Cached a day; empty Map
 *  on any failure so callers can attach contracts best-effort. */
export async function fetchPlayerContractMap() {
  const cached = readCache(ONE_DAY_MS);
  if (cached) return toMap(cached);
  try {
    const rows = await fetchAll("player_contracts", COLUMNS);
    writeCache(rows);
    return toMap(rows);
  } catch {
    return new Map();
  }
}
