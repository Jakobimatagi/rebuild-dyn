// ── NFL Defensive Coordinator database ────────────────────────────────────────
// Static dataset of NFL defensive coordinators by season + team — the DC twin
// of ocData.js, curated the same way. Team abbreviations match Sleeper's
// player.team field (the canonical list lives in ocData.js NFL_TEAMS).
//
// Import a season (or several) from the same CSV source you use for OCs:
//
//     npm run import:ocs -- --dc /path/to/dc.csv
//     # or
//     cat dc.csv | npm run import:ocs -- --dc --stdin
//
// CSV header: Team,2026,2025,2024,2023,2022 (any number of year columns;
// new years auto-create a new block). Empty cells are skipped, so partial
// imports are fine. See scripts/import-ocs.mjs.
//
// Per-entry shape (same as OC_DATA):
//   { name: "Jesse Minter" }                                 — minimum
//   { name: "Vic Fangio", playcaller: "HC" }                 — HC runs the defense
//   { name: "Vacant" }                                       — no formal DC
//   { name: "...", partial: true, note: "Fired mid-season" }
//
// The IDP Matchup Lab uses this for scheme-continuity weighting: seasons a
// team played under a DIFFERENT coordinator than its current one get their
// weight reduced in the defense-vs-position multipliers. Until a team has
// entries here, its weighting stays neutral — the feature degrades gracefully.
export const DC_DATA = {};

// ── Override layer (Supabase-backed, localStorage cache) ─────────────────────
// The DC twin of ocData.js's override layer: the /admin/dc-rankings editor
// reads dc_entries from Supabase on unlock, keeps an in-memory copy, and
// writes back on every change. localStorage keeps the page usable offline /
// before the first fetch resolves.

const OVERRIDES_KEY = "dc_overrides_v1";

export function loadDcOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistOverridesLocally(overrides) {
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides)); }
  catch (e) { console.error("Failed to persist DC overrides locally:", e); }
}

/**
 * Pure helper — returns the next overrides object after applying one change.
 * Also writes to localStorage for offline resilience.
 * The caller is responsible for persisting to Supabase via upsertDcEntry.
 */
export function setDcOverride(overrides, year, team, entry) {
  const next = { ...overrides };
  if (!next[year]) next[year] = {};
  next[year] = { ...next[year] };
  if (entry === null) delete next[year][team];
  else next[year][team] = entry;
  if (Object.keys(next[year]).length === 0) delete next[year];
  persistOverridesLocally(next);
  return next;
}

/**
 * Add a new year column. The caller triggers initDcYear in Supabase separately.
 */
export function addDcYear(overrides, year) {
  const next = { ...overrides };
  if (!next[year]) next[year] = {};
  persistOverridesLocally(next);
  return next;
}

/**
 * Copy one season's coaching staff forward for the editor's Advance Season
 * button. Names and the structural HC-runs-D flag carry over; the
 * season-specific flags (partial, note) do not — a mid-season firing last
 * year says nothing about next year. Skips the DB's __init__ year-marker
 * sentinel and unnamed entries. Returns { [teamAbbr]: entry }.
 */
export function carryForwardEntries(seasonData) {
  const out = {};
  for (const [team, e] of Object.entries(seasonData || {})) {
    if (team === "__init__" || !e?.name?.trim()) continue;
    const copy = { name: e.name.trim() };
    if (e.playcaller) copy.playcaller = e.playcaller;
    out[team] = copy;
  }
  return out;
}

/**
 * Merge the static DC_DATA seed with overrides (from Supabase or localStorage).
 * Overrides win for any year+team they specify.
 */
export function mergeDcData(overrides) {
  const merged = {};
  for (const [year, byTeam] of Object.entries(DC_DATA)) {
    merged[year] = { ...byTeam };
  }
  for (const [year, byTeam] of Object.entries(overrides || {})) {
    merged[year] = { ...(merged[year] || {}), ...byTeam };
  }
  return merged;
}
