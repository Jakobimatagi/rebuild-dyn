// Read-only access to the OC-history tables published by the offline Python
// pipeline (python/projections/scheme.py → store.py) from nflverse play-by-play:
//   team_scheme_seasons        per (season, team) offensive scheme fingerprint
//   coach_seasons              head-coach stints (the coach-tree spine)
//   player_utilization_seasons true per-player usage shares, 1999+
//
// Browser reads with the anon key under RLS (SELECT only); the pipeline writes
// with the service-role key. Every call degrades gracefully to an empty result
// if the tables aren't migrated/published yet, so the OC tool never hard-fails.
// See docs/migrations/oc_history_schema.sql.

import { supabase } from "./supabase.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function readCache(key, maxAgeMs) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { timestamp, rows } = JSON.parse(cached);
    if (Date.now() - timestamp < maxAgeMs) return rows;
  } catch {
    // ignore cache read issues
  }
  return null;
}

function writeCache(key, rows) {
  try {
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), rows }));
  } catch {
    // quota / private mode — non-fatal
  }
}

// Supabase caps a select at 1000 rows by default; page through so multi-decade
// pulls (coach_seasons ~900, player_utilization ~15k) come back complete.
async function fetchAll(table, columns, applyFilters) {
  const pageSize = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    let q = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/** Head-coach stints across all seasons (coach_seasons). Feeds coachTree.js. */
export async function fetchCoachSeasons() {
  const key = "dyn_coach_seasons";
  const cached = readCache(key, ONE_DAY_MS);
  if (cached) return cached;
  try {
    const rows = await fetchAll("coach_seasons", "season, team, head_coach, plays, is_primary");
    writeCache(key, rows);
    return rows;
  } catch {
    return [];
  }
}

/** Per (season, team) scheme fingerprints (team_scheme_seasons). */
export async function fetchSchemeSeasons() {
  const key = "dyn_scheme_seasons";
  const cached = readCache(key, ONE_DAY_MS);
  if (cached) return cached;
  try {
    const rows = await fetchAll(
      "team_scheme_seasons",
      "season, team, plays, pass_rate, proe, adot, deep_rate, shotgun_rate, no_huddle_rate, epa_play, pass_epa, rush_epa, success_rate, cpoe, scramble_rate, head_coach",
    );
    writeCache(key, rows);
    return rows;
  } catch {
    return [];
  }
}

// Columns used across the utilization fetchers.
const UTIL_COLS =
  "season, team, player_id, sleeper_id, name, targets, receptions, rec_air_yards, carries, target_share, carry_share, air_yard_share, rz_target_share, rz_carry_share";

/** All seasons of true per-player usage shares — for team deep-dives, multi-season
 *  trends, and OC usage profiles (sliced client-side). ~15k rows, cached a day. */
export async function fetchAllUtilization() {
  const key = "dyn_player_util_all";
  const cached = readCache(key, ONE_DAY_MS);
  if (cached) return cached;
  try {
    const rows = await fetchAll("player_utilization_seasons", UTIL_COLS);
    writeCache(key, rows);
    return rows;
  } catch {
    return [];
  }
}

/** True per-player usage shares for one season (player_utilization_seasons). */
export async function fetchPlayerUtilization(season) {
  if (!season) return [];
  const key = `dyn_player_util_${season}`;
  const cached = readCache(key, ONE_DAY_MS);
  if (cached) return cached;
  try {
    const rows = await fetchAll(
      "player_utilization_seasons",
      "season, team, player_id, sleeper_id, name, targets, receptions, rec_air_yards, carries, target_share, carry_share, air_yard_share, rz_target_share, rz_carry_share",
      (q) => q.eq("season", season),
    );
    writeCache(key, rows);
    return rows;
  } catch {
    return [];
  }
}
