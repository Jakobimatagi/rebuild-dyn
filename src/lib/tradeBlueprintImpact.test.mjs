/**
 * Unit tests for tradeBlueprintImpact.js
 * Run with: npm test (Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBlueprintImpact, classifyMoveType, computeLineupRoles, compareBuildFit } from "./tradeBlueprintImpact.js";
import { evaluateTrade } from "./tradeEngine.js";

const SF = { isSuperflex: true, tePremium: false, starterCounts: { QB: 1, RB: 2, WR: 3, TE: 1 }, flexCount: 2 };

// Build an enriched-ish player. Carries both `score` (used by
// projectRosterAfterTrade's proportions) and dynastyValue (used by pVal).
const mk = (position, age, value, extra = {}) => ({
  type: "player",
  id: extra.id ?? `${position}-${age}-${value}`,
  name: extra.name ?? `${position} ${value}`,
  position,
  age,
  yearsExp: extra.yearsExp ?? Math.max(0, age - 22),
  score: value,
  dynastyValue: { value },
  archetype: extra.archetype,
  peakPctile: extra.peakPctile ?? value,
  currentPctile: extra.currentPctile ?? value,
  ...extra,
});

const pick = (season, round, label = `${season} ${round}${round === 1 ? "st" : round === 2 ? "nd" : "rd"}`) => ({
  type: "pick",
  season,
  round,
  label,
});

// Build a league-team shell (classifier + projectRosterAfterTrade input) from
// a flat player list, with score-share proportions matching rosterBuilder.
function teamFrom(players, overrides = {}) {
  const byPos = { QB: [], RB: [], WR: [], TE: [] };
  for (const p of players) byPos[p.position]?.push(p);
  for (const k of Object.keys(byPos)) byPos[k].sort((a, b) => b.score - a.score);
  const totalScore = players.reduce((a, p) => a + p.score, 0) || 1;
  const ideal = { QB: 18, RB: 35, WR: 35, TE: 12 };
  const proportions = {};
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    const posScore = byPos[pos].reduce((a, p) => a + p.score, 0);
    const actual = Math.round((posScore / totalScore) * 100);
    proportions[pos] = { actual, ideal: ideal[pos], delta: actual - ideal[pos] };
  }
  const avgAge = players.length
    ? (players.reduce((a, p) => a + p.age, 0) / players.length).toFixed(1)
    : "N/A";
  return {
    rosterId: 1,
    label: "Test Team",
    enriched: players,
    byPos,
    proportions,
    avgAge,
    avgScore: Math.round(totalScore / (players.length || 1)),
    needs: [],
    picks: [],
    teamPhase: null,
    ...overrides,
  };
}

// A young, WR-heavy build holding one aging vet RB — reads Productive Struggle.
const youngWrTeam = () =>
  teamFrom([
    mk("WR", 23, 75),
    mk("WR", 22, 70),
    mk("WR", 23, 65),
    mk("WR", 24, 55),
    mk("RB", 29, 70, { archetype: "Productive Vet", id: "vet-rb" }),
    mk("RB", 23, 35),
    mk("QB", 24, 55),
    mk("TE", 25, 45),
  ]);

// One elite young RB anchor + young WR corps — reads Hero RB.
const heroRbTeam = () =>
  teamFrom([
    mk("RB", 24, 95, { id: "anchor-rb" }),
    mk("RB", 24, 40),
    mk("WR", 23, 80),
    mk("WR", 23, 75),
    mk("WR", 24, 70),
    mk("WR", 22, 60),
    mk("QB", 25, 60),
    mk("TE", 24, 50),
  ]);

describe("buildBlueprintImpact", () => {
  it("returns null on empty roster or empty trade", () => {
    assert.equal(
      buildBlueprintImpact({ team: teamFrom([]), outgoing: [mk("RB", 25, 50)], incoming: [], leagueContext: SF }),
      null,
    );
    assert.equal(
      buildBlueprintImpact({ team: youngWrTeam(), outgoing: [], incoming: [], leagueContext: SF }),
      null,
    );
  });

  it("trading an aging vet for youth + a pick strengthens a young build", () => {
    const team = youngWrTeam();
    const outgoing = [team.enriched.find((p) => p.id === "vet-rb")];
    const incoming = [mk("WR", 23, 75, { id: "in-wr" }), pick(2027, 1)];
    const impact = buildBlueprintImpact({ team, outgoing, incoming, leagueContext: SF });

    assert.ok(impact, "impact computed");
    assert.ok(impact.fitDelta > 0, `fitDelta should be positive, got ${impact.fitDelta}`);
    assert.ok(impact.avgAgeDelta < 0, "roster gets younger");
    assert.ok(
      ["vetForPick", "youthPivot", "pickAccumulation"].includes(impact.moveType.id),
      `expected a liquidation/youth move, got ${impact.moveType.id}`,
    );
    // Incoming player tagged against the current top blueprint.
    assert.equal(impact.incomingAlignment.length, 1);
    assert.ok(["core", "fit"].includes(impact.incomingAlignment[0].tag));
  });

  it("trading the Hero RB anchor away collapses the identity", () => {
    const team = heroRbTeam();
    const before = buildBlueprintImpact({
      team,
      outgoing: [team.enriched.find((p) => p.id === "anchor-rb")],
      incoming: [mk("WR", 23, 90, { id: "in-wr-big" })],
      leagueContext: SF,
    });
    assert.ok(before, "impact computed");
    assert.equal(before.before.top.id, "heroRb", `pre-trade identity should be heroRb, got ${before.before.top.id}`);
    assert.ok(
      before.fitDelta < 0 || before.archetypeChanged,
      `losing the anchor should hurt heroRb fit (fitDelta ${before.fitDelta}, changed ${before.archetypeChanged})`,
    );
  });

  it("vet-for-picks-only reads as a liquidation with no player alignment", () => {
    const team = youngWrTeam();
    const outgoing = [team.enriched.find((p) => p.id === "vet-rb")];
    const incoming = [pick(2026, 1), pick(2026, 2)];
    const impact = buildBlueprintImpact({ team, outgoing, incoming, leagueContext: SF });

    assert.ok(impact, "impact computed");
    assert.equal(impact.moveType.id, "vetForPick");
    assert.equal(impact.incomingAlignment.length, 0);
    // Picks never enter roster signals — projected roster just loses the player.
    assert.equal(impact.projected.enriched.length, team.enriched.length - 1);
    assert.equal(impact.projected.picks.length, 2);
  });
});

describe("computeLineupRoles", () => {
  // ppg drives the lineup; grade only breaks ties.
  const p = (position, ppg, score, id) => ({ id, position, ppg, score, dynastyValue: { value: score } });

  it("RB2 starts; the third QB rides the bench even in superflex", () => {
    const enriched = [
      p("QB", 22, 80, "qb1"),
      p("QB", 19, 75, "qb2"),
      p("QB", 12, 57, "qb3"), // the Mac Jones case
      p("RB", 16, 70, "rb1"),
      p("RB", 12, 55, "rb2"),
      p("WR", 15, 70, "wr1"),
      p("WR", 13, 65, "wr2"),
      p("WR", 11, 60, "wr3"),
      p("TE", 9, 50, "te1"),
      p("RB", 8, 40, "rb3"),
    ];
    const roles = computeLineupRoles(enriched, SF);
    assert.deepEqual(roles.get("rb2"), { starter: true, slot: "RB2" });
    assert.deepEqual(roles.get("qb2"), { starter: true, slot: "SF" }); // superflex QB2 starts
    assert.equal(roles.get("qb3").starter, false); // backup QB scores nothing
    assert.equal(roles.get("qb3").slot, "QB3");
    assert.deepEqual(roles.get("rb3"), { starter: true, slot: "FLEX" }); // flexCount 2 − 1 SF
  });

  it("in 1QB the second QB is bench, not superflex", () => {
    const oneQb = { ...SF, isSuperflex: false };
    const roles = computeLineupRoles(
      [p("QB", 22, 80, "qb1"), p("QB", 19, 75, "qb2"), p("RB", 16, 70, "rb1")],
      oneQb,
    );
    assert.equal(roles.get("qb2").starter, false);
    assert.equal(roles.get("qb2").slot, "QB2");
  });

  it("impact flags a bench-QB acquisition and a departing starter", () => {
    const team = teamFrom([
      mk("QB", 26, 80, { id: "qb1", ppg: 22 }),
      mk("QB", 25, 75, { id: "qb2", ppg: 19 }),
      mk("RB", 25, 70, { id: "rb1", ppg: 16 }),
      mk("RB", 24, 55, { id: "rb2", ppg: 12 }),
      mk("WR", 25, 70, { id: "wr1", ppg: 15 }),
      mk("WR", 24, 65, { id: "wr2", ppg: 13 }),
      mk("WR", 25, 60, { id: "wr3", ppg: 11 }),
      mk("TE", 26, 50, { id: "te1", ppg: 9 }),
      mk("RB", 23, 40, { id: "rb3", ppg: 8 }),
    ]);
    const impact = buildBlueprintImpact({
      team,
      outgoing: [team.enriched.find((x) => x.id === "rb2")],
      incoming: [mk("QB", 27, 57, { id: "backup-qb", ppg: 12 })],
      leagueContext: SF,
    });
    assert.ok(impact, "impact computed");
    const align = impact.incomingAlignment[0];
    assert.equal(align.role.starter, false, "third QB should be bench in SF");
    assert.match(align.roleNote, /bench QB3/);
    assert.equal(align.fillsNeed, false, "bench piece fills no lineup need");
    assert.equal(impact.outgoingStarters.length, 1, "RB2 was a starter");
    assert.equal(impact.outgoingStarters[0].role.slot, "RB2");
  });

  it("an NFL backup QB is worthless even when he'd start in the fantasy superflex", () => {
    // Thin QB room: the incoming QB would claim the SF slot — but he's a
    // depth-chart 2 on his NFL team, so he scores nothing while healthy.
    const team = teamFrom([
      mk("QB", 26, 80, { id: "qb1", ppg: 22, depthOrder: 1 }),
      mk("RB", 25, 70, { id: "rb1", ppg: 16 }),
      mk("RB", 24, 55, { id: "rb2", ppg: 12 }),
      mk("WR", 25, 70, { id: "wr1", ppg: 15 }),
      mk("WR", 24, 65, { id: "wr2", ppg: 13 }),
      mk("WR", 25, 60, { id: "wr3", ppg: 11 }),
      mk("TE", 26, 50, { id: "te1", ppg: 9 }),
    ]);
    const impact = buildBlueprintImpact({
      team,
      outgoing: [team.enriched.find((x) => x.id === "rb2")],
      incoming: [mk("QB", 27, 57, { id: "nfl-backup", ppg: 12, depthOrder: 2, team: "SF" })],
      leagueContext: SF,
    });
    const align = impact.incomingAlignment[0];
    assert.equal(align.role.starter, true, "he would claim the fantasy SF slot");
    assert.equal(align.nflBackup, true);
    assert.equal(align.roleTone, "warn");
    assert.match(align.roleNote, /NFL backup on SF/);
    assert.equal(align.fillsNeed, false, "an NFL backup fills no need");
  });

  it("never seats an NFL backup QB over a real player, nor mourns him as a departing starter", () => {
    // Backup QB has inflated trailing PPG from spot starts; a real RB should
    // take the superflex ahead of him, and trading him away should NOT warn
    // "sends away a starter".
    const backup = mk("QB", 27, 57, { id: "backup-qb", ppg: 12, depthOrder: 2, depthOrderKnown: true, team: "SF" });
    const team = teamFrom([
      mk("QB", 24, 80, { id: "qb1", ppg: 20, depthOrder: 1, depthOrderKnown: true }),
      backup,
      mk("RB", 24, 60, { id: "rb1", ppg: 14 }),
      mk("RB", 23, 50, { id: "rb2", ppg: 11 }),
      mk("RB", 24, 40, { id: "rb3", ppg: 8 }),
      mk("WR", 24, 70, { id: "wr1", ppg: 15 }),
      mk("WR", 23, 60, { id: "wr2", ppg: 12 }),
      mk("WR", 24, 55, { id: "wr3", ppg: 10 }),
      mk("WR", 22, 45, { id: "wr4", ppg: 9 }),
      mk("TE", 25, 45, { id: "te1", ppg: 7 }),
    ]);
    const roles = computeLineupRoles(team.enriched, SF);
    assert.equal(roles.get("backup-qb").starter, false, "backup QB must not hold the SF slot");

    const impact = buildBlueprintImpact({
      team,
      outgoing: [backup],
      incoming: [mk("RB", 23, 50, { id: "in-rb" })],
      leagueContext: SF,
    });
    assert.equal(impact.outgoingStarters.length, 0, "no departing-starter warning for an NFL backup");
  });

  it("does not brand a QB an NFL backup when the depth chart is unreported", () => {
    const team = youngWrTeam();
    const impact = buildBlueprintImpact({
      team,
      outgoing: [team.enriched.find((x) => x.id === "vet-rb")],
      // depthOrder 2 is rosterBuilder's DEFAULT when Sleeper reports nothing —
      // depthOrderKnown: false must suppress the flag.
      incoming: [mk("QB", 27, 57, { id: "unknown-depth", depthOrder: 2, depthOrderKnown: false, team: "SF" })],
      leagueContext: SF,
    });
    assert.equal(impact.incomingAlignment[0].nflBackup, false);
    assert.doesNotMatch(impact.incomingAlignment[0].roleNote, /NFL backup/);
  });

  it("seats a blue-chip rookie by forward value instead of burying him at PPG zero", () => {
    // Vets with modest PPG; incoming rookie has no PPG but elite value.
    const team = teamFrom([
      mk("RB", 26, 40, { id: "vet1", ppg: 8 }),
      mk("RB", 27, 35, { id: "vet2", ppg: 7 }),
      mk("WR", 25, 50, { id: "w1", ppg: 10 }),
      mk("WR", 24, 45, { id: "w2", ppg: 9 }),
      mk("WR", 24, 40, { id: "w3", ppg: 8 }),
      mk("QB", 26, 60, { id: "q1", ppg: 15 }),
      mk("TE", 25, 30, { id: "t1", ppg: 5 }),
    ]);
    const rookie = mk("RB", 21, 95, { id: "rookie-stud", yearsExp: 0, ppg: null });
    const impact = buildBlueprintImpact({
      team,
      outgoing: [team.enriched.find((x) => x.id === "vet2")],
      incoming: [rookie],
      leagueContext: SF,
    });
    const align = impact.incomingAlignment[0];
    assert.equal(align.role.starter, true, `95-value rookie should start, got ${align.roleNote}`);
    assert.match(align.roleNote, /starts as RB/);
  });

  it("labels a benched rookie as camp-battle TBD, not dead weight", () => {
    // Deep enough roster that every slot is filled without the rookie.
    const team = teamFrom([
      ...youngWrTeam().enriched,
      mk("QB", 25, 50, { id: "q2" }),
      mk("RB", 24, 45, { id: "rb-x" }),
      mk("WR", 24, 50, { id: "wr-x" }),
      mk("TE", 24, 40, { id: "te-x" }),
    ]);
    const deepRookie = mk("WR", 21, 20, { id: "deep-rookie", yearsExp: 0, ppg: null });
    const impact = buildBlueprintImpact({
      team,
      outgoing: [team.enriched.find((x) => x.id === "vet-rb")],
      incoming: [deepRookie],
      leagueContext: SF,
    });
    const align = impact.incomingAlignment[0];
    assert.equal(align.role.starter, false);
    assert.match(align.roleNote, /rookie .* settles in camp/);
    assert.doesNotMatch(align.roleNote, /no weekly points/);
  });

  it("flags the value war when fit improves on a clearly losing trade", () => {
    const team = youngWrTeam();
    const outgoing = [team.enriched.find((p) => p.id === "vet-rb")];
    const incoming = [mk("WR", 23, 75, { id: "in-wr" }), pick(2027, 1)];
    const winning = buildBlueprintImpact({ team, outgoing, incoming, leagueContext: SF, netValue: 12 });
    const losing = buildBlueprintImpact({ team, outgoing, incoming, leagueContext: SF, netValue: -40 });
    assert.equal(winning.moveType.valueCaution, false);
    assert.equal(losing.moveType.valueCaution, true);
    if (losing.moveType.verdict === "strengthens") {
      assert.match(losing.moveType.detail, /losing the value war/);
      assert.notEqual(losing.moveType.color, winning.moveType.color, "praise color must be muted");
    }
  });

  it("near-tie archetype flips read as leaning, not IDENTITY SHIFT", () => {
    const team = youngWrTeam();
    const impact = buildBlueprintImpact({
      team,
      outgoing: [team.enriched.find((p) => p.id === "vet-rb")],
      incoming: [mk("WR", 23, 75, { id: "in-wr" }), pick(2027, 1)],
      leagueContext: SF,
    });
    // Invariants: a flagged shift requires a real margin over the old identity's
    // post-trade fit; a leaning is only reported when the flag did NOT fire.
    if (impact.archetypeChanged) {
      const oldIdentityAfter = impact.after.matches.find((m) => m.id === impact.before.top.id);
      assert.ok(impact.after.top.fit - (oldIdentityAfter?.fit ?? 0) >= 5);
      assert.equal(impact.leaningToward, null);
    }
    if (impact.leaningToward) {
      assert.equal(impact.archetypeChanged, false);
      assert.notEqual(impact.leaningToward.id, impact.before.top.id);
    }
  });
});

describe("compareBuildFit", () => {
  it("tilts toward the side whose blueprint fit improves more", () => {
    const r = compareBuildFit({ fitDelta: 6 }, { fitDelta: -2 });
    assert.equal(r.tilt, "A");
    assert.equal(r.strength, "strong");
    assert.ok(r.lean > 0 && r.lean <= 1);

    const mirrored = compareBuildFit({ fitDelta: -2 }, { fitDelta: 6 });
    assert.equal(mirrored.tilt, "B");
    assert.equal(mirrored.lean, -r.lean, "lean must be symmetric");
  });

  it("reads near-equal fit changes as even", () => {
    const r = compareBuildFit({ fitDelta: 3 }, { fitDelta: 2 });
    assert.equal(r.tilt, "even");
    assert.equal(r.strength, "even");
  });

  it("clamps lean to [-1, 1] and handles missing sides", () => {
    assert.equal(compareBuildFit({ fitDelta: 40 }, { fitDelta: -40 }).lean, 1);
    assert.equal(compareBuildFit(null, null), null);
    const oneSided = compareBuildFit({ fitDelta: 5 }, null);
    assert.equal(oneSided.deltaB, 0);
    assert.equal(oneSided.tilt, "A");
  });
});

describe("phase adjustment — NFL backup QB penalty", () => {
  it("a contender pays a real penalty for acquiring a backup QB; a rebuild does not", () => {
    // Producing RB out, backup QB in — market values nearly even.
    const rb = mk("RB", 21, 68, { id: "prod-rb", fantasyCalcValue: 1300, ppg: 6 });
    const backupQb = mk("QB", 27, 57, {
      id: "backup-qb",
      fantasyCalcValue: 1100,
      ppg: 12,
      depthOrder: 2,
      depthOrderKnown: true,
      team: "SF",
    });
    const market = new Map([["prod-rb", rb], ["backup-qb", backupQb]]);
    const lc = { isSuperflex: true, tePremium: false };
    const asContender = evaluateTrade([rb], [backupQb], "contender", "rebuild", market, lc, null);
    const asRebuild = evaluateTrade([rb], [backupQb], "rebuild", "rebuild", market, lc, null);
    // Same assets, same market — the contender's net must be strictly worse.
    assert.ok(
      asContender.teamA.netValue <= asRebuild.teamA.netValue - 6,
      `contender net ${asContender.teamA.netValue} should trail rebuild net ${asRebuild.teamA.netValue} by ≥6`,
    );
    assert.equal(asContender.teamA.verdict, "overpay");
  });
});

describe("classifyMoveType", () => {
  it("labels a 2-for-1 best-player upgrade as depth consolidation", () => {
    const shape = classifyMoveType({
      outgoing: [mk("WR", 25, 60), mk("RB", 24, 50)],
      incoming: [mk("WR", 25, 80)],
    });
    assert.equal(shape.id, "twoForOne");
  });

  it("labels youth-out-for-vet-in as a win-now push", () => {
    const shape = classifyMoveType({
      outgoing: [mk("WR", 22, 55)],
      incoming: [mk("RB", 27, 70, { archetype: "Productive Vet" })],
    });
    assert.equal(shape.id, "winNowPush");
  });

  it("labels youth + pick for a producing vet as a pick-for-vet cash-in", () => {
    const shape = classifyMoveType({
      outgoing: [mk("WR", 22, 55), pick(2027, 1)],
      incoming: [mk("RB", 27, 70, { archetype: "Productive Vet" })],
    });
    assert.equal(shape.id, "pickForVet");
  });

  it("reads a same-tier 1-for-1 as a lateral pivot", () => {
    const shape = classifyMoveType({
      outgoing: [mk("WR", 24, 70)],
      incoming: [mk("RB", 24, 70)],
    });
    assert.equal(shape.id, "lateralPivot");
  });
});
