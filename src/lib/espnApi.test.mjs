/**
 * Unit tests for the ESPN normalization layer.
 * Covers the pure mapping helpers plus loadEspnLeague with a mocked fetch, so
 * regressions in slot/scoring/roster normalization are caught before users hit
 * them. No real network.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  buildEspnRosterPositions,
  buildEspnScoringSettings,
  espnTeamName,
  loadEspnLeague,
} from "./espnApi.js";

// A representative superflex / PPR / TE-premium / keeper league payload.
function makeSettings() {
  return {
    name: "Test Redraft SF",
    size: 12,
    draftSettings: { keeperCount: 1 },
    rosterSettings: {
      // 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX(23), 1 SUPER_FLEX(7), 5 BN(20), 1 IR(21)
      lineupSlotCounts: { 0: 1, 2: 2, 4: 2, 6: 1, 23: 1, 7: 1, 20: 5, 21: 1 },
    },
    scoringSettings: {
      scoringItems: [
        { statId: 53, points: 1, pointsOverrides: { 4: 1.5 } }, // PPR + TE premium
        { statId: 4, points: 4 }, // pass TD
        { statId: 3, points: 0.04 }, // pass yd
        { statId: 43, points: 6 }, // rec TD
        { statId: 42, points: 0.1 }, // rec yd
        { statId: 24, points: 0.1 }, // rush yd
        { statId: 25, points: 6 }, // rush TD
        { statId: 20, points: -2 }, // int
        { statId: 72, points: -2 }, // fumble lost
      ],
    },
    scheduleSettings: { playoffMatchupPeriodStart: 15 },
  };
}

// ---------------------------------------------------------------------------
// buildEspnRosterPositions
// ---------------------------------------------------------------------------

describe("buildEspnRosterPositions", () => {
  const rp = buildEspnRosterPositions(makeSettings());

  it("maps OP slot (7) to SUPER_FLEX", () => {
    assert.equal(rp.filter((p) => p === "SUPER_FLEX").length, 1);
  });
  it("maps FLEX slot (23) to FLEX", () => {
    assert.equal(rp.filter((p) => p === "FLEX").length, 1);
  });
  it("expands base positions by count", () => {
    assert.equal(rp.filter((p) => p === "QB").length, 1);
    assert.equal(rp.filter((p) => p === "RB").length, 2);
    assert.equal(rp.filter((p) => p === "WR").length, 2);
    assert.equal(rp.filter((p) => p === "TE").length, 1);
  });
  it("emits BN for bench (20) and IR for injured reserve (21)", () => {
    assert.equal(rp.filter((p) => p === "BN").length, 5);
    assert.equal(rp.filter((p) => p === "IR").length, 1);
  });
  it("handles a camelCase settings shape too", () => {
    const rp2 = buildEspnRosterPositions({
      rosterSettings: { lineupSlotCounts: { 0: 1, 20: 2 } },
    });
    assert.deepEqual(rp2, ["QB", "BN", "BN"]);
  });
});

// ---------------------------------------------------------------------------
// buildEspnScoringSettings
// ---------------------------------------------------------------------------

describe("buildEspnScoringSettings", () => {
  const ss = buildEspnScoringSettings(makeSettings());

  it("reads PPR from the reception item (statId 53)", () => {
    assert.equal(ss.rec, 1);
  });
  it("derives TE reception premium from pointsOverrides", () => {
    assert.equal(ss.rec_te, 1.5);
  });
  it("maps core categories", () => {
    assert.equal(ss.pass_td, 4);
    assert.equal(ss.pass_yd, 0.04);
    assert.equal(ss.rush_yd, 0.1);
    assert.equal(ss.rec_td, 6);
    assert.equal(ss.pass_int, -2);
    assert.equal(ss.fum_lost, -2);
  });
  it("does not set rec_te when there is no positional override", () => {
    const ss2 = buildEspnScoringSettings({
      scoringSettings: { scoringItems: [{ statId: 53, points: 0.5 }] },
    });
    assert.equal(ss2.rec, 0.5);
    assert.equal(ss2.rec_te, undefined);
  });
});

// ---------------------------------------------------------------------------
// espnTeamName
// ---------------------------------------------------------------------------

describe("espnTeamName", () => {
  it("prefers the modern name field", () => {
    assert.equal(espnTeamName({ name: "Alpha", location: "X", nickname: "Y" }), "Alpha");
  });
  it("falls back to location + nickname", () => {
    assert.equal(espnTeamName({ location: "Beta", nickname: "Squad" }), "Beta Squad");
  });
  it("falls back to abbrev", () => {
    assert.equal(espnTeamName({ abbrev: "ZZZ" }), "ZZZ");
  });
});

// ---------------------------------------------------------------------------
// loadEspnLeague (mocked fetch)
// ---------------------------------------------------------------------------

describe("loadEspnLeague", () => {
  const realFetch = global.fetch;

  function makePayload() {
    return {
      id: 555,
      seasonId: 2025,
      settings: makeSettings(),
      draftDetail: { drafted: true },
      transactions: [],
      members: [
        { id: "{SWID-AAA}", displayName: "alphaowner", firstName: "Al", lastName: "Pha" },
        { id: "{SWID-BBB}", displayName: "betaowner" },
      ],
      teams: [
        {
          id: 1, abbrev: "AAA", name: "Alpha", owners: ["{SWID-AAA}"],
          record: { overall: { wins: 3, losses: 1, ties: 0, pointsFor: 400.5, pointsAgainst: 350.2 } },
          roster: { entries: [
            { lineupSlotId: 0, playerPoolEntry: { player: { id: 1001, fullName: "Patrick Mahomes", defaultPositionId: 1, proTeamId: 12 } } },
            { lineupSlotId: 20, playerPoolEntry: { player: { id: 9999, fullName: "Zzz Unknownplayer", defaultPositionId: 3, proTeamId: 15 } } },
            { lineupSlotId: 21, playerPoolEntry: { player: { id: 1002, fullName: "Injured Guy", defaultPositionId: 2, proTeamId: 5 } } },
          ] },
        },
        {
          id: 2, location: "Beta", nickname: "Squad", abbrev: "BBB", owners: ["{SWID-BBB}"],
          record: { overall: { wins: 1, losses: 3, ties: 0, pointsFor: 320, pointsAgainst: 410 } },
          roster: { entries: [
            { lineupSlotId: 4, playerPoolEntry: { player: { id: 2001, fullName: "Justin Jefferson", defaultPositionId: 3, proTeamId: 16 } } },
          ] },
        },
      ],
    };
  }

  let players;
  beforeEach(() => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => makePayload() });
    players = {
      p_mahomes: { player_id: "p_mahomes", full_name: "Patrick Mahomes", position: "QB", active: true },
      p_jefferson: { player_id: "p_jefferson", full_name: "Justin Jefferson", position: "WR", active: true },
    };
  });
  afterEach(() => { global.fetch = realFetch; });

  it("returns the Sleeper-shaped contract", async () => {
    const res = await loadEspnLeague(555, 1, players, { season: 2025 });
    assert.equal(res.league.league_id, "espn_555");
    assert.equal(res.league.season, "2025");
    assert.ok(res.myRoster && Array.isArray(res.users) && Array.isArray(res.rosters));
    assert.deepEqual(res.tradedPicks, []);
    assert.equal(res.currentDraftComplete, true);
  });

  it("maps a keeper league to settings.type = 1", async () => {
    const res = await loadEspnLeague(555, 1, players, {});
    assert.equal(res.league.settings.type, 1);
  });

  it("name-matches known players to Sleeper ids and mints espn_ synthetics for the rest", async () => {
    const res = await loadEspnLeague(555, 1, players, {});
    assert.ok(res.myRoster.players.includes("p_mahomes"));
    assert.ok(players.espn_9999, "unmatched player minted under espn_ prefix");
    assert.equal(players.espn_9999.position, "WR");
  });

  it("buckets IR (slot 21) into reserve, keeps starters out of it", async () => {
    const res = await loadEspnLeague(555, 1, players, {});
    assert.equal(res.myRoster.reserve.length, 1);
    assert.ok(!res.myRoster.reserve.includes("p_mahomes"));
  });

  it("derives owner_id and display name from the SWID member", async () => {
    const res = await loadEspnLeague(555, 1, players, {});
    assert.equal(res.myRoster.owner_id, "espn_SWID-AAA");
    const alpha = res.users.find((u) => u.user_id === "espn_SWID-AAA");
    assert.equal(alpha.display_name, "alphaowner");
  });

  it("pins myRoster to the requested team id, else the first team", async () => {
    const res2 = await loadEspnLeague(555, 2, players, {});
    assert.equal(res2.myRoster.settings.team_name, "Beta Squad");
    const resNull = await loadEspnLeague(555, null, players, {});
    assert.equal(resNull.myRoster.settings.team_name, "Alpha");
  });

  it("surfaces the ESPN proxy error message on failure", async () => {
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: "ESPN denied access." }) });
    await assert.rejects(() => loadEspnLeague(555, 1, players, {}), /ESPN denied access/);
  });
});
