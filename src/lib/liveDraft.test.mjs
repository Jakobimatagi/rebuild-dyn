import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slotForPickNo,
  assignRosterSlots,
  buildLiveDraftState,
} from "./liveDraft.js";

test("slotForPickNo handles snake ordering", () => {
  // 4-team snake: round 1 left→right, round 2 right→left.
  assert.equal(slotForPickNo(1, 4, "snake"), 1);
  assert.equal(slotForPickNo(4, 4, "snake"), 4);
  assert.equal(slotForPickNo(5, 4, "snake"), 4); // round 2 reverses
  assert.equal(slotForPickNo(8, 4, "snake"), 1);
  assert.equal(slotForPickNo(9, 4, "snake"), 1); // round 3 forward again
});

test("slotForPickNo handles linear ordering", () => {
  assert.equal(slotForPickNo(1, 4, "linear"), 1);
  assert.equal(slotForPickNo(5, 4, "linear"), 1); // every round same direction
  assert.equal(slotForPickNo(8, 4, "linear"), 4);
});

test("assignRosterSlots fills exact slots before flex", () => {
  const positions = ["QB", "RB", "WR", "FLEX", "BN"];
  const players = [
    { position: "RB", name: "Back One", pickNo: 1 },
    { position: "RB", name: "Back Two", pickNo: 2 },
    { position: "WR", name: "Wide One", pickNo: 3 },
  ];
  const { starters, bench } = assignRosterSlots(players, positions);

  const rbSlot = starters.find((s) => s.slot === "RB");
  const wrSlot = starters.find((s) => s.slot === "WR");
  const flexSlot = starters.find((s) => s.slot === "FLEX");
  const qbSlot = starters.find((s) => s.slot === "QB");

  assert.equal(rbSlot.player.name, "Back One"); // exact RB slot first
  assert.equal(wrSlot.player.name, "Wide One");
  assert.equal(flexSlot.player.name, "Back Two"); // second RB overflows to FLEX
  assert.equal(qbSlot.player, null); // no QB drafted → open need
  assert.equal(bench.length, 0); // BN is not a starter slot, nothing benched
});

test("buildLiveDraftState computes on-the-clock and per-team rosters", () => {
  const draft = {
    draft_id: "d1",
    season: "2026",
    type: "snake",
    status: "drafting",
    settings: { teams: 2, rounds: 3 },
    slot_to_roster_id: { 1: 10, 2: 20 },
  };
  // Two picks made: pick 1 (slot1→roster10), pick 2 (slot2→roster20).
  const picks = [
    {
      pick_no: 1,
      round: 1,
      draft_slot: 1,
      roster_id: 10,
      player_id: "100",
      metadata: { first_name: "Aaron", last_name: "Quarterback", position: "QB" },
    },
    {
      pick_no: 2,
      round: 1,
      draft_slot: 2,
      roster_id: 20,
      player_id: "200",
      metadata: { first_name: "Bobby", last_name: "Runner", position: "RB" },
    },
  ];
  const teams = [
    { rosterId: 10, label: "My Team" },
    { rosterId: 20, label: "Rival" },
  ];
  const state = buildLiveDraftState({
    draft,
    picks,
    teams,
    rosterPositions: ["QB", "RB", "BN"],
    myRosterId: 10,
  });

  assert.equal(state.madeCount, 2);
  // Pick 3 is the start of round 2 → snake reverses → slot 2 → roster 20.
  assert.equal(state.onTheClock.pickNo, 3);
  assert.equal(state.onTheClock.rosterId, 20);

  // My team is sorted first and has the QB slotted.
  assert.equal(state.teams[0].isMe, true);
  const myQb = state.teams[0].starters.find((s) => s.slot === "QB");
  assert.equal(myQb.player.name, "Aaron Quarterback");

  // My next pick should be pick 4 (round 2, slot 1).
  assert.equal(state.myUpcoming[0].pickNo, 4);

  // No value map provided → no power rankings.
  assert.equal(state.powerRankings, null);
});

test("buildLiveDraftState grades rosters and ranks by total value", () => {
  const draft = {
    draft_id: "d2",
    season: "2026",
    type: "snake",
    status: "drafting",
    settings: { teams: 2, rounds: 2 },
    slot_to_roster_id: { 1: 10, 2: 20 },
  };
  const mk = (pickNo, slot, rosterId, pid, pos) => ({
    pick_no: pickNo,
    round: Math.ceil(pickNo / 2),
    draft_slot: slot,
    roster_id: rosterId,
    player_id: pid,
    metadata: { first_name: "P", last_name: pid, position: pos },
  });
  // Roster 10 drafts two studs; roster 20 drafts two cheap players.
  const picks = [
    mk(1, 1, 10, "100", "QB"),
    mk(2, 2, 20, "200", "RB"),
    mk(3, 2, 20, "201", "WR"),
    mk(4, 1, 10, "101", "RB"),
  ];
  const valueBySleeperId = { 100: 9000, 101: 7000, 200: 1000, 201: 500 };
  const state = buildLiveDraftState({
    draft,
    picks,
    teams: [
      { rosterId: 10, label: "Studs" },
      { rosterId: 20, label: "Bargains" },
    ],
    rosterPositions: ["QB", "RB", "WR", "TE", "BN"],
    myRosterId: 10,
    valueBySleeperId,
  });

  assert.ok(state.powerRankings);
  assert.equal(state.powerRankings.length, 2);
  // Highest total value ranks #1.
  assert.equal(state.powerRankings[0].rosterId, 10);
  assert.equal(state.powerRankings[0].rank, 1);
  assert.equal(state.powerRankings[0].totalValue, 16000);
  // Above-average team gets an A, below-average an F.
  assert.equal(state.powerRankings[0].grade, "A");
  assert.equal(state.powerRankings[1].grade, "F");

  // Position grades surface per-room weak spots.
  const studs = state.teams.find((t) => t.rosterId === 10);
  const studsTE = studs.positionGrades.find((g) => g.pos === "TE");
  assert.equal(studsTE.count, 0); // never drafted a TE
  assert.equal(studsTE.grade, null); // nobody in the league has → ungradeable
  const studsQB = studs.positionGrades.find((g) => g.pos === "QB");
  assert.equal(studsQB.grade, "A"); // only team with a QB → ahead of field
  const bargainsQB = state.teams
    .find((t) => t.rosterId === 20)
    .positionGrades.find((g) => g.pos === "QB");
  assert.equal(bargainsQB.count, 0);
  assert.equal(bargainsQB.grade, "F"); // QB hole flagged

  // draftedIds powers the Best Available filter.
  assert.ok(state.draftedIds.has("100"));
  assert.ok(state.draftedIds.has("201"));
  assert.equal(state.draftedIds.has("999"), false);
});

test("buildLiveDraftState sums expected PPG from the starting lineup", () => {
  const draft = {
    draft_id: "d3",
    season: "2026",
    type: "snake",
    status: "drafting",
    settings: { teams: 2, rounds: 2 },
    slot_to_roster_id: { 1: 10, 2: 20 },
  };
  const mk = (pickNo, slot, rosterId, pid, pos) => ({
    pick_no: pickNo,
    round: Math.ceil(pickNo / 2),
    draft_slot: slot,
    roster_id: rosterId,
    player_id: pid,
    metadata: { first_name: "P", last_name: pid, position: pos },
  });
  const picks = [
    mk(1, 1, 10, "100", "QB"), // starter
    mk(2, 2, 20, "200", "RB"), // fills B's RB slot
    mk(3, 2, 20, "201", "QB"), // fills B's QB slot
    mk(4, 1, 10, "101", "RB"), // starter
  ];
  const state = buildLiveDraftState({
    draft,
    picks,
    teams: [
      { rosterId: 10, label: "A" },
      { rosterId: 20, label: "B" },
    ],
    rosterPositions: ["QB", "RB", "BN"],
    myRosterId: 10,
    ppgBySleeperId: { 100: 20, 101: 12, 200: 15, 201: 99 },
  });

  const a = state.teams.find((t) => t.rosterId === 10);
  assert.equal(a.expectedPpg, 32); // 20 (QB) + 12 (RB)
  const b = state.teams.find((t) => t.rosterId === 20);
  // RB 200 starts (15); QB 201 fills the QB starter slot (99) → 114.
  assert.equal(b.expectedPpg, 114);
});
