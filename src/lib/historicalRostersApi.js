// ── Historical roster fetcher (client) ───────────────────────────────────────
// Fetches the per-season `{ sleeper_id: { team, position, name } }` map from
// our /api/historical-rosters Vercel endpoint and caches it in localStorage.
// Past seasons are immutable so we cache 30 days; current season 1 day.
//
// This is what makes year-aware team attribution work in the OC rankings page —
// without it we'd bucket every 2022 stat under each player's *current* team.

import { safeLocalStorageWrite } from "./sleeperApi.js";

const ONE_DAY_MS    = 24 * 60 * 60 * 1000;
const THIRTY_DAYS   = 30 * ONE_DAY_MS;

export async function fetchHistoricalRoster(year) {
  const key = `historical_roster_${year}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      const isCurrent = year >= new Date().getFullYear();
      const ttl = isCurrent ? ONE_DAY_MS : THIRTY_DAYS;
      if (Date.now() - timestamp < ttl) return data;
    }
  } catch {
    // ignore cache read errors
  }

  const res = await fetch(`/api/historical-rosters?year=${year}`);
  if (!res.ok) throw new Error(`historical-rosters fetch failed: ${res.status}`);
  const data = await res.json();
  safeLocalStorageWrite(key, JSON.stringify({ timestamp: Date.now(), data }));
  return data;
}
