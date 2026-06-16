/**
 * Unit tests for coachTree.js
 * Run with: npm test (Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCoachTrees,
  getDiscipleTree,
  rankCoachTrees,
} from "./coachTree.js";

// A small lineage: Shanahan (HC of SF) with McDaniel as his OC, who then becomes
// HC of MIA with Slowik as OC. Classic two-generation tree.
const coachSeasons = [
  { season: 2021, team: "SF", head_coach: "Kyle Shanahan", is_primary: true },
  { season: 2022, team: "SF", head_coach: "Kyle Shanahan", is_primary: true },
  { season: 2022, team: "MIA", head_coach: "Mike McDaniel", is_primary: true },
  { season: 2023, team: "MIA", head_coach: "Mike McDaniel", is_primary: true },
  // a mid-season change row that is NOT primary — must be ignored for HC-of-record
  { season: 2023, team: "MIA", head_coach: "Interim Guy", is_primary: false },
];

const ocData = {
  2021: { SF: { name: "Mike McDaniel" } },          // McDaniel OC under Shanahan
  2022: { MIA: { name: "Bobby Slowik" }, SF: { name: "Kyle Shanahan", playcaller: "HC" } },
  2023: { MIA: { name: "Frank Smith" } },
};

const schemeSeasons = [
  { season: 2021, team: "SF", proe: 2.0, epa_play: 0.12, adot: 7.5, pass_rate: 0.55, success_rate: 0.47 },
  { season: 2022, team: "SF", proe: 4.0, epa_play: 0.18, adot: 7.9, pass_rate: 0.57, success_rate: 0.49 },
  { season: 2022, team: "MIA", proe: 1.0, epa_play: 0.09, adot: 8.2, pass_rate: 0.56, success_rate: 0.46 },
];

describe("buildCoachTrees", () => {
  const graph = buildCoachTrees({ coachSeasons, ocData, schemeSeasons });

  it("records HC stops from primary rows only (ignores interim non-primary)", () => {
    const shanahan = graph.coaches.get("Kyle Shanahan");
    assert.deepEqual(shanahan.hcStops.map((s) => `${s.season} ${s.team}`), ["2021 SF", "2022 SF"]);
    assert.ok(!graph.coaches.has("Interim Guy") || graph.coaches.get("Interim Guy").hcStops.length === 0);
  });

  it("draws mentor→disciple edges where OC served under a different HC", () => {
    const edge = graph.edges.find((e) => e.disciple === "Mike McDaniel");
    assert.ok(edge, "expected a McDaniel-under-Shanahan edge");
    assert.equal(edge.mentor, "Kyle Shanahan");
    assert.equal(edge.team, "SF");
    assert.equal(edge.season, 2021);
  });

  it("does NOT draw a self-edge when the OC is the head coach (playcaller)", () => {
    // 2022 SF lists Shanahan as OC/playcaller — must not create a Shanahan→Shanahan edge.
    assert.ok(!graph.edges.some((e) => e.mentor === e.disciple));
    assert.ok(!graph.coaches.get("Kyle Shanahan").mentors.includes("Kyle Shanahan"));
  });

  it("links mentors and disciples both directions", () => {
    assert.ok(graph.coaches.get("Kyle Shanahan").disciples.includes("Mike McDaniel"));
    assert.ok(graph.coaches.get("Mike McDaniel").mentors.includes("Kyle Shanahan"));
    assert.ok(graph.coaches.get("Mike McDaniel").disciples.includes("Bobby Slowik"));
  });

  it("computes scheme DNA averaged over a coach's HC stops", () => {
    const dna = graph.coaches.get("Kyle Shanahan").schemeDNA;
    assert.equal(dna.n, 2);
    assert.equal(dna.proe, 3.0); // mean(2.0, 4.0)
    assert.equal(dna.epa_play, 0.15); // mean(0.12, 0.18)
  });

  it("flags head coaches", () => {
    assert.equal(graph.coaches.get("Kyle Shanahan").isHeadCoach, true);
    assert.equal(graph.coaches.get("Bobby Slowik").isHeadCoach, false);
  });
});

describe("getDiscipleTree", () => {
  it("traverses generations of disciples", () => {
    const graph = buildCoachTrees({ coachSeasons, ocData, schemeSeasons });
    const tree = getDiscipleTree("Kyle Shanahan", graph, 3);
    assert.equal(tree.name, "Kyle Shanahan");
    const mcd = tree.disciples.find((d) => d.name === "Mike McDaniel");
    assert.ok(mcd, "McDaniel should be a direct disciple");
    assert.ok(mcd.disciples.some((d) => d.name === "Bobby Slowik"), "Slowik under McDaniel");
  });

  it("respects maxDepth", () => {
    const graph = buildCoachTrees({ coachSeasons, ocData, schemeSeasons });
    const shallow = getDiscipleTree("Kyle Shanahan", graph, 1);
    const mcd = shallow.disciples.find((d) => d.name === "Mike McDaniel");
    assert.equal(mcd.disciples.length, 0); // depth capped before Slowik
  });
});

describe("rankCoachTrees", () => {
  it("ranks head coaches by how many disciples became head coaches", () => {
    const graph = buildCoachTrees({ coachSeasons, ocData, schemeSeasons });
    const ranked = rankCoachTrees(graph);
    const shanahan = ranked.find((r) => r.name === "Kyle Shanahan");
    assert.ok(shanahan);
    assert.equal(shanahan.hcDisciples, 1); // McDaniel became a HC
  });
});
