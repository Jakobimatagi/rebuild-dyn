/**
 * Unit tests for the Fleaflicker normalization layer.
 * Covers pure functions only (no network). Tests run against a fixed
 * FF roster snapshot so regressions are caught before they reach users.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPlayerLookup,
  buildSleeperRosterPositions,
  buildSleeperScoringSettings,
  mapSlotToSleeperPos,
  matchPlayer,
  normalizeName,
  normalizeFFCompletedTrades,
  normalizeFFMoveTransactions,
} from "./fleaflickerApi.js";

// ---------------------------------------------------------------------------
// normalizeName
// ---------------------------------------------------------------------------

describe("normalizeName", () => {
  it("lowercases input", () => {
    assert.equal(normalizeName("Patrick Mahomes"), "patrick mahomes");
  });

  it("strips punctuation (apostrophes, hyphens, periods)", () => {
    // Period stripped, then "Jr" suffix stripped
    assert.equal(normalizeName("Odell Beckham Jr."), "odell beckham");
    // apostrophe
    assert.equal(normalizeName("Le'Veon Bell"), "leveon bell");
    // hyphen
    assert.equal(normalizeName("Dee Ford-Smith"), "dee fordsmith");
    // mid-name period (e.g. O.J. Howard)
    assert.equal(normalizeName("O.J. Howard"), "oj howard");
  });

  it("strips common suffixes (jr, sr, ii, iii, iv, v)", () => {
    assert.equal(normalizeName("Calvin Johnson Jr"), "calvin johnson");
    assert.equal(normalizeName("Darrell Henderson Sr"), "darrell henderson");
    assert.equal(normalizeName("Robert Griffin III"), "robert griffin");
    assert.equal(normalizeName("Barry Sanders II"), "barry sanders");
  });

  it("is case-insensitive for suffixes", () => {
    assert.equal(normalizeName("Ahmad Bradshaw JR"), "ahmad bradshaw");
    assert.equal(normalizeName("Roddy White sr"), "roddy white");
  });

  it("handles empty / null gracefully", () => {
    assert.equal(normalizeName(""), "");
    assert.equal(normalizeName(null), "");
    assert.equal(normalizeName(undefined), "");
  });

  it("trims leading/trailing whitespace", () => {
    assert.equal(normalizeName("  Josh Allen  "), "josh allen");
  });
});

// ---------------------------------------------------------------------------
// buildPlayerLookup + matchPlayer (snapshot: 3-player Sleeper roster)
// ---------------------------------------------------------------------------

const SNAPSHOT_SLEEPER_PLAYERS = {
  "4046": {
    full_name: "Patrick Mahomes",
    position: "QB",
    active: true,
  },
  "5844": {
    full_name: "Justin Jefferson",
    position: "WR",
    active: true,
  },
  "6783": {
    full_name: "Travis Kelce",
    position: "TE",
    active: true,
  },
  // Retired player — should be overridden by the active flag logic
  "retired_qb": {
    full_name: "Patrick Mahomes",
    position: "QB",
    active: false,
  },
};

describe("buildPlayerLookup", () => {
  it("builds byNamePos and byName maps", () => {
    const lookup = buildPlayerLookup(SNAPSHOT_SLEEPER_PLAYERS);
    assert.ok(lookup.byNamePos instanceof Map);
    assert.ok(lookup.byName instanceof Map);
  });

  it("matches by normalized name + position", () => {
    const lookup = buildPlayerLookup(SNAPSHOT_SLEEPER_PLAYERS);
    assert.equal(lookup.byNamePos.get("patrick mahomes__QB"), "4046");
    assert.equal(lookup.byNamePos.get("justin jefferson__WR"), "5844");
    assert.equal(lookup.byNamePos.get("travis kelce__TE"), "6783");
  });

  it("prefers active player when there are duplicate name entries", () => {
    const lookup = buildPlayerLookup(SNAPSHOT_SLEEPER_PLAYERS);
    // Active "4046" should win over inactive "retired_qb"
    assert.equal(lookup.byName.get("patrick mahomes"), "4046");
  });

  it("skips entries without full_name or position", () => {
    const sparse = {
      bad1: { full_name: null, position: "WR" },
      bad2: { full_name: "Ghost", position: null },
    };
    const lookup = buildPlayerLookup(sparse);
    assert.equal(lookup.byNamePos.size, 0);
  });
});

describe("matchPlayer", () => {
  const lookup = buildPlayerLookup(SNAPSHOT_SLEEPER_PLAYERS);

  it("matches by name + position (primary path)", () => {
    const ffPlayer = { name_full: "Patrick Mahomes", position: "QB" };
    assert.equal(matchPlayer(ffPlayer, lookup), "4046");
  });

  it("falls back to name-only when position is absent", () => {
    const ffPlayer = { name_full: "Travis Kelce" };
    assert.equal(matchPlayer(ffPlayer, lookup), "6783");
  });

  it("handles suffix mismatch (Jr/Sr stripped on both sides)", () => {
    const withJr = { name_full: "Justin Jefferson Jr.", position: "WR" };
    assert.equal(matchPlayer(withJr, lookup), "5844");
  });

  it("returns null for unknown players", () => {
    const ffPlayer = { name_full: "Not A Real Player", position: "WR" };
    assert.equal(matchPlayer(ffPlayer, lookup), null);
  });

  it("returns null when name_full is missing", () => {
    assert.equal(matchPlayer({}, lookup), null);
    assert.equal(matchPlayer(null, lookup), null);
  });
});

// ---------------------------------------------------------------------------
// mapSlotToSleeperPos
// ---------------------------------------------------------------------------

describe("mapSlotToSleeperPos", () => {
  it("maps single-eligibility positions directly", () => {
    assert.equal(mapSlotToSleeperPos({ eligibility: ["QB"], label: "QB" }), "QB");
    assert.equal(mapSlotToSleeperPos({ eligibility: ["RB"], label: "RB" }), "RB");
    assert.equal(mapSlotToSleeperPos({ eligibility: ["WR"], label: "WR" }), "WR");
    assert.equal(mapSlotToSleeperPos({ eligibility: ["TE"], label: "TE" }), "TE");
    assert.equal(mapSlotToSleeperPos({ eligibility: ["K"], label: "K" }), "K");
  });

  it("maps D/ST and DST to DEF", () => {
    assert.equal(mapSlotToSleeperPos({ eligibility: ["D/ST"], label: "D/ST" }), "DEF");
    assert.equal(mapSlotToSleeperPos({ eligibility: ["DST"], label: "DST" }), "DEF");
  });

  it("maps EDR to DL", () => {
    assert.equal(mapSlotToSleeperPos({ eligibility: ["EDR"], label: "EDR" }), "DL");
  });

  it("maps multi-eligibility including QB to SUPER_FLEX", () => {
    const sf = { eligibility: ["QB", "RB", "WR", "TE"], label: "SF" };
    assert.equal(mapSlotToSleeperPos(sf), "SUPER_FLEX");
  });

  it("maps RB/WR/TE multi-eligibility to FLEX", () => {
    const flex = { eligibility: ["RB", "WR", "TE"], label: "FLEX" };
    assert.equal(mapSlotToSleeperPos(flex), "FLEX");
  });

  it("maps RB/WR multi-eligibility to FLEX", () => {
    const flex = { eligibility: ["RB", "WR"], label: "FLEX" };
    assert.equal(mapSlotToSleeperPos(flex), "FLEX");
  });

  it("maps K/D-ST multi-eligibility to K", () => {
    const kDst = { eligibility: ["K", "D/ST"], label: "K/DST" };
    assert.equal(mapSlotToSleeperPos(kDst), "K");
  });
});

// ---------------------------------------------------------------------------
// buildSleeperRosterPositions (snapshot: typical dynasty league rules)
// ---------------------------------------------------------------------------

describe("buildSleeperRosterPositions", () => {
  // Simulates a FetchLeagueRules response for a standard dynasty league:
  // 1 QB, 2 RB, 3 WR, 1 TE, 1 FLEX, 6 BN
  const DYNASTY_RULES = {
    num_bench: 6,
    roster_positions: [
      { group: "START", start: 1, label: "QB", eligibility: ["QB"] },
      { group: "START", start: 2, label: "RB", eligibility: ["RB"] },
      { group: "START", start: 3, label: "WR", eligibility: ["WR"] },
      { group: "START", start: 1, label: "TE", eligibility: ["TE"] },
      { group: "START", start: 1, label: "FLEX", eligibility: ["RB", "WR", "TE"] },
      // Non-starter group should be ignored
      { group: "RESERVE", start: 2, label: "IR", eligibility: [] },
    ],
  };

  it("produces the correct starter slots in order", () => {
    const positions = buildSleeperRosterPositions(DYNASTY_RULES);
    assert.equal(positions.filter((p) => p === "QB").length, 1);
    assert.equal(positions.filter((p) => p === "RB").length, 2);
    assert.equal(positions.filter((p) => p === "WR").length, 3);
    assert.equal(positions.filter((p) => p === "TE").length, 1);
    assert.equal(positions.filter((p) => p === "FLEX").length, 1);
  });

  it("appends the correct number of bench slots", () => {
    const positions = buildSleeperRosterPositions(DYNASTY_RULES);
    assert.equal(positions.filter((p) => p === "BN").length, 6);
  });

  it("ignores non-START groups", () => {
    const positions = buildSleeperRosterPositions(DYNASTY_RULES);
    // IR slots from RESERVE group should not appear
    assert.ok(!positions.includes("IR"));
  });

  it("handles missing roster_positions gracefully", () => {
    const positions = buildSleeperRosterPositions({ num_bench: 4 });
    assert.equal(positions.filter((p) => p === "BN").length, 4);
    assert.equal(positions.length, 4);
  });

  it("defaults to 6 bench slots when num_bench is absent", () => {
    const positions = buildSleeperRosterPositions({ roster_positions: [] });
    assert.equal(positions.filter((p) => p === "BN").length, 6);
  });

  it("maps SUPER_FLEX correctly for 2-QB leagues", () => {
    const sfRules = {
      num_bench: 6,
      roster_positions: [
        { group: "START", start: 1, label: "QB", eligibility: ["QB"] },
        { group: "START", start: 1, label: "SF", eligibility: ["QB", "RB", "WR", "TE"] },
      ],
    };
    const positions = buildSleeperRosterPositions(sfRules);
    assert.ok(positions.includes("SUPER_FLEX"));
  });
});

// ---------------------------------------------------------------------------
// buildSleeperScoringSettings (snapshot: standard PPR scoring)
// ---------------------------------------------------------------------------

describe("buildSleeperScoringSettings", () => {
  // Simulates a FetchLeagueRules scoring response (camelCase already converted)
  const PPR_RULES = {
    groups: [
      {
        scoring_rules: [
          { category: { abbreviation: "Rec" }, points_per: { value: 1 } },
          { category: { abbreviation: "Rec Yd" }, points_per: { value: 0.1 } },
          { category: { abbreviation: "Rush Yd" }, points_per: { value: 0.1 } },
          { category: { abbreviation: "Pass Yd" }, points_per: { value: 0.04 } },
          { category: { abbreviation: "Rec TD" }, points_per: { value: 6 } },
          { category: { abbreviation: "Rush TD" }, points_per: { value: 6 } },
          { category: { abbreviation: "Pass TD" }, points_per: { value: 4 } },
          { category: { abbreviation: "Int" }, points_per: { value: -2 } },
          { category: { abbreviation: "Fum Lost" }, points_per: { value: -2 } },
        ],
      },
    ],
  };

  it("parses all standard scoring categories", () => {
    const s = buildSleeperScoringSettings(PPR_RULES);
    assert.equal(s.rec, 1);
    assert.equal(s.rec_yd, 0.1);
    assert.equal(s.rush_yd, 0.1);
    assert.equal(s.pass_yd, 0.04);
    assert.equal(s.rec_td, 6);
    assert.equal(s.rush_td, 6);
    assert.equal(s.pass_td, 4);
    assert.equal(s.pass_int, -2);
    assert.equal(s.fum_lost, -2);
  });

  it("is case-insensitive for abbreviations", () => {
    const rules = {
      groups: [{
        scoring_rules: [
          { category: { abbreviation: "REC YDS" }, points_per: { value: 0.1 } },
          { category: { abbreviation: "RUSH YDS" }, points_per: { value: 0.1 } },
        ],
      }],
    };
    const s = buildSleeperScoringSettings(rules);
    assert.equal(s.rec_yd, 0.1);
    assert.equal(s.rush_yd, 0.1);
  });

  it("handles missing groups gracefully", () => {
    const s = buildSleeperScoringSettings({});
    assert.deepEqual(s, {});
  });

  it("handles empty scoring_rules array", () => {
    const s = buildSleeperScoringSettings({ groups: [{ scoring_rules: [] }] });
    assert.deepEqual(s, {});
  });

  it("ignores rules with no abbreviation", () => {
    const rules = {
      groups: [{
        scoring_rules: [
          { category: {}, points_per: { value: 5 } },
        ],
      }],
    };
    const s = buildSleeperScoringSettings(rules);
    assert.deepEqual(s, {});
  });
});

// ---------------------------------------------------------------------------
// normalizeFFCompletedTrades (snapshot: 2-team dynasty trade)
// ---------------------------------------------------------------------------

describe("normalizeFFCompletedTrades", () => {
  const sleeperPlayers = {
    "4046": { full_name: "Patrick Mahomes", position: "QB", active: true },
    "5844": { full_name: "Justin Jefferson", position: "WR", active: true },
  };
  const lookup = buildPlayerLookup(sleeperPlayers);

  // Snapshot: team 101 sends Mahomes + 2026 R1 and receives Jefferson
  const TRADE_SNAPSHOT = [
    {
      approved_on: 1700000000000,
      teams: [
        {
          team: { id: 101 },
          players_obtained: [{ pro_player: { name_full: "Justin Jefferson", position: "WR", id: 9001 } }],
          players_released: [{ pro_player: { name_full: "Patrick Mahomes", position: "QB", id: 9002 } }],
          picks_obtained: [],
        },
        {
          team: { id: 102 },
          players_obtained: [{ pro_player: { name_full: "Patrick Mahomes", position: "QB", id: 9002 } }],
          players_released: [{ pro_player: { name_full: "Justin Jefferson", position: "WR", id: 9001 } }],
          picks_obtained: [{ season: 2026, slot: { round: 1 }, original_owner: { id: 101 } }],
        },
      ],
    },
  ];

  it("produces one trade transaction", () => {
    const txs = normalizeFFCompletedTrades(TRADE_SNAPSHOT, lookup, { ...sleeperPlayers });
    assert.equal(txs.length, 1);
  });

  it("sets type and status correctly", () => {
    const txs = normalizeFFCompletedTrades(TRADE_SNAPSHOT, lookup, { ...sleeperPlayers });
    assert.equal(txs[0].type, "trade");
    assert.equal(txs[0].status, "complete");
  });

  it("maps player adds to the receiving team", () => {
    const players = { ...sleeperPlayers };
    const txs = normalizeFFCompletedTrades(TRADE_SNAPSHOT, lookup, players);
    // Team 101 received Jefferson (5844)
    assert.equal(txs[0].adds["5844"], 101);
    // Team 102 received Mahomes (4046)
    assert.equal(txs[0].adds["4046"], 102);
  });

  it("maps player drops to the sending team", () => {
    const players = { ...sleeperPlayers };
    const txs = normalizeFFCompletedTrades(TRADE_SNAPSHOT, lookup, players);
    // Team 101 released Mahomes
    assert.equal(txs[0].drops["4046"], 101);
    // Team 102 released Jefferson
    assert.equal(txs[0].drops["5844"], 102);
  });

  it("includes draft picks with season and round", () => {
    const players = { ...sleeperPlayers };
    const txs = normalizeFFCompletedTrades(TRADE_SNAPSHOT, lookup, players);
    const pick = txs[0].draft_picks.find((p) => p.season === "2026" && p.round === 1);
    assert.ok(pick, "2026 R1 pick should be in draft_picks");
    assert.equal(pick.owner_id, 102);
  });

  it("uses approved_on as the created timestamp", () => {
    const players = { ...sleeperPlayers };
    const txs = normalizeFFCompletedTrades(TRADE_SNAPSHOT, lookup, players);
    assert.equal(txs[0].created, 1700000000000);
  });

  it("creates synthetic players for unmatched FF players", () => {
    const players = {};
    const lookup2 = buildPlayerLookup(players);
    const txs = normalizeFFCompletedTrades(TRADE_SNAPSHOT, lookup2, players);
    // Both players unknown — synthetic ids should be created
    assert.ok(Object.keys(txs[0].adds).some((id) => id.startsWith("ff_")));
    assert.ok(Object.keys(players).some((id) => id.startsWith("ff_")));
  });

  it("returns an empty array for empty trades input", () => {
    assert.deepEqual(normalizeFFCompletedTrades([], lookup, {}), []);
    assert.deepEqual(normalizeFFCompletedTrades(null, lookup, {}), []);
  });
});

// ---------------------------------------------------------------------------
// normalizeFFMoveTransactions (snapshot: add, drop, waiver)
// ---------------------------------------------------------------------------

describe("normalizeFFMoveTransactions", () => {
  const sleeperPlayers = {
    "5844": { full_name: "Justin Jefferson", position: "WR", active: true },
  };
  const lookup = buildPlayerLookup(sleeperPlayers);

  const mkItem = (type, playerName = "Justin Jefferson", teamId = 201, timeMs = 1700001000000) => ({
    time_epoch_milli: String(timeMs),
    transaction: {
      type,
      team: { id: teamId },
      player: {
        pro_player: {
          name_full: playerName,
          position: "WR",
          id: 8001,
          pro_team_abbreviation: "MIN",
        },
      },
    },
  });

  it("maps TRANSACTION_ADD to free_agent type", () => {
    const txs = normalizeFFMoveTransactions([mkItem("TRANSACTION_ADD")], lookup, { ...sleeperPlayers });
    assert.equal(txs.length, 1);
    assert.equal(txs[0].type, "free_agent");
    assert.equal(txs[0].adds["5844"], 201);
    assert.deepEqual(txs[0].drops, {});
  });

  it("maps TRANSACTION_CLAIM to waiver type", () => {
    const txs = normalizeFFMoveTransactions([mkItem("TRANSACTION_CLAIM")], lookup, { ...sleeperPlayers });
    assert.equal(txs[0].type, "waiver");
  });

  it("maps TRANSACTION_DROP to free_agent type with drops populated", () => {
    const txs = normalizeFFMoveTransactions([mkItem("TRANSACTION_DROP")], lookup, { ...sleeperPlayers });
    assert.equal(txs[0].type, "free_agent");
    assert.equal(txs[0].drops["5844"], 201);
    assert.deepEqual(txs[0].adds, {});
  });

  it("skips TRANSACTION_TRADE items", () => {
    const txs = normalizeFFMoveTransactions([mkItem("TRANSACTION_TRADE")], lookup, { ...sleeperPlayers });
    assert.equal(txs.length, 0);
  });

  it("skips items with no team id", () => {
    const item = { time_epoch_milli: "1700001000000", transaction: { type: "TRANSACTION_ADD", player: {} } };
    const txs = normalizeFFMoveTransactions([item], lookup, { ...sleeperPlayers });
    assert.equal(txs.length, 0);
  });

  it("preserves the created timestamp from time_epoch_milli", () => {
    const txs = normalizeFFMoveTransactions([mkItem("TRANSACTION_ADD", "Justin Jefferson", 201, 1700001234567)], lookup, { ...sleeperPlayers });
    assert.equal(txs[0].created, 1700001234567);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(normalizeFFMoveTransactions([], lookup, {}), []);
  });
});
