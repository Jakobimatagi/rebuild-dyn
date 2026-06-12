import { test } from "node:test";
import assert from "node:assert/strict";
import { optimalLineup, winProbability, slotEligibility } from "./lineupMath.js";

const p = (id, pos, proj, floor, ceiling) => ({ id, pos, proj, floor, ceiling });

test("slotEligibility maps flex slots and passes through dedicated slots", () => {
  assert.deepEqual(slotEligibility("FLEX"), ["RB", "WR", "TE"]);
  assert.deepEqual(slotEligibility("SUPER_FLEX"), ["QB", "RB", "WR", "TE"]);
  assert.deepEqual(slotEligibility("QB"), ["QB"]);
});

test("optimalLineup fills dedicated slots first, then flex with the best leftover", () => {
  const players = [
    p("qb1", "QB", 25, 12, 38),
    p("qb2", "QB", 18, 8, 28),
    p("rb1", "RB", 20, 6, 34),
    p("rb2", "RB", 10, 2, 18),
    p("wr1", "WR", 16, 4, 28),
    p("te1", "TE", 8, 1, 15),
  ];
  // 1QB, 1RB, 1WR, 1 FLEX, 1 SUPER_FLEX, bench ignored.
  const slots = ["QB", "RB", "WR", "FLEX", "SUPER_FLEX", "BN", "BN"];
  const { starters, total } = optimalLineup(players, slots);

  const bySlot = Object.fromEntries(starters.map((s) => [s.slot, s.player?.id]));
  assert.equal(bySlot.QB, "qb1"); // best QB to the dedicated QB slot
  assert.equal(bySlot.RB, "rb1");
  assert.equal(bySlot.WR, "wr1");
  // FLEX (RB/WR/TE) takes the best remaining non-QB: rb2 (10) > te1 (8).
  assert.equal(bySlot.FLEX, "rb2");
  // SUPER_FLEX then takes the best remaining overall: qb2 (18).
  assert.equal(bySlot.SUPER_FLEX, "qb2");
  // Bench slots are not part of the lineup.
  assert.equal(starters.length, 5);
  // Total = 25 + 20 + 16 + 10 + 18.
  assert.equal(total, 89);
});

test("optimalLineup leaves a slot empty when no eligible player remains", () => {
  const players = [p("wr1", "WR", 16, 4, 28)];
  const { starters, total } = optimalLineup(players, ["QB", "WR"]);
  const bySlot = Object.fromEntries(starters.map((s) => [s.slot, s.player?.id]));
  assert.equal(bySlot.WR, "wr1");
  assert.equal(bySlot.QB, undefined); // no QB available -> empty
  assert.equal(total, 16);
});

test("winProbability: equal projections ~50%, favorite > 50%", () => {
  const a = { total: 110, variance: 400 };
  const b = { total: 110, variance: 400 };
  assert.ok(Math.abs(winProbability(a, b) - 0.5) < 1e-9);

  const fav = { total: 130, variance: 400 };
  const dog = { total: 100, variance: 400 };
  const wp = winProbability(fav, dog);
  assert.ok(wp > 0.5 && wp < 1);
  // Symmetry: the dog's win prob is the complement.
  assert.ok(Math.abs(winProbability(dog, fav) - (1 - wp)) < 1e-9);
});

test("winProbability with zero variance is deterministic", () => {
  assert.equal(winProbability({ total: 100, variance: 0 }, { total: 90, variance: 0 }), 1);
  assert.equal(winProbability({ total: 80, variance: 0 }, { total: 90, variance: 0 }), 0);
});
