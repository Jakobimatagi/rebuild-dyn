import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlayerProfiles,
  classifyGame,
  buildOutcomeRates,
  getOutcomeRate,
  outcomeVerdict,
} from "./matchupOutcomes.js";

// One player-week row. Defense defaults to a unique string so base rates stay
// spread across many opponents unless a test pins one.
function r(player_id, week, pts, { season = 2025, pos = "WR", opponent = `D${week}`, name = `P${player_id}` } = {}) {
  return { player_id, name, pos, team: "AAA", season, week, opponent, pts };
}

// 16 games scoring 1..16 → p25 = 4.75, p75 = 12.25, avg = 8.5.
function sixteenGames(player_id, opts = {}) {
  return Array.from({ length: 16 }, (_, i) => r(player_id, i + 1, i + 1, opts));
}

test("profiles compute own-range percentiles and drop small samples", () => {
  const rows = [...sixteenGames(1), r(2, 1, 10), r(2, 2, 12)]; // player 2: 2 games
  const profiles = buildPlayerProfiles(rows);
  assert.ok(!profiles.has(2), "sub-minGames player omitted");
  const p = profiles.get(1);
  assert.equal(p.games, 16);
  assert.equal(p.avg, 8.5);
  assert.equal(p.floor, 4.75);
  assert.equal(p.ceiling, 12.25);
});

test("games classify against the player's own range", () => {
  const profiles = buildPlayerProfiles(sixteenGames(1));
  const p = profiles.get(1);
  assert.equal(classifyGame(p, 16), "ceiling");
  assert.equal(classifyGame(p, 12.25), "ceiling"); // inclusive at the boundary
  assert.equal(classifyGame(p, 8), "average");
  assert.equal(classifyGame(p, 4.75), "floor");
  assert.equal(classifyGame(p, 1), "floor");
});

test("base rates land near 25/50/25 by construction", () => {
  const rows = [...sixteenGames(1), ...sixteenGames(2), ...sixteenGames(3)];
  const profiles = buildPlayerProfiles(rows);
  const { base } = buildOutcomeRates(rows, profiles, { priorN: 0 });
  const b = base.get("WR");
  assert.equal(b.ceiling, 0.25);
  assert.equal(b.floor, 0.25);
  assert.equal(b.average, 0.5);
});

test("a defense that forces every player's worst game rates as pure floor (unshrunk)", () => {
  // Week 1 (pts=1, each player's minimum) is played vs TUF for both players;
  // every other week is vs a unique defense.
  const rows = [
    ...sixteenGames(1, { opponent: undefined }).map((row) => ({ ...row, opponent: row.week === 1 ? "TUF" : `D${row.week}` })),
    ...sixteenGames(2, { opponent: undefined }).map((row) => ({ ...row, opponent: row.week === 1 ? "TUF" : `E${row.week}` })),
  ];
  const profiles = buildPlayerProfiles(rows);
  const rates = buildOutcomeRates(rows, profiles, { priorN: 0 });
  const tuf = getOutcomeRate(rates, "TUF", "WR");
  assert.equal(tuf.floor, 1);
  assert.equal(tuf.ceiling, 0);
  assert.equal(tuf.games, 2);
  // And the "ALL" bucket sees the same two games.
  assert.equal(getOutcomeRate(rates, "TUF").floor, 1);
});

test("shrinkage pulls a tiny extreme sample back toward the base rate", () => {
  const rows = [
    ...sixteenGames(1, { opponent: undefined }).map((row) => ({ ...row, opponent: row.week === 1 ? "TUF" : `D${row.week}` })),
  ];
  const profiles = buildPlayerProfiles(rows);
  const rates = buildOutcomeRates(rows, profiles, { priorN: 20 });
  const tuf = getOutcomeRate(rates, "TUF", "WR");
  // One weighted game of pure floor against 20 pseudo-games of ~25% floor.
  assert.ok(tuf.floor > 0.25 && tuf.floor < 0.35, `expected mild floor tilt, got ${tuf.floor}`);
});

test("season weights can zero out old seasons", () => {
  const rows = [
    ...sixteenGames(1, { season: 2020 }),
    ...sixteenGames(2, { season: 2025 }),
  ];
  const profiles = buildPlayerProfiles(rows);
  const rates = buildOutcomeRates(rows, profiles, { seasonWeights: { 2025: 1 }, priorN: 0 });
  assert.equal(getOutcomeRate(rates, "D1", "WR").n, 1, "only the 2025 game counts");
});

test("verdict picks the biggest lift over base, defaulting to average", () => {
  const base = { ceiling: 0.25, average: 0.5, floor: 0.25 };
  assert.equal(outcomeVerdict({ ceiling: 0.40, average: 0.40, floor: 0.20 }, base).verdict, "ceiling");
  assert.equal(outcomeVerdict({ ceiling: 0.20, average: 0.42, floor: 0.38 }, base).verdict, "floor");
  assert.equal(outcomeVerdict({ ceiling: 0.26, average: 0.49, floor: 0.25 }, base).verdict, "average");
  assert.equal(outcomeVerdict(null, base).verdict, "average");
});
