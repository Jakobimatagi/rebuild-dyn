import { safeLocalStorageWrite } from "./sleeperApi.js";

const FANTASYCALC_BASE_URL = "https://api.fantasycalc.com";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TRADES_WINDOW_MS = 7 * ONE_DAY_MS;
const TRADES_REFRESH_MS = 6 * 60 * 60 * 1000; // re-fetch at most every 6h

function clampPpr(rec = 0) {
  if (rec >= 1) return 1;
  if (rec >= 0.5) return 0.5;
  return 0;
}

function getFantasyCalcParams(league) {
  const rosterPositions = league?.roster_positions || [];
  const scoring = league?.scoring_settings || {};
  const qbStarters = rosterPositions.filter((slot) => slot === "QB").length;
  const isSuperflex = qbStarters > 1 || rosterPositions.includes("SUPER_FLEX");

  return {
    isDynasty: true,
    numQbs: isSuperflex ? 2 : 1,
    numTeams: Number(league?.total_rosters || 12),
    ppr: clampPpr(Number(scoring.rec ?? 0)),
  };
}

function getCacheKey(params) {
  return `fantasycalc_values_${params.isDynasty}_${params.numQbs}_${params.numTeams}_${params.ppr}`;
}

export async function fetchFantasyCalcValues(league) {
  const params = getFantasyCalcParams(league);
  const cacheKey = getCacheKey(params);

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        Date.now() - parsed.timestamp < ONE_DAY_MS &&
        Array.isArray(parsed.data)
      ) {
        return parsed.data;
      }
    }
  } catch {
    // ignore cache issues
  }

  const query = new URLSearchParams({
    isDynasty: String(params.isDynasty),
    numQbs: String(params.numQbs),
    numTeams: String(params.numTeams),
    ppr: String(params.ppr),
  });
  const res = await fetch(
    `${FANTASYCALC_BASE_URL}/values/current?${query.toString()}`,
  );
  if (!res.ok) throw new Error(`FantasyCalc API error: ${res.status}`);

  const data = await res.json();

  safeLocalStorageWrite(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
  return data;
}

// ---------------------------------------------------------------------------
// Recent trades — rolling 7-day window accumulator.
//
// FantasyCalc's /trades endpoint returns only the ~50 most recent community
// trades and ignores pagination/date params. A single fetch covers ~9 hours.
// To build a useful market-comp database we fetch periodically, merge into
// a localStorage-backed window, dedupe by trade id, and prune anything older
// than TRADES_WINDOW_MS. After a week of use this accumulates ~1000+ trades
// with broad player coverage.
// ---------------------------------------------------------------------------

function getTradesCacheKey(params) {
  return `fantasycalc_trades_${params.isDynasty}_${params.numQbs}_${params.numTeams}_${params.ppr}`;
}

function readTradesCache(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return { timestamp: 0, trades: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.trades)) return { timestamp: 0, trades: [] };
    return { timestamp: parsed.timestamp || 0, trades: parsed.trades };
  } catch {
    return { timestamp: 0, trades: [] };
  }
}

function mergeTrades(existing, incoming) {
  const cutoff = Date.now() - TRADES_WINDOW_MS;
  const byId = new Map();
  for (const t of existing) {
    if (t?.id && new Date(t.date).getTime() >= cutoff) byId.set(t.id, t);
  }
  for (const t of incoming) {
    if (!t?.id) continue;
    if (new Date(t.date).getTime() < cutoff) continue;
    byId.set(t.id, t);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export async function fetchFantasyCalcTrades(league) {
  const params = getFantasyCalcParams(league);
  const cacheKey = getTradesCacheKey(params);
  const cached = readTradesCache(cacheKey);

  // Skip the network fetch if we pulled recently — the endpoint moves slowly
  // and returns only 50 trades, so polling more often than every few hours
  // wastes bandwidth without adding coverage.
  if (Date.now() - cached.timestamp < TRADES_REFRESH_MS) {
    return mergeTrades(cached.trades, []);
  }

  try {
    const query = new URLSearchParams({
      isDynasty: String(params.isDynasty),
      numQbs: String(params.numQbs),
      numTeams: String(params.numTeams),
      ppr: String(params.ppr),
    });
    const res = await fetch(
      `${FANTASYCALC_BASE_URL}/trades?${query.toString()}`,
    );
    if (!res.ok) return mergeTrades(cached.trades, []);

    const data = await res.json();
    const incoming = Array.isArray(data) ? data : [];
    const merged = mergeTrades(cached.trades, incoming);

    safeLocalStorageWrite(
      cacheKey,
      JSON.stringify({ timestamp: Date.now(), trades: merged }),
    );
    return merged;
  } catch {
    return mergeTrades(cached.trades, []);
  }
}
