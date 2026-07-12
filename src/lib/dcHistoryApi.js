// Read-only access to the DC-Blueprint table published by the offline Python
// pipeline (python/projections/defense_scheme.py → store.py) from nflverse
// play-by-play:
//   defense_scheme_seasons   per (season, team) defensive scheme fingerprint
//
// Browser reads with the anon key under RLS (SELECT only); the pipeline writes
// with the service-role key (python -m projections publish-dc). Degrades to an
// empty result if the table isn't migrated/published yet, so the Matchup Lab
// never hard-fails. See docs/migrations/dc_history_schema.sql.

import { fetchAllRows } from "./supabase.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_KEY = "dyn_dc_scheme_v1";

/**
 * All defensive fingerprint rows, cached one day. Returns
 * [{ season, team, plays, epa_play_allowed, …, sack_rate, head_coach }] —
 * empty array when unavailable.
 */
export async function fetchDefenseSchemeSeasons() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { timestamp, rows } = JSON.parse(cached);
      if (Date.now() - timestamp < ONE_DAY_MS) return rows;
    }
  } catch {
    // ignore cache read issues
  }

  try {
    const rows = await fetchAllRows(
      "defense_scheme_seasons",
      "season, team, plays, epa_play_allowed, pass_epa_allowed, rush_epa_allowed, "
        + "success_rate_allowed, cpoe_allowed, pass_rate_faced, proe_faced, adot_faced, "
        + "deep_rate_allowed, sack_rate, int_rate, qb_hit_rate, head_coach",
      ["season", "team"],
    );
    // Don't cache emptiness: the table may be published at any moment, and a
    // cached [] would hide it for a day.
    if (rows && rows.length > 0) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), rows }));
      } catch {
        // quota / private mode — non-fatal
      }
    }
    return rows || [];
  } catch {
    // Table not migrated yet, network error, etc. — the UI just hides DC chips.
    return [];
  }
}

/**
 * Fingerprint for a team at-or-nearest-below `season` from the fetched rows —
 * a team's newest published season when the anchor season isn't published yet.
 */
export function defenseFingerprintFor(rows, team, season) {
  let best = null;
  for (const r of rows || []) {
    if (r.team !== team || r.season > season) continue;
    if (!best || r.season > best.season) best = r;
  }
  return best;
}
