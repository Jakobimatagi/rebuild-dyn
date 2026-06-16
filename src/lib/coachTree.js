/**
 * coachTree.js
 *
 * Builds offensive coach-tree lineage by joining two histories:
 *   - head-coach history (coach_seasons), derived from nflverse pbp 1999+
 *     (python/projections/scheme.py → Supabase), and
 *   - offensive-coordinator history (ocData.js OC_DATA), the app's curated OC map.
 *
 * A lineage edge is drawn wherever a coach was the OC of a team-season whose head
 * coach was someone else: the OC "coached under" that HC. Trace those edges and
 * you get the classic coaching tree — e.g. coordinators who served under a head
 * coach and later became head coaches themselves (disciples), and the mentors a
 * given coach came up under. Each coach also carries "scheme DNA": the average of
 * their team-seasons' offensive fingerprints (PROE, EPA/play, aDOT, pass rate),
 * so you can see what an offense tends to look like under them and how a tree's
 * identity propagates.
 *
 * Pure and dependency-light so it unit-tests in isolation (coachTree.test.mjs).
 * Inputs are plain rows so it works whether the data comes from Supabase or
 * fixtures; the OC tool fetches the published tables and passes them in.
 */

const DNA_FIELDS = ["proe", "epa_play", "adot", "pass_rate", "success_rate"];

const keyTS = (season, team) => `${season}|${team}`;
const clean = (s) => (s == null ? "" : String(s).trim());

/**
 * @param {object} params
 * @param {Array<{season:number, team:string, head_coach:string, is_primary?:boolean}>}
 *   params.coachSeasons  head-coach stints (Supabase coach_seasons).
 * @param {object} [params.ocData]  OC_DATA-shaped { year: { TEAM: { name } } }.
 * @param {Array<object>} [params.schemeSeasons]  per (season, team) fingerprints
 *   (Supabase team_scheme_seasons) for scheme DNA.
 * @returns {{ coaches: Map<string, object>, edges: Array<object> }}
 */
export function buildCoachTrees({ coachSeasons = [], ocData = {}, schemeSeasons = [] } = {}) {
  const coaches = new Map();
  const coach = (name) => {
    const n = clean(name);
    if (!coaches.has(n)) {
      coaches.set(n, {
        name: n,
        hcStops: [],
        ocStops: [],
        mentors: new Set(),
        disciples: new Set(),
        _dna: [],
      });
    }
    return coaches.get(n);
  };

  // Scheme fingerprint lookup by team-season.
  const schemeByTS = new Map();
  for (const s of schemeSeasons) {
    schemeByTS.set(keyTS(Number(s.season), clean(s.team)), s);
  }

  // Head coaches: primary stint per team-season (fall back to any row if no
  // primary flag is present, e.g. older publishes).
  const hcByTS = new Map();
  for (const r of coachSeasons) {
    if (!clean(r.head_coach)) continue;
    const k = keyTS(Number(r.season), clean(r.team));
    if (r.is_primary || !hcByTS.has(k)) hcByTS.set(k, clean(r.head_coach));
  }
  for (const [k, name] of hcByTS) {
    const [season, team] = k.split("|");
    const c = coach(name);
    c.hcStops.push({ season: Number(season), team });
    const fp = schemeByTS.get(k);
    if (fp) c._dna.push(fp);
  }

  // Offensive coordinators from OC_DATA.
  const ocByTS = new Map();
  for (const [year, teams] of Object.entries(ocData || {})) {
    const season = Number(year);
    for (const [team, entry] of Object.entries(teams || {})) {
      const name = clean(entry?.name);
      if (!name || /^vacant$/i.test(name)) continue;
      const k = keyTS(season, clean(team));
      ocByTS.set(k, name);
      coach(name).ocStops.push({ season, team: clean(team) });
    }
  }

  // Edges: OC served under a *different* HC at the same team-season.
  const edges = [];
  for (const [k, ocName] of ocByTS) {
    const hcName = hcByTS.get(k);
    if (!hcName || hcName === ocName) continue; // unknown HC, or OC == HC (playcaller)
    const [season, team] = k.split("|");
    edges.push({ mentor: hcName, disciple: ocName, team, season: Number(season) });
    coach(hcName).disciples.add(ocName);
    coach(ocName).mentors.add(hcName);
  }

  // Finalize: scheme DNA averages, sorted stops, Sets → sorted arrays.
  for (const c of coaches.values()) {
    c.schemeDNA = averageDNA(c._dna);
    delete c._dna;
    c.hcStops.sort((a, b) => a.season - b.season || a.team.localeCompare(b.team));
    c.ocStops.sort((a, b) => a.season - b.season || a.team.localeCompare(b.team));
    c.mentors = [...c.mentors].sort();
    c.disciples = [...c.disciples].sort();
    c.isHeadCoach = c.hcStops.length > 0;
  }

  return { coaches, edges };
}

function averageDNA(rows) {
  if (!rows.length) return null;
  const out = { n: rows.length };
  for (const f of DNA_FIELDS) {
    const vals = rows.map((r) => Number(r[f])).filter((v) => Number.isFinite(v));
    out[f] = vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 4) : null;
  }
  return out;
}

function round(v, d) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

/**
 * Traverse a coach's tree of disciples (coordinators who served under them, then
 * their disciples, …) up to `maxDepth`. Returns a nested structure for rendering.
 * Cycle-safe (a coach can't appear twice on one path).
 */
export function getDiscipleTree(name, graph, maxDepth = 3) {
  const root = clean(name);
  const visit = (n, depth, seen) => {
    const c = graph.coaches.get(n);
    if (!c) return { name: n, disciples: [] };
    const node = {
      name: n,
      isHeadCoach: c.isHeadCoach,
      hcStops: c.hcStops,
      schemeDNA: c.schemeDNA,
      disciples: [],
    };
    if (depth >= maxDepth) return node;
    for (const d of c.disciples) {
      if (seen.has(d)) continue;
      node.disciples.push(visit(d, depth + 1, new Set([...seen, d])));
    }
    return node;
  };
  return visit(root, 0, new Set([root]));
}

/** Coaches whose disciples later became head coaches — the most influential trees. */
export function rankCoachTrees(graph) {
  const out = [];
  for (const c of graph.coaches.values()) {
    if (!c.isHeadCoach) continue;
    const hcDisciples = c.disciples.filter((d) => graph.coaches.get(d)?.isHeadCoach);
    out.push({ name: c.name, disciples: c.disciples.length, hcDisciples: hcDisciples.length });
  }
  return out.sort((a, b) => b.hcDisciples - a.hcDisciples || b.disciples - a.disciples);
}
