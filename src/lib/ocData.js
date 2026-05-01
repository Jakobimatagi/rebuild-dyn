// ── NFL Offensive Coordinator database ────────────────────────────────────────
// Static dataset of NFL offensive coordinators by season + team. Team
// abbreviations match Sleeper's player.team field, so ranks computed from
// /stats/nfl/regular line up cleanly.
//
// To add or correct entries, the easiest path is the CSV importer:
//
//     npm run import:ocs -- /path/to/data.csv
//     # or
//     cat data.csv | npm run import:ocs -- --stdin
//
// CSV header: Team,2026,2025,2024,2023,2022 (any number of year columns;
// new years auto-create a new block). Empty cells are skipped, so you can
// import partial rosters and fill in the rest later. See scripts/import-ocs.mjs.
//
// Per-entry shape:
//   { name: "Klayton Adams" }                                — minimum
//   { name: "Luke Getsy", partial: true, note: "Fired mid-season; ..." }
//   { name: "Kyle Shanahan", playcaller: "HC" }              — HC calls plays
//   { name: "Vacant" }                                       — no formal OC
//
// The importer rewrites name-only entries; metadata fields (partial / note /
// playcaller) survive unless you re-import that exact slot. To attach a note
// after importing, edit this file directly.

export const NFL_TEAMS = [
  { abbr: "ARI", name: "Arizona Cardinals",     division: "NFC West"  },
  { abbr: "ATL", name: "Atlanta Falcons",       division: "NFC South" },
  { abbr: "BAL", name: "Baltimore Ravens",      division: "AFC North" },
  { abbr: "BUF", name: "Buffalo Bills",         division: "AFC East"  },
  { abbr: "CAR", name: "Carolina Panthers",     division: "NFC South" },
  { abbr: "CHI", name: "Chicago Bears",         division: "NFC North" },
  { abbr: "CIN", name: "Cincinnati Bengals",    division: "AFC North" },
  { abbr: "CLE", name: "Cleveland Browns",      division: "AFC North" },
  { abbr: "DAL", name: "Dallas Cowboys",        division: "NFC East"  },
  { abbr: "DEN", name: "Denver Broncos",        division: "AFC West"  },
  { abbr: "DET", name: "Detroit Lions",         division: "NFC North" },
  { abbr: "GB",  name: "Green Bay Packers",     division: "NFC North" },
  { abbr: "HOU", name: "Houston Texans",        division: "AFC South" },
  { abbr: "IND", name: "Indianapolis Colts",    division: "AFC South" },
  { abbr: "JAX", name: "Jacksonville Jaguars",  division: "AFC South" },
  { abbr: "KC",  name: "Kansas City Chiefs",    division: "AFC West"  },
  { abbr: "LAC", name: "Los Angeles Chargers",  division: "AFC West"  },
  { abbr: "LAR", name: "Los Angeles Rams",      division: "NFC West"  },
  { abbr: "LV",  name: "Las Vegas Raiders",     division: "AFC West"  },
  { abbr: "MIA", name: "Miami Dolphins",        division: "AFC East"  },
  { abbr: "MIN", name: "Minnesota Vikings",     division: "NFC North" },
  { abbr: "NE",  name: "New England Patriots",  division: "AFC East"  },
  { abbr: "NO",  name: "New Orleans Saints",    division: "NFC South" },
  { abbr: "NYG", name: "New York Giants",       division: "NFC East"  },
  { abbr: "NYJ", name: "New York Jets",         division: "AFC East"  },
  { abbr: "PHI", name: "Philadelphia Eagles",   division: "NFC East"  },
  { abbr: "PIT", name: "Pittsburgh Steelers",   division: "AFC North" },
  { abbr: "SEA", name: "Seattle Seahawks",      division: "NFC West"  },
  { abbr: "SF",  name: "San Francisco 49ers",   division: "NFC West"  },
  { abbr: "TB",  name: "Tampa Bay Buccaneers",  division: "NFC South" },
  { abbr: "TEN", name: "Tennessee Titans",      division: "AFC South" },
  { abbr: "WAS", name: "Washington Commanders", division: "NFC East"  },
];

export const DIVISIONS = [
  "AFC East", "AFC North", "AFC South", "AFC West",
  "NFC East", "NFC North", "NFC South", "NFC West",
];

// Indexed by season, then team abbr. Verify before relying on this for analysis —
// names are seeded from publicly reported hires/firings and may need correcting.
// Verified: indicates whether the entry has been double-checked by the user.
export const OC_DATA = {
  2026: {
    ARI: { name: "Nathaniel Hackett" },
    ATL: { name: "Tommy Rees" },
    BAL: { name: "Declan Doyle" },
    BUF: { name: "Pete Carmichael" },
    CAR: { name: "Brad Idzik" },
    CHI: { name: "Press Taylor" },
    CIN: { name: "Dan Pitcher" },
    CLE: { name: "Travis Switzer" },
    DAL: { name: "Klayton Adams" },
    DEN: { name: "Davis Webb" },
    DET: { name: "Drew Petzing" },
    GB : { name: "Adam Stenavich" },
    HOU: { name: "Nick Caley" },
    IND: { name: "Jim Bob Cooter" },
    JAX: { name: "Grant Udinski" },
    KC : { name: "Eric Bieniemy" },
    LAC: { name: "Mike McDaniel" },
    LAR: { name: "Nathan Scheelhaase" },
    LV : { name: "Andrew Janocko" },
    MIA: { name: "Bobby Slowik" },
    MIN: { name: "Wes Phillips" },
    NE : { name: "Josh McDaniels" },
    NO : { name: "Doug Nussmeier" },
    NYG: { name: "Matt Nagy" },
    NYJ: { name: "Frank Reich" },
    PHI: { name: "Sean Mannion" },
    PIT: { name: "Brian Angelichio" },
    SEA: { name: "Brian Fleury" },
    SF : { name: "Klay Kubiak" },
    TB : { name: "Zac Robinson" },
    TEN: { name: "Brian Daboll" },
    WAS: { name: "David Blough" },
  },
  2025: {
    ARI: { name: "Drew Petzing" },
    ATL: { name: "Zac Robinson" },
    BAL: { name: "Todd Monken" },
    BUF: { name: "Joe Brady" },
    CAR: { name: "Brad Idzik" },
    CHI: { name: "Declan Doyle" },
    CIN: { name: "Dan Pitcher" },
    CLE: { name: "Tommy Rees" },
    DAL: { name: "Klayton Adams" },
    DEN: { name: "Joe Lombardi" },
    DET: { name: "John Morton" },
    GB : { name: "Adam Stenavich" },
    HOU: { name: "Nick Caley", note: "Replaced Bobby Slowik." },
    IND: { name: "Jim Bob Cooter" },
    JAX: { name: "Grant Udinski", note: "First year under HC Liam Coen." },
    KC : { name: "Matt Nagy" },
    LAC: { name: "Greg Roman" },
    LAR: { name: "Mike LaFleur" },
    LV : { name: "Chip Kelly", note: "First year under HC Pete Carroll." },
    MIA: { name: "Frank Smith" },
    MIN: { name: "Wes Phillips" },
    NE : { name: "Josh McDaniels", note: "Returned under HC Mike Vrabel." },
    NO : { name: "Doug Nussmeier" },
    NYG: { name: "Mike Kafka" },
    NYJ: { name: "Tanner Engstrand", note: "First year under HC Aaron Glenn." },
    PHI: { name: "Kevin Patullo" },
    PIT: { name: "Arthur Smith" },
    SEA: { name: "Klint Kubiak" },
    SF : { name: "Klay Kubiak" },
    TB : { name: "Josh Grizzard" },
    TEN: { name: "Nick Holz" },
    WAS: { name: "Kliff Kingsbury" },
  },
  2024: {
    ARI: { name: "Drew Petzing" },
    ATL: { name: "Zac Robinson" },
    BAL: { name: "Todd Monken" },
    BUF: { name: "Joe Brady" },
    CAR: { name: "Brad Idzik" },
    CHI: { name: "Shane Waldron" },
    CIN: { name: "Dan Pitcher" },
    CLE: { name: "Ken Dorsey" },
    DAL: { name: "Brian Schottenheimer" },
    DEN: { name: "Joe Lombardi" },
    DET: { name: "Ben Johnson" },
    GB : { name: "Adam Stenavich" },
    HOU: { name: "Bobby Slowik" },
    IND: { name: "Jim Bob Cooter" },
    JAX: { name: "Press Taylor" },
    KC : { name: "Matt Nagy" },
    LAC: { name: "Greg Roman" },
    LAR: { name: "Mike LaFleur" },
    LV : { name: "Luke Getsy", partial: true, note: "Fired mid-season; Scott Turner finished." },
    MIA: { name: "Frank Smith" },
    MIN: { name: "Wes Phillips" },
    NE : { name: "Alex Van Pelt" },
    NO : { name: "Klint Kubiak" },
    NYG: { name: "Mike Kafka" },
    NYJ: { name: "Nathaniel Hackett", partial: true, note: "Replaced by Todd Downing after Saleh firing." },
    PHI: { name: "Kellen Moore" },
    PIT: { name: "Arthur Smith" },
    SEA: { name: "Ryan Grubb" },
    SF : { name: "Kyle Shanahan" },
    TB : { name: "Liam Coen" },
    TEN: { name: "Nick Holz" },
    WAS: { name: "Kliff Kingsbury" },
  },
  2023: {
    ARI: { name: "Drew Petzing" },
    ATL: { name: "Dave Ragone" },
    BAL: { name: "Todd Monken" },
    BUF: { name: "Ken Dorsey", partial: true, note: "Fired mid-season; Joe Brady took over." },
    CAR: { name: "Thomas Brown" },
    CHI: { name: "Luke Getsy" },
    CIN: { name: "Brian Callahan" },
    CLE: { name: "Alex Van Pelt" },
    DAL: { name: "Brian Schottenheimer" },
    DEN: { name: "Joe Lombardi", partial: true, note: "Fired late season; Davis Webb finished." },
    DET: { name: "Ben Johnson" },
    GB : { name: "Adam Stenavich" },
    HOU: { name: "Bobby Slowik" },
    IND: { name: "Jim Bob Cooter", note: "Promoted mid-season after Shane Steichen took HC role." },
    JAX: { name: "Press Taylor" },
    KC : { name: "Matt Nagy" },
    LAC: { name: "Kellen Moore" },
    LAR: { name: "Mike LaFleur" },
    LV : { name: "Mick Lombardi", partial: true, note: "Fired with HC McDaniels mid-season; Bo Hardegree finished." },
    MIA: { name: "Frank Smith" },
    MIN: { name: "Wes Phillips" },
    NE : { name: "Bill O'Brien" },
    NO : { name: "Pete Carmichael" },
    NYG: { name: "Mike Kafka" },
    NYJ: { name: "Nathaniel Hackett" },
    PHI: { name: "Brian Johnson" },
    PIT: { name: "Matt Canada", partial: true, note: "Fired mid-season; Mike Sullivan / Eddie Faulkner finished." },
    SEA: { name: "Shane Waldron" },
    SF : { name: "Kyle Shanahan" },
    TB : { name: "Dave Canales" },
    TEN: { name: "Tim Kelly" },
    WAS: { name: "Eric Bieniemy" },
  },
  2022: {
    ARI: { name: "Kliff Kingsbury" },
    ATL: { name: "Dave Ragone" },
    BAL: { name: "Greg Roman" },
    BUF: { name: "Ken Dorsey" },
    CAR: { name: "Ben McAdoo" },
    CHI: { name: "Luke Getsy" },
    CIN: { name: "Brian Callahan" },
    CLE: { name: "Alex Van Pelt" },
    DAL: { name: "Kellen Moore" },
    DEN: { name: "Justin Outten", partial: true, note: "Hackett (HC) called plays early before Klint Kubiak took over late." },
    DET: { name: "Ben Johnson" },
    GB : { name: "Adam Stenavich" },
    HOU: { name: "Pep Hamilton" },
    IND: { name: "Marcus Brady", partial: true, note: "Fired mid-season; Parks Frazier finished." },
    JAX: { name: "Press Taylor" },
    KC : { name: "Eric Bieniemy" },
    LAC: { name: "Joe Lombardi" },
    LAR: { name: "Liam Coen" },
    LV : { name: "Mick Lombardi" },
    MIA: { name: "Frank Smith" },
    MIN: { name: "Wes Phillips" },
    NE : { name: "Matt Patricia", note: "Patricia/Judge ran the offense; no formal OC." },
    NO : { name: "Pete Carmichael" },
    NYG: { name: "Mike Kafka" },
    NYJ: { name: "Mike LaFleur" },
    PHI: { name: "Shane Steichen" },
    PIT: { name: "Matt Canada" },
    SEA: { name: "Shane Waldron" },
    SF : { name: "Kyle Shanahan" },
    TB : { name: "Byron Leftwich" },
    TEN: { name: "Todd Downing" },
    WAS: { name: "Scott Turner" },
  },
};

export function ocSeasons(data = OC_DATA) {
  return Object.keys(data).map(Number).sort((a, b) => b - a);
}

/**
 * Return every team-season tuple a coordinator has held, newest season first.
 * Match is case-insensitive on the name string.
 */
export function findOcStints(name, data = OC_DATA) {
  if (!name) return [];
  const target = name.toLowerCase().trim();
  const stints = [];
  Object.entries(data).forEach(([year, byTeam]) => {
    Object.entries(byTeam).forEach(([abbr, oc]) => {
      if (oc.name?.toLowerCase().trim() === target) {
        stints.push({ year: Number(year), team: abbr, ...oc });
      }
    });
  });
  return stints.sort((a, b) => b.year - a.year);
}

export function uniqueOcs(data = OC_DATA) {
  const map = new Map();
  Object.entries(data).forEach(([year, byTeam]) => {
    Object.entries(byTeam).forEach(([abbr, oc]) => {
      if (!oc.name) return;
      const key = oc.name.toLowerCase().trim();
      const entry = map.get(key) || { name: oc.name, stints: [] };
      entry.stints.push({ year: Number(year), team: abbr, ...oc });
      map.set(key, entry);
    });
  });
  // Sort each OC's stints newest first, then sort OCs by name.
  return Array.from(map.values())
    .map((o) => ({ ...o, stints: o.stints.sort((a, b) => b.year - a.year) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Override layer (Supabase-backed, in-memory cache) ────────────────────────
// The editor reads from Supabase on mount, keeps an in-memory copy for instant
// reactivity, and writes back to Supabase on every change. The localStorage
// fallback is kept so the page works offline / before the first fetch resolves.

const OVERRIDES_KEY = "oc_overrides_v1";

export function loadOcOverrides() {
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
  catch (e) { console.error("Failed to persist OC overrides locally:", e); }
}

/**
 * Pure helper — returns the next overrides object after applying one change.
 * Also writes to localStorage for offline resilience.
 * The caller is responsible for persisting to Supabase via upsertOcEntry.
 */
export function setOcOverride(overrides, year, team, entry) {
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
 * Add a new year column. The caller triggers initOcYear in Supabase separately.
 */
export function addOcYear(overrides, year) {
  const next = { ...overrides };
  if (!next[year]) next[year] = {};
  persistOverridesLocally(next);
  return next;
}

/**
 * Merge the static OC_DATA seed with overrides (from Supabase or localStorage).
 * Overrides win for any year+team they specify.
 */
export function mergeOcData(overrides) {
  const merged = {};
  for (const [year, byTeam] of Object.entries(OC_DATA)) {
    merged[year] = { ...byTeam };
  }
  for (const [year, byTeam] of Object.entries(overrides || {})) {
    merged[year] = { ...(merged[year] || {}), ...byTeam };
  }
  return merged;
}

/**
 * Stringify overrides as a CSV the importer can read back.
 */
export function overridesToCsv(overrides) {
  const years = Object.keys(overrides || {}).map(Number).sort((a, b) => b - a);
  if (years.length === 0) return "";
  const teams = NFL_TEAMS.map((t) => t.abbr);
  const lines = [["Team", ...years].join(",")];
  for (const team of teams) {
    const row = [team];
    let any = false;
    for (const y of years) {
      const v = overrides[y]?.[team]?.name || "";
      if (v) any = true;
      row.push(v.includes(",") ? `"${v}"` : v);
    }
    if (any) lines.push(row.join(","));
  }
  return lines.join("\n");
}
