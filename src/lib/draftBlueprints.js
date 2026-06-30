// Draft Blueprint — startup-draft strategy layer. Pure logic, no UI.
//
// Three jobs:
//   1. classifyDraftBlueprint(snapshot, leagueContext) — which of the 8 archetypes
//      does a (finished or in-progress) roster most resemble?
//   2. recommendNextPick({...}) — given a chosen target archetype + the live draft
//      round + the undrafted pool, who should I take next to stay on plan?
//   3. trackAdherence(blueprint, myDrafted) — how well am I sticking to the plan?
//
// We deliberately reuse values already computed upstream: enriched players carry
// `dynastyValue.value` (market-anchored, forward-tilted) and `proportions` come from
// buildRosterSnapshot. We don't re-derive any of that here.

import { AGE_CURVES_FALLBACK } from "./scoringEngine.js";

const POSITIONS = ["QB", "RB", "WR", "TE"];

// ── tiny helpers ─────────────────────────────────────────────────────────────
const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const stdev = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
};
// A player's forward value (1–130), with graceful fallbacks to score/market/raw
// value (live draft picks carry a flat `.value`, not the full dynastyValue object).
const pVal = (p) =>
  num(p?.dynastyValue?.value, num(p?.marketValue, num(p?.score, num(p?.value, 0))));

// Order a pool the way a startup draft actually comes off the board. When players
// carry a real `adpRank` (community ADP), draft by that; players without ADP
// (deep/irrelevant, not in the feed) fall in after, ordered by value. With no ADP
// anywhere this degrades to pure value-rank — the proxy used before ADP shipped.
export function availabilityOrder(pool = []) {
  const valid = pool.filter((p) => p && POSITIONS.includes(p.position));
  const ranked = valid
    .filter((p) => Number.isFinite(p?.adpRank))
    .sort((a, b) => a.adpRank - b.adpRank);
  const unranked = valid
    .filter((p) => !Number.isFinite(p?.adpRank))
    .sort((a, b) => num(b.liveValue) - num(a.liveValue));
  return [...ranked, ...unranked];
}

// ── Blueprint config ─────────────────────────────────────────────────────────
// posPriorityByRound: ordered ranges; first one where `round <= upto` wins.
// weights are relative positional priority for that round band (≈ sum to 1).
// classifyWeights: which named signals (see computeSignals) define a roster match.

export const DRAFT_BLUEPRINTS = {
  productiveStruggle: {
    id: "productiveStruggle",
    label: "Productive Struggle",
    tagline: "Year-1 punt — youngest roster, max WR, no early RB",
    color: "#7fff7f",
    requires: null,
    targetAvgAge: 24.0,
    ageWindow: [21, 26],
    posPriorityByRound: [
      { upto: 3, weights: { WR: 0.6, QB: 0.25, TE: 0.15, RB: 0.0 } },
      { upto: 8, weights: { WR: 0.55, QB: 0.15, TE: 0.15, RB: 0.15 } },
      { upto: 99, weights: { WR: 0.45, RB: 0.3, TE: 0.12, QB: 0.13 } },
    ],
    assetRules: { earlyRbCapPct: 0, preferYoung: true, maxAgeHardStop: 28 },
    classifyWeights: { youngAge: 0.35, wrProportion: 0.3, lowEarlyRb: 0.25, rbProportionLow: 0.1 },
  },

  winNow: {
    id: "winNow",
    label: "Win-Now (Veteran Zig-Zag)",
    tagline: "Peak-age vets, RB-heavy early — win the title in year 1",
    color: "#ff9800",
    requires: null,
    targetAvgAge: 27.5,
    ageWindow: [24, 30],
    posPriorityByRound: [
      { upto: 3, weights: { RB: 0.45, WR: 0.35, QB: 0.15, TE: 0.05 } },
      { upto: 8, weights: { RB: 0.3, WR: 0.4, QB: 0.15, TE: 0.15 } },
      { upto: 99, weights: { WR: 0.35, RB: 0.3, TE: 0.2, QB: 0.15 } },
    ],
    assetRules: { preferYoung: false, maxAgeHardStop: 33 },
    classifyWeights: { winNowAge: 0.4, rbProportion: 0.25, eliteProductionNow: 0.2, veteranShare: 0.15 },
  },

  heroRb: {
    id: "heroRb",
    label: "Hero RB",
    tagline: "One elite young RB anchor, then pivot to young WRs",
    color: "#64b5f6",
    requires: null,
    targetAvgAge: 24.5,
    ageWindow: [21, 26],
    posPriorityByRound: [
      { upto: 2, weights: { RB: 0.55, WR: 0.35, QB: 0.1, TE: 0.0 } },
      { upto: 9, weights: { WR: 0.6, QB: 0.2, TE: 0.15, RB: 0.05 } },
      { upto: 99, weights: { WR: 0.45, RB: 0.25, TE: 0.15, QB: 0.15 } },
    ],
    assetRules: { heroRbCap: 1, heroRbRoundLimit: 9, preferYoung: true, maxAgeHardStop: 29 },
    classifyWeights: { rb1rb2Gap: 0.4, wrProportion: 0.25, youngAge: 0.2, oneEliteRb: 0.15 },
  },

  zeroRb: {
    id: "zeroRb",
    label: "Zero RB",
    tagline: "No RB until rounds 8–10; elite WR/QB/TE starters",
    color: "#c084fc",
    requires: null,
    targetAvgAge: 25.0,
    ageWindow: [21, 28],
    posPriorityByRound: [
      { upto: 7, weights: { WR: 0.5, QB: 0.28, TE: 0.22, RB: 0.0 } },
      { upto: 99, weights: { RB: 0.45, WR: 0.35, TE: 0.1, QB: 0.1 } },
    ],
    assetRules: { rbLockoutRound: 8, preferYoung: true, maxAgeHardStop: 30 },
    classifyWeights: { lowEarlyRb: 0.4, wrProportion: 0.25, qbTeStrength: 0.2, rbBenchShare: 0.15 },
  },

  eliteQbHammer: {
    id: "eliteQbHammer",
    label: "Elite QB Hammer",
    tagline: "Two elite QBs in the first three rounds (Superflex)",
    color: "#FFD700",
    requires: "superflex",
    targetAvgAge: 26.0,
    ageWindow: [22, 32],
    posPriorityByRound: [
      { upto: 3, weights: { QB: 0.6, WR: 0.25, RB: 0.1, TE: 0.05 } },
      { upto: 99, weights: { WR: 0.4, RB: 0.3, TE: 0.15, QB: 0.15 } },
    ],
    assetRules: { qbTargetCount: 2, qbByRound: 3, maxAgeHardStop: 34 },
    classifyWeights: { eliteQbCount: 0.5, qbProportion: 0.3, qbLongevity: 0.2 },
  },

  anchorWr: {
    id: "anchorWr",
    label: "Anchor WR (WR Avalanche)",
    tagline: "4–6 young WRs in the first 8 rounds",
    color: "#00f5a0",
    requires: null,
    targetAvgAge: 24.5,
    ageWindow: [21, 26],
    posPriorityByRound: [
      { upto: 8, weights: { WR: 0.7, QB: 0.15, TE: 0.1, RB: 0.05 } },
      { upto: 99, weights: { RB: 0.4, WR: 0.25, TE: 0.2, QB: 0.15 } },
    ],
    assetRules: { wrEarlyTarget: 5, preferYoung: true, maxAgeHardStop: 28 },
    classifyWeights: { wrProportion: 0.45, wrDepth: 0.3, youngAge: 0.25 },
  },

  balanced: {
    id: "balanced",
    label: "Balanced (Value-Based)",
    tagline: "Best player available, no systemic holes",
    color: "#d9deef",
    requires: null,
    targetAvgAge: 25.5,
    ageWindow: [21, 30],
    posPriorityByRound: [
      { upto: 99, weights: { RB: 0.34, WR: 0.34, QB: 0.18, TE: 0.14 } },
    ],
    assetRules: { bestAvailable: true, maxAgeHardStop: 32 },
    classifyWeights: { lowVariance: 0.55, noHoles: 0.25, balancedAge: 0.2 },
  },

  marketArbitrage: {
    id: "marketArbitrage",
    label: "Market Arbitrage",
    tagline: "Buy depressed, volatile, high-upside assets to flip",
    color: "#ffd84d",
    requires: null,
    // Retired as a user-selectable option — logic is kept intact, but availableBlueprints()
    // filters `hidden` out so it never appears in selectors, auto-detect, or classification.
    hidden: true,
    targetAvgAge: 25.0,
    ageWindow: [20, 32],
    posPriorityByRound: [
      { upto: 99, weights: { WR: 0.35, RB: 0.3, QB: 0.2, TE: 0.15 } },
    ],
    assetRules: { favorVolatile: true, maxAgeHardStop: 33 },
    classifyWeights: { volatility: 0.5, valueSpread: 0.25, mixedAge: 0.25 },
  },
};

export const BLUEPRINT_LIST = Object.values(DRAFT_BLUEPRINTS);

// ── config helpers ───────────────────────────────────────────────────────────

export function posWeightsForRound(blueprint, round) {
  const r = num(round, 1);
  const ranges = blueprint?.posPriorityByRound || [];
  for (const range of ranges) {
    if (r <= range.upto) return range.weights;
  }
  return ranges.length ? ranges[ranges.length - 1].weights : {};
}

export function blueprintAvailable(blueprint, leagueContext) {
  if (!blueprint?.requires) return true;
  if (blueprint.requires === "superflex") return !!leagueContext?.isSuperflex;
  if (blueprint.requires === "tePremium") return !!leagueContext?.tePremium;
  return true;
}

export function availableBlueprints(leagueContext) {
  return BLUEPRINT_LIST.filter((b) => !b.hidden && blueprintAvailable(b, leagueContext));
}

// ── League-format tags + board reshaping ─────────────────────────────────────

// Human-readable format chips for the UI. These formats reshape a startup board:
// Superflex lifts QBs, PPR/Half-PPR lift pass-catchers, TE premium lifts TEs.
export function formatTags(leagueContext = {}) {
  const tags = [];
  tags.push({ key: "qb", label: leagueContext.isSuperflex ? "Superflex" : "1QB" });
  const ppr = num(leagueContext.ppr, 1);
  tags.push({
    key: "ppr",
    label: ppr >= 1 ? "PPR" : ppr >= 0.75 ? "0.75 PPR" : ppr >= 0.5 ? "Half PPR" : ppr > 0 ? "0.25 PPR" : "Standard",
  });
  const tep = num(leagueContext.tePremiumBonus, 0);
  if (tep > 0) tags.push({ key: "tep", label: `TE Premium +${tep % 1 === 0 ? tep : tep.toFixed(2).replace(/0+$/, "")}` });
  if (num(leagueContext.passTd, 4) >= 6) tags.push({ key: "passtd", label: "6pt Pass TD" });
  return tags;
}

// TE-premium reshape: FantasyCalc values already bake in PPR + Superflex (the
// board is fetched per numQbs/ppr), but NOT TE premium — so we lift TE value by the
// per-reception bonus (≈ +25% at a full +1.0 TEP). Pure; returns a new pool.
export function reshapeForFormat(pool = [], leagueContext = {}) {
  const tep = num(leagueContext.tePremiumBonus, 0);
  if (tep <= 0) return pool;
  const mult = 1 + Math.min(tep, 1) * 0.25;
  return pool.map((p) =>
    p?.position === "TE"
      ? { ...p, liveValue: num(p.liveValue ?? p.value) * mult, value: num(p.value ?? p.liveValue) * mult }
      : p,
  );
}

// A player with no NFL team (free agent / unsigned). Sleeper leaves team null/"" or
// occasionally "FA". These are situation-unknown gambles, not early-round picks.
export function isUnsigned(player) {
  const t = String(player?.team || "").toUpperCase();
  return t === "" || t === "FA" || t === "FA*" || t === "NONE";
}

// Unsigned players are dart throws: fade them hard early (role/landing-spot unknown)
// and only let them surface in the late rounds where a gamble is appropriate.
function unsignedMultiplier(player, round) {
  if (!isUnsigned(player)) return { mult: 1, reason: null };
  const r = num(round, 1);
  if (r <= 6) return { mult: 0.2, reason: "Unsigned — wait for a landing spot" };
  if (r <= 10) return { mult: 0.6, reason: "Unsigned — speculative" };
  return { mult: 1.05, reason: "Unsigned — late-round gamble" };
}

// Age fit: 1.0 inside the window, linear falloff to 0 at ±AGE_FALLOFF years.
const AGE_FALLOFF = 5;
export function ageFitScore(age, ageWindow) {
  if (!ageWindow) return 1;
  const a = num(age, 26);
  const [lo, hi] = ageWindow;
  if (a >= lo && a <= hi) return 1;
  const dist = a < lo ? lo - a : a - hi;
  return clamp(1 - dist / AGE_FALLOFF, 0, 1);
}

// ── Classifier ───────────────────────────────────────────────────────────────

// Normalized 0..1 roster signals that the per-blueprint classifyWeights reference.
function computeSignals(snapshot, leagueContext) {
  const prop = snapshot?.proportions || {};
  const byPos = snapshot?.byPos || {};
  const enriched = snapshot?.enriched || [];
  const avgAge = num(snapshot?.avgAge, 26);
  const avgScore = num(snapshot?.avgScore, 50);

  const propActual = (pos) => num(prop[pos]?.actual, 0);
  const rbList = (byPos.RB || []).slice().sort((a, b) => pVal(b) - pVal(a));
  const wrList = byPos.WR || [];
  const qbList = byPos.QB || [];
  const teList = byPos.TE || [];

  const total = enriched.length || 1;
  const eliteRb = rbList.filter((p) => pVal(p) >= 75);
  const rb0 = rbList[0] ? pVal(rbList[0]) : 0;
  const rb1 = rbList[1] ? pVal(rbList[1]) : 0;
  const rb1rb2Gap = rb0 >= 75 && rbList.length >= 1
    ? clamp(((rb0 - rb1) / Math.max(rb0, 1)) * 1.4 + (eliteRb.length === 1 ? 0.2 : 0), 0, 1)
    : 0;

  const eliteQb = qbList.filter(
    (p) => pVal(p) >= 88 || p.archetype === "Cornerstone" || p.archetype === "Foundational",
  );
  const veteranShare = enriched.filter((p) => num(p.age) >= 28).length / total;
  const youngShare = enriched.filter((p) => num(p.age) <= 24).length / total;

  const deltas = POSITIONS.map((pos) => Math.abs(num(prop[pos]?.delta, 0)));
  const variance = stdev(deltas);
  const maxDelta = deltas.length ? Math.max(...deltas) : 0;

  const volatileArch = new Set(["Upside Shot", "Short Term Production", "JAG - Developmental"]);
  const volatileShare =
    enriched.filter(
      (p) =>
        volatileArch.has(p.archetype) ||
        num(p.peakPctile) - num(p.currentPctile) >= 25,
    ).length / total;
  const valueSpread = stdev(enriched.map((p) => pVal(p)));

  return {
    youngAge: clamp((28 - avgAge) / (28 - 23), 0, 1),
    primeAge: clamp(1 - Math.abs(avgAge - 27) / 4, 0, 1),
    // Win-Now: reward the 25.5–30 veteran band (flat through it, falloff outside).
    winNowAge: clamp(1 - Math.max(0, 25.5 - avgAge) / 3 - Math.max(0, avgAge - 30) / 3, 0, 1),
    balancedAge: clamp(1 - Math.abs(avgAge - 25.5) / 5, 0, 1),
    mixedAge: clamp(1 - Math.abs(avgAge - 25) / 6, 0, 1),
    wrProportion: clamp((propActual("WR") - 30) / (48 - 30), 0, 1),
    rbProportion: clamp((propActual("RB") - 28) / (45 - 28), 0, 1),
    rbProportionLow: clamp((35 - propActual("RB")) / (35 - 18), 0, 1),
    qbProportion: clamp((propActual("QB") - 15) / (30 - 15), 0, 1),
    lowEarlyRb: clamp(1 - eliteRb.length * 0.45, 0, 1),
    rb1rb2Gap,
    oneEliteRb: eliteRb.length === 1 ? 1 : 0,
    eliteProductionNow: clamp((avgScore - 50) / (75 - 50), 0, 1),
    veteranShare: clamp(veteranShare / 0.35, 0, 1),
    eliteQbCount: eliteQb.length >= 2 ? 1 : eliteQb.length === 1 ? 0.4 : 0,
    qbLongevity: clamp(mean(qbList.map((p) => clamp((32 - num(p.age, 30)) / 10, 0, 1))), 0, 1),
    wrDepth: clamp(wrList.filter((p) => pVal(p) >= 60).length / 4, 0, 1),
    qbTeStrength: clamp(
      ((qbList[0] ? pVal(qbList[0]) : 0) + (teList[0] ? pVal(teList[0]) : 0)) / 180,
      0,
      1,
    ),
    rbBenchShare: clamp(rbList.filter((p) => pVal(p) < 50).length / 3, 0, 1),
    // Blend spread + worst single skew so any large positional hole/glut reads as un-balanced.
    lowVariance: clamp(1 - (variance + maxDelta) / 16, 0, 1),
    noHoles: clamp(1 - (snapshot?.needs?.length || 0) * 0.3, 0, 1),
    volatility: clamp(volatileShare / 0.4, 0, 1),
    valueSpread: clamp(valueSpread / 30, 0, 1),
    youngShare: clamp(youngShare / 0.5, 0, 1),
  };
}

// Human label for a signal key (for the signals[] surfaced in the UI).
const SIGNAL_LABEL = {
  youngAge: "Young roster",
  primeAge: "Prime-age core",
  winNowAge: "Win-now age window",
  balancedAge: "Balanced age",
  mixedAge: "Mixed age profile",
  wrProportion: "WR-heavy build",
  rbProportion: "RB capital invested",
  rbProportionLow: "Light at RB",
  qbProportion: "QB capital invested",
  lowEarlyRb: "Little early RB investment",
  rb1rb2Gap: "Clear RB1 / steep dropoff",
  oneEliteRb: "Single elite RB anchor",
  eliteProductionNow: "High current production",
  veteranShare: "Veteran-laden",
  eliteQbCount: "Two-plus elite QBs",
  qbLongevity: "Long QB runway",
  wrDepth: "Deep WR corps",
  qbTeStrength: "Strong QB/TE pillars",
  rbBenchShare: "RB depth on the bench",
  lowVariance: "Even positional strength",
  noHoles: "No roster holes",
  volatility: "High-variance assets",
  valueSpread: "Wide value spread",
  youngShare: "Many young players",
};

/**
 * Classify a roster snapshot against each (format-eligible) blueprint.
 * @returns {{ matches: Array<{id,label,color,tagline,fit,signals:string[]}>, top, isMature }}
 */
export function classifyDraftBlueprint(snapshot, leagueContext) {
  if (!snapshot) return { matches: [], top: null, isMature: false };
  const signals = computeSignals(snapshot, leagueContext);

  const sc = leagueContext?.starterCounts || {};
  const starterTotal =
    num(sc.QB) + num(sc.RB) + num(sc.WR) + num(sc.TE) + num(leagueContext?.flexCount) || 9;
  const enriched = snapshot.enriched || [];
  const vetShare = enriched.length
    ? enriched.filter((p) => num(p.yearsExp) >= 3).length / enriched.length
    : 0;
  const isMature = enriched.length >= starterTotal * 2.2 || vetShare > 0.6;

  const matches = availableBlueprints(leagueContext)
    .map((b) => {
      const weights = b.classifyWeights || {};
      const keys = Object.keys(weights);
      const wSum = keys.reduce((a, k) => a + weights[k], 0) || 1;
      const fitRaw = keys.reduce((a, k) => a + weights[k] * (signals[k] ?? 0), 0) / wSum;
      // Surface the strongest contributing signals (weighted value >= 0.12).
      const sigStrings = keys
        .map((k) => ({ k, contrib: weights[k] * (signals[k] ?? 0) }))
        .filter((x) => x.contrib >= 0.12)
        .sort((a, b2) => b2.contrib - a.contrib)
        .map((x) => SIGNAL_LABEL[x.k] || x.k);
      return {
        id: b.id,
        label: b.label,
        color: b.color,
        tagline: b.tagline,
        fit: Math.round(clamp(fitRaw, 0, 1) * 100),
        signals: sigStrings,
      };
    })
    .sort((a, b) => b.fit - a.fit);

  return { matches, top: matches[0] || null, isMature };
}

// ── Asset rules (recommender gates/boosts) ───────────────────────────────────

function rosterPosCount(myRoster, pos) {
  return (myRoster || []).filter((p) => p.position === pos).length;
}
function rosterEliteRbCount(myRoster) {
  return (myRoster || []).filter((p) => p.position === "RB" && pVal(p) >= 75).length;
}

// Returns a multiplier in [0.05, 1.2] expressing how the blueprint's hard rules
// treat this candidate at this round, plus reason strings explaining strong gates.
function applyAssetRules(blueprint, player, round, myRoster) {
  const rules = blueprint?.assetRules || {};
  const pos = player.position;
  const r = num(round, 1);
  let mult = 1;
  const reasons = [];

  if (rules.maxAgeHardStop && num(player.age) > rules.maxAgeHardStop) {
    mult *= 0.05;
    reasons.push(`Older than plan cap (${rules.maxAgeHardStop})`);
  }
  // Zero-RB style lockout.
  if (rules.rbLockoutRound && pos === "RB" && r < rules.rbLockoutRound) {
    mult *= 0.05;
    reasons.push(`No RB before round ${rules.rbLockoutRound}`);
  }
  // Productive Struggle: 0% early RB capital in rounds 1–3.
  if (rules.earlyRbCapPct === 0 && pos === "RB" && r <= 3) {
    mult *= 0.05;
    reasons.push("Punt RB early");
  }
  // Hero RB: once the single anchor is secured, suppress more early RBs.
  if (rules.heroRbCap != null && pos === "RB") {
    if (rosterPosCount(myRoster, "RB") >= rules.heroRbCap && r <= (rules.heroRbRoundLimit || 9)) {
      mult *= 0.3;
      reasons.push("Anchor RB already secured");
    } else if (rosterPosCount(myRoster, "RB") === 0 && r <= 2) {
      mult *= 1.2;
      reasons.push("Lock the RB anchor");
    }
  }
  // Elite QB Hammer: boost QBs until two are in, through the target round.
  if (rules.qbTargetCount && pos === "QB") {
    if (rosterPosCount(myRoster, "QB") < rules.qbTargetCount && r <= (rules.qbByRound || 3)) {
      mult *= 1.2;
      reasons.push("Secure your second elite QB");
    }
  }
  // Anchor WR: nudge early WRs until the target count is reached.
  if (rules.wrEarlyTarget && pos === "WR" && r <= 8) {
    if (rosterPosCount(myRoster, "WR") < rules.wrEarlyTarget) {
      mult *= 1.1;
      reasons.push("Build the WR avalanche");
    }
  }
  // Market Arbitrage: reward high-variance / depressed profiles.
  if (rules.favorVolatile) {
    const swing = num(player.peakPctile) - num(player.currentPctile);
    if (swing >= 20 || player.archetype === "Upside Shot" || player.archetype === "Short Term Production") {
      mult *= 1.15;
      reasons.push("Discounted / high-variance asset");
    }
  }

  return { mult: clamp(mult, 0.05, 1.2), reasons };
}

// ── Next-pick recommender ────────────────────────────────────────────────────

const STRICT_PLAN_WEIGHT = 0.95;
const BLENDED_PLAN_WEIGHT = 0.6;

// Minimum startable players per position for a league. In Superflex the SUPER_FLEX
// slot is effectively a second QB, so QB demand is 2.
function starterTargets(leagueContext) {
  const sf = !!leagueContext?.isSuperflex;
  const sc = leagueContext?.starterCounts || {};
  return {
    QB: sf ? 2 : Math.max(1, num(sc.QB, 1)),
    RB: Math.max(1, num(sc.RB, 2)),
    WR: Math.max(2, num(sc.WR, 2)),
    TE: Math.max(1, num(sc.TE, 1)),
  };
}

// Keep blueprints from hoarding one position to the point of an unstartable roster.
// Boosts a position while a mandatory starter is unfilled (only when the blueprint
// isn't actively punting it this round, so intentional punts survive), and decays a
// position once it's stocked well past what the lineup can use. Returns 1 (no-op)
// when no leagueContext is supplied, so callers that don't pass one are unaffected.
function rosterNeedMultiplier(pos, myRoster, leagueContext, posWeight) {
  if (!leagueContext) return { mult: 1, reason: null };
  const sf = !!leagueContext.isSuperflex;
  const flex = Math.max(0, num(leagueContext.flexCount, 1) - (sf ? 1 : 0)); // SF slot counted as QB
  const starters = starterTargets(leagueContext);
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of myRoster || []) if (counts[p.position] != null) counts[p.position] += 1;

  const c = counts[pos] || 0;
  const start = starters[pos] || 1;
  const benchBuffer = pos === "QB" ? (sf ? 1 : 1) : 2;
  const capacity = start + (pos === "QB" ? 0 : flex) + benchBuffer;

  let mult = 1;
  let reason = null;
  if (c < start && posWeight > 0) {
    // Strong enough to overcome a blueprint's positional weight gap as the deficit
    // grows — so mandatory starters (esp. a 2nd Superflex QB) actually get filled,
    // while a small/zero deficit barely nudges. The boost shrinks as the slot fills.
    mult *= 1 + (start - c) * (pos === "QB" ? 0.9 : 0.45);
    reason = `Fills a starting ${pos} need`;
  }
  if (c >= capacity) {
    mult *= Math.max(0.12, 1 - (c - capacity + 1) * 0.4);
    reason = `Already deep at ${pos}`;
  }
  return { mult, reason };
}

/**
 * Rank the undrafted pool for the chosen blueprint at the current round.
 * @param {object} args
 * @param {object} args.blueprint   a DRAFT_BLUEPRINTS entry
 * @param {number} args.round       current/next pick round
 * @param {object[]} args.pool      undrafted enriched players (Object.values(bestAvailableEnriched))
 * @param {object[]} args.myRoster  my drafted players (need {position, age, dynastyValue|value})
 * @param {object} [args.leagueContext] starterCounts/flex/superflex → roster-need awareness
 * @param {object} [args.opts]      { strict:boolean, limit:number }
 * @returns {Array<{player,planFit,valueScore,blended,reasons:string[]}>}
 */
export function recommendNextPick({ blueprint, round, pool, myRoster, leagueContext, opts } = {}) {
  if (!blueprint || !Array.isArray(pool)) return [];
  const planWeight = opts?.strict ? STRICT_PLAN_WEIGHT : BLENDED_PLAN_WEIGHT;
  const limit = opts?.limit ?? 25;
  const weights = posWeightsForRound(blueprint, round);

  const ranked = pool
    .filter((p) => p && POSITIONS.includes(p.position))
    .map((player) => {
      const posWeight = num(weights[player.position], 0);
      const ageFit = ageFitScore(player.age, blueprint.ageWindow);
      const { mult, reasons: ruleReasons } = applyAssetRules(blueprint, player, round, myRoster);
      const planFit = 100 * posWeight * ageFit * mult;

      const valueScore = pVal(player);
      const normValue = clamp((valueScore / 130) * 100, 0, 100);
      const { mult: needMult, reason: needReason } = rosterNeedMultiplier(player.position, myRoster, leagueContext, posWeight);
      const { mult: faMult, reason: faReason } = unsignedMultiplier(player, round);
      // Roster-need scales the whole score so we both fill mandatory starters and
      // stop hoarding a single position; the unsigned fade pushes FA gambles late.
      const blended = (planWeight * planFit + (1 - planWeight) * normValue) * needMult * faMult;

      const reasons = [];
      if (posWeight >= 0.3) reasons.push(`Round-${num(round, 1)} ${player.position} priority`);
      if (ageFit >= 0.999) reasons.push(`In target age ${blueprint.ageWindow[0]}–${blueprint.ageWindow[1]}`);
      else if (ageFit < 0.6) reasons.push("Outside target age band");
      reasons.push(...ruleReasons);
      if (needReason) reasons.push(needReason);
      if (faReason) reasons.push(faReason);
      if (normValue >= 80 && planFit < 40) reasons.push("Elite value falling to you");

      return { player, planFit: Math.round(planFit), valueScore: Math.round(valueScore), blended, reasons };
    })
    .sort((a, b) => b.blended - a.blended)
    .slice(0, limit);

  return ranked;
}

// ── Pick impact projection ───────────────────────────────────────────────────

/**
 * Project how a candidate pick moves your blueprint adherence — the "what does
 * this pick do to my plan" signal. Caller must pass `projectedPick` on the SAME
 * value scale as the existing picks (live raw value), so the value-share math
 * stays consistent.
 * @param {object} blueprint
 * @param {Array} myDrafted              picks so far ({position,age,round,value})
 * @param {object} projectedPick         the candidate as a pick ({position,age,round,value})
 * @returns {{ before:number, after:number, delta:number,
 *             ageBefore:number, ageAfter:number, onPlanBefore:number, onPlanAfter:number }}
 */
export function projectPickImpact(blueprint, myDrafted, projectedPick) {
  const before = trackAdherence(blueprint, myDrafted);
  const after = trackAdherence(blueprint, [...(myDrafted || []), projectedPick]);
  return {
    before: before.overall,
    after: after.overall,
    delta: after.overall - before.overall,
    ageBefore: before.avgAge.actual,
    ageAfter: after.avgAge.actual,
    onPlanBefore: before.onPlanPickPct,
    onPlanAfter: after.onPlanPickPct,
  };
}

/**
 * Match-trajectory: blueprint adherence after each successive pick, so the UI can
 * chart how the build has tracked the plan over time (and project the next pick).
 * @returns {number[]} overall match % after pick 1, 2, … n (chronological order).
 */
export function adherenceTrajectory(blueprint, myDrafted) {
  const picks = myDrafted || [];
  const out = [];
  for (let i = 1; i <= picks.length; i++) {
    out.push(trackAdherence(blueprint, picks.slice(0, i)).overall);
  }
  return out;
}

// ── League outlook: projected forward strength vs the field ──────────────────

// Discount a player's raw market value by where they sit on the age curve, so the
// comparison reflects multi-year (dynasty) strength rather than win-now value.
// Young/pre-peak players keep full value; aging players are discounted toward a floor.
function forwardMultiplier(pos, age) {
  const c = AGE_CURVES_FALLBACK[pos] || AGE_CURVES_FALLBACK.WR;
  const a = num(age, c.peak);
  if (a <= c.peak) return 1.1;
  if (a <= c.decline) return 1.1 - ((a - c.peak) / (c.decline - c.peak)) * 0.1; // 1.1 → 1.0
  if (a <= c.cliff) return 1.0 - ((a - c.decline) / (c.cliff - c.decline)) * 0.4; // 1.0 → 0.6
  return 0.4;
}

export function forwardValue(pos, age, rawValue) {
  return num(rawValue) * forwardMultiplier(pos, age);
}

// Build a full snake schedule of remaining picks {round, slot} from fromRound..rounds.
// Used as a fallback when the caller can't supply real (trade-adjusted) ownership.
function snakeSchedule(numTeams, rounds, fromRound = 1) {
  const out = [];
  for (let round = Math.max(1, fromRound); round <= rounds; round++) {
    for (let pos = 1; pos <= numTeams; pos++) {
      const slot = round % 2 === 0 ? numTeams - pos + 1 : pos; // even rounds reverse
      out.push({ round, slot });
    }
  }
  return out;
}

/**
 * Simulate the rest of the draft and rank every team by projected forward dynasty
 * strength. My team drafts on-plan (via recommendNextPick); the field takes best
 * value available. A greedy, transparent projection — directional, not exact.
 *
 * Ownership-aware: pass `remainingPicks` ([{round, rosterId}] in draft order) so
 * traded-away picks aren't projected to their original owner. When omitted, falls
 * back to one pick per team per round from `fromRound..totalRounds`.
 * @param {object} args
 * @param {Array} args.teams        [{rosterId,label,isMe, roster:[{position,age,value}]}]
 * @param {Array} args.pool         undrafted enriched players ({id,position,age,liveValue})
 * @param {object} args.blueprint   my target blueprint (null → I also take best value)
 * @param {Array} [args.remainingPicks] ordered [{round, rosterId}] of picks still to be made
 * @param {number} [args.totalRounds] fallback when remainingPicks omitted
 * @param {number} [args.fromRound]   fallback when remainingPicks omitted
 * @param {boolean} [args.baseline] if true, my team ignores the plan (best-value) — for lift comparison
 * @returns {Array<{rosterId,label,isMe,now,proj,nowRank,projRank}>} sorted by proj desc
 */
export function projectLeagueOutlook({ teams = [], pool = [], blueprint, remainingPicks = null, totalRounds = 0, fromRound = 1, baseline = false, leagueContext = null } = {}) {
  const fwd = (p) => forwardValue(p.position, p.age, p.value ?? p.liveValue);
  const avail = availabilityOrder(pool);

  const sim = teams.map((t) => {
    const roster = (t.roster || []).filter((p) => POSITIONS.includes(p.position));
    const now = roster.reduce((s, p) => s + fwd(p), 0);
    return { rosterId: t.rosterId, label: t.label, isMe: !!t.isMe, now, proj: now, roster: [...roster] };
  });
  const byRoster = new Map(sim.map((t) => [t.rosterId, t]));

  // Resolve the pick schedule: real (trade-adjusted) ownership when given, else
  // one pick per team per round (preserves the pre-ownership fallback behaviour).
  let effective;
  if (Array.isArray(remainingPicks)) {
    effective = remainingPicks;
  } else {
    effective = [];
    for (let round = Math.max(1, fromRound); round <= totalRounds; round++) {
      for (const t of sim) effective.push({ round, rosterId: t.rosterId });
    }
  }

  for (const rp of effective) {
    if (avail.length === 0) break;
    const team = byRoster.get(rp.rosterId);
    if (!team) { avail.shift(); continue; } // unknown owner still consumes the board
    let idx = 0; // default: best value available
    if (team.isMe && blueprint && !baseline) {
      const recs = recommendNextPick({ blueprint, round: rp.round, pool: avail, myRoster: team.roster, leagueContext, opts: { limit: 1 } });
      const pick = recs[0]?.player;
      if (pick) {
        const found = avail.findIndex((x) => x.id === pick.id);
        if (found >= 0) idx = found;
      }
    }
    const taken = avail.splice(idx, 1)[0];
    if (!taken) break;
    team.proj += forwardValue(taken.position, taken.age, taken.liveValue);
    team.roster.push({ position: taken.position, age: taken.age, value: taken.liveValue });
  }

  const nowRank = new Map([...sim].sort((a, b) => b.now - a.now).map((t, i) => [t.rosterId, i + 1]));
  const projRank = new Map([...sim].sort((a, b) => b.proj - a.proj).map((t, i) => [t.rosterId, i + 1]));
  return [...sim]
    .sort((a, b) => b.proj - a.proj)
    .map((t) => ({
      rosterId: t.rosterId,
      label: t.label,
      isMe: t.isMe,
      now: Math.round(t.now),
      proj: Math.round(t.proj),
      nowRank: nowRank.get(t.rosterId),
      projRank: projRank.get(t.rosterId),
    }));
}

// ── Example build: round-by-round draft following a blueprint ────────────────

/**
 * Simulate a snake startup draft and return the example team's pick each round.
 * Availability model: the field takes best value available (value-rank ≈ startup
 * ADP), the example team drafts on-plan.
 *
 * Ownership-aware: pass `remainingPicks` ([{round, mine}] in draft order) so picks
 * you've traded away aren't projected to you — when your `mine` picks run out the
 * build is `complete`. When omitted, falls back to one pick per round from `slot`.
 * @param {object} args
 * @param {object} args.blueprint
 * @param {Array} args.pool        undrafted enriched players ({id,name,position,age,liveValue})
 * @param {Array} [args.remainingPicks] ordered [{round, mine:boolean}] of picks still to be made
 * @param {Array} [args.myDrafted]  picks already made ({name,position,age,round,value})
 * @param {number} [args.slot]      fallback: my draft slot (1..numTeams)
 * @param {number} [args.numTeams]  fallback
 * @param {number} [args.rounds]    fallback
 * @param {number} [args.fromRound] fallback: first round still to draft (default 1)
 * @returns {{ picks: Array<{round,player,made:boolean}>, complete:boolean }}
 */
export function simulateExampleDraft({ blueprint, pool = [], remainingPicks = null, myDrafted = [], slot, numTeams, rounds, fromRound = 1, leagueContext = null } = {}) {
  if (!blueprint) return { picks: [], complete: false };

  // Resolve the remaining-pick schedule, marking which picks are mine.
  let schedule;
  if (Array.isArray(remainingPicks)) {
    schedule = remainingPicks;
  } else if (slot && numTeams && rounds) {
    schedule = snakeSchedule(numTeams, rounds, fromRound).map((c) => ({ round: c.round, mine: c.slot === slot }));
  } else {
    schedule = [];
  }

  const avail = availabilityOrder(pool);
  const myRoster = (myDrafted || [])
    .filter((p) => POSITIONS.includes(p.position))
    .map((p) => ({ position: p.position, age: p.age, value: p.value, round: p.round }));

  // Picks already made show first (chronological), then the projected remainder.
  const out = (myDrafted || [])
    .filter((p) => POSITIONS.includes(p.position))
    .map((p) => ({ round: p.round, player: p, made: true }))
    .sort((a, b) => num(a.round) - num(b.round));

  for (const rp of schedule) {
    if (avail.length === 0) break;
    if (rp.mine) {
      const recs = recommendNextPick({ blueprint, round: rp.round, pool: avail, myRoster, leagueContext, opts: { limit: 1 } });
      const pick = recs[0]?.player || avail[0];
      const i = avail.findIndex((x) => x.id === pick.id);
      avail.splice(i >= 0 ? i : 0, 1);
      myRoster.push({ position: pick.position, age: pick.age, value: pick.liveValue, round: rp.round });
      out.push({ round: rp.round, player: pick, made: false });
    } else {
      avail.shift(); // someone else's pick — best available is gone
    }
  }

  // "Complete" = no remaining picks of my own to make (e.g. traded them all away).
  const complete = !schedule.some((rp) => rp.mine);
  return { picks: out, complete };
}

// ── Full mock draft (the Mock Blueprints sandbox) ────────────────────────────

/**
 * Simulate a complete snake startup draft and return the entire board, not just
 * my team. My slot drafts on-plan (recommendNextPick); every other slot takes the
 * best available (ADP-rank when present, else value). Lets a user see the picks
 * that happened *around* them — the context that forces each decision.
 * @param {object} args
 * @param {object} args.blueprint
 * @param {Array} args.pool      draftable players ({id,name,position,age,liveValue,adpRank?})
 * @param {number} args.slot     my draft slot (1..numTeams)
 * @param {number} args.numTeams
 * @param {number} args.rounds
 * @param {boolean} [args.strict]
 * @returns {{ board: Array<{round,slot,pickNo,player,mine}>, myRoster: Array }}
 */
export function simulateMockDraft({ blueprint, pool = [], slot, numTeams, rounds, strict = false, leagueContext = null } = {}) {
  if (!slot || !numTeams || !rounds) return { board: [], myRoster: [] };
  const avail = availabilityOrder(pool);
  const myRoster = [];
  const board = [];
  const totalPicks = numTeams * rounds;

  for (let p = 1; p <= totalPicks; p++) {
    if (avail.length === 0) break;
    const round = Math.floor((p - 1) / numTeams) + 1;
    const idxInRound = (p - 1) % numTeams;
    const slotPicking = round % 2 === 1 ? idxInRound + 1 : numTeams - idxInRound; // snake
    const mine = slotPicking === slot;

    let pick;
    if (mine && blueprint) {
      const recs = recommendNextPick({ blueprint, round, pool: avail, myRoster, leagueContext, opts: { strict, limit: 1 } });
      pick = recs[0]?.player || avail[0];
    } else {
      pick = avail[0]; // best available by ADP/value
    }
    const i = avail.findIndex((x) => x.id === pick.id);
    avail.splice(i >= 0 ? i : 0, 1);

    if (mine) myRoster.push({ position: pick.position, age: pick.age, value: pick.liveValue ?? pick.value, round });
    board.push({ round, slot: slotPicking, pickNo: p, player: pick, mine });
  }
  return { board, myRoster };
}

// ── Active-team Blueprint Coach (post-draft) ─────────────────────────────────

// Tag a rostered player relative to a target blueprint: "core" (cornerstone fit),
// "off" (works against the plan — a sell candidate), or "fit" (fine / on-plan).
function playerAlignment(p, blueprint, wts) {
  const win = blueprint.ageWindow || [21, 30];
  const age = num(p.age, 26);
  const val = pVal(p);
  const posW = num(wts[p.position], 0);
  const rules = blueprint.assetRules || {};
  const preferYoung = rules.preferYoung === true;

  // Off-plan: ages past the plan's hard cap.
  if (rules.maxAgeHardStop && age > rules.maxAgeHardStop) {
    return { tag: "off", reason: `Ages out of the plan (>${rules.maxAgeHardStop})` };
  }
  // Off-plan: a youth-building plan holding an aging asset still worth selling.
  if (preferYoung && age >= win[1] + 2 && val >= 25) {
    return { tag: "off", reason: "Aging vs a youth plan — sell while it has value" };
  }
  // Off-plan: a win-now plan holding a low-value young dart-throw (convert it).
  if (blueprint.id === "winNow" && age <= 23 && val < 60) {
    return { tag: "off", reason: "Young dart-throw — flip for win-now help" };
  }
  // Off-plan: a valuable player at a position the plan barely uses (sell high).
  if (posW <= 0.12 && val >= 70) {
    return { tag: "off", reason: `Plan is light at ${p.position} — sell into your strengths` };
  }

  const ageOk = age >= win[0] && age <= win[1];
  if (val >= 80 && posW >= 0.2 && ageOk) return { tag: "core", reason: "Cornerstone fit" };
  if (ageOk && posW >= 0.15) return { tag: "fit", reason: "On-plan" };
  return { tag: "fit", reason: "Roster filler" };
}

// Does a trade-suggestion's acquire target advance the blueprint?
function suggestionFit(target, blueprint, wts) {
  if (!target) return { fitsPlan: false, fitReason: null };
  const ageFit = ageFitScore(target.age, blueprint.ageWindow);
  const posW = num(wts[target.position], 0);
  const reasons = [];
  if (posW >= 0.2) reasons.push(`fills a ${blueprint.label} priority spot`);
  if (ageFit >= 0.999) reasons.push(`in the ${blueprint.ageWindow[0]}–${blueprint.ageWindow[1]} age band`);
  const fitsPlan = posW >= 0.15 && ageFit >= 0.6;
  return { fitsPlan, fitReason: reasons.length ? reasons.join(", ") : null };
}

/**
 * Make a chosen blueprint actionable for an established roster: how well the team
 * fits it, the gap to close, which players work against it (sell candidates), and
 * which buy targets advance it.
 * @param {object} args
 * @param {object} args.snapshot         my-team roster snapshot (proportions, byPos, enriched, avgAge)
 * @param {object} args.blueprint        the target DRAFT_BLUEPRINTS entry
 * @param {object} args.leagueContext
 * @param {Array}  [args.tradeSuggestions] precomputed buildTradeSuggestions() output
 * @returns {{ fit, signals, avgAge, targetAge, positions, players, core, sells, wantedPositions, acquireTargets }}
 */
export function coachActiveTeam({ snapshot, blueprint, leagueContext, tradeSuggestions = [] } = {}) {
  if (!snapshot || !blueprint) return null;
  const cls = classifyDraftBlueprint(snapshot, leagueContext);
  const match = cls.matches.find((m) => m.id === blueprint.id);

  // Roster-level target positional mix = the blueprint's catch-all (late) band.
  const wts = posWeightsForRound(blueprint, 99);
  const positions = POSITIONS.map((pos) => {
    const actual = Math.round(num(snapshot.proportions?.[pos]?.actual));
    const target = Math.round(num(wts[pos]) * 100);
    return { pos, actual, target, delta: actual - target };
  });

  const enriched = snapshot.enriched || [];
  const players = enriched.map((p) => ({ player: p, ...playerAlignment(p, blueprint, wts) }));
  const sells = players.filter((x) => x.tag === "off").sort((a, b) => pVal(b.player) - pVal(a.player));
  const core = players.filter((x) => x.tag === "core").sort((a, b) => pVal(b.player) - pVal(a.player));
  const wantedPositions = positions.filter((x) => x.delta <= -8 && x.target >= 12).map((x) => x.pos);

  const acquireTargets = (tradeSuggestions || [])
    .map((s) => ({ ...s, ...suggestionFit(s.targetPlayer, blueprint, wts) }))
    .sort((a, b) => (b.fitsPlan ? 1 : 0) - (a.fitsPlan ? 1 : 0))
    .slice(0, 8);

  return {
    fit: match?.fit ?? 0,
    signals: match?.signals ?? [],
    avgAge: num(snapshot.avgAge),
    targetAge: blueprint.targetAvgAge,
    positions,
    players,
    core,
    sells,
    wantedPositions,
    acquireTargets,
  };
}

// ── Auto-detect blueprint from picks so far ──────────────────────────────────

/**
 * For a draft already in progress, infer which blueprint the picks-so-far most
 * resemble. Uses trackAdherence's score (positional value-share + age + round
 * behaviour) — all scale-free, so it works off the live picks' raw value scale.
 * @param {Array<{position,age,round,value}>} myDrafted
 * @param {object} leagueContext
 * @returns {{ matches: Array<{id,label,color,tagline,fit,onPlanPickPct}>, top, pickCount }}
 */
export function detectBlueprintFromPicks(myDrafted, leagueContext) {
  const picks = (myDrafted || []).filter((p) => p && POSITIONS.includes(p.position));
  const matches = availableBlueprints(leagueContext)
    .map((b) => {
      const a = trackAdherence(b, picks);
      return {
        id: b.id,
        label: b.label,
        color: b.color,
        tagline: b.tagline,
        fit: a.overall,
        onPlanPickPct: a.onPlanPickPct,
      };
    })
    .sort((a, b) => b.fit - a.fit);
  return { matches, top: matches[0] || null, pickCount: picks.length };
}

// ── Adherence tracker ────────────────────────────────────────────────────────

/**
 * Measure how well the picks made so far match the chosen blueprint.
 * @param {object} blueprint
 * @param {Array<{position,age,round,value|dynastyValue}>} myDrafted
 * @returns {{ overall, avgAge:{actual,target,ok}, posCapital, onPlanPickPct, deviations:string[] }}
 */
export function trackAdherence(blueprint, myDrafted) {
  const picks = (myDrafted || []).filter((p) => p && POSITIONS.includes(p.position));
  const empty = {
    overall: 0,
    avgAge: { actual: 0, target: blueprint?.targetAvgAge ?? 0, ok: true },
    posCapital: {},
    onPlanPickPct: 0,
    deviations: [],
  };
  if (!blueprint || picks.length === 0) return empty;

  const target = blueprint.targetAvgAge;
  const actualAge = mean(picks.map((p) => num(p.age, 26)));
  // For young-leaning plans, being under the age ceiling is on-plan (only drifting
  // OLD is a deviation). Center-targeted plans (Win-Now, QB Hammer) penalize both ways.
  const preferYoung = blueprint.assetRules?.preferYoung === true;
  const ageMiss = preferYoung ? Math.max(0, actualAge - target) : Math.abs(actualAge - target);
  const ageOk = preferYoung ? actualAge <= target + 1.0 : ageMiss <= 1.5;

  // Positional capital: actual value-share vs the mean round-weight target.
  const totalVal = picks.reduce((a, p) => a + pVal(p), 0) || 1;
  const posCapital = {};
  for (const pos of POSITIONS) {
    const actual = picks.filter((p) => p.position === pos).reduce((a, p) => a + pVal(p), 0) / totalVal;
    const targetShare = mean(picks.map((p) => num(posWeightsForRound(blueprint, p.round)[pos], 0)));
    posCapital[pos] = { actual: +(actual * 100).toFixed(0), target: +(targetShare * 100).toFixed(0) };
  }

  // On-plan picks: did each pick match a top-weighted position for its round?
  let onPlan = 0;
  for (const p of picks) {
    const w = posWeightsForRound(blueprint, p.round);
    const maxW = Math.max(...POSITIONS.map((pos) => num(w[pos], 0)));
    if (maxW > 0 && num(w[p.position], 0) >= maxW * 0.85) onPlan += 1;
  }
  const onPlanPickPct = Math.round((onPlan / picks.length) * 100);

  const ageScore = clamp(1 - ageMiss / 4, 0, 1);
  const capitalScore = clamp(
    1 - mean(POSITIONS.map((pos) => Math.abs(posCapital[pos].actual - posCapital[pos].target) / 100)),
    0,
    1,
  );
  const pickScore = onPlanPickPct / 100;
  const overall = Math.round(100 * (0.3 * ageScore + 0.35 * capitalScore + 0.35 * pickScore));

  const deviations = [];
  if (!ageOk) {
    deviations.push(
      actualAge > target
        ? `Roster ${(actualAge - target).toFixed(1)}y older than the ${target} target`
        : `Roster ${(target - actualAge).toFixed(1)}y younger than the ${target} target`,
    );
  }
  for (const pos of POSITIONS) {
    const { actual, target: t } = posCapital[pos];
    if (actual - t >= 20) deviations.push(`Over-invested at ${pos} (${actual}% vs ${t}% plan)`);
  }

  return {
    overall,
    avgAge: { actual: +actualAge.toFixed(1), target, ok: ageOk },
    posCapital,
    onPlanPickPct,
    deviations,
  };
}
