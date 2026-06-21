import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlayerStreaks,
  rankHot,
  rankCold,
  rankInjured,
  isEligible,
  MIN_PROJ_FLOOR,
} from "./hotStreaks.js";

// Helper to make a weekly entry quickly.
function e(player_id, week, proj, actual, extra = {}) {
  return { player_id, week, proj, actual, position: "WR", name: `P${player_id}`, team: "BUF", ...extra };
}

test("computes residual, beat flag, and averages over evaluated weeks", () => {
  const players = buildPlayerStreaks([
    e(1, 1, 10, 14), // +4 beat
    e(1, 2, 10, 8),  // -2 miss
    e(1, 3, 10, 16), // +6 beat
  ]);
  assert.equal(players.length, 1);
  const p = players[0];
  assert.equal(p.evaluatedWeeks, 3);
  assert.equal(p.beatCount, 2);
  assert.equal(p.weeks[0].residual, 4);
  assert.equal(p.weeks[1].beat, false);
  assert.equal(p.avgProj, 10);
  assert.equal(p.seasonAvgResidual, round1((4 - 2 + 6) / 3));
});

function round1(n) { return Math.round(n * 10) / 10; }

test("skips weeks below the projection floor and weeks with no actual", () => {
  const players = buildPlayerStreaks([
    e(1, 1, MIN_PROJ_FLOOR - 1, 99), // below floor → ignored
    e(1, 2, 12, null),               // DNP (no actual) → ignored
    e(1, 3, 12, 15),                 // counts
  ]);
  assert.equal(players[0].evaluatedWeeks, 1);
  assert.equal(players[0].weeks[0].week, 3);
});

test("current streak counts consecutive same-sign weeks from the latest", () => {
  // beat, beat, miss, beat, beat, beat → latest run is +3
  const players = buildPlayerStreaks([
    e(1, 1, 10, 12),
    e(1, 2, 10, 13),
    e(1, 3, 10, 5),
    e(1, 4, 10, 14),
    e(1, 5, 10, 15),
    e(1, 6, 10, 16),
  ]);
  assert.equal(players[0].currentStreak, 3);
});

test("cold streak is negative", () => {
  const players = buildPlayerStreaks([
    e(1, 1, 12, 14),
    e(1, 2, 12, 6),
    e(1, 3, 12, 7),
    e(1, 4, 12, 5),
  ]);
  assert.equal(players[0].currentStreak, -3);
});

test("a zero residual breaks the streak", () => {
  const players = buildPlayerStreaks([
    e(1, 1, 10, 13),
    e(1, 2, 10, 10), // exactly met → neutral, breaks run
  ]);
  assert.equal(players[0].currentStreak, 0);
});

test("eligibility requires enough weeks and fantasy relevance", () => {
  const thin = buildPlayerStreaks([e(1, 1, 10, 12), e(1, 2, 10, 13)])[0];
  assert.equal(isEligible(thin), false); // only 2 weeks

  const scrub = buildPlayerStreaks([
    e(2, 1, 5, 6), e(2, 2, 5, 7), e(2, 3, 5, 8),
  ])[0];
  assert.equal(isEligible(scrub), false); // avgProj 5 < floor
});

test("position-aware projection floor drops low-projected flash backups (Tonges case)", () => {
  // Backup TE projected ~6/wk who flashes — beats the bar big but isn't startable.
  const tonges = buildPlayerStreaks([
    e(1, 1, 6, 14, { position: "TE" }), e(1, 2, 6, 16, { position: "TE" }),
    e(1, 3, 6, 4, { position: "TE" }), e(1, 4, 6, 5, { position: "TE" }),
    e(1, 5, 6, 12, { position: "TE" }),
  ])[0];
  assert.equal(tonges.position, "TE");
  assert.equal(tonges.avgProj, 6);
  assert.equal(isEligible(tonges), false);      // 6 < TE floor (7)
  assert.ok(!rankHot([tonges]).length);          // and off the hot list

  // A real starting TE projected ~10/wk stays eligible.
  const starterTE = buildPlayerStreaks([
    e(2, 1, 10, 14, { position: "TE" }), e(2, 2, 10, 12, { position: "TE" }),
    e(2, 3, 10, 16, { position: "TE" }),
  ])[0];
  assert.equal(isEligible(starterTE), true);
});

test("rankHot returns over-performers hottest-first; rankCold the inverse", () => {
  const entries = [
    // Hot riser: beats every week, big recent residuals
    e(1, 1, 12, 18), e(1, 2, 12, 20), e(1, 3, 12, 22), e(1, 4, 12, 24),
    // Cold faller: misses every week
    e(2, 1, 14, 9), e(2, 2, 14, 8), e(2, 3, 14, 6), e(2, 4, 14, 5),
    // Steady: right on projection (neutral)
    e(3, 1, 12, 12), e(3, 2, 12, 12), e(3, 3, 12, 12), e(3, 4, 12, 12),
  ];
  const players = buildPlayerStreaks(entries);
  const hot = rankHot(players);
  const cold = rankCold(players);

  assert.equal(hot[0].player_id, "1");
  assert.ok(!hot.some((p) => p.player_id === "2")); // faller not in hot list
  assert.equal(cold[0].player_id, "2");
  assert.ok(!cold.some((p) => p.player_id === "1")); // riser not in cold list
});

test("recent-participation gate drops small-sample cameos, keeps late-season risers", () => {
  // League ran 12 weeks. A 3-game cameo (weeks 10-12) and a late riser who
  // started the whole back half (weeks 5-12) both beat projection big.
  const entries = [
    e(1, 10, 10, 18), e(1, 11, 10, 20), e(1, 12, 10, 22),                 // cameo: 3 of last 8
    e(2, 5, 10, 16), e(2, 6, 10, 17), e(2, 7, 10, 18), e(2, 8, 10, 19),   // riser: started wk 5
    e(2, 9, 10, 20), e(2, 10, 10, 21), e(2, 11, 10, 22), e(2, 12, 10, 23),//  → 8 of last 8
  ];
  const players = buildPlayerStreaks(entries);
  const cameo = players.find((p) => p.player_id === "1");
  const riser = players.find((p) => p.player_id === "2");

  assert.equal(cameo.recentGamesPlayed, 3);   // last 8 weeks (5-12): only 10,11,12
  assert.equal(riser.recentGamesPlayed, 8);
  assert.equal(isEligible(cameo), false);      // 3 < ceil(0.75 * 8) = 6 → off the board
  assert.equal(isEligible(riser), true);       // started the stretch → stays
  assert.ok(!rankHot(players).some((p) => p.player_id === "1"));
  assert.ok(rankHot(players).some((p) => p.player_id === "2"));
});

test("allWeeks retains DNP and below-floor weeks, flagged as not evaluated", () => {
  const players = buildPlayerStreaks([
    e(1, 1, 10, 14),                 // evaluated beat
    e(1, 2, MIN_PROJ_FLOOR - 1, 20), // below floor → kept but not evaluated
    e(1, 3, 12, null),               // DNP → kept but not evaluated
  ]);
  const p = players[0];
  assert.equal(p.evaluatedWeeks, 1);          // only week 1 counts
  assert.equal(p.allWeeks.length, 3);         // all three retained for the drawer
  assert.equal(p.allWeeks[0].evaluated, true);
  assert.equal(p.allWeeks[1].evaluated, false);
  assert.equal(p.allWeeks[2].evaluated, false);
  assert.equal(p.allWeeks[2].residual, null); // DNP has no residual
});

test("flags a hot-then-injured player, pulls them off the hot list onto injured", () => {
  const entries = [
    // Riser: hot weeks 1-5, then season-ending injury (DNP 6-10)
    e(1, 1, 12, 18), e(1, 2, 12, 20), e(1, 3, 12, 22), e(1, 4, 12, 24), e(1, 5, 12, 26),
    e(1, 6, 12, null), e(1, 7, 12, null), e(1, 8, 12, null), e(1, 9, 12, null), e(1, 10, 12, null),
    // Healthy riser who keeps playing through the latest week (week 10) — and
    // played most of the recent stretch, so he clears the participation gate.
    e(2, 3, 12, 17), e(2, 4, 12, 17), e(2, 5, 12, 18), e(2, 6, 12, 18),
    e(2, 7, 12, 19), e(2, 8, 12, 20), e(2, 9, 12, 21), e(2, 10, 12, 22),
  ];
  const players = buildPlayerStreaks(entries);
  const injured = players.find((p) => p.player_id === "1");
  const healthy = players.find((p) => p.player_id === "2");

  assert.equal(injured.seasonEndedEarly, true);
  assert.equal(injured.lastPlayedWeek, 5);
  assert.equal(injured.weeksMissedRecent, 5); // leagueLastWeek 10 - lastPlayed 5
  assert.equal(healthy.seasonEndedEarly, false);
  assert.equal(healthy.weeksMissedRecent, 0);

  // The injured riser is off the live hot list but tops the injured list.
  assert.ok(!rankHot(players).some((p) => p.player_id === "1"));
  assert.ok(rankHot(players).some((p) => p.player_id === "2"));
  const inj = rankInjured(players);
  assert.equal(inj[0].player_id, "1");
});

test("dedupes repeated week entries, latest wins", () => {
  const players = buildPlayerStreaks([
    e(1, 1, 10, 12),
    e(1, 1, 10, 20), // same week, should overwrite
  ]);
  assert.equal(players[0].evaluatedWeeks, 1);
  assert.equal(players[0].weeks[0].actual, 20);
});
