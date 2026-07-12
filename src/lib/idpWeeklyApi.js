// Weekly IDP (DL/LB/DB) + team-defense (DEF) data from Sleeper's v2 list
// endpoints (api.sleeper.com — CORS *, same host weeklyScoringApi uses). Rows
// there carry team + opponent, which the v1 season dict lacks, so this is the
// data spine for both matchup directions on the admin IDP page.
//
// Weekly rows are scored at fetch time (fixed scoring in idpScoring.js) and
// only the compact result is cached — a raw week is ~1 MB, the compact rows
// ~50 KB, and localStorage is shared with the big season-stat caches.

import { safeLocalStorageWrite } from "./sleeperApi.js";
import { scoreIdp, scoreDst } from "./idpScoring.js";

const SLEEPER_V2_BASE = import.meta.env.DEV ? "/sleeper2" : "https://api.sleeper.com";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const IDP_QUERY = ["DL", "LB", "DB", "DEF"].map((p) => `position[]=${p}`).join("&");
const OFF_QUERY = ["QB", "RB", "WR", "TE"].map((p) => `position[]=${p}`).join("&");

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  return res.json();
}

function rowPos(row) {
  const p = row?.player || {};
  return p.position || p.fantasy_positions?.[0] || null;
}

/**
 * Scored IDP/DEF rows for one (season, week):
 * [{ player_id, pos, team, opponent, week, pts }]. Players who didn't play
 * (no stats) are dropped. Cached 30 days — past weeks never change.
 */
export async function fetchIdpWeekly(season, week) {
  if (!season || !week) return [];

  const cacheKey = `dyn_idp_wk_${season}_${week}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, rows } = JSON.parse(cached);
      if (Date.now() - timestamp < THIRTY_DAYS_MS) return rows;
    }
  } catch {
    // ignore cache read issues
  }

  const raw = await fetchJson(
    `${SLEEPER_V2_BASE}/stats/nfl/${season}/${week}?season_type=regular&${IDP_QUERY}`,
  );

  const rows = [];
  for (const row of raw || []) {
    const id = String(row.player_id);
    if (id.startsWith("TEAM_")) continue; // offense aggregate rows, not defenses
    const pos = rowPos(row);
    if (!pos) continue;
    const stats = row.stats || {};
    const pts = pos === "DEF" ? scoreDst(stats) : scoreIdp(stats);
    // Keep only players with a real stat line — an all-zero IDP row is a DNP.
    if (pos !== "DEF" && pts === 0 && !stats.gp) continue;
    rows.push({
      player_id: id,
      pos,
      team: row.team || row.player?.team || null,
      opponent: row.opponent || null,
      week,
      pts,
    });
  }

  safeLocalStorageWrite(cacheKey, JSON.stringify({ timestamp: Date.now(), rows }));
  return rows;
}

/**
 * All scored IDP/DEF rows for a season (weeks 1..maxWeek), flattened. Weeks
 * that fail to load are skipped; `onProgress(done, total)` drives a loading bar.
 */
export async function fetchSeasonIdpWeekly(season, maxWeek = 18, onProgress) {
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
  let done = 0;
  const results = await Promise.all(
    weeks.map((week) =>
      fetchIdpWeekly(season, week)
        .catch(() => [])
        .finally(() => {
          done += 1;
          if (onProgress) onProgress(done, maxWeek);
        }),
    ),
  );
  return results.flat();
}

// Upcoming-week data changes as projections update, so memoize per session
// instead of localStorage.
const upcomingCache = new Map();

/**
 * Upcoming-week slate from Sleeper's offensive projections rows (the same
 * list shape as stats, with `team`/`opponent` on every row — the mirror of the
 * Python pipeline's opponent_map_from_projection):
 *   teamToOpp — Map(team → opponent) for every team on a bye-less slate
 *   baselines — [{ player_id, name, pos, team, opponent, proj }] (proj = pts_ppr)
 */
export async function fetchUpcomingWeek(season, week) {
  if (!season || !week) return { teamToOpp: new Map(), baselines: [] };
  const cacheKey = `${season}_${week}`;
  if (upcomingCache.has(cacheKey)) return upcomingCache.get(cacheKey);

  const raw = await fetchJson(
    `${SLEEPER_V2_BASE}/projections/nfl/${season}/${week}?season_type=regular&${OFF_QUERY}`,
  );

  const teamToOpp = new Map();
  const baselines = [];
  for (const row of raw || []) {
    const team = row.team || row.player?.team || null;
    const opponent = row.opponent || null;
    if (team && opponent && !teamToOpp.has(team)) teamToOpp.set(team, opponent);
    const pos = rowPos(row);
    const proj = row.stats?.pts_ppr;
    if (!pos || proj == null) continue;
    const p = row.player || {};
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    baselines.push({
      player_id: String(row.player_id),
      name: name || String(row.player_id),
      pos,
      team,
      opponent,
      proj: Number(proj),
    });
  }

  const result = { teamToOpp, baselines };
  upcomingCache.set(cacheKey, result);
  return result;
}
