// Pure helpers for turning a community startup value feed (e.g. KeepTradeCut)
// into per-format ADP mapped onto Sleeper player_ids. No network, no Supabase,
// no browser globals — so both the Vercel cron (api/refresh-startup-adp.js) and
// the unit tests can import it. See docs/migrations/startup_adp_schema.sql.

const SUFFIX_RE = /\b(jr|sr|ii|iii|iv|v)\b/g;

// Normalize a player name for fuzzy matching: lowercase, strip punctuation and
// generational suffixes, collapse whitespace. "A.J. Brown Jr." → "aj brown".
export function normalizePlayerName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[.'`’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(SUFFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Index the Sleeper /players/nfl map by "normalizedName|POS" → sleeper_id, so a
// feed that lacks Sleeper ids can still be matched. Skips non-skill positions.
export function buildSleeperIndex(players) {
  const idx = new Map();
  for (const [id, p] of Object.entries(players || {})) {
    if (!p) continue;
    const pos = (p.position || p.fantasy_positions?.[0] || "").toUpperCase();
    if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
    const full = p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
    if (!full) continue;
    idx.set(`${normalizePlayerName(full)}|${pos}`, String(id));
  }
  return idx;
}

// Pull (name, position, value, sleeperId?) out of one feed row across the plausible
// shapes a community feed might use. `valueKey` selects the format-specific value
// object (e.g. "superflexValues" vs "oneQBValues" for KTC). Returns null if the
// row can't yield a usable value.
export function extractFeedPlayer(raw, valueKey) {
  if (!raw) return null;
  const name = raw.playerName || raw.name || raw.fullName || raw.player?.name;
  const position = (raw.position || raw.pos || raw.player?.position || "").toUpperCase();
  const v =
    (valueKey && raw[valueKey] && (raw[valueKey].value ?? raw[valueKey])) ??
    raw.value ?? raw.sfValue ?? raw.dynastyValue ?? null;
  const value = Number(v);
  const directSleeper = raw.sleeperId || raw.sleeper_id || raw.player?.sleeperId || null;
  // Require a positive value — Number(null/undefined) is 0/NaN, which must not pass.
  if (!name || !["QB", "RB", "WR", "TE"].includes(position) || !(value > 0)) return null;
  return { name, position, value, sleeperId: directSleeper ? String(directSleeper) : null };
}

// Map feed rows → [{ sleeper_id, name, position, value }]. Uses a direct Sleeper id
// when the feed provides one, else a normalized name|pos lookup. Unmatched rows are
// dropped. Dedupes to the highest value per sleeper_id.
export function mapFeedToSleeper(feedRows, sleeperIndex, valueKey) {
  const byId = new Map();
  for (const raw of feedRows || []) {
    const fp = extractFeedPlayer(raw, valueKey);
    if (!fp) continue;
    const sid = fp.sleeperId || sleeperIndex.get(`${normalizePlayerName(fp.name)}|${fp.position}`);
    if (!sid) continue;
    const prev = byId.get(sid);
    if (!prev || fp.value > prev.value) {
      byId.set(sid, { sleeper_id: sid, name: fp.name, position: fp.position, value: Math.round(fp.value) });
    }
  }
  return [...byId.values()];
}

// Assign ADP ranks from value (highest value drafts first → rank 1). Pure.
export function rankByValue(rows) {
  return [...rows]
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, adp_rank: i + 1 }));
}
