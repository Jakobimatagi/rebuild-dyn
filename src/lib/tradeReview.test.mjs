import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTradeReview, resolveTradedPick, pickLabel } from "./tradeReview.js";

// FantasyCalc-style value entries keyed by sleeper id (value = dollar scale).
const fc = new Map([
  ["100", { value: 8000 }], // Star QB → trade scale 80
  ["200", { value: 3000 }], // RB      → 30
  ["300", { value: 6000 }], // drafted rookie → 60
]);
const ra = new Map();
const players = {
  100: { full_name: "Star QB", position: "QB" },
  200: { full_name: "Solid RB", position: "RB" },
  300: { full_name: "Rookie WR", position: "WR" },
};
const rosterLabelById = new Map([
  [10, "Team A"],
  [20, "Team B"],
]);
const leagueContext = { isSuperflex: true };

// A completed 2025 draft: slot 3 originally belonged to roster 20; that selection
// (round 1, slot 3) became player 300.
const sleeperDrafts = [
  {
    draft_id: "d1",
    season: "2025",
    status: "complete",
    slot_to_roster_id: { 1: 11, 2: 12, 3: 20, 4: 10 },
  },
];
const allDraftPicksMap = {
  d1: [
    { round: 1, draft_slot: 3, pick_no: 3, player_id: "300", metadata: { first_name: "Rookie", last_name: "WR", position: "WR" } },
  ],
};

test("resolveTradedPick maps a traded pick to the player drafted", () => {
  const resolved = resolveTradedPick(
    { season: "2025", round: 1, roster_id: 20 },
    sleeperDrafts,
    allDraftPicksMap,
  );
  assert.equal(resolved.playerId, "300");
  assert.equal(resolved.playerName, "Rookie WR");
});

test("resolveTradedPick matches by draft year when draft.season is off (the 2026 bug)", () => {
  // Sleeper stamped this completed 2026 rookie draft with season '2025', but it
  // ran in 2026. A '2026 2nd' pick must still resolve to the player drafted.
  const drafts = [
    {
      draft_id: "d2",
      season: "2025", // wrong / offset season label
      status: "complete",
      start_time: Date.parse("2026-05-01T00:00:00Z"),
      slot_to_roster_id: { 1: 11, 2: 20, 3: 12 },
    },
  ];
  const picksMap = {
    d2: [
      { round: 2, draft_slot: 2, pick_no: 14, player_id: "777", metadata: { first_name: "Soph", last_name: "Back", position: "RB" } },
    ],
  };
  const resolved = resolveTradedPick({ season: "2026", round: 2, roster_id: 20 }, drafts, picksMap);
  assert.equal(resolved.playerId, "777");
});

test("resolveTradedPick falls back to draft_order + rosters when slot_to_roster_id is absent", () => {
  const drafts = [
    {
      draft_id: "d3",
      season: "2025",
      status: "complete",
      draft_order: { u1: 1, u2: 2 }, // user_id → slot, no slot_to_roster_id
    },
  ];
  const rostersArg = [
    { roster_id: 20, owner_id: "u2" },
    { roster_id: 11, owner_id: "u1" },
  ];
  const picksMap = {
    d3: [
      { round: 1, draft_slot: 2, pick_no: 2, player_id: "888", metadata: { first_name: "Late", last_name: "First", position: "WR" } },
    ],
  };
  const resolved = resolveTradedPick({ season: "2025", round: 1, roster_id: 20 }, drafts, picksMap, rostersArg);
  assert.equal(resolved.playerId, "888");
});

test("resolveTradedPick returns null for an undrafted future pick", () => {
  const resolved = resolveTradedPick(
    { season: "2099", round: 1, roster_id: 20 },
    sleeperDrafts,
    allDraftPicksMap,
  );
  assert.equal(resolved, null);
});

test("buildTradeReview scores value-now and picks the winner", () => {
  // Team A sends Star QB (80) to B; B sends Solid RB (30) + its 2025 1st (→ Rookie WR, 60) to A.
  const transactions = [
    {
      transaction_id: "t1",
      type: "trade",
      created: 1714000000000,
      adds: { 100: 20, 200: 10 },
      drops: { 100: 10, 200: 20 },
      draft_picks: [{ season: "2025", round: 1, owner_id: 10, previous_owner_id: 20, roster_id: 20 }],
    },
  ];

  const { cards } = buildTradeReview({
    transactions, rosterLabelById, players,
    fcByPlayerId: fc, raByPlayerId: ra, leagueContext,
    sleeperDrafts, allDraftPicksMap, valueSnapshots: null,
  });

  assert.equal(cards.length, 1);
  const card = cards[0];
  const view = card.views.fc;
  const teamA = view.sides.find((s) => s.rosterId === 10);
  const teamB = view.sides.find((s) => s.rosterId === 20);

  // A received Solid RB (30) + pick→Rookie WR (60) = 90; B received Star QB (80).
  assert.equal(teamA.totalNow, 90);
  assert.equal(teamB.totalNow, 80);
  assert.equal(view.winnerNowRosterId, 10);

  // The pick asset reports what it became.
  const pickAsset = teamA.assets.find((a) => a.kind === "pick_used");
  assert.equal(pickAsset.becameLabel, "Rookie WR");
  assert.equal(pickAsset.valueNow, 60);

  // Each asset names where its value came from (FantasyCalc here).
  const rbAsset = teamA.assets.find((a) => a.kind === "player");
  assert.equal(rbAsset.nowSource, "fc");
  assert.equal(pickAsset.nowSource, "fc");
  assert.deepEqual(view.valueSources, ["fc"]);

  // No snapshots → no value-then, flagged outside the frame.
  assert.equal(card.provenance, "outside_frame");
  assert.equal(teamA.totalThen, null);
});

test("buildTradeReview reprices and can flip the winner under the RosterAudit lens", () => {
  // RA values Star QB far lower than FC does, which flips who won.
  const raVals = new Map([
    ["100", { value: 2000 }], // Star QB → 20 under RA (vs 80 under FC)
    ["200", { value: 3000 }], // RB → 30
    ["300", { value: 6000 }], // rookie → 60
  ]);
  const transactions = [
    {
      transaction_id: "t1",
      type: "trade",
      created: 1714000000000,
      adds: { 100: 20, 200: 10 },
      drops: { 100: 10, 200: 20 },
      draft_picks: [{ season: "2025", round: 1, owner_id: 10, previous_owner_id: 20, roster_id: 20 }],
    },
  ];

  const { cards } = buildTradeReview({
    transactions, rosterLabelById, players,
    fcByPlayerId: fc, raByPlayerId: raVals, leagueContext,
    sleeperDrafts, allDraftPicksMap, valueSnapshots: null,
  });
  const card = cards[0];

  // FC lens: A 90 vs B 80 → A wins.
  assert.equal(card.views.fc.winnerNowRosterId, 10);
  // RA lens: A (RB 30 + rookie 60 = 90) vs B (QB 20) → A wins by more; QB repriced.
  const raTeamB = card.views.ra.sides.find((s) => s.rosterId === 20);
  assert.equal(raTeamB.totalNow, 20);
  assert.equal(card.views.ra.sides.find((s) => s.rosterId === 10).assets.find((a) => a.kind === "player").nowSource, "ra");
});

test("buildTradeReview exposes a Dynasty Oracle (internal) lens on its own points scale", () => {
  // Oracle values are already on a ~0-100 points scale (NOT dollar scale): used as-is.
  const internal = new Map([
    ["100", { value: 88 }], // Star QB
    ["200", { value: 24 }], // RB
    ["300", { value: 55 }], // rookie WR
  ]);
  const transactions = [
    {
      transaction_id: "t1",
      type: "trade",
      created: 1714000000000,
      adds: { 100: 20, 200: 10 },
      drops: { 100: 10, 200: 20 },
      draft_picks: [{ season: "2025", round: 1, owner_id: 10, previous_owner_id: 20, roster_id: 20 }],
    },
  ];

  const { cards } = buildTradeReview({
    transactions, rosterLabelById, players,
    fcByPlayerId: fc, raByPlayerId: ra, internalByPlayerId: internal,
    leagueContext, sleeperDrafts, allDraftPicksMap, valueSnapshots: null,
  });
  const oracle = cards[0].views.oracle;

  // A: RB 24 + rookie 55 = 79; B: QB 88 (used as-is, no ÷100).
  assert.equal(oracle.sides.find((s) => s.rosterId === 10).totalNow, 79);
  assert.equal(oracle.sides.find((s) => s.rosterId === 20).totalNow, 88);
  assert.equal(oracle.winnerNowRosterId, 20);
  assert.deepEqual(oracle.valueSources, ["oracle"]);
});

test("buildTradeReview uses snapshots for value-then when available", () => {
  const transactions = [
    {
      transaction_id: "t2",
      type: "trade",
      created: Date.parse("2025-04-15T00:00:00Z"),
      adds: { 100: 20, 200: 10 },
      drops: { 100: 10, 200: 20 },
      draft_picks: [],
    },
  ];
  // Snapshot from 2025-04-10 (nearest prior): Star QB was worth 5000 then (→ 50).
  const valueSnapshots = {
    dates: ["2025-04-10"],
    earliestDate: "2025-04-10",
    byDatePlayer: new Map([
      ["2025-04-10|100", 5000],
      ["2025-04-10|200", 3000],
    ]),
  };

  const { cards } = buildTradeReview({
    transactions, rosterLabelById, players,
    fcByPlayerId: fc, raByPlayerId: ra, leagueContext,
    sleeperDrafts, allDraftPicksMap, valueSnapshots,
  });

  const card = cards[0];
  assert.equal(card.provenance, "snapshot");
  assert.equal(card.snapDate, "2025-04-10");
  const teamB = card.views.fc.sides.find((s) => s.rosterId === 20); // received Star QB
  assert.equal(teamB.totalNow, 80);
  assert.equal(teamB.totalThen, 50); // 5000 / 100
});

test("pickLabel formats season + round ordinal", () => {
  assert.equal(pickLabel({ season: "2026", round: 1 }), "2026 1st");
  assert.equal(pickLabel({ season: "2027", round: 3 }), "2027 3rd");
});
