/**
 * Unit tests for the redraft draft-assistant math.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  replacementLevels,
  vorFor,
  draftRosterNeeds,
  rankRedraftBoard,
  recommendRedraftPicks,
} from "./redraftDraft.js";

// A 2-team superflex-ish context: 1 QB + 1 SUPER_FLEX ⇒ roomStarterCount(QB)=2,
// so QB replacement rank = 2 × 2 teams = 4.
const CTX = {
  numTeams: 2,
  starterCounts: { QB: 1, RB: 2, WR: 2, TE: 1 },
  flexCount: 1,
  superFlexCount: 1,
};

const ppgOf = (p) => p.ppg;

function wr(id, ppg) {
  return { playerId: id, position: "WR", ppg };
}

describe("replacementLevels", () => {
  it("sets the line at (per-team starters × teams)-th best at each position", () => {
    // WR per-team = starterCounts.WR(2) + round(nonSfFlex(0) × 0.5)=0 → 2; × 2 teams = 4.
    const wrs = [wr("a", 20), wr("b", 18), wr("c", 16), wr("d", 14), wr("e", 12)];
    const levels = replacementLevels(wrs, ppgOf, CTX);
    assert.equal(levels.WR, 14); // the 4th-best WR is the replacement
  });

  it("degrades to the worst available when the pool is thinner than the demand", () => {
    const levels = replacementLevels([wr("a", 20), wr("b", 18)], ppgOf, CTX);
    assert.equal(levels.WR, 18); // only 2 WRs, demand 4 → last one
  });
});

describe("vorFor", () => {
  it("is points above the replacement line", () => {
    const levels = { WR: 14 };
    assert.equal(vorFor(wr("a", 20), 20, levels), 6);
    assert.equal(vorFor(wr("e", 12), 12, levels), -2);
  });
  it("returns null when the position has no line", () => {
    assert.equal(vorFor({ position: "K", ppg: 8 }, 8, { WR: 14 }), null);
  });
});

describe("draftRosterNeeds", () => {
  it("weights unfilled slots and splits flex across eligible positions", () => {
    const starters = [
      { eligible: ["QB"], player: { id: 1 } }, // filled → no need
      { eligible: ["RB"], player: null }, // open RB → +1
      { eligible: ["RB", "WR", "TE"], player: null }, // open FLEX → +1/3 each
    ];
    const needs = draftRosterNeeds(starters);
    assert.equal(needs.QB, undefined);
    assert.ok(Math.abs(needs.RB - (1 + 1 / 3)) < 1e-9);
    assert.ok(Math.abs(needs.WR - 1 / 3) < 1e-9);
    assert.ok(Math.abs(needs.TE - 1 / 3) < 1e-9);
  });
});

describe("rankRedraftBoard / recommendRedraftPicks", () => {
  it("ranks by VOR and lets an open slot break a near-tie toward the need", () => {
    const levels = { RB: 10, WR: 10 };
    const pool = [
      { playerId: "rb1", position: "RB", ppg: 15 }, // VOR 5
      { playerId: "wr1", position: "WR", ppg: 15.4 }, // VOR 5.4
    ];
    // No need → the higher raw VOR (wr1) leads.
    const flat = rankRedraftBoard(pool, ppgOf, levels, {});
    assert.equal(flat[0].playerId, "wr1");
    // A strong RB need (weight 2) flips it: 5 × (1+2×0.35)=8.5 > 5.4 × 1 = 5.4.
    const withNeed = rankRedraftBoard(pool, ppgOf, levels, { RB: 2 });
    assert.equal(withNeed[0].playerId, "rb1");
    assert.equal(withNeed[0].vor, 5);
  });

  it("never lets need promote a below-replacement player over a positive-VOR one", () => {
    const levels = { RB: 10, WR: 10 };
    const pool = [
      { playerId: "rb_scrub", position: "RB", ppg: 6 }, // VOR -4
      { playerId: "wr_ok", position: "WR", ppg: 12 }, // VOR +2
    ];
    const ranked = rankRedraftBoard(pool, ppgOf, levels, { RB: 5 });
    assert.equal(ranked[0].playerId, "wr_ok");
  });

  it("recommendRedraftPicks returns the top N", () => {
    const levels = { WR: 10 };
    const pool = [wr("a", 20), wr("b", 18), wr("c", 16)];
    const recs = recommendRedraftPicks(pool, ppgOf, levels, {}, 2);
    assert.equal(recs.length, 2);
    assert.equal(recs[0].playerId, "a");
  });
});
