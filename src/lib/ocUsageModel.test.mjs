/**
 * Unit tests for ocUsageModel.js
 * Run with: npm test (Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  teamPlayerTrends,
  buildOcUsageProfile,
  projectTeamUsage,
  concentrationLabel,
} from "./ocUsageModel.js";

// Two seasons of one team's utilization. WR A is the clear alpha and rising.
const util = [
  // 2022
  { season: 2022, team: "KC", player_id: "a", name: "WR A", sleeper_id: "1", targets: 120, rec_air_yards: 1200, carries: 0, target_share: 0.24, carry_share: 0, air_yard_share: 0.30, rz_target_share: 0.25, rz_carry_share: 0 },
  { season: 2022, team: "KC", player_id: "b", name: "WR B", sleeper_id: "2", targets: 90, rec_air_yards: 800, carries: 0, target_share: 0.18, carry_share: 0, air_yard_share: 0.20, rz_target_share: 0.15, rz_carry_share: 0 },
  { season: 2022, team: "KC", player_id: "c", name: "RB C", sleeper_id: "3", targets: 40, rec_air_yards: 100, carries: 220, target_share: 0.08, carry_share: 0.62, air_yard_share: 0.03, rz_target_share: 0.05, rz_carry_share: 0.60 },
  // 2023 — WR A climbs, WR B slips
  { season: 2023, team: "KC", player_id: "a", name: "WR A", sleeper_id: "1", targets: 140, rec_air_yards: 1500, carries: 0, target_share: 0.29, carry_share: 0, air_yard_share: 0.34, rz_target_share: 0.30, rz_carry_share: 0 },
  { season: 2023, team: "KC", player_id: "b", name: "WR B", sleeper_id: "2", targets: 70, rec_air_yards: 600, carries: 0, target_share: 0.14, carry_share: 0, air_yard_share: 0.16, rz_target_share: 0.10, rz_carry_share: 0 },
  { season: 2023, team: "KC", player_id: "c", name: "RB C", sleeper_id: "3", targets: 45, rec_air_yards: 120, carries: 240, target_share: 0.09, carry_share: 0.65, air_yard_share: 0.04, rz_target_share: 0.06, rz_carry_share: 0.62 },
];

const scheme = [
  { season: 2022, team: "KC", pass_rate: 0.60, proe: 2.0, adot: 7.0, epa_play: 0.10 },
  { season: 2023, team: "KC", pass_rate: 0.62, proe: 3.0, adot: 7.4, epa_play: 0.14 },
];

describe("teamPlayerTrends", () => {
  const trends = teamPlayerTrends(util, "KC");

  it("groups players and orders by latest PPR-opportunity involvement", () => {
    // RB C: 0.09*1.7 + 0.65 = 0.80 outranks WR A: 0.29*1.7 = 0.49 (bellcow volume).
    assert.equal(trends[0].name, "RB C");
    assert.equal(trends[1].name, "WR A");
    assert.equal(trends.length, 3);
  });

  it("computes per-player season history and trend", () => {
    const a = trends.find((p) => p.name === "WR A");
    assert.equal(a.seasons.length, 2);
    assert.ok(a.trendTarget > 0, "WR A target share rising"); // 0.29 - 0.24
    const b = trends.find((p) => p.name === "WR B");
    assert.ok(b.trendTarget < 0, "WR B target share falling");
  });

  it("derives true aDOT (intended air yards / target)", () => {
    const a = trends.find((p) => p.name === "WR A");
    assert.equal(a.latest.adot, 1500 / 140);
  });
});

describe("buildOcUsageProfile", () => {
  const profile = buildOcUsageProfile({
    teamSeasons: [{ team: "KC", season: 2022 }, { team: "KC", season: 2023 }],
    allUtil: util,
    schemeRows: scheme,
  });

  it("aggregates role-slot shares across stints", () => {
    assert.equal(profile.n, 2);
    // R1 slot ≈ mean(0.24, 0.29); R2 ≈ mean(0.18, 0.14)
    assert.ok(profile.recvSlots[0] > profile.recvSlots[1]);
    assert.ok(Math.abs(profile.recvSlots[0] - 0.265) < 1e-6);
    // B1 carry slot ≈ mean(0.62, 0.65)
    assert.ok(Math.abs(profile.rushSlots[0] - 0.635) < 1e-6);
  });

  it("pulls scheme rates and concentration", () => {
    assert.ok(Math.abs(profile.passRate - 0.61) < 1e-6);
    assert.ok(profile.proe === 2.5);
    assert.equal(typeof profile.concentration, "string");
  });

  it("returns null with no matching team-seasons", () => {
    assert.equal(buildOcUsageProfile({ teamSeasons: [{ team: "XX", season: 1990 }], allUtil: util }), null);
  });
});

describe("projectTeamUsage", () => {
  const profile = buildOcUsageProfile({
    teamSeasons: [{ team: "KC", season: 2022 }, { team: "KC", season: 2023 }],
    allUtil: util,
    schemeRows: scheme,
  });

  it("flags a player ascending into a bigger slot as a breakout", () => {
    // WR B (recent 14%) but if he's now the de-facto R1 (A departed), the OC's
    // R1 slot (~26.5%) pulls his projection UP → breakout.
    const players = [
      { name: "WR B", sleeper_id: "2", recentTargetShare: 0.14, recentCarryShare: 0 },
      { name: "WR D", sleeper_id: "4", recentTargetShare: 0.05, recentCarryShare: 0 },
    ];
    const proj = projectTeamUsage(players, profile);
    const b = proj.find((p) => p.name === "WR B");
    assert.equal(b.recvSlot, 0); // top of the room now
    assert.ok(b.projTargetShare > b.recentTargetShare, "projected up toward R1 norm");
    assert.equal(b.signal, "breakout");
  });

  it("flags an alpha in a spread system as a faller", () => {
    const spread = buildOcUsageProfile({
      teamSeasons: [{ team: "KC", season: 2022 }],
      allUtil: [
        { season: 2022, team: "KC", player_id: "x", name: "X", targets: 80, rec_air_yards: 700, carries: 0, target_share: 0.15, carry_share: 0 },
        { season: 2022, team: "KC", player_id: "y", name: "Y", targets: 78, rec_air_yards: 690, carries: 0, target_share: 0.145, carry_share: 0 },
        { season: 2022, team: "KC", player_id: "z", name: "Z", targets: 75, rec_air_yards: 680, carries: 0, target_share: 0.14, carry_share: 0 },
      ],
    });
    const players = [{ name: "Alpha", recentTargetShare: 0.30, recentCarryShare: 0 }];
    const proj = projectTeamUsage(players, spread);
    assert.ok(proj[0].targetDelta < 0, "spread system trims an alpha");
    assert.equal(proj[0].signal, "faller");
  });

  it("does not invent targets for a pure runner", () => {
    const players = [{ name: "Pure RB", recentTargetShare: 0.0, recentCarryShare: 0.55 }];
    const proj = projectTeamUsage(players, profile);
    assert.equal(proj[0].projTargetShare, 0); // stays 0, no phantom R-slot targets
  });
});

describe("concentrationLabel", () => {
  it("labels by HHI band", () => {
    assert.equal(concentrationLabel(0.18), "Funnel (alpha-heavy)");
    assert.equal(concentrationLabel(0.05), "Spread (committee)");
    assert.equal(concentrationLabel(null), "—");
  });
});
