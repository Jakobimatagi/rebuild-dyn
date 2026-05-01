import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamRoomTotals,
  rankByPosition,
  buildRankMatrix,
  ordinal,
} from "./teamFantasyRanks.js";

// Minimal players + stats fixture: two WRs on CHI, one WR on BAL, ignored P/K.
const players = {
  p1: { full_name: "Alpha One",   team: "CHI", position: "WR" },
  p2: { full_name: "Bravo Two",   team: "CHI", position: "WR" },
  p3: { full_name: "Charlie Tre", team: "BAL", position: "WR" },
  p4: { full_name: "Delta Four",  team: "CHI", position: "QB" },
  p5: { full_name: "Echo Five",   team: "FA",  position: "WR" }, // FA dropped
  p6: { full_name: "Kicker",      team: "CHI", position: "K"  }, // not fantasy pos
};

const stats = {
  p1: { pts_ppr: 200, gp: 16 }, // 200 / 17 ≈ 11.76 ppg contribution
  p2: { pts_ppr: 100, gp: 14 },
  p3: { pts_ppr: 250, gp: 17 },
  p4: { pts_ppr: 300, gp: 16 },
  p5: { pts_ppr: 999, gp: 17 }, // should be ignored (FA team)
  p6: { pts_ppr: 200, gp: 17 }, // ignored (kicker)
};

test("buildTeamRoomTotals sums PPR by team and position", () => {
  const totals = buildTeamRoomTotals(players, stats);
  assert.equal(totals.CHI.WR.points, 300);
  assert.equal(totals.BAL.WR.points, 250);
  assert.equal(totals.CHI.QB.points, 300);
  assert.equal(totals.CHI.RB.points, 0);
  // PPG = points / 17 regular-season games
  assert.ok(Math.abs(totals.CHI.WR.ppg - 300 / 17) < 1e-9);
});

test("buildTeamRoomTotals ignores FA team and non-fantasy positions", () => {
  const totals = buildTeamRoomTotals(players, stats);
  // No WR room should reflect the FA player's 999 points.
  Object.values(totals).forEach((byPos) => {
    assert.ok(byPos.WR.points <= 300, "FA points must not leak into any team");
  });
});

test("historicalRoster overrides current player.team for season attribution", () => {
  // p1 (Alpha One) is currently on CHI but was on BAL in this historical season.
  // Without the override the WR totals would land on CHI; with it, BAL.
  const historical = {
    p1: { team: "BAL", position: "WR", name: "Alpha One" },
  };
  const totals = buildTeamRoomTotals(players, stats, historical);
  // 200 points should now land on BAL, not CHI.
  assert.equal(totals.BAL.WR.points, 250 + 200);
  // CHI WR room loses Alpha's contribution.
  assert.equal(totals.CHI.WR.points, 100);
});

test("rankByPosition orders all 32 teams by PPG with no gaps", () => {
  const totals = buildTeamRoomTotals(players, stats);
  const ranks = rankByPosition(totals, "WR");
  assert.equal(ranks.length, 32);
  // Top two should be the only teams with WR points: BAL (250) then CHI (300)?
  // CHI has higher (300) so rank 1.
  assert.equal(ranks[0].team, "CHI");
  assert.equal(ranks[1].team, "BAL");
  // Remaining 30 teams should all be tied at 0 PPG (rank 3 onward).
  ranks.slice(2).forEach((r, i) => {
    assert.equal(r.points, 0);
    assert.equal(r.rank, i + 3);
  });
});

test("buildRankMatrix reports rank per team per position", () => {
  const totals = buildTeamRoomTotals(players, stats);
  const matrix = buildRankMatrix(totals);
  assert.equal(matrix.CHI.WR.rank, 1);
  assert.equal(matrix.BAL.WR.rank, 2);
  assert.equal(matrix.CHI.QB.rank, 1);
  // CHI has zero RB room, so they should be tied with everyone else and ranked
  // somewhere in the middle of the 32-way 0-tie.
  assert.ok(matrix.CHI.RB.rank >= 1 && matrix.CHI.RB.rank <= 32);
});

test("ordinal renders English ordinals correctly", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(4), "4th");
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(12), "12th");
  assert.equal(ordinal(13), "13th");
  assert.equal(ordinal(21), "21st");
  assert.equal(ordinal(22), "22nd");
  assert.equal(ordinal(23), "23rd");
  assert.equal(ordinal(32), "32nd");
});
