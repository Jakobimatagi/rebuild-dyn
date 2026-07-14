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
//   { name: "Todd Bowles", playcaller: "HC" }                — HC runs the defense
//   { name: "Vacant" }                                       — no formal DC
//   { name: "...", partial: true, note: "Fired mid-season" }
//
// The IDP Matchup Lab uses this for scheme-continuity weighting: seasons a
// team played under a DIFFERENT coordinator than its current one get their
// weight reduced in the defense-vs-position multipliers. Until a team has
// entries here, its weighting stays neutral — the feature degrades gracefully.
//
// Verify before relying on this for analysis — names are seeded from publicly
// reported hires/firings and may need correcting. Manage seasons (including
// adding a new year) from the DC Manager tab in /admin/idp-matchups.
export const DC_DATA = {
  2025: {
    ARI: { name: "Nick Rallis" },
    ATL: { name: "Jeff Ulbrich" },
    BAL: { name: "Zach Orr" },
    BUF: { name: "Bobby Babich" },
    CAR: { name: "Ejiro Evero" },
    CHI: { name: "Dennis Allen" },
    CIN: { name: "Al Golden" },
    CLE: { name: "Jim Schwartz" },
    DAL: { name: "Matt Eberflus" },
    DEN: { name: "Vance Joseph" },
    DET: { name: "Kelvin Sheppard" },
    GB : { name: "Jeff Hafley" },
    HOU: { name: "Matt Burke", note: "HC DeMeco Ryans runs the defense." },
    IND: { name: "Lou Anarumo" },
    JAX: { name: "Anthony Campanile" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Jesse Minter" },
    LAR: { name: "Chris Shula" },
    LV : { name: "Patrick Graham" },
    MIA: { name: "Anthony Weaver" },
    MIN: { name: "Brian Flores" },
    NE : { name: "Terrell Williams" },
    NO : { name: "Brandon Staley" },
    NYG: { name: "Shane Bowen" },
    NYJ: { name: "Steve Wilks" },
    PHI: { name: "Vic Fangio" },
    PIT: { name: "Teryl Austin" },
    SEA: { name: "Aden Durde" },
    SF : { name: "Robert Saleh" },
    TB : { name: "Todd Bowles", playcaller: "HC" },
    TEN: { name: "Dennard Wilson" },
    WAS: { name: "Joe Whitt Jr." },
  },
  2024: {
    ARI: { name: "Nick Rallis" },
    ATL: { name: "Jimmy Lake" },
    BAL: { name: "Zach Orr" },
    BUF: { name: "Bobby Babich" },
    CAR: { name: "Ejiro Evero" },
    CHI: { name: "Eric Washington" },
    CIN: { name: "Lou Anarumo" },
    CLE: { name: "Jim Schwartz" },
    DAL: { name: "Mike Zimmer" },
    DEN: { name: "Vance Joseph" },
    DET: { name: "Aaron Glenn" },
    GB : { name: "Jeff Hafley" },
    HOU: { name: "Matt Burke", note: "HC DeMeco Ryans runs the defense." },
    IND: { name: "Gus Bradley" },
    JAX: { name: "Ryan Nielsen" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Jesse Minter" },
    LAR: { name: "Chris Shula" },
    LV : { name: "Patrick Graham" },
    MIA: { name: "Anthony Weaver" },
    MIN: { name: "Brian Flores" },
    NE : { name: "DeMarcus Covington" },
    NO : { name: "Joe Woods" },
    NYG: { name: "Shane Bowen" },
    NYJ: { name: "Jeff Ulbrich", partial: true, note: "Became interim HC after Saleh firing." },
    PHI: { name: "Vic Fangio" },
    PIT: { name: "Teryl Austin" },
    SEA: { name: "Aden Durde" },
    SF : { name: "Nick Sorensen" },
    TB : { name: "Todd Bowles", playcaller: "HC" },
    TEN: { name: "Dennard Wilson" },
    WAS: { name: "Joe Whitt Jr." },
  },
  2023: {
    ARI: { name: "Nick Rallis" },
    ATL: { name: "Ryan Nielsen" },
    BAL: { name: "Mike Macdonald" },
    BUF: { name: "Sean McDermott", playcaller: "HC", note: "HC called the defense after Frazier's exit." },
    CAR: { name: "Ejiro Evero" },
    CHI: { name: "Alan Williams", partial: true, note: "Resigned early; HC Matt Eberflus called the rest." },
    CIN: { name: "Lou Anarumo" },
    CLE: { name: "Jim Schwartz" },
    DAL: { name: "Dan Quinn" },
    DEN: { name: "Vance Joseph" },
    DET: { name: "Aaron Glenn" },
    GB : { name: "Joe Barry" },
    HOU: { name: "Matt Burke", note: "HC DeMeco Ryans runs the defense." },
    IND: { name: "Gus Bradley" },
    JAX: { name: "Mike Caldwell" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Derrick Ansley", note: "HC Brandon Staley ran the defense." },
    LAR: { name: "Raheem Morris" },
    LV : { name: "Patrick Graham" },
    MIA: { name: "Vic Fangio" },
    MIN: { name: "Brian Flores" },
    NE : { name: "Steve Belichick", note: "No formal DC; play-calling under Bill Belichick." },
    NO : { name: "Joe Woods" },
    NYG: { name: "Wink Martindale" },
    NYJ: { name: "Jeff Ulbrich" },
    PHI: { name: "Sean Desai", partial: true, note: "Demoted late; Matt Patricia called the finish." },
    PIT: { name: "Teryl Austin" },
    SEA: { name: "Clint Hurtt" },
    SF : { name: "Steve Wilks" },
    TB : { name: "Todd Bowles", playcaller: "HC" },
    TEN: { name: "Shane Bowen" },
    WAS: { name: "Jack Del Rio", partial: true, note: "Fired late season; HC Ron Rivera took over." },
  },
  2022: {
    ARI: { name: "Vance Joseph" },
    ATL: { name: "Dean Pees" },
    BAL: { name: "Mike Macdonald" },
    BUF: { name: "Leslie Frazier" },
    CAR: { name: "Phil Snow", partial: true, note: "Out with HC Rhule; Al Holcomb finished." },
    CHI: { name: "Alan Williams" },
    CIN: { name: "Lou Anarumo" },
    CLE: { name: "Joe Woods" },
    DAL: { name: "Dan Quinn" },
    DEN: { name: "Ejiro Evero" },
    DET: { name: "Aaron Glenn" },
    GB : { name: "Joe Barry" },
    HOU: { name: "Lovie Smith", playcaller: "HC" },
    IND: { name: "Gus Bradley" },
    JAX: { name: "Mike Caldwell" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Renaldo Hill", note: "HC Brandon Staley ran the defense." },
    LAR: { name: "Raheem Morris" },
    LV : { name: "Patrick Graham" },
    MIA: { name: "Josh Boyer" },
    MIN: { name: "Ed Donatell" },
    NE : { name: "Steve Belichick", note: "No formal DC; play-calling under Bill Belichick." },
    NO : { name: "Ryan Nielsen", note: "Co-DC with Kris Richard; HC Dennis Allen ran the defense." },
    NYG: { name: "Wink Martindale" },
    NYJ: { name: "Jeff Ulbrich" },
    PHI: { name: "Jonathan Gannon" },
    PIT: { name: "Teryl Austin" },
    SEA: { name: "Clint Hurtt" },
    SF : { name: "DeMeco Ryans" },
    TB : { name: "Todd Bowles", playcaller: "HC" },
    TEN: { name: "Shane Bowen" },
    WAS: { name: "Jack Del Rio" },
  },
};

export function dcSeasons(data = DC_DATA) {
  return Object.keys(data).map(Number).sort((a, b) => b - a);
}

/** Every distinct DC name in the dataset, sorted — datalist suggestions. */
export function uniqueDcNames(data = DC_DATA) {
  const names = new Set();
  for (const byTeam of Object.values(data)) {
    for (const entry of Object.values(byTeam)) {
      if (entry?.name && !/^vacant$/i.test(entry.name)) names.add(entry.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

// ── Override layer (Supabase-backed, in-memory cache) ────────────────────────
// Same pattern as ocData.js: the DC Manager reads from Supabase (dc_entries)
// on mount, keeps an in-memory copy for instant reactivity, and writes back on
// every change. localStorage is the offline / pre-fetch fallback.

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
