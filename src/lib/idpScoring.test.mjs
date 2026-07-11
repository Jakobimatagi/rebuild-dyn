import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ptsAllowedTierPoints,
  scoreIdp,
  scoreDst,
  buildIdpRankings,
  IDP_SCORING,
} from "./idpScoring.js";

test("points-allowed tier boundaries", () => {
  const cases = [
    [0, 10],
    [1, 7], [6, 7],
    [7, 4], [13, 4],
    [14, 1], [20, 1],
    [21, 0], [27, 0],
    [28, -1], [34, -1],
    [35, -4], [50, -4],
  ];
  for (const [pa, pts] of cases) {
    assert.equal(ptsAllowedTierPoints(pa), pts, `pts_allow=${pa}`);
  }
  assert.equal(ptsAllowedTierPoints(null), 0);
  assert.equal(ptsAllowedTierPoints(undefined), 0);
  assert.equal(ptsAllowedTierPoints("not a number"), 0);
});

test("scores a known LB stat line", () => {
  const stats = {
    idp_tkl_solo: 8,
    idp_tkl_ast: 4,
    idp_sack: 1,
    idp_int: 1,
    idp_ff: 1,
    idp_pass_def: 2,
  };
  // 8*1 + 4*0.5 + 1*2 + 1*3 + 1*2 + 2*1 = 19
  assert.equal(scoreIdp(stats), 19);
});

test("IDP safety key aliases both score", () => {
  assert.equal(scoreIdp({ idp_safe: 1 }), IDP_SCORING.safety);
  assert.equal(scoreIdp({ idp_safety: 1 }), IDP_SCORING.safety);
  assert.equal(scoreIdp({}), 0);
});

test("scores a single-game DST stat line with tier bonus", () => {
  const stats = { sack: 3, int: 2, fum_rec: 1, ff: 1, def_td: 1, pts_allow: 13 };
  // 3*1 + 2*2 + 1*2 + 1*1 + 1*6 + tier(13)=4 → 20
  assert.equal(scoreDst(stats), 20);
});

test("DST with no stats scores only the shutout tier when pts_allow is 0", () => {
  assert.equal(scoreDst({ pts_allow: 0 }), 10);
  assert.equal(scoreDst({}), 0); // no pts_allow → no tier assumption
});

const playersDb = {
  100: { first_name: "Mike", last_name: "Backer", position: "LB", fantasy_positions: ["LB"], team: "BUF" },
  200: { first_name: "Sol", last_name: "Corner", position: "DB", fantasy_positions: ["DB"], team: "MIA" },
  300: { first_name: "Quincy", last_name: "Slinger", position: "QB", fantasy_positions: ["QB"], team: "KC" },
  SF: { first_name: "San Francisco", last_name: "49ers", position: "DEF", team: "SF" },
};

test("buildIdpRankings keeps IDP + DEF, drops offense, sorts by total", () => {
  const seasonStats = {
    100: { gp: 17, idp_tkl_solo: 100, idp_tkl_ast: 40, idp_sack: 3 }, // 100+20+6 = 126
    200: { gp: 16, idp_tkl_solo: 60, idp_int: 4, idp_pass_def: 12 },  // 60+12+12 = 84
    300: { gp: 17, pass_yd: 4800, pts_ppr: 380 },                     // QB → excluded
    SF: { gp: 17, sack: 34, int: 17, fum_rec: 8, def_td: 3, pts_allow: 289 },
  };
  const rows = buildIdpRankings(seasonStats, playersDb);
  // LB 126 > DEF 119 (102 category + 17×tier(+1)) > DB 84
  assert.deepEqual(rows.map((r) => r.player_id), ["100", "SF", "200"]);

  const lb = rows.find((r) => r.player_id === "100");
  assert.equal(lb.pos, "LB");
  assert.equal(lb.total, 126);
  assert.equal(Math.round(lb.ppg * 100) / 100, Math.round((126 / 17) * 100) / 100);

  // DEF: 34 + 17*2 + 8*2 + 3*6 = 102 category pts; 289/17 = 17 PA/g → tier +1 × 17 games
  const def = rows.find((r) => r.pos === "DEF");
  assert.equal(def.total, 102 + 17);
  assert.equal(Math.round(def.line.paPerGame), 17);
});

test("buildIdpRankings honors positions and minGp filters", () => {
  const seasonStats = {
    100: { gp: 17, idp_tkl_solo: 100 },
    200: { gp: 2, idp_tkl_solo: 10 },
    SF: { gp: 17, sack: 30, pts_allow: 300 },
  };
  const onlyLb = buildIdpRankings(seasonStats, playersDb, { positions: ["LB"] });
  assert.deepEqual(onlyLb.map((r) => r.pos), ["LB"]);

  const minGp = buildIdpRankings(seasonStats, playersDb, { minGp: 5 });
  assert.ok(!minGp.some((r) => r.player_id === "200"));
});

test("team-def rows are detected by id shape even without players DB metadata", () => {
  const rows = buildIdpRankings({ DEN: { gp: 1, sack: 4, pts_allow: 10 } }, {});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pos, "DEF");
  assert.equal(rows[0].team, "DEN");
  // 4 sacks + tier(10 PA/g)=+4 → 8
  assert.equal(rows[0].total, 8);
});
