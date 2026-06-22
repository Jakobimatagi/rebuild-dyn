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

test("slotForPickNo handles third-round reversal", () => {
  // 12-team 3RR: rounds 1-2 are standard snake, then round 3 reverses again so
  // the slot-1 owner picks 1.01, 2.12, 3.12, 4.01, 5.12, …
  const N = 12;
  const rr = 3;
  assert.equal(slotForPickNo(1, N, "snake", rr), 1); // 1.01
  assert.equal(slotForPickNo(N + 1, N, "snake", rr), N); // 2.12 (round 2 reverses)
  assert.equal(slotForPickNo(2 * N + 1, N, "snake", rr), N); // 3.12 (reversal: stays at slot 12)
  assert.equal(slotForPickNo(3 * N + 1, N, "snake", rr), 1); // 4.01 (flips back to forward)
  assert.equal(slotForPickNo(4 * N + 1, N, "snake", rr), N); // 5.12
  // reversalRound = 0 leaves plain snake untouched.
  assert.equal(slotForPickNo(2 * N + 1, N, "snake", 0), 1); // 3.01 without reversal
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

test("buildLiveDraftState honors reversal_round for on-the-clock + upcoming", () => {
  // 4-team 3RR. Two rounds done (slot1 had 1.01 + 2.04); round 3 reverses again,
  // so slot1 picks last (3.04) rather than first.
  const draft = {
    draft_id: "drr",
    season: "2026",
    type: "snake",
    status: "drafting",
    settings: { teams: 4, rounds: 4, reversal_round: 3 },
    slot_to_roster_id: { 1: 10, 2: 20, 3: 30, 4: 40 },
  };
  const mk = (pickNo, slot, rosterId) => ({
    pick_no: pickNo,
    round: Math.floor((pickNo - 1) / 4) + 1,
    draft_slot: slot,
    roster_id: rosterId,
    player_id: String(pickNo),
    metadata: { first_name: "P", last_name: String(pickNo), position: "RB" },
  });
  // Rounds 1-2 (8 picks) snake: 1→4 then 4→1.
  const picks = [
    mk(1, 1, 10), mk(2, 2, 20), mk(3, 3, 30), mk(4, 4, 40),
    mk(5, 4, 40), mk(6, 3, 30), mk(7, 2, 20), mk(8, 1, 10),
  ];
  const teams = [
    { rosterId: 10, label: "Slot1" },
    { rosterId: 20, label: "Slot2" },
    { rosterId: 30, label: "Slot3" },
    { rosterId: 40, label: "Slot4" },
  ];
  const state = buildLiveDraftState({
    draft,
    picks,
    teams,
    rosterPositions: ["RB", "BN"],
    myRosterId: 10,
  });

  // Pick 9 starts round 3. Plain snake would send it forward to slot 1 (roster
  // 10); with 3RR it reverses again → slot 4 → roster 40.
  assert.equal(state.onTheClock.pickNo, 9);
  assert.equal(state.onTheClock.round, 3);
  assert.equal(state.onTheClock.rosterId, 40);

  // Slot-1 owner (me) picks last in round 3 → pick 12, then first in round 4 → 13.
  assert.equal(state.myUpcoming[0].pickNo, 12);
  assert.equal(state.myUpcoming[1].pickNo, 13);
});

test("buildLiveDraftState reflects traded picks in owner, clock, and upcoming", () => {
  // 2-team, 3 rounds. Roster 20 traded its round-2 pick to roster 10 (me).
  const draft = {
    draft_id: "dtp",
    season: "2026",
    type: "snake",
    status: "drafting",
    settings: { teams: 2, rounds: 3 },
    slot_to_roster_id: { 1: 10, 2: 20 },
  };
  // Round 1 done: 1.01 (slot1→10), 1.02 (slot2→20). Pick 3 starts round 2,
  // which snake-reverses to slot 2 — normally roster 20, but it's been traded.
  const picks = [
    {
      pick_no: 1, round: 1, draft_slot: 1, roster_id: 10,
      player_id: "100", metadata: { first_name: "A", last_name: "One", position: "QB" },
    },
    {
      pick_no: 2, round: 1, draft_slot: 2, roster_id: 20,
      player_id: "200", metadata: { first_name: "B", last_name: "Two", position: "RB" },
    },
  ];
  const tradedPicks = [
    { season: "2026", round: 2, roster_id: 20, previous_owner_id: 20, owner_id: 10 },
  ];
  const state = buildLiveDraftState({
    draft,
    picks,
    teams: [
      { rosterId: 10, label: "Me" },
      { rosterId: 20, label: "Rival" },
    ],
    rosterPositions: ["QB", "RB", "BN"],
    myRosterId: 10,
    tradedPicks,
  });

  // Pick 3 (round 2, slot 2) is on the clock; the seat is Rival's but the pick
  // belongs to me via trade.
  assert.equal(state.onTheClock.pickNo, 3);
  assert.equal(state.onTheClock.rosterId, 10);
  assert.equal(state.onTheClock.isMe, true);
  assert.equal(state.onTheClock.viaTrade, true);
  assert.equal(state.onTheClock.fromLabel, "Rival");

  // My upcoming includes the traded-in 2.02, flagged.
  const acquired = state.myUpcoming.find((u) => u.pickNo === 3);
  assert.ok(acquired);
  assert.equal(acquired.viaTrade, true);
  assert.equal(acquired.fromLabel, "Rival");

  // Board ownership: round-2 slot-2 cell now reads as mine, marked traded.
  const r2s2 = state.boardOwners[1][1];
  assert.equal(r2s2.rosterId, 10);
  assert.equal(r2s2.traded, true);
  assert.equal(r2s2.fromLabel, "Rival");
  // Round-2 slot-1 (untraded) stays with its seat owner, not flagged.
  const r2s1 = state.boardOwners[1][0];
  assert.equal(r2s1.rosterId, 10);
  assert.equal(r2s1.traded, false);
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
