import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMultipliers,
  getMultiplier,
  getMatchupEntry,
  defaultSeasonWeights,
} from "./defenseMatchups.js";

// Helper: one player-week row.
function r(season, week, opponent, pts, pos = "WR") {
  return { season, week, pos, team: "AAA", opponent, pts };
}

test("empty and unusable input yield empty results and neutral lookups", () => {
  for (const rows of [[], null, [{ season: 2025, week: 1, pos: "WR", opponent: null, pts: 10 }]]) {
    const res = buildMultipliers(rows);
    assert.equal(res.multipliers.size, 0);
    assert.equal(getMultiplier(res, "DEN", "WR"), 1.0);
    assert.equal(getMatchupEntry(res, "DEN", "WR"), null);
  }
});

test("a league-average defense gets multiplier 1.0", () => {
  // Two defenses, both allowing the same weekly total → both exactly average.
  const rows = [];
  for (let week = 1; week <= 6; week++) {
    rows.push(r(2025, week, "DEN", 30));
    rows.push(r(2025, week, "MIA", 30));
  }
  const res = buildMultipliers(rows);
  assert.equal(getMultiplier(res, "DEN", "WR"), 1.0);
  assert.equal(getMultiplier(res, "MIA", "WR"), 1.0);
  assert.equal(res.leagueAvgByPos.get("WR"), 30);
  assert.deepEqual(res.groups, ["DEN", "MIA"]);
});

test("multiple players against the same defense in one week sum to one observation", () => {
  const rows = [
    { season: 2025, week: 1, pos: "WR", team: "AAA", opponent: "DEN", pts: 12 },
    { season: 2025, week: 1, pos: "WR", team: "AAA", opponent: "DEN", pts: 18 },
    r(2025, 1, "MIA", 30),
  ];
  const res = buildMultipliers(rows);
  assert.equal(getMatchupEntry(res, "DEN", "WR").weightedPpg, 30);
  assert.equal(getMatchupEntry(res, "DEN", "WR").games, 1);
});

test("shrinkage keeps a one-game outlier near 1.0 with priorK=4", () => {
  // DEN allows double the league norm, but only one game vs eight normal games.
  const rows = [r(2025, 1, "DEN", 60)];
  for (let week = 1; week <= 8; week++) rows.push(r(2025, week, "MIA", 30));
  const res = buildMultipliers(rows); // league avg ≈ 33.3
  const den = getMultiplier(res, "DEN", "WR");
  // Raw ratio would be ~1.8; with 4 pseudo-games of prior it stays modest.
  assert.ok(den > 1.0 && den < 1.2, `expected mild boost, got ${den}`);
});

test("clamp engages when shrinkage is disabled", () => {
  const rows = [r(2025, 1, "DEN", 300)];
  for (let week = 1; week <= 8; week++) rows.push(r(2025, week, "MIA", 30));
  const res = buildMultipliers(rows, { priorK: 0 });
  assert.equal(getMultiplier(res, "DEN", "WR"), 1.3);

  const soft = buildMultipliers(
    [r(2025, 1, "DEN", 1), ...Array.from({ length: 8 }, (_, i) => r(2025, i + 1, "MIA", 30))],
    { priorK: 0 },
  );
  assert.equal(getMultiplier(soft, "DEN", "WR"), 0.75);
});

test("recency weights favor the current season", () => {
  // DEN was soft in 2023 (50/gm) but stingy in 2025 (10/gm); MIA is flat 30.
  const rows = [];
  for (let week = 1; week <= 6; week++) {
    rows.push(r(2023, week, "DEN", 50));
    rows.push(r(2025, week, "DEN", 10));
    rows.push(r(2023, week, "MIA", 30));
    rows.push(r(2025, week, "MIA", 30));
  }
  const weighted = buildMultipliers(rows, { seasonWeights: defaultSeasonWeights(2025) });
  const flat = buildMultipliers(rows);
  assert.ok(
    getMultiplier(weighted, "DEN", "WR") < getMultiplier(flat, "DEN", "WR"),
    "recency weighting should pull DEN toward its stingy current season",
  );
});

test("seasons missing from seasonWeights contribute nothing", () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => r(2020, i + 1, "DEN", 99)), // outside window
    ...Array.from({ length: 6 }, (_, i) => r(2025, i + 1, "DEN", 30)),
    ...Array.from({ length: 6 }, (_, i) => r(2025, i + 1, "MIA", 30)),
  ];
  const res = buildMultipliers(rows, { seasonWeights: defaultSeasonWeights(2025) });
  assert.equal(getMultiplier(res, "DEN", "WR"), 1.0);
});

test("works in the IDP direction (grouping IDP rows by opposing offense)", () => {
  const rows = [];
  for (let week = 1; week <= 6; week++) {
    // LBs facing PHI rack up points; LBs facing NE don't.
    rows.push({ season: 2025, week, pos: "LB", team: "BUF", opponent: "PHI", pts: 40 });
    rows.push({ season: 2025, week, pos: "LB", team: "NYJ", opponent: "NE", pts: 20 });
  }
  const res = buildMultipliers(rows);
  assert.ok(getMultiplier(res, "PHI", "LB") > 1.0);
  assert.ok(getMultiplier(res, "NE", "LB") < 1.0);
});
