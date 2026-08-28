/**
 * Unit tests for assessRosterEfficiency — the Buying Power vs. Expected Value
 * roster-efficiency read on tradeEngine.js.
 * Run with: npm test (Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assessRosterEfficiency } from "./tradeEngine.js";

describe("assessRosterEfficiency — buying power vs. expected value", () => {
  it("flags over-extending: big buying-power spend, little EV lift", () => {
    const r = assessRosterEfficiency({
      buyingPowerDelta: -30,
      ppgDelta: 0.4,
      phase: "contender",
    });
    assert.equal(r.flag, "over-extended");
    assert.equal(r.color, "#ff6b35");
    // Contender tone should call out the shortened window.
    assert.match(r.note, /window/i);
  });

  it("flags over-hoarding: banks buying power while losing present EV", () => {
    const r = assessRosterEfficiency({
      buyingPowerDelta: 28,
      ppgDelta: -2.5,
      phase: "retool",
    });
    assert.equal(r.flag, "over-hoarding");
    assert.match(r.note, /future flexibility/i);
  });

  it("rewards efficient allocation: converts buying power into EV", () => {
    const r = assessRosterEfficiency({
      buyingPowerDelta: -6,
      ppgDelta: 3.2,
      phase: "contender",
    });
    assert.equal(r.flag, "efficient");
    assert.equal(r.color, "#00f5a0");
  });

  it("a real spend that still buys real EV is efficient, not over-extended", () => {
    const r = assessRosterEfficiency({
      buyingPowerDelta: -20,
      ppgDelta: 2.0,
      phase: "contender",
    });
    assert.equal(r.flag, "efficient");
  });

  it("labels pure accumulation with no present-EV cost", () => {
    const r = assessRosterEfficiency({
      buyingPowerDelta: 20,
      ppgDelta: 0.2,
      phase: "rebuild",
    });
    assert.equal(r.flag, "accumulating");
  });

  it("returns a neutral read when nothing swings", () => {
    const r = assessRosterEfficiency({
      buyingPowerDelta: 3,
      ppgDelta: 0.1,
      phase: "retool",
    });
    assert.equal(r.flag, "neutral");
  });

  it("treats a missing/NaN ppgDelta as zero expected-value change", () => {
    const r = assessRosterEfficiency({
      buyingPowerDelta: -25,
      ppgDelta: undefined,
      phase: "retool",
    });
    assert.equal(r.flag, "over-extended");
  });

  it("always returns a grade, headline, note and color", () => {
    for (const bp of [-40, -5, 0, 5, 40]) {
      for (const ppg of [-4, -1, 0, 1, 4]) {
        const r = assessRosterEfficiency({ buyingPowerDelta: bp, ppgDelta: ppg, phase: "retool" });
        assert.ok(r.grade && r.headline && r.note && r.color);
      }
    }
  });
});
