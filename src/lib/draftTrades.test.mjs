import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTrades, mergeTransactions } from "./draftTrades.js";

const players = {
  100: { full_name: "Star Quarterback", position: "QB" },
  200: { full_name: "Workhorse Back", position: "RB" },
};
const teamLabelById = new Map([
  [10, "My Team"],
  [20, "Rival"],
  [30, "Third Wheel"],
]);

test("parseTrades groups assets each team receives", () => {
  // Roster 10 sends player 100 + a 2027 1st, gets player 200.
  const transactions = [
    {
      transaction_id: "t1",
      type: "trade",
      status: "complete",
      created: 1000,
      roster_ids: [10, 20],
      adds: { 100: 20, 200: 10 },
      drops: { 100: 10, 200: 20 },
      draft_picks: [
        { season: "2027", round: 1, owner_id: 20, previous_owner_id: 10 },
      ],
    },
  ];
  const [trade] = parseTrades(transactions, { players, teamLabelById, myRosterId: 10 });

  assert.equal(trade.isMultiTeam, false);
  // My team sorted first.
  assert.equal(trade.teams[0].isMe, true);
  assert.equal(trade.teams[0].label, "My Team");
  assert.deepEqual(
    trade.teams[0].received.map((a) => a.label),
    ["Workhorse Back"],
  );
  // Rival receives the QB and the pick.
  const rival = trade.teams.find((t) => t.rosterId === 20);
  const labels = rival.received.map((a) => a.label).sort();
  assert.deepEqual(labels, ["2027 1st", "Star Quarterback"]);
});

test("parseTrades flags 3-team trades and ignores non-trades", () => {
  const transactions = [
    { type: "waiver", created: 5, adds: { 200: 10 } }, // ignored
    {
      transaction_id: "t2",
      type: "trade",
      status: "complete",
      created: 2000,
      roster_ids: [10, 20, 30],
      draft_picks: [
        { season: "2026", round: 2, owner_id: 30, previous_owner_id: 10 },
      ],
    },
  ];
  const trades = parseTrades(transactions, { players, teamLabelById, myRosterId: 10 });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].isMultiTeam, true);
  assert.equal(trades[0].teams.length, 3);
});

test("mergeTransactions dedupes by transaction_id", () => {
  const a = [{ transaction_id: "x", type: "trade", created: 1 }];
  const b = [
    { transaction_id: "x", type: "trade", created: 1 }, // dup
    { transaction_id: "y", type: "trade", created: 2 },
  ];
  assert.equal(mergeTransactions(a, b).length, 2);
});
