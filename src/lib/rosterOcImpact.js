// ── Roster-level OC impact synthesis ─────────────────────────────────────────
// Per-player OC outlooks (buildPlayerOcOutlook in ocAdjustment.js) already tell
// us how each rostered player's Year-1 PPG shifts under their team's incoming
// coordinator + scheme. This module rolls those individual outlooks up to the
// *team* level so a manager can see, in one glance, how the offseason's OC churn
// moves their whole roster: net projected-PPG swing, who's catching tailwinds
// vs. headwinds, which NFL offenses they're concentrated on, and where the
// projection is shakiest (first-year or mid-season coordinators).
//
// Input is the same `byPos` map RosterTab renders ({ QB:[], RB:[], WR:[], TE:[] }),
// where each player optionally carries `ocOutlook`. Players without an outlook
// (free agents, positions with no OC data) are simply skipped — they contribute
// nothing to the totals rather than dragging them toward zero.

import { NFL_TEAMS } from "./ocData.js";

const TEAM_NAME = Object.fromEntries(NFL_TEAMS.map((t) => [t.abbr, t.name]));

// A delta has to clear this (PPG) to count as a real mover; anything smaller is
// rounding noise from the ±20% multiplier acting on a low baseline.
const MOVER_THRESHOLD = 0.1;

function sign(n) {
  return n > 0 ? "+" : "";
}

/**
 * Aggregate every rostered player's `ocOutlook` into a single team-level view.
 *
 * Returns null when no player on the roster has an OC outlook at all (e.g. OC
 * data hasn't loaded for the target season). Otherwise:
 *
 *   {
 *     covered,            // # of players with an OC outlook
 *     withBaseline,       // # of those that also had a PPG baseline to project
 *     baselinePpg,        // Σ baseline PPG across covered+baselined players
 *     projectedPpg,       // Σ projected PPG (same set)
 *     netDelta,           // projectedPpg − baselinePpg (team PPG swing)
 *     netPct,             // netDelta / baselinePpg
 *     counts: { helped, hurt, neutral },
 *     tailwinds: [mover…],   // delta > 0, sorted strongest first
 *     headwinds: [mover…],   // delta < 0, sorted most negative first
 *     envOnly:   [player…],  // outlook but no baseline (rookies / no games)
 *     clusters:  [cluster…], // grouped by NFL team, sorted by |combined delta|
 *     risks: { firstYearOc:[…], partialOc:[…] },
 *   }
 *
 * Each `mover` is { id, name, pos, team, ocName, baselinePpg, projectedPpg,
 * delta, multiplierPct }. Each `cluster` is { team, teamName, ocName, schemes,
 * players:[…], baselinePpg, projectedPpg, delta, isFirstYearOC, ocPartial }.
 */
export function buildRosterOcImpact(byPos) {
  if (!byPos) return null;

  const all = [];
  for (const pos of Object.keys(byPos)) {
    for (const p of byPos[pos] || []) {
      if (p?.ocOutlook) all.push(p);
    }
  }
  if (all.length === 0) return null;

  let baselinePpg = 0;
  let projectedPpg = 0;
  let withBaseline = 0;
  const counts = { helped: 0, hurt: 0, neutral: 0 };
  const movers = [];
  const envOnly = [];
  const clusterMap = new Map();
  const firstYearOc = [];
  const partialOc = [];
  const seenFirstYear = new Set();
  const seenPartial = new Set();

  for (const p of all) {
    const oc = p.ocOutlook;
    const team = p.team;

    if (oc.baselinePpg != null && oc.projectedPpg != null) {
      baselinePpg += oc.baselinePpg;
      projectedPpg += oc.projectedPpg;
      withBaseline += 1;

      const delta = oc.delta ?? oc.projectedPpg - oc.baselinePpg;
      const mover = {
        id: p.id,
        name: p.name,
        pos: p.position,
        team,
        ocName: oc.ocName,
        baselinePpg: oc.baselinePpg,
        projectedPpg: oc.projectedPpg,
        delta,
        multiplierPct: oc.multiplierPct,
      };
      if (delta >= MOVER_THRESHOLD) counts.helped += 1;
      else if (delta <= -MOVER_THRESHOLD) counts.hurt += 1;
      else counts.neutral += 1;
      if (Math.abs(delta) >= MOVER_THRESHOLD) movers.push(mover);
    } else {
      // Outlook exists but no PPG baseline (rookie / no games played) — surface
      // it as an environment signal, not a production swing.
      envOnly.push({
        id: p.id,
        name: p.name,
        pos: p.position,
        team,
        ocName: oc.ocName,
        multiplierPct: oc.multiplierPct,
      });
    }

    // Cluster by NFL offense — concentration is the manager-relevant story
    // (three players on one downgraded offense is a roster-wide dent).
    if (team) {
      if (!clusterMap.has(team)) {
        clusterMap.set(team, {
          team,
          teamName: TEAM_NAME[team] || team,
          ocName: oc.ocName,
          schemes: oc.schemes || [],
          isFirstYearOC: !!oc.isFirstYearOC,
          ocPartial: !!oc.ocPartial,
          players: [],
          baselinePpg: 0,
          projectedPpg: 0,
          delta: 0,
        });
      }
      const c = clusterMap.get(team);
      c.players.push({ id: p.id, name: p.name, pos: p.position });
      if (oc.baselinePpg != null && oc.projectedPpg != null) {
        c.baselinePpg += oc.baselinePpg;
        c.projectedPpg += oc.projectedPpg;
        c.delta += oc.delta ?? oc.projectedPpg - oc.baselinePpg;
      }
    }

    // Risk flags — dedupe by OC so we list each coordinator once, with the
    // affected players attached.
    if (oc.isFirstYearOC && !seenFirstYear.has(oc.ocName)) {
      seenFirstYear.add(oc.ocName);
      firstYearOc.push({ ocName: oc.ocName, team, players: [] });
    }
    if (oc.ocPartial && !seenPartial.has(oc.ocName)) {
      seenPartial.add(oc.ocName);
      partialOc.push({ ocName: oc.ocName, team, players: [] });
    }
    const fy = firstYearOc.find((r) => r.ocName === oc.ocName);
    if (fy && oc.isFirstYearOC) fy.players.push(p.name);
    const pt = partialOc.find((r) => r.ocName === oc.ocName);
    if (pt && oc.ocPartial) pt.players.push(p.name);
  }

  const tailwinds = movers
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  const headwinds = movers
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta);

  const clusters = [...clusterMap.values()].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
  );

  const netDelta = projectedPpg - baselinePpg;

  return {
    covered: all.length,
    withBaseline,
    baselinePpg,
    projectedPpg,
    netDelta,
    netPct: baselinePpg > 0 ? netDelta / baselinePpg : null,
    counts,
    tailwinds,
    headwinds,
    envOnly,
    clusters,
    risks: { firstYearOc, partialOc },
  };
}

/**
 * One-line plain-language verdict for the team's net OC swing. Tuned to the
 * total-roster PPG scale (a full lineup sums to ~120–160 PPG), so a few points
 * of net swing is already a meaningful tilt.
 */
export function ocImpactVerdict(impact) {
  if (!impact || impact.withBaseline === 0) {
    return { label: "No projection", tone: "#a0a8c0" };
  }
  const d = impact.netDelta;
  if (d >= 3) return { label: "Strong tailwind", tone: "#00f5a0" };
  if (d >= 0.8) return { label: "Net tailwind", tone: "#7fe0b0" };
  if (d <= -3) return { label: "Strong headwind", tone: "#ff6b35" };
  if (d <= -0.8) return { label: "Net headwind", tone: "#ffb088" };
  return { label: "Roughly neutral", tone: "#ffd84d" };
}

export { sign as ocSign, MOVER_THRESHOLD };
