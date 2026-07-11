// Fetches weekly projected vs actual fantasy points from Sleeper.
//
// Unlike the season-stats endpoint used elsewhere (api.sleeper.app/v1), the
// per-week projections + box scores live on api.sleeper.com and send
// `access-control-allow-origin: *`, so the browser can read them directly.
// We fetch the four fantasy positions per week and merge proj+actual into one
// row per player. Completed weeks are immutable, so we cache aggressively.

import { safeLocalStorageWrite } from "./sleeperApi.js";

// Direct in prod; dev proxies through Vite (see vite.config.js) to keep the
// Network tab tidy and dodge any future CORS surprises.
const SLEEPER_V2_BASE = import.meta.env.DEV ? "/sleeper2" : "https://api.sleeper.com";

const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE"];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function posQuery() {
  return FANTASY_POSITIONS.map((p) => `position[]=${p}`).join("&");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  return res.json();
}

// Sleeper rows look like { player_id, player: {...}, stats: { pts_ppr, ... } }.
// Pull just what we need; pts_ppr is null for players who didn't suit up.
function pts(row) {
  const v = row?.stats?.pts_ppr;
  return v == null ? null : Number(v);
}

function meta(row) {
  const p = row?.player || {};
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return {
    position: p.position || p.fantasy_positions?.[0] || null,
    name: name || null,
    team: row?.team || p.team || null,
  };
}

/**
 * Merged projected + actual rows for one (season, week), keyed by player_id.
 * Returns a Map: player_id → { player_id, position, name, team, opponent, week, proj, actual }.
 * Cached in localStorage for 30 days (past weeks never change).
 */
export async function fetchWeeklyScores(season, week) {
  if (!season || !week) return new Map();

  // v2: rows now carry `opponent` — older cached rows lack it, so the key is
  // versioned to force a refetch rather than serving opponent-less data.
  const cacheKey = `dyn_wk_scores_v2_${season}_${week}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, rows } = JSON.parse(cached);
      if (Date.now() - timestamp < THIRTY_DAYS_MS) {
        return new Map(rows.map((r) => [r.player_id, r]));
      }
    }
  } catch {
    // ignore cache read issues
  }

  const qs = `season_type=regular&${posQuery()}`;
  const [projRows, statRows] = await Promise.all([
    fetchJson(`${SLEEPER_V2_BASE}/projections/nfl/${season}/${week}?${qs}`),
    fetchJson(`${SLEEPER_V2_BASE}/stats/nfl/${season}/${week}?${qs}`),
  ]);

  const merged = new Map();
  for (const row of projRows || []) {
    const id = String(row.player_id);
    merged.set(id, {
      player_id: id, week, ...meta(row),
      opponent: row.opponent ?? null,
      proj: pts(row), actual: null,
    });
  }
  for (const row of statRows || []) {
    const id = String(row.player_id);
    const cur = merged.get(id) || {
      player_id: id, week, ...meta(row), opponent: null, proj: null, actual: null,
    };
    cur.actual = pts(row);
    // stats carry the freshest team/metadata; fill any gaps from projections
    const m = meta(row);
    cur.position = cur.position || m.position;
    cur.name = cur.name || m.name;
    cur.team = m.team || cur.team;
    cur.opponent = row.opponent ?? cur.opponent;
    merged.set(id, cur);
  }

  const rows = [...merged.values()];
  safeLocalStorageWrite(cacheKey, JSON.stringify({ timestamp: Date.now(), rows }));
  return merged;
}

/**
 * All weekly score rows for a full regular season (weeks 1..maxWeek), flattened
 * into a single array of { player_id, position, name, team, week, proj, actual }
 * ready for hotStreaks.buildPlayerStreaks. Weeks that fail to load are skipped.
 * `onProgress(done, total)` fires after each week resolves for a loading bar.
 */
export async function fetchSeasonWeeklyScores(season, maxWeek = 18, onProgress) {
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
  let done = 0;
  const results = await Promise.all(
    weeks.map((week) =>
      fetchWeeklyScores(season, week)
        .catch(() => new Map())
        .finally(() => {
          done += 1;
          if (onProgress) onProgress(done, maxWeek);
        }),
    ),
  );
  const entries = [];
  for (const map of results) {
    for (const row of map.values()) entries.push(row);
  }
  return entries;
}
