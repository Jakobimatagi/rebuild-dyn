import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRosterOcImpact, ocImpactVerdict } from "./rosterOcImpact.js";

function player(id, position, team, ocOutlook) {
  return { id, name: id, position, team, ocOutlook };
}

function oc({ ocName = "Test OC", baselinePpg = null, projectedPpg = null, delta = null, multiplierPct = 0, schemes = [], isFirstYearOC = false, ocPartial = false } = {}) {
  return { ocName, baselinePpg, projectedPpg, delta, multiplierPct, schemes, isFirstYearOC, ocPartial };
}

test("returns null when no player has an OC outlook", () => {
  const byPos = { QB: [player("a", "QB", "KC", null)], RB: [], WR: [], TE: [] };
  assert.equal(buildRosterOcImpact(byPos), null);
});

test("sums baseline/projected and computes net swing", () => {
  const byPos = {
    QB: [player("q", "QB", "KC", oc({ baselinePpg: 20, projectedPpg: 22, delta: 2 }))],
    RB: [player("r", "RB", "KC", oc({ baselinePpg: 12, projectedPpg: 10.5, delta: -1.5 }))],
    WR: [], TE: [],
  };
  const impact = buildRosterOcImpact(byPos);
  assert.equal(impact.withBaseline, 2);
  assert.equal(impact.baselinePpg, 32);
  assert.equal(impact.projectedPpg, 32.5);
  assert.ok(Math.abs(impact.netDelta - 0.5) < 1e-9);
  assert.equal(impact.counts.helped, 1);
  assert.equal(impact.counts.hurt, 1);
  assert.equal(impact.tailwinds[0].id, "q");
  assert.equal(impact.headwinds[0].id, "r");
});

test("clusters players by NFL offense and combines delta", () => {
  const byPos = {
    QB: [player("q", "QB", "KC", oc({ baselinePpg: 20, projectedPpg: 22, delta: 2 }))],
    WR: [
      player("w1", "WR", "KC", oc({ baselinePpg: 14, projectedPpg: 15, delta: 1 })),
      player("w2", "WR", "BUF", oc({ baselinePpg: 10, projectedPpg: 9, delta: -1 })),
    ],
    RB: [], TE: [],
  };
  const impact = buildRosterOcImpact(byPos);
  const kc = impact.clusters.find((c) => c.team === "KC");
  assert.equal(kc.players.length, 2);
  assert.ok(Math.abs(kc.delta - 3) < 1e-9);
  assert.equal(kc.teamName, "Kansas City Chiefs");
});

test("rookies with no baseline land in envOnly, not totals", () => {
  const byPos = {
    QB: [], RB: [],
    WR: [player("rk", "WR", "LAR", oc({ baselinePpg: null, projectedPpg: null, multiplierPct: 5.2 }))],
    TE: [],
  };
  const impact = buildRosterOcImpact(byPos);
  assert.equal(impact.withBaseline, 0);
  assert.equal(impact.envOnly.length, 1);
  assert.equal(impact.envOnly[0].multiplierPct, 5.2);
});

test("dedupes first-year / partial OC risk flags by coordinator", () => {
  const newOc = oc({ ocName: "Rookie Coord", baselinePpg: 10, projectedPpg: 10, delta: 0, isFirstYearOC: true });
  const byPos = {
    QB: [player("a", "QB", "CHI", newOc)],
    WR: [player("b", "WR", "CHI", newOc)],
    RB: [], TE: [],
  };
  const impact = buildRosterOcImpact(byPos);
  assert.equal(impact.risks.firstYearOc.length, 1);
  assert.deepEqual(impact.risks.firstYearOc[0].players, ["a", "b"]);
});

test("verdict reflects net swing magnitude", () => {
  assert.equal(ocImpactVerdict({ withBaseline: 3, netDelta: 4 }).label, "Strong tailwind");
  assert.equal(ocImpactVerdict({ withBaseline: 3, netDelta: -4 }).label, "Strong headwind");
  assert.equal(ocImpactVerdict({ withBaseline: 3, netDelta: 0.1 }).label, "Roughly neutral");
  assert.equal(ocImpactVerdict({ withBaseline: 0, netDelta: 0 }).label, "No projection");
});
