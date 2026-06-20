import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mulberry32,
  gaussian,
  roundRobin,
  buildSchedule,
  lineupStrength,
  buildStrengths,
  simulatePowerRankings,
} from "./powerRankings.js";

test("mulberry32 is deterministic for a given seed", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test("gaussian returns the mean when sigma is 0", () => {
  const rng = mulberry32(1);
  assert.equal(gaussian(rng, 12.5, 0), 12.5);
});

test("gaussian sample mean tracks the requested mean", () => {
  const rng = mulberry32(7);
  let sum = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) sum += gaussian(rng, 100, 15);
  assert.ok(Math.abs(sum / N - 100) < 1, "sample mean within 1 of target");
});

test("roundRobin gives each team a unique opponent each round (even n)", () => {
  const rounds = roundRobin(6);
  assert.equal(rounds.length, 5); // n-1 rounds
  for (const round of rounds) {
    assert.equal(round.length, 3); // n/2 games
    const seen = new Set();
    for (const [a, b] of round) {
      assert.ok(!seen.has(a) && !seen.has(b));
      seen.add(a);
      seen.add(b);
    }
    assert.equal(seen.size, 6); // everyone plays
  }
});

test("roundRobin handles odd n with a bye", () => {
  const rounds = roundRobin(5);
  assert.equal(rounds.length, 5);
  for (const round of rounds) {
    assert.equal(round.length, 2); // one team sits each round
  }
});

test("buildSchedule produces the requested number of weeks", () => {
  const sched = buildSchedule(8, 14);
  assert.equal(sched.length, 14);
  assert.ok(sched.every((round) => round.length === 4));
});

test("lineupStrength uses the optimal lineup total as the mean", () => {
  const players = [
    { id: "qb", pos: "QB", proj: 24, floor: 14, ceiling: 34 },
    { id: "rb", pos: "RB", proj: 18, floor: 8, ceiling: 28 },
    { id: "wr", pos: "WR", proj: 16, floor: 6, ceiling: 26 },
  ];
  const { mean, sigma } = lineupStrength(players, ["QB", "RB", "WR", "BN"]);
  assert.equal(mean, 58); // 24 + 18 + 16
  assert.ok(sigma > 0);
});

test("buildStrengths prefers projections and carries record", () => {
  const out = buildStrengths([
    { rosterId: 1, label: "A", projMean: 120, projSigma: 20, actualPPG: 110, wins: 7, losses: 3 },
    { rosterId: 2, label: "B", projMean: 90, projSigma: 18, wins: 2, losses: 8 },
  ]);
  assert.equal(out.length, 2);
  // blended slightly toward actual (110) but still near projection (120).
  assert.ok(out[0].mean < 120 && out[0].mean > 112);
  assert.equal(out[0].priorWins, 7);
  assert.equal(out[1].mean, 90); // no actual → pure projection
});

test("buildStrengths falls back to a flat field with no data", () => {
  const out = buildStrengths([
    { rosterId: 1, label: "A" },
    { rosterId: 2, label: "B" },
  ]);
  assert.ok(out.every((t) => t.mean === 100 && t.sigma === 18));
});

test("simulatePowerRankings: stronger teams get better odds and odds sum to ~1", () => {
  const teams = [
    { rosterId: 1, label: "Juggernaut", projMean: 140, projSigma: 18 },
    { rosterId: 2, label: "Contender", projMean: 120, projSigma: 18 },
    { rosterId: 3, label: "Middle", projMean: 110, projSigma: 18 },
    { rosterId: 4, label: "Middle2", projMean: 108, projSigma: 18 },
    { rosterId: 5, label: "Weak", projMean: 95, projSigma: 18 },
    { rosterId: 6, label: "Tank", projMean: 85, projSigma: 18 },
  ];
  const res = simulatePowerRankings(teams, { weeks: 12, playoffTeams: 4, sims: 3000, seed: 99 });

  assert.equal(res.length, 6);
  // Champion odds across the league sum to 1 (exactly one champion per sim).
  const champSum = res.reduce((s, r) => s + r.championOdds, 0);
  assert.ok(Math.abs(champSum - 1) < 1e-9);

  // The juggernaut should be #1 power rank with the best title odds.
  const top = res.find((r) => r.rosterId === 1);
  const tank = res.find((r) => r.rosterId === 6);
  assert.equal(top.powerRank, 1);
  assert.ok(top.championOdds > tank.championOdds);
  assert.ok(top.playoffOdds > tank.playoffOdds);
  assert.ok(top.powerScore === 100 && tank.powerScore === 0);

  // Playoff field is 4 of 6, so league-wide playoff odds sum to ~4.
  const poSum = res.reduce((s, r) => s + r.playoffOdds, 0);
  assert.ok(Math.abs(poSum - 4) < 0.05);
});

test("simulatePowerRankings is reproducible for a fixed seed", () => {
  const teams = [
    { rosterId: 1, label: "A", projMean: 120, projSigma: 18 },
    { rosterId: 2, label: "B", projMean: 100, projSigma: 18 },
  ];
  const r1 = simulatePowerRankings(teams, { sims: 500, seed: 5 });
  const r2 = simulatePowerRankings(teams, { sims: 500, seed: 5 });
  assert.deepEqual(r1, r2);
});
