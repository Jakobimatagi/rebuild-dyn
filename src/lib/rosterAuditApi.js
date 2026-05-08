/**
 * rosterAuditApi.js
 * Fetches dynasty player values and pick values from RosterAudit.
 */

import { safeLocalStorageWrite } from "./sleeperApi.js";

const RA_BASE_URL = import.meta.env.DEV
  ? "/rosteraudit"
  : "/api/rosteraudit";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function readCache(key, ttlMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp < ttlMs && parsed.data !== undefined) {
      return parsed.data;
    }
  } catch {
    // ignore cache issues
  }
  return null;
}

// ---------------------------------------------------------------------------
// League ↔ RA format mapping
// ---------------------------------------------------------------------------
function getRaFormat(league) {
  const rosterPositions = league?.roster_positions || [];
  const qbStarters = rosterPositions.filter((s) => s === "QB").length;
  const isSuperflex =
    qbStarters > 1 || rosterPositions.includes("SUPER_FLEX");
  return isSuperflex ? "sf" : "1qb";
}

// ---------------------------------------------------------------------------
// Fetch all player rankings.
// Cached 24h in localStorage. Pages 2..N are fetched in parallel after page 1
// returns total_pages (RA caps at 100 players/page; ~5–6 pages typical).
// ---------------------------------------------------------------------------
export async function fetchRosterAuditValues(league) {
  const format = getRaFormat(league);
  const numTeams = Number(league?.total_rosters || 12);
  const cacheKey = `rosteraudit_values_${format}_${numTeams}`;

  const cached = readCache(cacheKey, ONE_DAY_MS);
  if (Array.isArray(cached)) return cached;

  const buildUrl = (page) => {
    const params = new URLSearchParams({
      format,
      position: "all",
      per_page: "100",
      page: String(page),
      league_size: String(numTeams),
    });
    return import.meta.env.DEV
      ? `${RA_BASE_URL}/rankings?${params.toString()}`
      : `${RA_BASE_URL}?path=rankings&${params.toString()}`;
  };

  const fetchPage = async (page) => {
    const res = await fetch(buildUrl(page));
    if (!res.ok) throw new Error(`RosterAudit API error: ${res.status}`);
    return res.json();
  };

  const firstPage = await fetchPage(1);
  const totalPages = Number(firstPage.total_pages || 1);
  const restPages =
    totalPages > 1
      ? await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(i + 2)),
        )
      : [];

  const allPlayers = [
    ...(firstPage.players || []),
    ...restPages.flatMap((p) => p.players || []),
  ];

  safeLocalStorageWrite(
    cacheKey,
    JSON.stringify({ timestamp: Date.now(), data: allPlayers }),
  );

  return allPlayers;
}

// ---------------------------------------------------------------------------
// Fetch pick values. Cached 24h in localStorage.
// ---------------------------------------------------------------------------
export async function fetchRosterAuditPicks() {
  const cacheKey = "rosteraudit_picks";

  const cached = readCache(cacheKey, ONE_DAY_MS);
  if (cached) return cached;

  const url = import.meta.env.DEV
    ? `${RA_BASE_URL}/picks`
    : `${RA_BASE_URL}?path=picks`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RosterAudit picks API error: ${res.status}`);

  const data = await res.json();

  safeLocalStorageWrite(
    cacheKey,
    JSON.stringify({ timestamp: Date.now(), data }),
  );

  return data;
}

// ---------------------------------------------------------------------------
// Build context (keyed by sleeperId, like FC)
// ---------------------------------------------------------------------------
export function buildRosterAuditContext(raValues = [], raPicks = null, format = "sf") {
  const bySleeperId = new Map();

  for (const entry of raValues) {
    const sid = String(entry.sleeper_id || "");
    if (!sid) continue;
    bySleeperId.set(sid, {
      value: Number(entry.value || 0),
      rankOverall: Number(entry.rank_overall || 0),
      rankPos: Number(entry.rank_pos || 0),
      trend7d: Number(entry.trend_7d || 0),
      trend30d: Number(entry.trend_30d || 0),
      tier: String(entry.tier || ""),
      buyLow: entry.buy_low === "1" || entry.buy_low === 1,
      sellHigh: entry.sell_high === "1" || entry.sell_high === 1,
      breakout: entry.breakout === "1" || entry.breakout === 1,
    });
  }

  const allSortedValues = raValues
    .map((e) => Number(e?.value || 0))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const maxRankOverall = raValues.reduce(
    (best, e) => Math.max(best, Number(e?.rank_overall || 0)),
    0,
  );

  // Build pick value lookup: keyed by `${season}-${round}-${slot}`
  // slot is "early"/"mid"/"late" — maps to our phaseSlot system
  const pickValues = {};
  if (raPicks?.picks) {
    const valKey = format === "sf" ? "val_sf" : "val_1qb";
    for (const pk of raPicks.picks) {
      const key = `${pk.pick_season}-${pk.pick_round}-${pk.pick_slot}`;
      pickValues[key] = Number(pk[valKey] || 0);
    }
  }

  return { bySleeperId, pickValues, allSortedValues, maxRankOverall: Math.max(1, maxRankOverall) };
}

// ---------------------------------------------------------------------------
// Map our phaseSlot ("early"/"mid"/"late") to RA pick_slot
// ---------------------------------------------------------------------------
const PHASE_TO_SLOT = {
  rebuild: "early",
  retool: "mid",
  contender: "late",
};

/**
 * Look up an RA-calibrated pick value (dollar scale).
 * Returns null if no RA data is available for this pick.
 */
export function rosterAuditPickValue(pick, ownerPhase, raContext) {
  if (!raContext?.pickValues || !pick?.round) return null;
  const currentYear = new Date().getFullYear();
  const season = Number(pick.season || currentYear);
  const slot = PHASE_TO_SLOT[ownerPhase] || "mid";
  const key = `${season}-${pick.round}-${slot}`;
  const val = raContext.pickValues[key];
  return val != null ? val : null;
}
