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
    HOU: { name: "Matt Burke", playcaller: "HC", note: "HC DeMeco Ryans calls the defense." },
    IND: { name: "Lou Anarumo" },
    JAX: { name: "Anthony Campanile" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Jesse Minter" },
    LAR: { name: "Chris Shula" },
    LV : { name: "Patrick Graham" },
    MIA: { name: "Anthony Weaver" },
    MIN: { name: "Brian Flores" },
    NE : { name: "DeMarcus Covington" },
    NO : { name: "Brandon Staley" },
    NYG: { name: "Shane Bowen" },
    NYJ: { name: "Aaron Glenn", playcaller: "HC", note: "New HC runs the defensive structure." },
    PHI: { name: "Vic Fangio" },
    PIT: { name: "Teryl Austin" },
    SEA: { name: "Aden Durde", playcaller: "HC", note: "HC Mike Macdonald calls the defense." },
    SF : { name: "Nick Sorensen" },
    TB : { name: "Todd Bowles", playcaller: "HC", note: "HC kept defensive play-calling." },
    TEN: { name: "Dennard Wilson" },
    WAS: { name: "Joe Whitt Jr." },
  },
  2024: {
    ARI: { name: "Nick Rallis" },
    ATL: { name: "Jimmy Lake" },
    BAL: { name: "Zach Orr" },
    BUF: { name: "Bobby Babich" },
    CAR: { name: "Ejiro Evero" },
    CHI: { name: "Eric Washington", playcaller: "HC", note: "HC Matt Eberflus called plays." },
    CIN: { name: "Lou Anarumo" },
    CLE: { name: "Jim Schwartz" },
    DAL: { name: "Mike Zimmer" },
    DEN: { name: "Vance Joseph" },
    DET: { name: "Aaron Glenn" },
    GB : { name: "Jeff Hafley" },
    HOU: { name: "Matt Burke", playcaller: "HC", note: "HC DeMeco Ryans calls the defense." },
    IND: { name: "Gus Bradley" },
    JAX: { name: "Ryan Nielsen" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Jesse Minter" },
    LAR: { name: "Chris Shula" },
    LV : { name: "Patrick Graham" },
    MIA: { name: "Anthony Weaver" },
    MIN: { name: "Brian Flores" },
    NE : { name: "DeMarcus Covington" },
    NO : { name: "Joe Woods", playcaller: "HC", note: "HC Dennis Allen called plays until his mid-season firing." },
    NYG: { name: "Shane Bowen" },
    NYJ: { name: "Jeff Ulbrich", note: "Became interim HC after Saleh firing; kept the defense." },
    PHI: { name: "Vic Fangio" },
    PIT: { name: "Teryl Austin" },
    SEA: { name: "Aden Durde", playcaller: "HC", note: "HC Mike Macdonald calls the defense." },
    SF : { name: "Nick Sorensen" },
    TB : { name: "Todd Bowles", playcaller: "HC", note: "HC kept defensive play-calling." },
    TEN: { name: "Dennard Wilson" },
    WAS: { name: "Joe Whitt Jr." },
  },
  2023: {
    ARI: { name: "Nick Rallis" },
    ATL: { name: "Ryan Nielsen" },
    BAL: { name: "Mike Macdonald" },
    BUF: { name: "Sean McDermott", playcaller: "HC", note: "HC called plays after Leslie Frazier stepped aside; no formal DC." },
    CAR: { name: "Ejiro Evero" },
    CHI: { name: "Alan Williams", partial: true, playcaller: "HC", note: "Resigned early season; HC Matt Eberflus took over play-calling." },
    CIN: { name: "Lou Anarumo" },
    CLE: { name: "Jim Schwartz" },
    DAL: { name: "Dan Quinn" },
    DEN: { name: "Vance Joseph" },
    DET: { name: "Aaron Glenn" },
    GB : { name: "Joe Barry" },
    HOU: { name: "Matt Burke", playcaller: "HC", note: "HC DeMeco Ryans calls the defense." },
    IND: { name: "Gus Bradley" },
    JAX: { name: "Mike Caldwell" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Derrick Ansley" },
    LAR: { name: "Raheem Morris" },
    LV : { name: "Patrick Graham" },
    MIA: { name: "Vic Fangio" },
    MIN: { name: "Brian Flores" },
    NE : { name: "Jerod Mayo / Steve Belichick", playcaller: "HC", note: "No formal DC; Bill Belichick called plays." },
    NO : { name: "Joe Woods", playcaller: "HC", note: "HC Dennis Allen called plays." },
    NYG: { name: "Don Martindale" },
    NYJ: { name: "Jeff Ulbrich" },
    PHI: { name: "Sean Desai", partial: true, note: "Demoted late season; Matt Patricia took over calls." },
    PIT: { name: "Teryl Austin" },
    SEA: { name: "Clint Hurtt" },
    SF : { name: "Steve Wilks" },
    TB : { name: "Todd Bowles", playcaller: "HC", note: "HC kept defensive play-calling." },
    TEN: { name: "Shane Bowen" },
    WAS: { name: "Jack Del Rio", partial: true, note: "Fired late season; HC Ron Rivera took over calls." },
  },
  2022: {
    ARI: { name: "Vance Joseph" },
    ATL: { name: "Dean Pees" },
    BAL: { name: "Mike Macdonald" },
    BUF: { name: "Leslie Frazier" },
    CAR: { name: "Phil Snow" },
    CHI: { name: "Alan Williams" },
    CIN: { name: "Lou Anarumo" },
    CLE: { name: "Joe Woods" },
    DAL: { name: "Dan Quinn" },
    DEN: { name: "Ejiro Evero" },
    DET: { name: "Aaron Glenn" },
    GB : { name: "Joe Barry" },
    HOU: { name: "Lovie Smith", playcaller: "HC", note: "HC called the defense himself." },
    IND: { name: "Gus Bradley" },
    JAX: { name: "Mike Caldwell" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Renaldo Hill" },
    LAR: { name: "Raheem Morris" },
    LV : { name: "Patrick Graham" },
    MIA: { name: "Josh Boyer" },
    MIN: { name: "Ed Donatell" },
    NE : { name: "Jerod Mayo / Steve Belichick", playcaller: "HC", note: "No formal DC; Bill Belichick called plays." },
    NO : { name: "Ryan Nielsen / Kris Richard", playcaller: "HC", note: "Co-DCs; HC Dennis Allen called plays." },
    NYG: { name: "Don Martindale" },
    NYJ: { name: "Jeff Ulbrich" },
    PHI: { name: "Jonathan Gannon" },
    PIT: { name: "Teryl Austin" },
    SEA: { name: "Clint Hurtt" },
    SF : { name: "DeMeco Ryans" },
    TB : { name: "Todd Bowles", playcaller: "HC", note: "Promoted to HC; kept defensive play-calling." },
    TEN: { name: "Shane Bowen" },
    WAS: { name: "Jack Del Rio" },
  },
  2021: {
    ARI: { name: "Vance Joseph" },
    ATL: { name: "Dean Pees" },
    BAL: { name: "Don Martindale" },
    BUF: { name: "Leslie Frazier" },
    CAR: { name: "Phil Snow" },
    CHI: { name: "Sean Desai" },
    CIN: { name: "Lou Anarumo" },
    CLE: { name: "Joe Woods" },
    DAL: { name: "Dan Quinn" },
    DEN: { name: "Ed Donatell" },
    DET: { name: "Aaron Glenn" },
    GB : { name: "Joe Barry" },
    HOU: { name: "Lovie Smith" },
    IND: { name: "Matt Eberflus" },
    JAX: { name: "Joe Cullen" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Renaldo Hill" },
    LAR: { name: "Raheem Morris" },
    LV : { name: "Gus Bradley" },
    MIA: { name: "Josh Boyer" },
    MIN: { name: "Andre Patterson / Adam Zimmer", playcaller: "HC", note: "Co-DCs; HC Mike Zimmer called plays." },
    NE : { name: "Jerod Mayo / Steve Belichick", playcaller: "HC", note: "No formal DC; Bill Belichick called plays." },
    NO : { name: "Dennis Allen" },
    NYG: { name: "Patrick Graham" },
    NYJ: { name: "Jeff Ulbrich" },
    PHI: { name: "Jonathan Gannon" },
    PIT: { name: "Keith Butler" },
    SEA: { name: "Ken Norton Jr." },
    SF : { name: "DeMeco Ryans" },
    TB : { name: "Todd Bowles" },
    TEN: { name: "Shane Bowen" },
    WAS: { name: "Jack Del Rio" },
  },
  2020: {
    ARI: { name: "Vance Joseph" },
    ATL: { name: "Jeff Ulbrich" },
    BAL: { name: "Don Martindale" },
    BUF: { name: "Leslie Frazier" },
    CAR: { name: "Phil Snow" },
    CHI: { name: "Chuck Pagano" },
    CIN: { name: "Lou Anarumo" },
    CLE: { name: "Joe Woods" },
    DAL: { name: "Mike Nolan" },
    DEN: { name: "Ed Donatell" },
    DET: { name: "Cory Undlin" },
    GB : { name: "Mike Pettine" },
    HOU: { name: "Anthony Weaver" },
    IND: { name: "Matt Eberflus" },
    JAX: { name: "Todd Wash" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Gus Bradley" },
    LAR: { name: "Brandon Staley" },
    LV : { name: "Paul Guenther" },
    MIA: { name: "Josh Boyer" },
    MIN: { name: "Andre Patterson / Adam Zimmer", playcaller: "HC", note: "Co-DCs; HC Mike Zimmer called plays." },
    NE : { name: "Jerod Mayo / Steve Belichick", playcaller: "HC", note: "No formal DC; Bill Belichick called plays." },
    NO : { name: "Dennis Allen" },
    NYG: { name: "Patrick Graham" },
    NYJ: { name: "Gregg Williams" },
    PHI: { name: "Jim Schwartz" },
    PIT: { name: "Keith Butler" },
    SEA: { name: "Ken Norton Jr." },
    SF : { name: "Robert Saleh" },
    TB : { name: "Todd Bowles" },
    TEN: { name: "Dean Pees" },
    WAS: { name: "Jack Del Rio" },
  },
  2019: {
    ARI: { name: "Vance Joseph" },
    ATL: { name: "Dan Quinn", playcaller: "HC", note: "HC ran the defense; Jeff Ulbrich handled the front." },
    BAL: { name: "Don Martindale" },
    BUF: { name: "Leslie Frazier" },
    CAR: { name: "Eric Washington" },
    CHI: { name: "Chuck Pagano" },
    CIN: { name: "Lou Anarumo" },
    CLE: { name: "Steve Wilks" },
    DAL: { name: "Rod Marinelli", note: "Kris Richard called the passing game." },
    DEN: { name: "Ed Donatell" },
    DET: { name: "Paul Pasqualoni" },
    GB : { name: "Mike Pettine" },
    HOU: { name: "Romeo Crennel" },
    IND: { name: "Matt Eberflus" },
    JAX: { name: "Todd Wash" },
    KC : { name: "Steve Spagnuolo" },
    LAC: { name: "Gus Bradley" },
    LAR: { name: "Wade Phillips" },
    LV : { name: "Paul Guenther" },
    MIA: { name: "Patrick Graham" },
    MIN: { name: "George Edwards", playcaller: "HC", note: "HC Mike Zimmer called plays." },
    NE : { name: "Jerod Mayo / Steve Belichick", playcaller: "HC", note: "No formal DC; Bill Belichick called plays." },
    NO : { name: "Dennis Allen" },
    NYG: { name: "James Bettcher" },
    NYJ: { name: "Gregg Williams" },
    PHI: { name: "Jim Schwartz" },
    PIT: { name: "Keith Butler" },
    SEA: { name: "Ken Norton Jr." },
    SF : { name: "Robert Saleh" },
    TB : { name: "Todd Bowles" },
    TEN: { name: "Dean Pees" },
    WAS: { name: "Greg Manusky" },
  },
  2018: {
    ARI: { name: "Al Holcomb" },
    ATL: { name: "Marquand Manuel" },
    BAL: { name: "Don Martindale" },
    BUF: { name: "Leslie Frazier" },
    CAR: { name: "Eric Washington" },
    CHI: { name: "Vic Fangio" },
    CIN: { name: "Teryl Austin" },
    CLE: { name: "Gregg Williams" },
    DAL: { name: "Rod Marinelli", note: "Kris Richard called the passing game." },
    DEN: { name: "Joe Woods" },
    DET: { name: "Paul Pasqualoni" },
    GB : { name: "Mike Pettine" },
    HOU: { name: "Romeo Crennel" },
    IND: { name: "Matt Eberflus" },
    JAX: { name: "Todd Wash" },
    KC : { name: "Bob Sutton" },
    LAC: { name: "Gus Bradley" },
    LAR: { name: "Wade Phillips" },
    LV : { name: "Paul Guenther" },
    MIA: { name: "Matt Burke" },
    MIN: { name: "George Edwards", playcaller: "HC", note: "HC Mike Zimmer called plays." },
    NE : { name: "Brian Flores", playcaller: "HC", note: "LBs coach ran the calls; Bill Belichick de facto controlled the defense." },
    NO : { name: "Dennis Allen" },
    NYG: { name: "James Bettcher" },
    NYJ: { name: "Kacy Rodgers" },
    PHI: { name: "Jim Schwartz" },
    PIT: { name: "Keith Butler" },
    SEA: { name: "Ken Norton Jr." },
    SF : { name: "Robert Saleh" },
    TB : { name: "Mike Smith", partial: true, note: "Fired mid-season; Mark Duffner finished." },
    TEN: { name: "Dean Pees" },
    WAS: { name: "Greg Manusky" },
  },
  2017: {
    ARI: { name: "James Bettcher" },
    ATL: { name: "Marquand Manuel" },
    BAL: { name: "Dean Pees" },
    BUF: { name: "Leslie Frazier" },
    CAR: { name: "Steve Wilks" },
    CHI: { name: "Vic Fangio" },
    CIN: { name: "Paul Guenther" },
    CLE: { name: "Gregg Williams" },
    DAL: { name: "Rod Marinelli" },
    DEN: { name: "Joe Woods" },
    DET: { name: "Teryl Austin" },
    GB : { name: "Dom Capers" },
    HOU: { name: "Mike Vrabel" },
    IND: { name: "Ted Monachino" },
    JAX: { name: "Todd Wash" },
    KC : { name: "Bob Sutton" },
    LAC: { name: "Gus Bradley" },
    LAR: { name: "Wade Phillips" },
    LV : { name: "Ken Norton Jr.", partial: true, note: "Fired late season; John Pagano finished." },
    MIA: { name: "Matt Burke" },
    MIN: { name: "George Edwards", playcaller: "HC", note: "HC Mike Zimmer called plays." },
    NE : { name: "Matt Patricia" },
    NO : { name: "Dennis Allen" },
    NYG: { name: "Steve Spagnuolo" },
    NYJ: { name: "Kacy Rodgers" },
    PHI: { name: "Jim Schwartz" },
    PIT: { name: "Keith Butler" },
    SEA: { name: "Kris Richard" },
    SF : { name: "Robert Saleh" },
    TB : { name: "Mike Smith" },
    TEN: { name: "Dick LeBeau" },
    WAS: { name: "Greg Manusky" },
  },
  2016: {
    ARI: { name: "James Bettcher" },
    ATL: { name: "Richard Smith" },
    BAL: { name: "Dean Pees" },
    BUF: { name: "Dennis Thurman" },
    CAR: { name: "Sean McDermott" },
    CHI: { name: "Vic Fangio" },
    CIN: { name: "Paul Guenther" },
    CLE: { name: "Ray Horton" },
    DAL: { name: "Rod Marinelli" },
    DEN: { name: "Wade Phillips" },
    DET: { name: "Teryl Austin" },
    GB : { name: "Dom Capers" },
    HOU: { name: "Romeo Crennel" },
    IND: { name: "Ted Monachino" },
    JAX: { name: "Todd Wash" },
    KC : { name: "Bob Sutton" },
    LAC: { name: "John Pagano" },
    LAR: { name: "Gregg Williams" },
    LV : { name: "Ken Norton Jr." },
    MIA: { name: "Vance Joseph" },
    MIN: { name: "George Edwards", playcaller: "HC", note: "HC Mike Zimmer called plays." },
    NE : { name: "Matt Patricia" },
    NO : { name: "Dennis Allen" },
    NYG: { name: "Steve Spagnuolo" },
    NYJ: { name: "Kacy Rodgers" },
    PHI: { name: "Jim Schwartz" },
    PIT: { name: "Keith Butler" },
    SEA: { name: "Kris Richard" },
    SF : { name: "Jim O'Neil" },
    TB : { name: "Mike Smith" },
    TEN: { name: "Dick LeBeau" },
    WAS: { name: "Joe Barry" },
  },
};

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
