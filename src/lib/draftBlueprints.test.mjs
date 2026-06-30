/**
 * Unit tests for draftBlueprints.js
 * Run with: npm test (Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DRAFT_BLUEPRINTS,
  BLUEPRINT_LIST,
  posWeightsForRound,
  blueprintAvailable,
  availableBlueprints,
  ageFitScore,
  classifyDraftBlueprint,
  recommendNextPick,
  trackAdherence,
  detectBlueprintFromPicks,
  projectPickImpact,
  adherenceTrajectory,
  projectLeagueOutlook,
  forwardValue,
  simulateExampleDraft,
  availabilityOrder,
  simulateMockDraft,
  formatTags,
  reshapeForFormat,
  isUnsigned,
} from "./draftBlueprints.js";

const SF = { isSuperflex: true, tePremium: false, starterCounts: { QB: 1, RB: 2, WR: 3, TE: 1 }, flexCount: 2 };
const ONE_QB = { isSuperflex: false, tePremium: false, starterCounts: { QB: 1, RB: 2, WR: 3, TE: 1 }, flexCount: 2 };

// Build an enriched-ish player.
const mk = (position, age, value, extra = {}) => ({
  id: `${position}-${age}-${value}`,
  name: `${position} ${value}`,
  position,
  age,
  yearsExp: extra.yearsExp ?? Math.max(0, age - 22),
  dynastyValue: { value },
  archetype: extra.archetype,
  peakPctile: extra.peakPctile ?? value,
  currentPctile: extra.currentPctile ?? value,
  ...extra,
});

// Build a snapshot shell from a flat player list.
function snapFrom(players, overrides = {}) {
  const byPos = { QB: [], RB: [], WR: [], TE: [] };
  for (const p of players) byPos[p.position]?.push(p);
  for (const k of Object.keys(byPos)) byPos[k].sort((a, b) => b.dynastyValue.value - a.dynastyValue.value);
  const total = players.length || 1;
  const pct = (pos) => Math.round((byPos[pos].length / total) * 100);
  const avgAge = players.reduce((a, p) => a + p.age, 0) / total;
  const ideal = { QB: 18, RB: 35, WR: 35, TE: 12 };
  const proportions = {};
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    proportions[pos] = { actual: pct(pos), ideal: ideal[pos], delta: pct(pos) - ideal[pos] };
  }
  return {
    enriched: players,
    byPos,
    proportions,
    avgAge: avgAge.toFixed(1),
    avgScore: players.reduce((a, p) => a + p.dynastyValue.value, 0) / total,
    needs: [],
    ...overrides,
  };
}

describe("config + helpers", () => {
  it("has 8 blueprints, each with required fields", () => {
    assert.equal(BLUEPRINT_LIST.length, 8);
    for (const b of BLUEPRINT_LIST) {
      assert.ok(b.id && b.label && b.posPriorityByRound?.length && b.classifyWeights);
      assert.ok(typeof b.targetAvgAge === "number" && Array.isArray(b.ageWindow));
    }
  });

  it("posWeightsForRound picks the right round band", () => {
    const z = DRAFT_BLUEPRINTS.zeroRb;
    assert.equal(posWeightsForRound(z, 1).RB, 0); // locked out early
    assert.ok(posWeightsForRound(z, 9).RB > 0); // opens up late
  });

  it("gates superflex-only blueprints", () => {
    assert.equal(blueprintAvailable(DRAFT_BLUEPRINTS.eliteQbHammer, ONE_QB), false);
    assert.equal(blueprintAvailable(DRAFT_BLUEPRINTS.eliteQbHammer, SF), true);
    assert.ok(availableBlueprints(ONE_QB).every((b) => b.requires !== "superflex"));
    // 8 defined − Market Arbitrage (hidden) = 7 selectable in Superflex.
    assert.equal(availableBlueprints(SF).length, 7);
  });

  it("keeps Market Arbitrage logic but hides it from selection", () => {
    assert.ok(DRAFT_BLUEPRINTS.marketArbitrage, "config + logic retained");
    assert.equal(DRAFT_BLUEPRINTS.marketArbitrage.hidden, true);
    assert.ok(availableBlueprints(SF).every((b) => b.id !== "marketArbitrage"));
    assert.ok(availableBlueprints(ONE_QB).every((b) => b.id !== "marketArbitrage"));
  });

  it("ageFitScore is 1 inside the window and falls off outside", () => {
    assert.equal(ageFitScore(23, [21, 26]), 1);
    assert.equal(ageFitScore(31, [21, 26]), 0); // 5y past → 0
    assert.ok(ageFitScore(28, [21, 26]) > 0 && ageFitScore(28, [21, 26]) < 1);
  });
});

describe("classifyDraftBlueprint", () => {
  it("flags a young WR-heavy, no-RB roster as Productive Struggle or Anchor WR", () => {
    const players = [
      mk("WR", 22, 90), mk("WR", 23, 82), mk("WR", 21, 78), mk("WR", 24, 70),
      mk("WR", 22, 60), mk("QB", 24, 75), mk("TE", 23, 55), mk("RB", 25, 30),
    ];
    const { top, matches } = classifyDraftBlueprint(snapFrom(players), ONE_QB);
    assert.ok(["productiveStruggle", "anchorWr"].includes(top.id), `got ${top.id}`);
    assert.ok(top.fit > 50);
    assert.ok(Array.isArray(top.signals) && top.signals.length > 0);
    assert.equal(matches.length, 6); // minus superflex-only + hidden Market Arbitrage
  });

  it("flags an RB-heavy veteran roster as Win-Now", () => {
    const players = [
      mk("RB", 26, 88), mk("RB", 27, 80), mk("WR", 29, 78), mk("WR", 28, 70),
      mk("QB", 30, 72), mk("TE", 29, 60),
    ];
    const { top } = classifyDraftBlueprint(snapFrom(players), ONE_QB);
    assert.equal(top.id, "winNow", `got ${top.id}`);
  });

  it("flags two elite QBs in superflex as Elite QB Hammer", () => {
    const players = [
      mk("QB", 25, 95, { archetype: "Cornerstone" }), mk("QB", 26, 90, { archetype: "Foundational" }),
      mk("WR", 24, 70), mk("RB", 25, 55), mk("TE", 27, 45),
    ];
    const { top } = classifyDraftBlueprint(snapFrom(players), SF);
    assert.equal(top.id, "eliteQbHammer", `got ${top.id}`);
  });

  it("marks an established roster as mature", () => {
    const players = Array.from({ length: 24 }, (_, i) =>
      mk(["QB", "RB", "WR", "TE"][i % 4], 27, 50, { yearsExp: 5 }),
    );
    const { isMature } = classifyDraftBlueprint(snapFrom(players), ONE_QB);
    assert.equal(isMature, true);
  });
});

describe("format tags + reshaping", () => {
  it("builds tags for superflex / PPR tiers / TE premium", () => {
    const t1 = formatTags({ isSuperflex: true, ppr: 1, tePremiumBonus: 0.5, passTd: 6 }).map((t) => t.label);
    assert.ok(t1.includes("Superflex"));
    assert.ok(t1.includes("PPR"));
    assert.ok(t1.includes("TE Premium +0.5"));
    assert.ok(t1.includes("6pt Pass TD"));
    const t2 = formatTags({ isSuperflex: false, ppr: 0.5, tePremiumBonus: 0 }).map((t) => t.label);
    assert.ok(t2.includes("1QB"));
    assert.ok(t2.includes("Half PPR"));
    assert.ok(t2.every((l) => !/TE Premium/.test(l)));
  });

  it("reshapeForFormat lifts TE value under TE premium and is a no-op otherwise", () => {
    const pool = [
      { id: "te", position: "TE", liveValue: 100, value: 100 },
      { id: "wr", position: "WR", liveValue: 100, value: 100 },
    ];
    const reshaped = reshapeForFormat(pool, { tePremiumBonus: 1 });
    assert.ok(reshaped.find((p) => p.id === "te").liveValue > 100);
    assert.equal(reshaped.find((p) => p.id === "wr").liveValue, 100);
    assert.deepEqual(reshapeForFormat(pool, { tePremiumBonus: 0 }), pool);
  });

  it("isUnsigned flags FA / empty team", () => {
    assert.equal(isUnsigned({ team: "" }), true);
    assert.equal(isUnsigned({ team: "FA" }), true);
    assert.equal(isUnsigned({ team: null }), true);
    assert.equal(isUnsigned({ team: "KC" }), false);
  });

  it("unsigned veterans are faded early and surface late", () => {
    const pool = [
      { id: "fa", name: "FA Vet", position: "RB", age: 28, team: "FA", liveValue: 130, dynastyValue: { value: 120 } },
      { id: "rb", name: "Signed RB", position: "RB", age: 24, team: "ATL", liveValue: 90, dynastyValue: { value: 90 } },
    ];
    const early = recommendNextPick({ blueprint: DRAFT_BLUEPRINTS.winNow, round: 2, pool, myRoster: [] });
    const late = recommendNextPick({ blueprint: DRAFT_BLUEPRINTS.winNow, round: 14, pool, myRoster: [] });
    // Early: the signed RB outranks the higher-value FA. Late: the FA gamble is fine.
    assert.equal(early[0].player.id, "rb", `early top ${early[0].player.id}`);
    assert.ok(early.find((r) => r.player.id === "fa").reasons.some((s) => /Unsigned/.test(s)));
    assert.equal(late[0].player.id, "fa", `late top ${late[0].player.id}`);
  });
});

describe("recommendNextPick", () => {
  const pool = [
    mk("RB", 23, 95), // elite RB
    mk("WR", 22, 88),
    mk("WR", 24, 80),
    mk("QB", 25, 78),
    mk("TE", 26, 60),
    mk("RB", 28, 70),
  ];

  it("Zero-RB suppresses RBs in early rounds", () => {
    const recs = recommendNextPick({ blueprint: DRAFT_BLUEPRINTS.zeroRb, round: 2, pool, myRoster: [] });
    assert.notEqual(recs[0].player.position, "RB", `top was ${recs[0].player.position}`);
    const rbRec = recs.find((r) => r.player.position === "RB");
    if (rbRec) assert.ok(rbRec.reasons.some((s) => /No RB before/.test(s)));
  });

  it("Elite QB Hammer boosts a QB toward the top early when none rostered", () => {
    const recs = recommendNextPick({ blueprint: DRAFT_BLUEPRINTS.eliteQbHammer, round: 1, pool, myRoster: [] });
    const qbRank = recs.findIndex((r) => r.player.position === "QB");
    assert.ok(qbRank <= 1, `QB ranked ${qbRank}`);
  });

  it("strict mode reorders vs blended (plan over raw value)", () => {
    const blended = recommendNextPick({ blueprint: DRAFT_BLUEPRINTS.anchorWr, round: 1, pool, myRoster: [] });
    const strict = recommendNextPick({ blueprint: DRAFT_BLUEPRINTS.anchorWr, round: 1, pool, myRoster: [], opts: { strict: true } });
    // Anchor WR round 1 weights WR heavily; strict should put a WR first even though an RB has higher raw value.
    assert.equal(strict[0].player.position, "WR", `strict top ${strict[0].player.position}`);
    assert.ok(blended.length === strict.length);
  });

  it("Hero RB suppresses a second early RB once one is rostered", () => {
    const withAnchor = [mk("RB", 23, 92)];
    const recs = recommendNextPick({ blueprint: DRAFT_BLUEPRINTS.heroRb, round: 2, pool, myRoster: withAnchor, opts: { strict: true } });
    assert.notEqual(recs[0].player.position, "RB");
  });
});

describe("trackAdherence", () => {
  it("returns empty-but-valid with no picks", () => {
    const a = trackAdherence(DRAFT_BLUEPRINTS.anchorWr, []);
    assert.equal(a.overall, 0);
    assert.equal(a.onPlanPickPct, 0);
  });

  it("scores an on-plan young WR build highly", () => {
    const drafted = [
      { position: "WR", age: 22, round: 1, dynastyValue: { value: 90 } },
      { position: "WR", age: 23, round: 2, dynastyValue: { value: 80 } },
      { position: "WR", age: 21, round: 3, dynastyValue: { value: 70 } },
    ];
    const a = trackAdherence(DRAFT_BLUEPRINTS.anchorWr, drafted);
    assert.ok(a.overall >= 70, `overall ${a.overall}`);
    assert.equal(a.onPlanPickPct, 100);
    assert.ok(a.avgAge.ok);
  });

  it("detects the closest blueprint from picks-so-far (scale-free)", () => {
    // Two young WRs taken in rounds 1–2 with thousands-scale raw values.
    const drafted = [
      { position: "WR", age: 22, round: 1, value: 8200 },
      { position: "WR", age: 23, round: 2, value: 6100 },
    ];
    const { top, matches, pickCount } = detectBlueprintFromPicks(drafted, ONE_QB);
    assert.equal(pickCount, 2);
    assert.equal(matches.length, 6); // minus superflex-only + hidden Market Arbitrage
    assert.ok(["anchorWr", "productiveStruggle"].includes(top.id), `got ${top.id}`);
    assert.ok(top.fit > 0);
  });

  it("detects Elite QB Hammer when two QBs are taken early in superflex", () => {
    const drafted = [
      { position: "QB", age: 25, round: 1, value: 9000 },
      { position: "QB", age: 26, round: 2, value: 8000 },
    ];
    const { top } = detectBlueprintFromPicks(drafted, SF);
    assert.equal(top.id, "eliteQbHammer", `got ${top.id}`);
  });

  it("flags age + capital deviations for an off-plan build", () => {
    const drafted = [
      { position: "RB", age: 29, round: 1, dynastyValue: { value: 85 } },
      { position: "RB", age: 30, round: 2, dynastyValue: { value: 75 } },
    ];
    const a = trackAdherence(DRAFT_BLUEPRINTS.anchorWr, drafted); // anchorWr wants young WRs
    assert.ok(a.overall < 50, `overall ${a.overall}`);
    assert.ok(a.deviations.length > 0);
  });
});

describe("projectPickImpact (stress test)", () => {
  // A realistic in-progress Anchor-WR build: 3 young WRs taken, now on round 4.
  const inProgress = [
    { position: "WR", age: 22, round: 1, value: 8000 },
    { position: "WR", age: 23, round: 2, value: 6500 },
    { position: "WR", age: 21, round: 3, value: 5200 },
  ];

  it("an on-plan young WR raises the match; an off-plan old RB lowers it", () => {
    const bp = DRAFT_BLUEPRINTS.anchorWr;
    const onPlan = projectPickImpact(bp, inProgress, { position: "WR", age: 22, round: 4, value: 4800 });
    const offPlan = projectPickImpact(bp, inProgress, { position: "RB", age: 30, round: 4, value: 4800 });
    assert.ok(onPlan.delta >= 0, `on-plan delta ${onPlan.delta}`);
    assert.ok(offPlan.delta < onPlan.delta, `off-plan ${offPlan.delta} should trail on-plan ${onPlan.delta}`);
    assert.ok(onPlan.after >= 0 && onPlan.after <= 100);
  });

  it("never throws and stays bounded across every blueprint + position + round", () => {
    for (const bp of BLUEPRINT_LIST) {
      for (const pos of ["QB", "RB", "WR", "TE"]) {
        for (const round of [1, 4, 8, 12]) {
          const imp = projectPickImpact(bp, inProgress, { position: pos, age: 24, round, value: 5000 });
          assert.ok(imp.after >= 0 && imp.after <= 100, `${bp.id}/${pos}/r${round} after=${imp.after}`);
          assert.ok(Number.isFinite(imp.delta));
        }
      }
    }
  });

  it("handles the very first pick (no prior picks) without dividing by zero", () => {
    const imp = projectPickImpact(DRAFT_BLUEPRINTS.zeroRb, [], { position: "WR", age: 22, round: 1, value: 9000 });
    assert.ok(Number.isFinite(imp.after) && imp.after >= 0);
  });

  it("a perfectly on-plan sequence trends the trajectory upward", () => {
    const seq = [
      { position: "WR", age: 22, round: 1, value: 9000 },
      { position: "WR", age: 22, round: 2, value: 7000 },
      { position: "WR", age: 23, round: 3, value: 6000 },
      { position: "WR", age: 22, round: 4, value: 5000 },
    ];
    const traj = adherenceTrajectory(DRAFT_BLUEPRINTS.anchorWr, seq);
    assert.equal(traj.length, 4);
    assert.ok(traj[traj.length - 1] >= traj[0], `traj ${JSON.stringify(traj)}`);
    assert.ok(traj.every((v) => v >= 0 && v <= 100));
  });
});

describe("forwardValue + projectLeagueOutlook", () => {
  it("discounts aging players below young ones at equal raw value", () => {
    const young = forwardValue("RB", 23, 1000);
    const old = forwardValue("RB", 30, 1000);
    assert.ok(young > old, `${young} should beat ${old}`);
    assert.ok(old >= 400 && young <= 1100);
  });

  const mkTeam = (rosterId, label, isMe, roster) => ({ rosterId, label, isMe, roster });
  const poolP = (id, position, age, liveValue) => ({ id, position, age, liveValue, dynastyValue: { value: Math.min(130, liveValue / 60) } });

  it("ranks teams by projected forward strength, every team placed once", () => {
    const teams = [
      mkTeam(1, "Me", true, [{ position: "WR", age: 22, value: 6000 }]),
      mkTeam(2, "Vets", false, [{ position: "RB", age: 30, value: 6500 }]),
      mkTeam(3, "Mixed", false, [{ position: "TE", age: 26, value: 4000 }]),
    ];
    const pool = [
      poolP("a", "WR", 22, 5000), poolP("b", "WR", 23, 4500),
      poolP("c", "RB", 28, 4000), poolP("d", "QB", 25, 3500),
      poolP("e", "TE", 24, 3000), poolP("f", "WR", 21, 2500),
    ];
    const out = projectLeagueOutlook({ teams, pool, blueprint: DRAFT_BLUEPRINTS.anchorWr, totalRounds: 3, fromRound: 2 });
    assert.equal(out.length, 3);
    assert.deepEqual([...new Set(out.map((t) => t.projRank))].sort(), [1, 2, 3]);
    out.forEach((t) => assert.ok(t.proj >= t.now)); // future picks only add value
    assert.ok(out.some((t) => t.isMe));
  });

  it("following the plan changes my projected finish vs a best-available baseline", () => {
    const teams = [
      mkTeam(1, "Me", true, [{ position: "RB", age: 23, value: 7000 }]),
      mkTeam(2, "B", false, [{ position: "WR", age: 24, value: 6000 }]),
    ];
    // Aging RB barely outranks a young WR by raw value — so best-available grabs the RB,
    // but Hero RB (anchor already secured) steers my pick to the young WR.
    const pool = [
      poolP("a", "RB", 29, 5200), poolP("b", "WR", 22, 5000), poolP("c", "WR", 23, 4800), poolP("d", "TE", 24, 3000),
    ];
    const withPlan = projectLeagueOutlook({ teams, pool, blueprint: DRAFT_BLUEPRINTS.heroRb, totalRounds: 2, fromRound: 2 });
    const baseline = projectLeagueOutlook({ teams, pool, blueprint: DRAFT_BLUEPRINTS.heroRb, totalRounds: 2, fromRound: 2, baseline: true });
    const mePlan = withPlan.find((t) => t.isMe);
    const meBase = baseline.find((t) => t.isMe);
    // Hero RB suppresses a 2nd RB, so the plan takes the young WR over the elite aging RB —
    // a different (more future-proof) projected roster than raw best-available.
    assert.ok(mePlan.proj !== meBase.proj, `plan ${mePlan.proj} vs base ${meBase.proj}`);
  });

  it("no future rounds left → projection equals current strength", () => {
    const teams = [mkTeam(1, "Me", true, [{ position: "WR", age: 22, value: 5000 }])];
    const out = projectLeagueOutlook({ teams, pool: [], blueprint: DRAFT_BLUEPRINTS.anchorWr, totalRounds: 1, fromRound: 5 });
    assert.equal(out[0].now, out[0].proj);
  });

  it("ownership-aware: a team with no remaining picks doesn't gain projected value", () => {
    const teams = [
      mkTeam(1, "Me", true, [{ position: "WR", age: 22, value: 6000 }]),
      mkTeam(2, "Trader", false, [{ position: "RB", age: 24, value: 6000 }]),
    ];
    const pool = [
      poolP("a", "WR", 22, 5000), poolP("b", "WR", 23, 4500), poolP("c", "RB", 25, 4000), poolP("d", "TE", 24, 3000),
    ];
    // Team 2 traded all their picks; only I (roster 1) pick the rest of the way.
    const remainingPicks = [
      { round: 2, rosterId: 1 }, { round: 3, rosterId: 1 }, { round: 4, rosterId: 1 },
    ];
    const out = projectLeagueOutlook({ teams, pool, blueprint: DRAFT_BLUEPRINTS.anchorWr, remainingPicks });
    const trader = out.find((t) => t.rosterId === 2);
    const me = out.find((t) => t.isMe);
    assert.equal(trader.now, trader.proj, "trader with no picks shouldn't grow");
    assert.ok(me.proj > me.now, "I keep drafting, so I grow");
  });
});

describe("simulateExampleDraft", () => {
  // A deep value-ranked pool: alternating positions so availability matters.
  const bigPool = [];
  let v = 9000;
  for (let i = 0; i < 120; i++) {
    const pos = ["WR", "RB", "QB", "TE", "WR", "RB"][i % 6];
    bigPool.push({ id: "p" + i, name: pos + i, position: pos, age: 22 + (i % 8), liveValue: v, dynastyValue: { value: Math.min(130, v / 70) } });
    v -= 70;
  }

  it("returns one pick per round from a clean slot, never reusing a player", () => {
    const { picks } = simulateExampleDraft({ blueprint: DRAFT_BLUEPRINTS.anchorWr, pool: bigPool, slot: 5, numTeams: 12, rounds: 8 });
    assert.equal(picks.length, 8);
    assert.deepEqual(picks.map((p) => p.round), [1, 2, 3, 4, 5, 6, 7, 8]);
    const ids = picks.map((p) => p.player.id);
    assert.equal(new Set(ids).size, ids.length, "no player drafted twice");
    picks.forEach((p) => assert.equal(p.made, false));
  });

  it("an Anchor WR example skews heavily to WR in the early rounds", () => {
    const { picks } = simulateExampleDraft({ blueprint: DRAFT_BLUEPRINTS.anchorWr, pool: bigPool, slot: 1, numTeams: 12, rounds: 8 });
    const earlyWr = picks.slice(0, 6).filter((p) => p.player.position === "WR").length;
    assert.ok(earlyWr >= 4, `expected ≥4 early WR, got ${earlyWr}`);
  });

  it("a Zero RB example takes no RB before round 8", () => {
    const { picks } = simulateExampleDraft({ blueprint: DRAFT_BLUEPRINTS.zeroRb, pool: bigPool, slot: 6, numTeams: 12, rounds: 10 });
    const earlyRb = picks.filter((p) => p.round < 8 && p.player.position === "RB");
    assert.equal(earlyRb.length, 0, `early RBs: ${earlyRb.map((p) => p.round)}`);
  });

  it("continues an in-progress draft: prior picks marked made, remainder projected", () => {
    const made = [
      { name: "My WR", position: "WR", age: 22, round: 1, value: 8000 },
      { name: "My WR2", position: "WR", age: 23, round: 2, value: 6500 },
    ];
    const { picks } = simulateExampleDraft({
      blueprint: DRAFT_BLUEPRINTS.anchorWr, pool: bigPool, slot: 3, numTeams: 12, rounds: 6, fromRound: 3, myDrafted: made,
    });
    const madePicks = picks.filter((p) => p.made);
    assert.equal(madePicks.length, 2);
    assert.ok(picks.some((p) => !p.made && p.round >= 3));
    assert.equal(picks[0].round, 1); // made picks lead, chronological
  });

  it("returns empty when required inputs are missing", () => {
    assert.deepEqual(simulateExampleDraft({ blueprint: DRAFT_BLUEPRINTS.zeroRb, pool: bigPool }).picks, []);
  });

  it("ownership-aware: only projects picks I actually own", () => {
    // I own rounds 4 and 6 only; rounds 5,7,8 belong to others (traded away).
    const remainingPicks = [
      { round: 4, mine: true },
      { round: 5, mine: false },
      { round: 6, mine: true },
      { round: 7, mine: false },
      { round: 8, mine: false },
    ];
    const myDrafted = [
      { name: "R1 WR", position: "WR", age: 22, round: 1, value: 8000 },
      { name: "R2 WR", position: "WR", age: 23, round: 2, value: 6500 },
      { name: "R3 RB", position: "RB", age: 24, round: 3, value: 5000 },
    ];
    const { picks, complete } = simulateExampleDraft({ blueprint: DRAFT_BLUEPRINTS.anchorWr, pool: bigPool, remainingPicks, myDrafted });
    assert.equal(complete, false);
    const projected = picks.filter((p) => !p.made);
    assert.deepEqual(projected.map((p) => p.round), [4, 6]); // not 5/7/8 — those aren't mine
    assert.equal(picks.filter((p) => p.made).length, 3);
  });

  it("traded away all remaining picks → team complete, only made picks shown", () => {
    const remainingPicks = [
      { round: 11, mine: false },
      { round: 12, mine: false },
    ];
    const myDrafted = [
      { name: "WR1", position: "WR", age: 22, round: 1, value: 8000 },
      { name: "RB1", position: "RB", age: 23, round: 2, value: 6000 },
    ];
    const { picks, complete } = simulateExampleDraft({ blueprint: DRAFT_BLUEPRINTS.heroRb, pool: bigPool, remainingPicks, myDrafted });
    assert.equal(complete, true);
    assert.equal(picks.every((p) => p.made), true);
    assert.equal(picks.length, 2);
  });
});

describe("availabilityOrder (ADP-aware)", () => {
  it("drafts by adpRank when present, value only as tiebreak fallback", () => {
    const pool = [
      { id: "hi-val", position: "WR", age: 24, liveValue: 9000, adpRank: 30 },
      { id: "hi-adp", position: "RB", age: 23, liveValue: 5000, adpRank: 3 },
      { id: "no-adp", position: "TE", age: 25, liveValue: 8000 },
    ];
    const order = availabilityOrder(pool).map((p) => p.id);
    // adp-ranked come first by rank; the un-ranked (even high value) falls last.
    assert.deepEqual(order, ["hi-adp", "hi-val", "no-adp"]);
  });

  it("falls back to pure value-rank when no ADP anywhere", () => {
    const pool = [
      { id: "a", position: "WR", age: 24, liveValue: 4000 },
      { id: "b", position: "RB", age: 23, liveValue: 7000 },
    ];
    assert.deepEqual(availabilityOrder(pool).map((p) => p.id), ["b", "a"]);
  });

  it("simulateMockDraft fills the whole board with my slot on-plan", () => {
    const pool = [];
    for (let i = 0; i < 200; i++) {
      pool.push({ id: "p" + i, name: "P" + i, position: ["WR", "RB", "QB", "TE"][i % 4], age: 22 + (i % 8), liveValue: 9000 - i * 40, adpRank: i + 1 });
    }
    const { board, myRoster } = simulateMockDraft({ blueprint: DRAFT_BLUEPRINTS.zeroRb, pool, slot: 4, numTeams: 12, rounds: 10 });
    assert.equal(board.length, 120); // 12 * 10
    assert.equal(myRoster.length, 10); // one per round at my slot
    // No player appears twice on the board.
    const ids = board.map((c) => c.player.id);
    assert.equal(new Set(ids).size, ids.length);
    // Zero RB: my early picks (rounds < 8) are never RB.
    const myEarlyRb = board.filter((c) => c.mine && c.round < 8 && c.player.position === "RB");
    assert.equal(myEarlyRb.length, 0);
    // Snake: my round-1 pick is at slot 4; round-2 (reversed) also resolves to slot 4.
    assert.ok(board.filter((c) => c.mine).every((c) => c.slot === 4));
  });

  it("roster-need: a WR-heavy plan in Superflex still drafts QBs (no 16-WR roster)", () => {
    const pool = [];
    for (let i = 0; i < 240; i++) {
      pool.push({ id: "p" + i, name: "P" + i, position: ["WR", "RB", "QB", "TE"][i % 4], age: 22 + (i % 6), liveValue: 9000 - i * 30, adpRank: i + 1 });
    }
    const sfCtx = { isSuperflex: true, starterCounts: { QB: 1, RB: 2, WR: 3, TE: 1 }, flexCount: 2 };
    const { myRoster } = simulateMockDraft({
      blueprint: DRAFT_BLUEPRINTS.productiveStruggle, pool, slot: 1, numTeams: 12, rounds: 16, leagueContext: sfCtx,
    });
    const qbs = myRoster.filter((p) => p.position === "QB").length;
    const wrs = myRoster.filter((p) => p.position === "WR").length;
    assert.ok(qbs >= 2, `expected ≥2 QBs in superflex, got ${qbs}`);
    assert.ok(wrs < 16, `WR should not consume the whole roster, got ${wrs}`);
  });

  it("an example build respects ADP — an early-ADP player is gone by later picks", () => {
    const pool = [];
    for (let i = 0; i < 60; i++) {
      pool.push({ id: "p" + i, name: "P" + i, position: ["WR", "RB", "QB", "TE"][i % 4], age: 23, liveValue: 1000, adpRank: i + 1 });
    }
    const { picks } = simulateExampleDraft({ blueprint: DRAFT_BLUEPRINTS.balanced, pool, slot: 1, numTeams: 12, rounds: 3 });
    // Slot 1 round 1 should land an early-ADP player (rank ≤ a few), never a rank-50 guy.
    assert.ok(picks[0].player.adpRank <= 6, `r1 adpRank ${picks[0].player.adpRank}`);
  });
});
