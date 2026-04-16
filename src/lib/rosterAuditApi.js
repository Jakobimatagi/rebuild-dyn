/**
 * rosterAuditApi.js
 * Fetches dynasty player values and pick values from RosterAudit.
 */

const RA_BASE_URL = import.meta.env.DEV
  ? "/rosteraudit"
  : "/api/rosteraudit";

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
// Fetch all player rankings (paginated — RA caps at 100/page)
// ---------------------------------------------------------------------------
export async function fetchRosterAuditValues(league) {
  const format = getRaFormat(league);
  const numTeams = Number(league?.total_rosters || 12);

  // Paginate through all results
  const allPlayers = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const params = new URLSearchParams({
      format,
      position: "all",
      per_page: "100",
      page: String(page),
      league_size: String(numTeams),
    });
    const url = import.meta.env.DEV
      ? `${RA_BASE_URL}/rankings?${params.toString()}`
      : `${RA_BASE_URL}?path=rankings&${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RosterAudit API error: ${res.status}`);

    const json = await res.json();
    const players = json.players || [];
    allPlayers.push(...players);
    totalPages = json.total_pages || 1;
    page++;
  }

  return allPlayers;
}

// ---------------------------------------------------------------------------
// Fetch pick values
// ---------------------------------------------------------------------------
export async function fetchRosterAuditPicks() {
  const url = import.meta.env.DEV
    ? `${RA_BASE_URL}/picks`
    : `${RA_BASE_URL}?path=picks`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RosterAudit picks API error: ${res.status}`);

  const json = await res.json();

  return json;
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

  return { bySleeperId, pickValues };
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
