/**
 * Unit tests for dynastyValue.js
 * Run with: npm test (Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeDynastyValue,
  projectionPercentiles,
  valueTier,
} from "./dynastyValue.js";

// A young ascending WR: same current grade as an aging RB, but a rising
// projection and breakout upside.
const youngAscending = {
  position: "WR",
  age: 23,
  score: 70,
  marketValue: 78,
  prediction: {
    projections: [
      { yearsAhead: 1, score: 76 },
      { yearsAhead: 2, score: 80 },
      { yearsAhead: 3, score: 82 },
    ],
    breakoutProb: 55,
    bustRisk: 15,
  },
};

// An aging RB: identical current grade, but a declining projection and high bust.
const agingDecline = {
  position: "RB",
  age: 29,
  score: 70,
  marketValue: 58,
  prediction: {
    projections: [
      { yearsAhead: 1, score: 62 },
      { yearsAhead: 2, score: 50 },
      { yearsAhead: 3, score: 40 },
    ],
    breakoutProb: 5,
    bustRisk: 60,
  },
};

describe("computeDynastyValue", () => {
  it("returns null for non-skill positions", () => {
    assert.equal(computeDynastyValue({ position: "K", score: 90 }), null);
    assert.equal(computeDynastyValue(null), null);
  });

  it("ranks a young ascending asset above an aging declining one at equal grade", () => {
    const up = computeDynastyValue(youngAscending);
    const down = computeDynastyValue(agingDecline);
    assert.ok(up.value > down.value, `${up.value} should beat ${down.value}`);
  });

  it("forward production percentile lifts present value", () => {
    const base = computeDynastyValue(youngAscending);
    const hot = computeDynastyValue(youngAscending, { projPctile: 95 });
    const cold = computeDynastyValue(youngAscending, { projPctile: 20 });
    assert.ok(hot.value > base.value, "hot projection should raise value");
    assert.ok(cold.value < base.value, "cold projection should lower value");
    assert.equal(hot.confidence, "high");
  });

  it("degrades gracefully with no prediction and no projection", () => {
    const v = computeDynastyValue({ position: "TE", score: 55, marketValue: 50 });
    assert.ok(v && v.value > 0);
    assert.equal(v.confidence, "low");
    // With no future info, present == grade and the value anchors near market.
    assert.equal(v.breakdown.present, 55);
  });

  it("anchors toward market value", () => {
    const lowMarket = computeDynastyValue({
      ...youngAscending,
      marketValue: 20,
    });
    const highMarket = computeDynastyValue({
      ...youngAscending,
      marketValue: 110,
    });
    assert.ok(highMarket.value > lowMarket.value);
  });

  it("clamps and rounds to a sane band", () => {
    const v = computeDynastyValue(youngAscending, { projPctile: 99 });
    assert.ok(v.value >= 1 && v.value <= 130);
    assert.equal(v.value, Math.round(v.value));
  });

  it("assigns a tier label", () => {
    assert.equal(valueTier(96), "Cornerstone");
    assert.equal(valueTier(10), "Flier");
    assert.equal(typeof computeDynastyValue(youngAscending).tier, "string");
  });
});

describe("projectionPercentiles", () => {
  it("ranks within position, 0-99, keyed by player_id", () => {
    const rows = [
      { player_id: "1", position: "WR", proj_ppr: 5 },
      { player_id: "2", position: "WR", proj_ppr: 10 },
      { player_id: "3", position: "WR", proj_ppr: 20 },
      { player_id: "10", position: "RB", proj_ppr: 8 },
    ];
    const pct = projectionPercentiles(rows);
    assert.equal(pct.get("1"), 0); // worst WR
    assert.equal(pct.get("3"), 99); // best WR
    assert.ok(pct.get("2") > 0 && pct.get("2") < 99);
    assert.equal(pct.get("10"), 50); // lone RB → midpoint
  });

  it("ignores non-skill positions and non-finite points", () => {
    const pct = projectionPercentiles([
      { player_id: "a", position: "K", proj_ppr: 100 },
      { player_id: "b", position: "WR", proj_ppr: null },
    ]);
    assert.equal(pct.size, 0);
  });
});
