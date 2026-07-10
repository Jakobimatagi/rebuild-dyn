// Read-only access to the weekly projections published to Supabase by the
// offline Python pipeline (python/projections). The browser only ever reads
// these rows (anon SELECT under RLS); the pipeline writes them server-side with
// the service-role key. See docs/migrations/player_projections_schema.sql.

import { fetchAllRows } from "./supabase.js";
import { fetchSleeper, safeLocalStorageWrite } from "./sleeperApi.js";
import { projectionPercentiles } from "./dynastyValue.js";

// Pure lineup/matchup math lives in its own dependency-free module so it can be
// unit-tested in isolation (lineupMath.test.mjs). Re-exported for callers.
export { optimalLineup, winProbability } from "./lineupMath.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

// Bumped when the fetch logic changes in a way that invalidates cached rows.
// v2: reads are paged past PostgREST's 1000-row cap — v1 caches may hold a
// silently truncated season (the table is ~16k rows/season).
const CACHE_VERSION = 2;

// Season-wide pulls exceed the 1000-row select cap, so page through .range()
// ordered by the primary key (week, player_id, model_version) for stable pages.
function fetchProjectionRows(season, columns, week = null) {
  return fetchAllRows("player_projections", columns, ["week", "player_id", "model_version"], (q) => {
    q = q.eq("season", season);
    if (week != null) q = q.eq("week", week);
    return q;
  });
}

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
      const { v, timestamp, rows } = JSON.parse(cached);
      if (v === CACHE_VERSION && Date.now() - timestamp < ONE_HOUR_MS) {
        return indexRows(rows, season, week);
      }
    }
  } catch {
    // ignore cache read issues
  }

  try {
    const data = await fetchProjectionRows(
      season,
      "player_id, position, name, team, opponent, proj_ppr, proj_half, proj_std, floor, ceiling, components",
      week,
    );
    safeLocalStorageWrite(
      cacheKey,
      JSON.stringify({ v: CACHE_VERSION, timestamp: Date.now(), rows: data }),
    );
    return indexRows(data, season, week);
  } catch {
    // Table not migrated yet, network error, etc. — treat as "no projections".
    return { byPlayerId: new Map(), count: 0, season, week, unavailable: true };
  }
}

/**
 * Per-player season-average projection (mean proj_ppr / floor / ceiling across
 * all published weeks of a season), indexed by Sleeper player_id. This is the
 * "typical week" projection the Power Rankings tab feeds into each team's
 * optimal lineup to get its projected max points per week.
 *
 * Returns { byPlayerId: Map, count }. Never throws — an unmigrated table or a
 * network error yields an empty map so the caller degrades to results-based
 * strength.
 */
export async function fetchSeasonProjectionAverages(season) {
  if (!season) return { byPlayerId: new Map(), count: 0 };
  const cacheKey = `dyn_proj_avg_${season}`;
  let rows = null;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.v === CACHE_VERSION && Date.now() - parsed.timestamp < ONE_HOUR_MS) {
        rows = parsed.rows;
      }
    }
  } catch {
    // ignore cache read issues
  }

  if (!rows) {
    try {
      rows = await fetchProjectionRows(season, "player_id, position, proj_ppr, floor, ceiling");
      safeLocalStorageWrite(
        cacheKey,
        JSON.stringify({ v: CACHE_VERSION, timestamp: Date.now(), rows }),
      );
    } catch {
      return { byPlayerId: new Map(), count: 0, unavailable: true };
    }
  }

  // Average each metric across the season's published weeks → one row/player.
  const acc = new Map(); // id → { position, p:[sum,n], f:[sum,n], c:[sum,n] }
  for (const r of rows) {
    const id = String(r.player_id);
    const cur = acc.get(id) || { position: r.position, p: 0, f: 0, c: 0, n: 0 };
    if (r.proj_ppr != null) cur.p += Number(r.proj_ppr);
    if (r.floor != null) cur.f += Number(r.floor);
    if (r.ceiling != null) cur.c += Number(r.ceiling);
    cur.n += 1;
    acc.set(id, cur);
  }
  const byPlayerId = new Map();
  for (const [id, v] of acc) {
    if (v.n === 0) continue;
    byPlayerId.set(id, {
      position: v.position,
      proj_ppr: v.p / v.n,
      floor: v.f / v.n,
      ceiling: v.c / v.n,
    });
  }
  return { byPlayerId, count: byPlayerId.size };
}

/**
 * Projected points-per-game per Sleeper player_id for a season, in the league's
 * scoring (PPR / half / standard). "Per game" = the mean of the published weekly
 * projections, so it's a true forward look rather than last year's box scores.
 * Used by the live draft's Best Available board so the PPG column reflects what
 * we expect this season, not stale history (a retired player has no rows here).
 *
 * Returns a Map(player_id → ppg). Never throws — an unmigrated table or network
 * error yields an empty Map so callers fall back to historical PPG.
 */
export async function fetchSeasonProjectedPpg(season, ppr = 1) {
  if (!season) return new Map();
  const col = ppr >= 1 ? "proj_ppr" : ppr >= 0.5 ? "proj_half" : "proj_std";
  const cacheKey = `dyn_proj_ppg_${season}_${col}`;
  let rows = null;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { v, timestamp, rows: cachedRows } = JSON.parse(cached);
      if (v === CACHE_VERSION && Date.now() - timestamp < ONE_HOUR_MS) rows = cachedRows;
    }
  } catch {
    // ignore cache read issues
  }

  if (!rows) {
    try {
      rows = await fetchProjectionRows(season, `player_id, ${col}`);
      safeLocalStorageWrite(
        cacheKey,
        JSON.stringify({ v: CACHE_VERSION, timestamp: Date.now(), rows }),
      );
    } catch {
      return new Map();
    }
  }

  // Average the scoring column across the season's published weeks → one ppg/player.
  const acc = new Map(); // player_id → { sum, n }
  for (const r of rows) {
    const v = r[col];
    if (v == null) continue;
    const id = String(r.player_id);
    const cur = acc.get(id) || { sum: 0, n: 0 };
    cur.sum += Number(v);
    cur.n += 1;
    acc.set(id, cur);
  }
  const out = new Map();
  for (const [id, v] of acc) if (v.n > 0) out.set(id, v.sum / v.n);
  return out;
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
      const { v, timestamp, rows } = JSON.parse(cached);
      if (v === CACHE_VERSION && Date.now() - timestamp < ONE_HOUR_MS) {
        return projectionPercentiles(rows);
      }
    }
  } catch {
    // ignore cache read issues
  }

  try {
    const data = await fetchProjectionRows(season, "player_id, position, proj_ppr");

    // Average proj_ppr across the season's published weeks → one pace row/player.
    const acc = new Map(); // player_id → { position, sum, n }
    for (const r of data) {
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
    safeLocalStorageWrite(
      cacheKey,
      JSON.stringify({ v: CACHE_VERSION, timestamp: Date.now(), rows }),
    );
    return projectionPercentiles(rows);
  } catch {
    return new Map();
  }
}
