/**
 * playerGrading.js
 * Player verdict labels, room grades, archetype classification, and tags.
 * Pure functions — no side effects.
 */
import { getKeepCount, estimatePickValue } from "./marketValue.js";
import { clamp } from "./scoringEngine.js";

export function getVerdict(score) {
  if (score >= 72) return "buy";
  if (score >= 52) return "hold";
  if (score >= 35) return "sell";
  return "cut";
}

export function getColor(verdict) {
  return (
    { buy: "#00f5a0", hold: "#ffd84d", sell: "#ff6b35", cut: "#ff2d55" }[
      verdict
    ] || "#d9deef"
  );
}

// Stash player: young (≤2 yrs exp) and below the position's "real contributor"
// PPG floor. Held for dynasty upside, not anchoring the current room. Excluded
// from grading so a future-looking bench piece doesn't get slotted as a
// "starter" via dynasty score. Position-aware floors reject WR4-tier output
// regardless of how many games were played.
const STASH_PPG_FLOOR = { QB: 14, RB: 8, WR: 8, TE: 5 };

function isStashPlayer(player) {
  if (!player) return false;
  const yearsExp = Number(player.yearsExp ?? 99);
  if (yearsExp > 2) return false;
  const floor = STASH_PPG_FLOOR[player.position];
  if (floor == null) return false;
  const ppg = parseFloat(player.ppg ?? 0) || 0;
  return ppg < floor;
}

// Computes the raw quality of a position room — production-tilted blend of
// dynasty value and actual 2024 PPG, weighted near-flat across the
// starter+flex+depth pool. Returns a number (0-100) used to rank rooms
// across the league. Returns null for empty rooms so they sort last.
//
// For each player in the pool:
//   gradeInput = 0.3 × dynastyScore + 0.7 × productionScore
//   weight[i]  = 1 − 0.08·i             // top=1.00, 5th=0.68
//   quality    = Σ(input × weight) / Σ(weight)
//
// Production carries the larger share because room rank answers
// "who can win games this year?" — PPG drives wins, market value follows.
export function computeRoomQuality(players, pos = null, isSuperflex = null) {
  if (!players.length) return null;

  const graded = players.filter((p) => !isStashPlayer(p));
  if (!graded.length) return null;

  const keepCount = pos && isSuperflex !== null
    ? getKeepCount(pos, isSuperflex)
    : graded.length;

  // Pick the core by the same blended formula we grade with — otherwise a
  // dynasty-only sort lets a backup with an inflated speculative value (e.g.
  // a young QB2 with a high FC score but zero PPG) displace a productive
  // starter, then drag the room average down via the 0.7 production weight.
  const blends = graded.map((p) => ({
    p,
    blend: 0.3 * (p.score ?? 0) + 0.7 * (p.currentPctile ?? 0),
  }));
  blends.sort((a, b) => b.blend - a.blend);
  const core = blends.slice(0, keepCount);

  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < core.length; i++) {
    const w = 1 - i * 0.08;
    weightedSum += core[i].blend * w;
    weightTotal += w;
  }
  return weightedSum / weightTotal;
}

// Position-specific 1-10 room grade.
// Answers "how elite is this room in absolute terms?" — distinct from
// league-relative posRanks. 8-10 is a cheat-code room, 5-7 is playable,
// 1-4 is a hole that needs addressing.
//
// Per-slot weights reflect the reality of each position:
//   QB_SF : two anchors carry equal weight (Superflex demands both)
//   QB    : single anchor dominates, QB2 is a streamer floor
//   RB    : hammers up top, flex-depth still matters (RB attrition)
//   WR    : widest curve — depth contributes through WR4
//   TE    : elite anchor is the entire grade, depth barely moves it
const GRADE_SLOT_WEIGHTS = {
  QB_SF: [1.0, 0.95, 0.25, 0.1],
  QB: [1.0, 0.3, 0.1],
  RB: [1.0, 0.85, 0.5, 0.25],
  WR: [1.0, 0.85, 0.55, 0.3, 0.15],
  TE: [1.0, 0.2, 0.08],
};

// Per-slot quality (0-100) for one player. Blends current production floor,
// peak ceiling, job security, and age runway — then applies position-specific
// adjustments backed by actual usage data where available.
//
// QB: job security paramount; rushing upside (30+ rush yd/g) is a real floor bonus.
// RB: workhorse carry load (15+ att/g) and pass-catching (4+ tgt/g) raise the floor.
// WR: 23-27 prime window with real volume (8+ tgt/g) is the ascending-alpha signal.
// TE: red zone presence (8+ RZ targets/season) confirms a true difference-maker role.
function slotQuality(player, pos, slotIdx) {
  if (!player) return 0;
  const cur = player.currentPctile ?? 0;
  const peak = player.peakPctile ?? 0;
  const situ = player.components?.situ ?? 0;
  const ageScore = player.components?.age ?? 0;
  const rawAge = player.age ?? 26;
  const exp = player.yearsExp ?? 0;

  let q = 0.4 * cur + 0.25 * peak + 0.2 * situ + 0.15 * ageScore;

  if (pos === "QB" && slotIdx < 2) {
    if (situ < 60) q *= 0.75;
    else if (situ >= 85 && cur >= 60) q += 4;
    if ((player.rushYdPg ?? 0) >= 30) q += 3;
  } else if (pos === "RB") {
    if (slotIdx < 2 && situ < 55) q *= 0.82;
    if (slotIdx < 2 && (player.rushAttPg ?? 0) >= 15) q += 4;
    if ((player.targetsPg ?? 0) >= 4) q += 3;
  } else if (pos === "WR") {
    if (slotIdx < 2 && rawAge >= 23 && rawAge <= 27 && cur >= 55) q += 6;
    if (slotIdx < 2 && (player.targetsPg ?? 0) >= 8) q += 3;
    if (slotIdx < 2 && (player.targetsPg ?? 0) < 4 && cur < 50) q -= 4;
    if (slotIdx >= 2 && exp >= 5 && cur < 35) q *= 0.7;
  } else if (pos === "TE" && slotIdx === 0) {
    if (cur >= 70 && peak >= 70) q += 8;
    else if (cur < 40) q *= 0.7;
    if ((player.rzTargets ?? 0) >= 8) q += 4;
  }

  return clamp(q, 0, 100);
}

function gradeFromScore(s) {
  if (s >= 80) return 10;
  if (s >= 72) return 9;
  if (s >= 64) return 8;
  if (s >= 56) return 7;
  if (s >= 48) return 6;
  if (s >= 40) return 5;
  if (s >= 32) return 4;
  if (s >= 24) return 3;
  if (s >= 16) return 2;
  return 1;
}

function gradeColor(grade) {
  if (grade >= 8) return "#00f5a0";
  if (grade >= 5) return "#ffd84d";
  return "#ff6b35";
}

export function computePositionGrade(players, pos, isSuperflex) {
  const key = pos === "QB" && isSuperflex ? "QB_SF" : pos;
  const weights = GRADE_SLOT_WEIGHTS[key];
  if (!weights) return null;

  const graded = (players || []).filter((p) => !isStashPlayer(p));

  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    weightedSum += slotQuality(graded[i], pos, i) * w;
    weightTotal += w;
  }
  const raw = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const grade = gradeFromScore(raw);
  return { grade, color: gradeColor(grade), score: Math.round(raw) };
}

const POSITIONS_TO_RANK = ["QB", "RB", "WR", "TE"];

// Ranks every team's position rooms 1..N across the league. Mutates each
// team in `leagueTeams` to add `posRanks: { QB: { rank, of, quality, color }, ... }`.
// Color tiers split the league into thirds: top → green, middle → yellow,
// bottom → red. Empty rooms (null quality) sort last and get red.
export function assignPositionRanks(leagueTeams, isSuperflex) {
  const total = leagueTeams.length;
  if (!total) return;

  for (const pos of POSITIONS_TO_RANK) {
    const entries = leagueTeams.map((team) => {
      const roster = team.byPos?.[pos] || [];
      return {
        team,
        quality: computeRoomQuality(roster, pos, isSuperflex),
        grade: computePositionGrade(roster, pos, isSuperflex),
      };
    });

    // Sort descending by quality. Null sorts last.
    entries.sort((a, b) => {
      if (a.quality == null && b.quality == null) return 0;
      if (a.quality == null) return 1;
      if (b.quality == null) return -1;
      return b.quality - a.quality;
    });

    entries.forEach((entry, idx) => {
      const rank = idx + 1;
      if (!entry.team.posRanks) entry.team.posRanks = {};
      entry.team.posRanks[pos] = {
        rank,
        of: total,
        quality: entry.quality != null ? Math.round(entry.quality) : null,
        color: rankColor(rank, total),
        grade: entry.grade?.grade ?? null,
        gradeColor: entry.grade?.color ?? null,
        gradeScore: entry.grade?.score ?? null,
      };
    });
  }
}

function rankColor(rank, total) {
  const third = total / 3;
  if (rank <= third) return "#00f5a0";
  if (rank <= third * 2) return "#ffd84d";
  return "#ff6b35";
}

// Ranks every team's draft pick capital 1..N across the league. Mutates each
// team in `leagueTeams` to add `pickRank: { rank, of, value, color }`.
// Quality = sum of estimated pick values across the team's tradeable picks.
export function assignPickRanks(leagueTeams, leagueContext, tradeMarket) {
  const total = leagueTeams.length;
  if (!total) return;

  const entries = leagueTeams.map((team) => {
    const value = (team.picks || []).reduce(
      (sum, pick) => sum + estimatePickValue(pick, leagueContext, tradeMarket),
      0,
    );
    return { team, value };
  });

  entries.sort((a, b) => b.value - a.value);

  entries.forEach((entry, idx) => {
    const rank = idx + 1;
    entry.team.pickRank = {
      rank,
      of: total,
      value: Math.round(entry.value),
      color: rankColor(rank, total),
    };
  });
}

export function rankLabel(rank) {
  const mod10 = rank % 10;
  const mod100 = rank % 100;
  if (mod10 === 1 && mod100 !== 11) return `${rank}st`;
  if (mod10 === 2 && mod100 !== 12) return `${rank}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${rank}rd`;
  return `${rank}th`;
}

export function getArchetype(player) {
  const {
    score,
    components,
    gp24,
    peakPctile,
    currentPctile,
    yearsExp,
    draftRound,
    draftSlot,
    fantasyCalcNormalized,
    rosterAuditTier,
    rosterAuditPosRank,
  } = player;
  const { age: ageScore, situ: situScore, trend: trendScore } = components;

  const isEarlyCareer = yearsExp <= 2;
  const isEliteDraft =
    isEarlyCareer && draftRound === 1 && (draftSlot || 99) <= 15;
  const isFirstDraft = isEarlyCareer && draftRound === 1;

  const isProvenElite = peakPctile >= 88;
  const isHighProd = peakPctile >= 72;
  const isSolidProd = peakPctile >= 55;
  const currentlyOn = currentPctile >= 55;
  const isModCurrent = currentPctile >= 38;

  const isYoung = ageScore >= 78;
  const isPrime = ageScore >= 60 && ageScore < 78;
  const isVet = ageScore >= 40 && ageScore < 60;
  const isOld = ageScore < 40;

  const isStarter = situScore >= 75;
  const hasRole = situScore >= 52;
  const isDeclining = trendScore < 40;

  // RA consensus signals
  const raTier = Number(rosterAuditTier) || 99;
  const raPosRank = Number(rosterAuditPosRank) || 999;
  const raElite = raTier <= 2 || raPosRank <= 5;

  // Elite draft picks (top-15 NFL, years 1-2) with any meaningful role are Foundational.
  // isStarter was too strict — rookies often sit at WR2/RB2 on depth charts even when
  // clearly the future focal point. Draft capital + role is enough for this tier.
  if (isEliteDraft && hasRole) return "Foundational";
  if (isFirstDraft && isStarter) return "Upside Shot";
  if (isFirstDraft && !hasRole) return "JAG - Developmental";

  // When Sleeper has no draft metadata (common for the most recent class),
  // fall back to FC market consensus to classify young players.
  // Require both FC elite ranking AND confirmed starter status for Foundational —
  // score alone is too easily inflated by age + FC for non-elite prospects.
  const isFCElite =
    fantasyCalcNormalized != null && fantasyCalcNormalized >= 80;
  if (draftRound == null && yearsExp <= 1) {
    if ((isFCElite || raElite) && isStarter) return "Foundational";
    if (isStarter) return "Upside Shot";
    if (hasRole) return "JAG - Developmental";
  }

  if (isProvenElite && isStarter && !isOld) return "Cornerstone";
  if (isOld && isProvenElite) return "Short Term League Winner";
  if ((isYoung || isPrime) && isStarter && isHighProd) return "Foundational";

  // RA elite consensus can promote borderline Mainstay → Foundational
  if ((isYoung || isPrime) && isStarter && isSolidProd && raElite) return "Foundational";

  if (isYoung && gp24 < 10 && currentPctile < 35) return "JAG - Developmental";
  if (isYoung && hasRole && !isHighProd) return "Upside Shot";
  if ((isVet || isOld) && isSolidProd && hasRole) return "Productive Vet";
  if (currentlyOn && (isOld || isDeclining)) return "Short Term Production";
  if ((isYoung || isPrime) && isModCurrent) return "Mainstay";
  if (isModCurrent && score >= 38) return "Serviceable";
  if (score >= 28) return "JAG - Insurance";
  return "Replaceable";
}

export function getArchetypeTags(player) {
  const {
    score = 0,
    internalScore = 0,
    fantasyCalcNormalized,
    components = {},
    peakPctile,
    currentPctile,
    yearsExp = 0,
    draftRound,
    gp24 = 0,
    rosterAuditTrend,
    rosterAuditBuyLow,
    rosterAuditSellHigh,
    rosterAuditBreakout,
  } = player;

  const ageScore = components.age ?? 0;
  const situScore = components.situ ?? 0;
  const trendScore = components.trend ?? 0;
  const availScore = components.avail ?? 0;
  const peak = peakPctile ?? 0;
  const current = currentPctile ?? 0;

  const tags = [];

  // Value tags — threshold of 12 (not 8) because the blended score now leans
  // 55–75% on market values, so internal-vs-blended gaps are systematically
  // larger. 12 keeps the signal rare enough to be meaningful.
  if (internalScore - score >= 12) tags.push("Undervalued");
  if (score - internalScore >= 12) tags.push("Overvalued");

  // Trend tags — combine internal trend component with RA 30-day trend
  const raTrend = Number(rosterAuditTrend) || 0;
  if (trendScore >= 60 || raTrend >= 5) tags.push("Ascending");
  else if (trendScore <= 40 || raTrend <= -5) tags.push("Declining");

  // Risk tags
  if (situScore < 55) tags.push("Fragile Role");
  if (availScore < 60) tags.push("Injury Risk");
  if (peakPctile != null && currentPctile != null && peak - current >= 35)
    tags.push("Volatile Profile");

  // Ceiling tags
  if (peak >= 90) tags.push("Elite Ceiling");
  if (ageScore >= 75 && yearsExp <= 2 && draftRound === 1 && current < 55)
    tags.push("Untapped Upside");
  if (peak > 0 && peak < 75 && yearsExp >= 4) tags.push("Capped Ceiling");

  // RosterAudit consensus tags
  if (rosterAuditBuyLow) tags.push("Buy Low");
  if (rosterAuditSellHigh) tags.push("Sell High");
  if (rosterAuditBreakout) tags.push("Breakout Candidate");

  return tags;
}

export function getConfidence(player) {
  const gp24 = player.gp24 ?? 0;
  const yearsExp = player.yearsExp ?? 0;
  const trendScore = player.components?.trend ?? 50;

  const raw =
    (gp24 / 17) * 0.5 + (yearsExp / 5) * 0.3 + (trendScore / 100) * 0.2;

  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}

// Bucket the 0-100 confidence into a tier the UI can use to qualify
// recommendations. "speculative" flags rookies / very-low-sample players
// whose verdict is driven by archetype + draft pedigree more than by
// observed production. "high" is reserved for proven contributors with
// a stable trend.
export function getConvictionTier(player) {
  const confidence = player.confidence ?? getConfidence(player);
  const gp24 = player.gp24 ?? 0;
  const yearsExp = player.yearsExp ?? 0;

  if (confidence < 35 || (gp24 < 4 && yearsExp <= 1)) return "speculative";
  if (confidence >= 65 && gp24 >= 10) return "high";
  return "standard";
}
