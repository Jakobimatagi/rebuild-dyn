// Read-only access to community startup ADP published to Supabase by the weekly
// cron (api/refresh-startup-adp.js). The browser only reads (anon SELECT under
// RLS); the cron writes with the service-role key. See
// docs/migrations/startup_adp_schema.sql.

import { supabase } from "./supabase.js";
import { safeLocalStorageWrite } from "./sleeperApi.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Bucket a league to the nearest canonical format we store ADP for. ADP shape is
// driven far more by Superflex-vs-1QB and team count than by finer settings.
export function adpFormatKey(leagueContext) {
  const sf = leagueContext?.isSuperflex ? "sf" : "1qb";
  const teams = Number(leagueContext?.numTeams) || 12;
  const t = teams >= 13 ? 14 : teams <= 11 ? 10 : 12;
  return `${sf}_${t}`;
}

function indexAdp(rows) {
  const m = new Map();
  for (const r of rows || []) {
    m.set(String(r.sleeper_id), { adp: Number(r.value) || null, adpRank: Number(r.adp_rank) || null });
  }
  return m;
}

/**
 * Community ADP for the league's format, indexed by Sleeper id → { adp, adpRank }.
 * Cached a day in localStorage. Degrades to an empty Map when the table is missing
 * or the read fails, so callers fall back to value-rank availability.
 */
export async function fetchStartupAdp(leagueContext) {
  const format = adpFormatKey(leagueContext);
  const cacheKey = `startup_adp_${format}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < ONE_DAY_MS && Array.isArray(parsed.rows)) {
        return indexAdp(parsed.rows);
      }
    }
  } catch {
    // ignore cache issues
  }
  try {
    const { data, error } = await supabase
      .from("startup_adp")
      .select("sleeper_id, value, adp_rank")
      .eq("format", format);
    if (error || !Array.isArray(data)) return new Map();
    safeLocalStorageWrite(cacheKey, JSON.stringify({ timestamp: Date.now(), rows: data }));
    return indexAdp(data);
  } catch {
    return new Map();
  }
}
