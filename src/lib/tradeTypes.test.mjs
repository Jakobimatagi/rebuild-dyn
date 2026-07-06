/**
 * Unit tests for tradeTypes.js — the dynasty trade-type taxonomy.
 * Run with: npm test (Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TRADE_TYPES, classifyTradeType } from "./tradeTypes.js";

const mk = (position, age, value, extra = {}) => ({
  type: "player",
  id: extra.id ?? `${position}-${age}-${value}`,
  name: extra.name ?? `${position} ${value}`,
  position,
  age,
  yearsExp: extra.yearsExp ?? Math.max(0, age - 22),
  score: value,
  dynastyValue: { value },
  ...extra,
});

const pick = (season, round) => ({
  type: "pick",
  season,
  round,
  label: `${season} ${round}${round === 1 ? "st" : round === 2 ? "nd" : round === 3 ? "rd" : "th"}`,
});

describe("classifyTradeType — the ten canonical shapes", () => {
  it("Tier Down: elite out for a near-tier piece + a 1st", () => {
    const r = classifyTradeType({
      outgoing: [mk("WR", 26, 98, { name: "Justin Jefferson" })],
      incoming: [mk("WR", 25, 80, { name: "George Pickens" }), pick(2027, 1)],
    });
    assert.equal(r.id, "tierDown");
  });

  it("Tier Up: multiple mid pieces in, one blue chip back", () => {
    const r = classifyTradeType({
      outgoing: [mk("WR", 24, 75, { name: "Drake London" }), pick(2026, 1)],
      incoming: [mk("WR", 26, 98, { name: "Ja'Marr Chase" })],
    });
    assert.equal(r.id, "tierUp");
  });

  it("Lateral Pivot: same-tier 1-for-1 with an age story", () => {
    const r = classifyTradeType({
      outgoing: [mk("WR", 31, 72, { name: "Aging WR1" })],
      incoming: [mk("WR", 24, 74, { name: "Ascending WR" })],
    });
    assert.equal(r.id, "lateralPivot");
    assert.match(r.detail, /shedding age risk/);
  });

  it("Vet-for-Pick: 28yo RB1 out for a future 1st + developmental WR", () => {
    const r = classifyTradeType({
      outgoing: [mk("RB", 28, 68, { name: "Vet RB1" })],
      incoming: [pick(2027, 1), mk("WR", 22, 35, { name: "Dart Throw" })],
    });
    assert.equal(r.id, "vetForPick");
  });

  it("Pick-for-Vet: future 1st out for a producing veteran QB", () => {
    const r = classifyTradeType({
      outgoing: [pick(2027, 1)],
      incoming: [mk("QB", 31, 66, { name: "Vet QB" })],
    });
    assert.equal(r.id, "pickForVet");
  });

  it("Rookie Fever: current-year 1st out for a proven young producer", () => {
    const r = classifyTradeType({
      outgoing: [pick(2026, 1)],
      incoming: [mk("WR", 25, 78, { name: "Certified Producer", yearsExp: 3 })],
      currentSeason: 2026,
    });
    assert.equal(r.id, "rookieFever");
  });

  it("Time Arbitrage: a 2026 2nd becomes a 2028 1st", () => {
    const r = classifyTradeType({
      outgoing: [pick(2026, 2)],
      incoming: [pick(2028, 1)],
    });
    assert.equal(r.id, "timeArbitrage");
  });

  it("2-for-1 Depth Consolidation below the elite line", () => {
    const r = classifyTradeType({
      outgoing: [mk("WR", 25, 58), mk("RB", 24, 52)],
      incoming: [mk("WR", 25, 76)],
    });
    assert.equal(r.id, "twoForOne");
  });

  it("1-for-2 Bench Churn: mid starter out for two upside stashes", () => {
    const r = classifyTradeType({
      outgoing: [mk("WR", 26, 65)],
      incoming: [mk("WR", 22, 45), mk("RB", 23, 40)],
    });
    assert.equal(r.id, "oneForTwo");
  });

  it("Handcuff: cheap RB behind my elite starter's NFL backfield", () => {
    const team = {
      enriched: [
        mk("RB", 24, 92, { name: "My Anchor", team: "SF" }),
        mk("WR", 25, 70, { team: "DAL" }),
      ],
    };
    const r = classifyTradeType({
      team,
      outgoing: [pick(2027, 3)],
      incoming: [mk("RB", 24, 30, { name: "The Cuff", team: "SF" })],
    });
    assert.equal(r.id, "handcuff");
  });
});

describe("classifyTradeType — guards and metadata", () => {
  it("a vet swapped for an established young star is NOT a liquidation", () => {
    const r = classifyTradeType({
      outgoing: [mk("RB", 27, 80)],
      incoming: [mk("WR", 24, 82)],
    });
    assert.equal(r.id, "lateralPivot");
  });

  it("pick-for-pick without a round upgrade is just a value swap", () => {
    const r = classifyTradeType({
      outgoing: [pick(2027, 2)],
      incoming: [pick(2027, 3), pick(2027, 4)],
    });
    assert.equal(r.id, "valueSwap");
  });

  it("every type carries master-matrix metadata", () => {
    for (const t of Object.values(TRADE_TYPES)) {
      assert.ok(t.id && t.label && t.give && t.get && t.objective && t.bestTime, t.id);
    }
  });
});
