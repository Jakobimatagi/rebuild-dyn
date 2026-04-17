/**
 * playerGrading.js
 * Player verdict labels, room grades, archetype classification, and tags.
 * Pure functions — no side effects.
 */
import { getKeepCount } from "./marketValue";

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

  const keepCount = pos && isSuperflex !== null
    ? getKeepCount(pos, isSuperflex)
    : players.length;

  // byPos is pre-sorted descending by score in rosterBuilder.
  const core = players.slice(0, keepCount);

  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < core.length; i++) {
    const dynasty = core[i].score ?? 0;
    const production = core[i].currentPctile ?? 0;
    const blended = 0.3 * dynasty + 0.7 * production;
    const w = 1 - i * 0.08;
    weightedSum += blended * w;
    weightTotal += w;
  }
  return weightedSum / weightTotal;
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
    const entries = leagueTeams.map((team) => ({
      team,
      quality: computeRoomQuality(team.byPos?.[pos] || [], pos, isSuperflex),
    }));

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
