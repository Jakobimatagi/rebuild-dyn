// Read-only access to the weekly projections published to Supabase by the
// offline Python pipeline (python/projections). The browser only ever reads
// these rows (anon SELECT under RLS); the pipeline writes them server-side with
// the service-role key. See docs/migrations/player_projections_schema.sql.

import { supabase } from "./supabase.js";
import { fetchSleeper, safeLocalStorageWrite } from "./sleeperApi.js";
import { projectionPercentiles } from "./dynastyValue.js";

// Pure lineup/matchup math lives in its own dependency-free module so it can be
// unit-tested in isolation (lineupMath.test.mjs). Re-exported for callers.
export { optimalLineup, winProbability } from "./lineupMath.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Current NFL season/week. During the offseason `week` is 0. */
export async function fetchNflState() {
  return fetchSleeper("/state/nfl");
}

/** Head-to-head matchups for a league week (rosters grouped by matchup_id). */
export async function fetchMatchups(leagueId, week) {
  if (!leagueId || !week) return [];
  return fetchSleeper(`/league/${leagueId}/matchups/${week}`).catch(() => []);
}

function indexRows(rows, season, week) {
  const byPlayerId = new Map();
  for (const r of rows || []) byPlayerId.set(String(r.player_id), r);
  return { byPlayerId, count: byPlayerId.size, season, week };
}

/**
 * Projections for one (season, week), indexed by Sleeper player_id. Cached in
 * localStorage for an hour. If the table doesn't exist yet or the read fails,
 * resolves to an empty, `unavailable: true` result so the UI degrades to an
 * empty state instead of throwing.
 */
export async function fetchProjections(season, week) {
  if (!season || !week) return { byPlayerId: new Map(), count: 0, season, week };

  const cacheKey = `dyn_proj_${season}_${week}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, rows } = JSON.parse(cached);
      if (Date.now() - timestamp < ONE_HOUR_MS) return indexRows(rows, season, week);
    }
  } catch {
    // ignore cache read issues
  }

  try {
    const { data, error } = await supabase
      .from("player_projections")
      .select(
        "player_id, position, name, team, opponent, proj_ppr, proj_half, proj_std, floor, ceiling, components",
      )
      .eq("season", season)
      .eq("week", week);
    if (error) throw error;
    safeLocalStorageWrite(cacheKey, JSON.stringify({ timestamp: Date.now(), rows: data || [] }));
    return indexRows(data, season, week);
  } catch {
    // Table not migrated yet, network error, etc. — treat as "no projections".
    return { byPlayerId: new Map(), count: 0, season, week, unavailable: true };
  }
}

/**
 * Forward production percentile (0-99, within position) per Sleeper player_id,
 * derived from the nflverse-enriched weekly projections — the bridge that feeds
 * dynastyValue.computeDynastyValue's `projPctile`.
 *
 * "Season pace" = the mean projected PPR across all published weeks for the
 * season, so a single noisy matchup doesn't define a player's forward signal.
 * Returns an empty Map (never throws) when the table isn't migrated / no rows,
 * so the fused dynasty value degrades gracefully to grade + age-curve + market.
 */
export async function fetchSeasonPaceProjPercentiles(season) {
  if (!season) return new Map();
  const cacheKey = `dyn_proj_pace_${season}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, rows } = JSON.parse(cached);
      if (Date.now() - timestamp < ONE_HOUR_MS) return projectionPercentiles(rows);
    }
  } catch {
    // ignore cache read issues
  }

  try {
    const { data, error } = await supabase
      .from("player_projections")
      .select("player_id, position, proj_ppr")
      .eq("season", season);
    if (error) throw error;

    // Average proj_ppr across the season's published weeks → one pace row/player.
    const acc = new Map(); // player_id → { position, sum, n }
    for (const r of data || []) {
      if (r.proj_ppr == null) continue;
      const id = String(r.player_id);
      const cur = acc.get(id) || { position: r.position, sum: 0, n: 0 };
      cur.sum += Number(r.proj_ppr);
      cur.n += 1;
      acc.set(id, cur);
    }
    const rows = [...acc.entries()].map(([player_id, v]) => ({
      player_id,
      position: v.position,
      proj_ppr: v.n > 0 ? v.sum / v.n : null,
    }));
    safeLocalStorageWrite(cacheKey, JSON.stringify({ timestamp: Date.now(), rows }));
    return projectionPercentiles(rows);
  } catch {
    return new Map();
  }
}
