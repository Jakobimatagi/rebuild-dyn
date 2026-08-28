/**
 * Unit tests for rosterEfficiency.js — the roster-level Buying Power vs.
 * Expected Value grader. Run with: npm test (Node's built-in test runner).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeRosterEfficiency } from "./rosterEfficiency.js";

const CTX = {
  isSuperflex: true,
  tePremium: false,
  starterCounts: { QB: 1, RB: 2, WR: 3, TE: 1 },
  flexCount: 2,
};
const MARKET = { recentTrades: [] };

// Player priced on the FC dollar scale (≈ value × 100), so buying power reads
// on the ~value-pts trade scale.
let uid = 0;
const player = (position, age, value) => ({
  id: `p${uid++}`,
  name: `${position}${age}-${value}`,
  position,
  age,
  score: value,
  fantasyCalcValue: value * 100,
});

// Build a team. starterPPG drives expected value; enriched drives buying power.
const team = (rosterId, label, players, starterPPG, picks = [], phase = "retool") => ({
  rosterId,
  label,
  enriched: players,
  picks,
  avgAge: players.length
    ? (players.reduce((s, p) => s + p.age, 0) / players.length).toFixed(1)
    : "26",
  teamPhase: { phase, starterPPG },
});

describe("computeRosterEfficiency", () => {
  it("returns null without a league", () => {
    assert.equal(computeRosterEfficiency([], CTX, MARKET, "1"), null);
    assert.equal(computeRosterEfficiency(null, CTX, MARKET, "1"), null);
  });

  it("sums player + pick value into buying power", () => {
    const teams = [
      team("1", "Me", [player("WR", 24, 60), player("RB", 23, 40)], 120, [
        { season: "2026", round: 1, label: "2026 1st" },
      ]),
      team("2", "Them", [player("QB", 27, 50)], 110),
    ];
    const model = computeRosterEfficiency(teams, CTX, MARKET, "1");
    assert.ok(model && model.me);
    // 60 + 40 + a positive pick value.
    assert.ok(model.me.playerBP === 100);
    assert.ok(model.me.pickBP > 0);
    assert.equal(model.me.buyingPower, model.me.playerBP + model.me.pickBP);
    assert.equal(model.me.expectedValue, 120);
  });

  it("flags an under-leveraged (hoarding) roster: most buying power, least output", () => {
    const teams = [
      // Me: huge buying power, weak lineup output.
      team("1", "Hoarder", [player("WR", 22, 90), player("RB", 21, 85), player("QB", 23, 80)], 90),
      team("2", "B", [player("WR", 28, 30)], 130),
      team("3", "C", [player("RB", 27, 32)], 125),
      team("4", "D", [player("QB", 29, 28)], 120),
    ];
    const model = computeRosterEfficiency(teams, CTX, MARKET, "1");
    assert.equal(model.me.bpRank, 1); // most buying power
    assert.equal(model.me.evRank, 4); // least expected value
    assert.equal(model.me.quadrant, "under-leveraged");
    assert.ok(model.me.efficiencyIndex < 0);
    assert.ok(["D", "F"].includes(model.me.grade));
  });

  it("flags a maxed-out (over-extended) roster: least buying power, most output", () => {
    const teams = [
      // Me: thin assets, elite lineup, no future capital (all old, no picks).
      team("1", "Maxed", [player("WR", 30, 22), player("RB", 31, 20)], 145),
      team("2", "B", [player("WR", 23, 80), player("QB", 22, 85)], 100),
      team("3", "C", [player("RB", 22, 78), player("TE", 23, 70)], 105),
      team("4", "D", [player("QB", 24, 82)], 98),
    ];
    const model = computeRosterEfficiency(teams, CTX, MARKET, "1");
    assert.equal(model.me.evRank, 1); // most output
    assert.equal(model.me.bpRank, 4); // least buying power
    assert.equal(model.me.quadrant, "over-extended");
    assert.equal(model.me.risk, "over-extended");
    assert.ok(model.me.efficiencyIndex > 0);
  });

  it("rewards a loaded & efficient roster: top of both", () => {
    const teams = [
      team("1", "Loaded", [player("WR", 24, 90), player("QB", 25, 88), player("RB", 23, 80)], 150),
      team("2", "B", [player("WR", 29, 30)], 100),
      team("3", "C", [player("RB", 30, 28)], 95),
    ];
    const model = computeRosterEfficiency(teams, CTX, MARKET, "1");
    assert.equal(model.me.quadrant, "loaded");
    assert.equal(model.me.risk, null);
  });

  it("attaches a grade, archetype, and note to every team", () => {
    const teams = [
      team("1", "A", [player("WR", 24, 60)], 120),
      team("2", "B", [player("QB", 27, 50)], 110),
      team("3", "C", [player("RB", 26, 55)], 115),
    ];
    const model = computeRosterEfficiency(teams, CTX, MARKET, "2");
    for (const r of model.rows) {
      assert.ok(r.grade && r.gradeColor && r.archetype && r.headline && r.note);
      assert.ok(r.bpPct >= 0 && r.bpPct <= 100);
      assert.ok(r.evPct >= 0 && r.evPct <= 100);
    }
  });
});
