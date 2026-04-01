import { IDEAL_PROPORTION, POSITION_PRIORITY } from "../constants";

export const DEFAULT_SCORING_WEIGHTS = {
  age: 35,
  prod: 30,
  avail: 15,
  trend: 10,
  situ: 10,
};

function normalizeScoringWeights(weights = DEFAULT_SCORING_WEIGHTS) {
  const safe = {
    age: Number(weights.age ?? DEFAULT_SCORING_WEIGHTS.age),
    prod: Number(weights.prod ?? DEFAULT_SCORING_WEIGHTS.prod),
    avail: Number(weights.avail ?? DEFAULT_SCORING_WEIGHTS.avail),
    trend: Number(weights.trend ?? DEFAULT_SCORING_WEIGHTS.trend),
    situ: Number(weights.situ ?? DEFAULT_SCORING_WEIGHTS.situ),
  };
  const total = Math.max(
    1,
    safe.age + safe.prod + safe.avail + safe.trend + safe.situ,
  );

  return {
    age: safe.age / total,
    prod: safe.prod / total,
    avail: safe.avail / total,
    trend: safe.trend / total,
    situ: safe.situ / total,
  };
}

function getWeightDeviationRatio(weights = DEFAULT_SCORING_WEIGHTS) {
  const base = normalizeScoringWeights(DEFAULT_SCORING_WEIGHTS);
  const current = normalizeScoringWeights(weights);
  const distance =
    Math.abs(current.age - base.age) +
    Math.abs(current.prod - base.prod) +
    Math.abs(current.avail - base.avail) +
    Math.abs(current.trend - base.trend) +
    Math.abs(current.situ - base.situ);

  return clamp(distance / 1.4, 0, 1);
}

const AGE_CURVES_FALLBACK = {
  QB: { peak: 27, decline: 32, cliff: 35 },
  RB: { peak: 24, decline: 27, cliff: 30 },
  WR: { peak: 26, decline: 30, cliff: 33 },
  TE: { peak: 27, decline: 30, cliff: 33 },
};

// Derives age-production curves from actual player-season data.
// Each bucket needs MIN_BUCKET_SIZE samples before we trust it; positions with
// insufficient data fall back to the hardcoded curves above.
const MIN_BUCKET_SIZE = 8;

function buildAgeCurves(players, allStatYears) {
  const currentYear = new Date().getFullYear();
  const buckets = {};
  POSITION_PRIORITY.forEach((pos) => {
    buckets[pos] = {};
  });

  allStatYears.forEach(({ year, stats }) => {
    if (!stats || typeof stats !== "object") return;
    Object.entries(stats).forEach(([id, s]) => {
      if (!s?.gp || s.gp < 8) return;
      const p = players[id];
      if (!p) return;
      const pos = p.fantasy_positions?.[0] || p.position;
      if (!POSITION_PRIORITY.includes(pos)) return;
      const ppg = (s.pts_ppr || 0) / s.gp;
      if (ppg <= 0) return;
      // Approximate the player's age during that season
      const ageInSeason = (p.age || 26) - (currentYear - year);
      if (ageInSeason < 20 || ageInSeason > 42) return;
      if (!buckets[pos][ageInSeason]) buckets[pos][ageInSeason] = [];
      buckets[pos][ageInSeason].push(ppg);
    });
  });

  const curves = {};
  POSITION_PRIORITY.forEach((pos) => {
    const bucket = buckets[pos];
    const ages = Object.keys(bucket)
      .map(Number)
      .filter((age) => bucket[age].length >= MIN_BUCKET_SIZE)
      .sort((a, b) => a - b);

    if (ages.length < 5) {
      curves[pos] = AGE_CURVES_FALLBACK[pos];
      return;
    }

    // Median PPG per age bucket
    const median = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const medians = {};
    ages.forEach((age) => {
      medians[age] = median(bucket[age]);
    });

    // Peak: age with highest median (smoothed over a 3-year window to reduce noise)
    const smoothed = {};
    ages.forEach((age) => {
      const window = ages.filter((a) => Math.abs(a - age) <= 1);
      smoothed[age] =
        window.reduce((s, a) => s + medians[a], 0) / window.length;
    });
    const peakAge = ages.reduce(
      (best, age) => (smoothed[age] > smoothed[best] ? age : best),
      ages[0],
    );
    const peakVal = smoothed[peakAge];

    // Decline: first post-peak age where smoothed median falls to ≤60% of peak
    let decline = AGE_CURVES_FALLBACK[pos].decline;
    for (const age of ages.filter((a) => a > peakAge)) {
      if (smoothed[age] <= peakVal * 0.6) {
        decline = age;
        break;
      }
    }

    // Cliff: first post-decline age where smoothed median falls to ≤30% of peak
    let cliff = AGE_CURVES_FALLBACK[pos].cliff;
    for (const age of ages.filter((a) => a > decline)) {
      if (smoothed[age] <= peakVal * 0.3) {
        cliff = age;
        break;
      }
    }

    curves[pos] = {
      peak: Math.max(peakAge, AGE_CURVES_FALLBACK[pos].peak - 2),
      decline: Math.max(decline, peakAge + 2),
      cliff: Math.max(cliff, decline + 2),
    };
  });

  return curves;
}

function buildBenchmarks(
  players,
  stats22,
  stats23,
  stats24,
  leagueContext = null,
  historicalStats = [],
) {
  const raw = { QB: {}, RB: {}, WR: {}, TE: {} };
  POSITION_PRIORITY.forEach((pos) => {
    raw[pos] = { 2022: [], 2023: [], 2024: [] };
  });

  const allStats = { 2022: stats22, 2023: stats23, 2024: stats24 };
  Object.entries(allStats).forEach(([year, stats]) => {
    Object.entries(stats).forEach(([id, s]) => {
      if (!s || !s.gp || s.gp < 8) return;
      const p = players[id];
      if (!p) return;
      const pos = p.fantasy_positions?.[0] || p.position;
      if (!POSITION_PRIORITY.includes(pos)) return;
      const ppg = (s.pts_ppr || 0) / s.gp;
      if (ppg > 0) raw[pos][year].push(ppg);
    });
  });

  POSITION_PRIORITY.forEach((pos) =>
    Object.keys(raw[pos]).forEach((yr) => raw[pos][yr].sort((a, b) => a - b)),
  );

  // PAR replacement level: PPG of the first player outside projected starting lineups.
  // Flex spots split roughly 35% RB / 45% WR / 10% TE by typical usage.
  const numTeams = leagueContext?.numTeams || 12;
  const sc = leagueContext?.starterCounts || { QB: 1, RB: 2, WR: 3, TE: 1 };
  const flexCount = leagueContext?.flexCount || 2;
  const isSuperflex = leagueContext?.isSuperflex || false;
  const replCounts = {
    QB: (isSuperflex ? 2 : 1) * numTeams + 1,
    RB: (sc.RB || 2) * numTeams + Math.round(flexCount * numTeams * 0.35) + 1,
    WR: (sc.WR || 3) * numTeams + Math.round(flexCount * numTeams * 0.45) + 1,
    TE: (sc.TE || 1) * numTeams + Math.round(flexCount * numTeams * 0.1) + 1,
  };

  const replacementLevel = {};
  POSITION_PRIORITY.forEach((pos) => {
    replacementLevel[pos] = {};
    ["2022", "2023", "2024"].forEach((yr) => {
      const sorted = raw[pos][yr];
      if (!sorted.length) {
        replacementLevel[pos][yr] = 0;
        return;
      }
      // sorted is ascending; replacement player sits just outside starters
      const replIdx = Math.max(0, sorted.length - replCounts[pos]);
      replacementLevel[pos][yr] = sorted[replIdx] || 0;
    });
  });

  // Build empirical age curves from all available seasons (recent 3 + historical).
  // More seasons → more samples per age bucket → more reliable peak/decline/cliff.
  const allForAgeCurves = [
    { year: 2024, stats: stats24 },
    { year: 2023, stats: stats23 },
    { year: 2022, stats: stats22 },
    ...historicalStats,
  ];
  const ageCurves = buildAgeCurves(players, allForAgeCurves);

  return { raw, replacementLevel, ageCurves };
}

function getPctileRank(ppg, sorted) {
  if (!ppg || !sorted?.length) return null;
  const below = sorted.filter((v) => v < ppg).length;
  return Math.round((below / sorted.length) * 100);
}

function playerPctiles(s24, s23, s22, pos, benchmarks) {
  // Support both old format (raw arrays) and new format ({ raw, replacementLevel })
  const raw = benchmarks.raw || benchmarks;
  const rl = benchmarks.replacementLevel?.[pos] || {};
  const b = raw[pos] || {};

  const ppgOf = (s) => (s?.gp >= 6 ? (s.pts_ppr || 0) / s.gp : 0);

  // PAR-adjusted percentile: standard rank + small bonus for meaningful production above replacement.
  // Bonus scales with PAR ratio (capped at +8 pts) so elite producers score higher than pure percentile.
  const parAdjPctile = (ppgVal, sorted, replPpg) => {
    const pctile = getPctileRank(ppgVal, sorted);
    if (pctile === null) return null;
    if (replPpg > 0 && ppgVal > replPpg) {
      const parBonus = Math.min(
        8,
        Math.round(((ppgVal - replPpg) / replPpg) * 12),
      );
      return Math.min(100, pctile + parBonus);
    }
    return pctile;
  };

  const p24 = parAdjPctile(ppgOf(s24), b["2024"], rl["2024"] || 0);
  const p23 = parAdjPctile(ppgOf(s23), b["2023"], rl["2023"] || 0);
  const p22 = parAdjPctile(ppgOf(s22), b["2022"], rl["2022"] || 0);
  const valid = [p24, p23, p22].filter((v) => v !== null);
  const peak = valid.length > 0 ? Math.max(...valid) : null;
  const current = p24 ?? (peak != null ? Math.round(peak * 0.65) : 40);
  return { current, peak, p24, p23, p22 };
}

function draftCapitalScore(round, slot) {
  if (!round) return null;
  if (round === 1) {
    if (slot <= 10) return 95;
    if (slot <= 20) return 85;
    return 78;
  }
  if (round === 2) return 62;
  if (round === 3) return 45;
  if (round === 4) return 32;
  return 18;
}

export function draftTierLabel(round, slot) {
  if (!round) return null;
  if (round === 1 && slot <= 10) return "Top 10 Pick";
  if (round === 1 && slot <= 20) return "Mid 1st";
  if (round === 1) return "Late 1st";
  if (round === 2) return "2nd Round";
  if (round === 3) return "3rd Round";
  if (round === 4) return "4th Round";
  return `${round}th Round`;
}

function ageComponent(pos, age, ageCurves) {
  const fallback = AGE_CURVES_FALLBACK[pos] || AGE_CURVES_FALLBACK.WR;
  const c = ageCurves && ageCurves[pos] ? ageCurves[pos] : fallback;
  if (age <= c.peak) return 95;
  if (age <= c.decline) {
    return Math.max(30, 95 - ((age - c.peak) / (c.decline - c.peak)) * 65);
  }
  if (age <= c.cliff) {
    return Math.max(10, 30 - ((age - c.decline) / (c.cliff - c.decline)) * 20);
  }
  return 5;
}

function availComponent(s24, injuryStatus) {
  const gp = s24?.gp || 0;
  const base = (gp / 17) * 100;
  const penalty =
    { IR: 20, Out: 10, Doubtful: 5, Questionable: 2, PUP: 15 }[injuryStatus] ||
    0;
  return Math.max(0, Math.min(100, base - penalty));
}

function trendComponent(s24, s23) {
  const gp24 = s24?.gp || 0;
  const gp23 = s23?.gp || 0;
  if (gp24 < 4 || gp23 < 4) return 50;
  const ppg24 = (s24.pts_ppr || 0) / gp24;
  const ppg23 = (s23.pts_ppr || 0) / gp23;
  if (ppg23 === 0) return 50;
  const pct = (ppg24 - ppg23) / ppg23;
  return Math.min(100, Math.max(0, 60 + pct * 100));
}

function situComponent(depthOrder, team) {
  if (!team || team === "FA") return 20;
  if (depthOrder === 1) return 90;
  if (depthOrder === 2) return 55;
  return 30;
}

function calcScore(
  player,
  s24,
  s23,
  currentPctile,
  ageCurves,
  scoringWeights = DEFAULT_SCORING_WEIGHTS,
) {
  const age = ageComponent(player.position, player.age, ageCurves);
  const avail = availComponent(s24, player.injuryStatus);
  const trend = trendComponent(s24, s23);
  const situ = situComponent(player.depthOrder, player.team);
  const w = normalizeScoringWeights(scoringWeights);

  const dc = draftCapitalScore(player.draftRound, player.draftSlot);
  const dcWeight = dc != null ? ([0.6, 0.4, 0.2][player.yearsExp] ?? 0) : 0;
  const rawProd = currentPctile ?? 40;
  const prod = Math.round(
    rawProd * (1 - dcWeight) + (dc ?? rawProd) * dcWeight,
  );

  const score = Math.round(
    age * w.age +
      prod * w.prod +
      avail * w.avail +
      trend * w.trend +
      situ * w.situ,
  );
  return {
    score,
    components: {
      age: Math.round(age),
      prod: Math.round(prod),
      avail: Math.round(avail),
      trend: Math.round(trend),
      situ: Math.round(situ),
    },
  };
}

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

export function getRoomGrade(players) {
  if (!players.length) return { grade: "F", color: "#ff2d55", label: "Empty" };
  const avg = players.reduce((s, p) => s + p.score, 0) / players.length;
  const buyCount = players.filter((p) => p.verdict === "buy").length;
  const ratio = buyCount / players.length;
  if (ratio >= 0.5 && avg >= 70)
    return { grade: "A", color: "#00f5a0", label: "Elite Core" };
  if (ratio >= 0.3 && avg >= 58)
    return { grade: "B", color: "#7fff7f", label: "Good Shape" };
  if (avg >= 45) return { grade: "C", color: "#ffd84d", label: "Mixed Bag" };
  return { grade: "D", color: "#ff6b35", label: "Needs Work" };
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
    if (isFCElite && isStarter) return "Foundational";
    if (isStarter) return "Upside Shot";
    if (hasRole) return "JAG - Developmental";
  }

  if (isProvenElite && isStarter && !isOld) return "Cornerstone";
  if (isOld && isProvenElite) return "Short Term League Winner";
  if ((isYoung || isPrime) && isStarter && isHighProd) return "Foundational";
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
  } = player;

  const ageScore = components.age ?? 0;
  const situScore = components.situ ?? 0;
  const trendScore = components.trend ?? 0;
  const availScore = components.avail ?? 0;
  const peak = peakPctile ?? 0;
  const current = currentPctile ?? 0;

  const tags = [];

  // Value tags
  if (internalScore - score >= 8) tags.push("Undervalued");
  if (score - internalScore >= 8) tags.push("Overvalued");

  // Trend tags
  if (trendScore >= 60) tags.push("Ascending");
  else if (trendScore <= 40) tags.push("Declining");

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

function getLeagueRulesContext(league) {
  const scoring = league.scoring_settings || {};
  const rosterPositions = league.roster_positions || [];
  const passTd = Number(scoring.pass_td ?? 4);
  const recBase = Number(scoring.rec ?? 0);
  const teRec = Number(scoring.rec_te ?? recBase);
  const wrRec = Number(scoring.rec_wr ?? recBase);
  const rbRec = Number(scoring.rec_rb ?? recBase);
  const flexCount = rosterPositions.filter((slot) =>
    ["FLEX", "REC_FLEX", "WRRB_FLEX", "WRTE_FLEX", "SUPER_FLEX"].includes(slot),
  ).length;
  const starterCounts = {
    QB: rosterPositions.filter((slot) => slot === "QB").length,
    RB: rosterPositions.filter((slot) => slot === "RB").length,
    WR: rosterPositions.filter((slot) => slot === "WR").length,
    TE: rosterPositions.filter((slot) => slot === "TE").length,
  };
  const isSuperflex =
    starterCounts.QB > 1 || rosterPositions.includes("SUPER_FLEX");
  const tePremium = teRec > Math.max(wrRec, rbRec, recBase);

  return {
    isSuperflex,
    tePremium,
    passTd,
    ppr: recBase,
    numTeams: Number(league.total_rosters || 12),
    starterCounts,
    flexCount,
    formatLabel: [
      isSuperflex ? "Superflex" : "1QB",
      tePremium ? "TE Premium" : null,
      recBase >= 1 ? "PPR" : recBase > 0 ? "Half PPR" : "Standard-ish",
      passTd >= 6 ? "6pt Pass TD" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    positionPremiums: {
      QB: isSuperflex ? 24 + Math.max(0, starterCounts.QB - 1) * 5 : 0,
      RB: starterCounts.RB >= 2 ? 2 : 0,
      WR: starterCounts.WR >= 3 || flexCount >= 2 ? 4 : 0,
      TE: tePremium ? 10 + Math.max(0, starterCounts.TE - 1) * 3 : 0,
    },
  };
}

function getArchetypePremium(archetype) {
  return (
    {
      Cornerstone: 18,
      Foundational: 13,
      Mainstay: 8,
      "Upside Shot": 10,
      "Productive Vet": 4,
      "Short Term League Winner": 6,
      "Short Term Production": 3,
      Serviceable: 0,
      "JAG - Insurance": -6,
      "JAG - Developmental": 2,
      Replaceable: -14,
    }[archetype] || 0
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildFantasyCalcContext(fantasyCalcValues = []) {
  const bySleeperId = new Map();
  const maxValue = fantasyCalcValues.reduce(
    (best, entry) => Math.max(best, Number(entry?.value || 0)),
    0,
  );
  const maxOverallRank = fantasyCalcValues.reduce(
    (best, entry) => Math.max(best, Number(entry?.overallRank || 0)),
    0,
  );

  // Pre-sort all values ascending for O(n) percentile lookup in normalizeFantasyCalcValue.
  // This replaces the ad-hoc sqrt(value/maxValue) compression with a true percentile rank,
  // which more accurately reflects where a player sits in the actual market distribution.
  const allSortedValues = fantasyCalcValues
    .map((e) => Number(e?.value || 0))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  fantasyCalcValues.forEach((entry) => {
    const sleeperId = entry?.player?.sleeperId;
    if (sleeperId) bySleeperId.set(String(sleeperId), entry);
  });

  return {
    bySleeperId,
    allSortedValues,
    maxValue: Math.max(1, maxValue),
    maxOverallRank: Math.max(1, maxOverallRank),
    totalPlayers: fantasyCalcValues.length,
  };
}

function normalizeFantasyCalcValue(entry, context) {
  if (!entry) return null;

  const value = Number(entry.value || 0);

  // Percentile rank within all FC values: more principled than sqrt(value/maxValue),
  // which assumed a specific distribution shape. Percentile directly reflects market position.
  let valuePercentile;
  if (context.allSortedValues?.length > 0) {
    const below = context.allSortedValues.filter((v) => v < value).length;
    valuePercentile = below / context.allSortedValues.length;
  } else {
    // Fallback for contexts without pre-sorted values
    valuePercentile = clamp(Math.sqrt(value / context.maxValue), 0, 1);
  }

  // Rank score: linear inverse rank (1 = #1 overall, 0 = last)
  const rankScore = clamp(
    1 -
      (Number(entry.overallRank || context.maxOverallRank) - 1) /
        context.maxOverallRank,
    0,
    1,
  );

  // Trend: FC values are on 0-10000 scale; a 30-day swing of ±500 is significant.
  // Normalize on 1500 so typical hot/cold streaks produce ±5-7 pts of adjustment.
  const trendAdj = clamp(Number(entry.trend30Day || 0) / 1500, -0.07, 0.07);

  // Rank is the more stable signal; value percentile captures real market spread.
  return Math.round(
    clamp((rankScore * 0.55 + valuePercentile * 0.45 + trendAdj) * 100, 5, 100),
  );
}

// Blends the internal score with FantasyCalc market data.
// Called early in player enrichment so every downstream grade (verdict, archetype,
// room quality, trade value) already reflects the FC-informed score.
// FC weight ranges from 50% (complete rookies with no games) to 65% (4+ yr vets).
function computeBlendedScore(
  internalScore,
  fantasyCalcEntry,
  fantasyCalcContext,
  gp24,
  yearsExp,
  scoringWeights = DEFAULT_SCORING_WEIGHTS,
) {
  const fantasyCalcNormalized = normalizeFantasyCalcValue(
    fantasyCalcEntry,
    fantasyCalcContext,
  );
  if (fantasyCalcNormalized == null) {
    return { score: internalScore, fantasyCalcNormalized: null };
  }
  const seasonCertainty = Math.min(1, (gp24 || 0) / 14);
  const expCertainty = Math.min(1, (yearsExp || 0) / 4);
  const certainty = seasonCertainty * 0.6 + expCertainty * 0.4;
  const customWeightIntensity = getWeightDeviationRatio(scoringWeights);
  const fcBaseWeight = 0.5 + certainty * 0.15;
  const fcWeight = clamp(
    fcBaseWeight - customWeightIntensity * 0.35,
    0.2,
    0.65,
  );
  const score = Math.max(
    5,
    Math.round(
      internalScore * (1 - fcWeight) + fantasyCalcNormalized * fcWeight,
    ),
  );
  return { score, fantasyCalcNormalized };
}

function buildPlayerMarketValue(player, leagueContext, fantasyCalcEntry) {
  // player.score is already FC-blended; build trade-specific market value on top.
  // Separately track internalValue (from raw internal score) for display/comparison.
  const applyPremiums = (base) => {
    let v = base + (leagueContext.positionPremiums[player.position] || 0) * 0.6;
    if (player.age <= 23) v += player.position === "QB" ? 8 : 5;
    else if (player.age <= 25) v += player.position === "QB" ? 5 : 3;
    else if (player.age >= 29) v -= player.position === "RB" ? 14 : 7;
    if (player.draftRound === 1) v += player.draftSlot <= 12 ? 8 : 5;
    else if (player.draftRound === 2) v += 2;
    v += getArchetypePremium(player.archetype) * 0.55;
    v += Math.max(0, ((player.currentPctile || 0) - 55) * 0.18);
    v += Math.max(0, ((player.peakPctile || 0) - 75) * 0.1);
    if (player.gp24 < 4) v -= player.draftRound === 1 ? 4 : 10;
    if (player.yearsExp <= 1 && (player.currentPctile || 0) < 45)
      v -= player.draftRound === 1 ? 3 : 8;
    if (player.position === "RB" && player.yearsExp <= 1 && player.score < 65)
      v -= 7;
    if (
      player.position !== "QB" &&
      player.archetype === "Upside Shot" &&
      player.score < 62
    )
      v -= 5;
    return Math.max(10, Math.round(v));
  };

  return {
    marketValue: applyPremiums(player.score),
    internalValue: applyPremiums(player.internalScore),
    fantasyCalcValue: Number(fantasyCalcEntry?.value || 0) || null,
    fantasyCalcRank: Number(fantasyCalcEntry?.overallRank || 0) || null,
    fantasyCalcTrend: Number(fantasyCalcEntry?.trend30Day || 0) || 0,
  };
}

function getKeepCount(pos, isSuperflex) {
  const counts = isSuperflex
    ? { QB: 3, RB: 4, WR: 5, TE: 2 }
    : { QB: 2, RB: 4, WR: 5, TE: 2 };
  return counts[pos] || 2;
}

function estimatePickValue(pick, leagueContext, tradeMarket = null) {
  if (!pick?.round) return 12;

  const currentYear = new Date().getFullYear();
  const yearsOut = Math.max(
    0,
    Number(pick.season || currentYear) - currentYear,
  );
  const slot = pick.round === 1 ? 16 : 24;
  let value = draftCapitalScore(pick.round, slot) || 12;

  if (pick.round === 1 && leagueContext.isSuperflex) value += 8;
  if (pick.round === 1 && leagueContext.tePremium) value += 2;
  if (yearsOut === 1) value -= 4;
  if (yearsOut >= 2) value -= 10;
  if (!pick.isOwn) value += 3;

  const marketMultiplier = tradeMarket?.pickRoundMultipliers?.[pick.round] || 1;
  return Math.max(8, Math.round(value * marketMultiplier));
}

function getRosterNeeds(byPos, proportions) {
  return POSITION_PRIORITY.filter((pos) => {
    const room = byPos[pos] || [];
    const roomAvg = room.length
      ? room.reduce((sum, player) => sum + player.score, 0) / room.length
      : 0;
    const premiumCount = room.filter((player) => player.score >= 65).length;
    return (
      room.length < 2 ||
      premiumCount === 0 ||
      roomAvg < 48 ||
      (proportions[pos]?.delta ?? 0) <= -5
    );
  }).sort(
    (a, b) => (proportions[a]?.delta ?? 0) - (proportions[b]?.delta ?? 0),
  );
}

function getRosterSurplusPositions(byPos, proportions, isSuperflex) {
  return POSITION_PRIORITY.filter((pos) => {
    const room = byPos[pos] || [];
    const keepCount = getKeepCount(pos, isSuperflex);
    const goodDepth = room.filter((player) => player.score >= 55).length;
    return (
      room.length > keepCount ||
      goodDepth >= keepCount ||
      (proportions[pos]?.delta ?? 0) >= 5
    );
  }).sort(
    (a, b) => (proportions[b]?.delta ?? 0) - (proportions[a]?.delta ?? 0),
  );
}

function buildRosterPicks(
  rosterId,
  league,
  tradedPicks,
  rosterLabelById,
  futureSeasons,
) {
  const draftRounds = league.settings?.draft_rounds || 5;

  const tradedAway = new Set(
    tradedPicks
      .filter(
        (pick) => pick.roster_id === rosterId && pick.owner_id !== rosterId,
      )
      .map((pick) => `${pick.season}_${pick.round}_${pick.roster_id}`),
  );

  const ownPicks = futureSeasons.flatMap((season) =>
    Array.from({ length: draftRounds }, (_, index) => index + 1)
      .filter((round) => !tradedAway.has(`${season}_${round}_${rosterId}`))
      .map((round) => ({
        season: String(season),
        round,
        isOwn: true,
        label: `${season} ${round === 1 ? "1st" : round === 2 ? "2nd" : round === 3 ? "3rd" : `${round}th`}`,
      })),
  );

  const acquiredPicks = tradedPicks
    .filter((pick) => pick.owner_id === rosterId && pick.roster_id !== rosterId)
    .map((pick) => ({
      season: String(pick.season),
      round: pick.round,
      isOwn: false,
      fromTeam:
        rosterLabelById.get(pick.roster_id) || `Roster ${pick.roster_id}`,
      label: `${pick.season} ${pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `${pick.round}th`} via ${rosterLabelById.get(pick.roster_id) || `Roster ${pick.roster_id}`}`,
    }));

  return [...ownPicks, ...acquiredPicks].sort(
    (a, b) => a.season.localeCompare(b.season) || a.round - b.round,
  );
}

function buildRosterSnapshot(
  roster,
  players,
  league,
  tradedPicks,
  stats24,
  stats23,
  stats22,
  benchmarks,
  scoringWeights,
  rosterLabelById,
  leagueContext,
  fantasyCalcContext,
  futureSeasons,
) {
  const playerIds = roster.players || [];
  const picks = buildRosterPicks(
    roster.roster_id,
    league,
    tradedPicks,
    rosterLabelById,
    futureSeasons,
  );

  const enriched = playerIds
    .map((id) => {
      const p = players[id];
      if (!p) return null;
      const pos = p.fantasy_positions?.[0] || p.position;
      if (!POSITION_PRIORITY.includes(pos)) return null;

      const s24 = stats24[id] || null;
      const s23 = stats23[id] || null;
      const s22 = stats22[id] || null;
      const age = p.age || 26;
      const yearsExp = p.years_exp ?? 0;
      // Sleeper stores draft info on p directly (number) or in metadata (string).
      // Parse to numbers so all === 1, === 2 comparisons work regardless of source.
      const rawDraftRound = p.draft_round ?? p.metadata?.draft_round;
      const rawDraftSlot = p.draft_slot ?? p.metadata?.draft_slot;
      const draftRound =
        rawDraftRound != null ? Number(rawDraftRound) || null : null;
      const draftSlot =
        rawDraftSlot != null ? Number(rawDraftSlot) || null : null;
      const draftYear = p.draft_year ?? p.metadata?.draft_year ?? null;

      const playerData = {
        position: pos,
        age,
        yearsExp,
        draftRound,
        draftSlot,
        team: p.team || "FA",
        injuryStatus: p.injury_status || null,
        depthOrder: p.depth_chart_order || 2,
      };

      const pctiles = playerPctiles(s24, s23, s22, pos, benchmarks);
      const { score: internalScore, components } = calcScore(
        playerData,
        s24,
        s23,
        pctiles.current,
        benchmarks.ageCurves,
        scoringWeights,
      );
      const ppg = s24?.gp > 0 ? ((s24.pts_ppr || 0) / s24.gp).toFixed(1) : null;
      const gp24 = s24?.gp || 0;

      // Blend internal score with FC market data NOW so every downstream grade
      // (verdict, archetype, room quality, trade value) uses the FC-informed score.
      const fantasyCalcEntry = fantasyCalcContext.bySleeperId.get(String(id));
      const { score, fantasyCalcNormalized } = computeBlendedScore(
        internalScore,
        fantasyCalcEntry,
        fantasyCalcContext,
        gp24,
        yearsExp,
        scoringWeights,
      );

      const verdict = getVerdict(score);

      const enrichedPlayer = {
        id,
        score,
        internalScore,
        fantasyCalcNormalized,
        components,
        verdict,
        name: `${p.first_name} ${p.last_name}`,
        position: pos,
        team: p.team || "FA",
        age,
        yearsExp,
        draftRound,
        draftSlot,
        draftYear,
        injuryStatus: p.injury_status || null,
        ppg,
        gp24,
        peakPctile: pctiles.peak,
        currentPctile: pctiles.current,
        pctile24: pctiles.p24,
        pctile23: pctiles.p23,
        pctile22: pctiles.p22,
        draftTier: draftTierLabel(draftRound, draftSlot),
      };

      enrichedPlayer.archetype = getArchetype(enrichedPlayer);
      enrichedPlayer.tags = getArchetypeTags(enrichedPlayer);
      enrichedPlayer.confidence = getConfidence(enrichedPlayer);
      const market = buildPlayerMarketValue(
        enrichedPlayer,
        leagueContext,
        fantasyCalcEntry,
      );
      enrichedPlayer.marketValue = market.marketValue;
      enrichedPlayer.internalValue = market.internalValue;
      enrichedPlayer.fantasyCalcValue = market.fantasyCalcValue;
      enrichedPlayer.fantasyCalcRank = market.fantasyCalcRank;
      enrichedPlayer.fantasyCalcTrend = market.fantasyCalcTrend;
      return enrichedPlayer;
    })
    .filter(Boolean);

  const byPos = {};
  POSITION_PRIORITY.forEach((pos) => {
    byPos[pos] = enriched
      .filter((player) => player.position === pos)
      .sort((a, b) => b.score - a.score);
  });

  const totalScore =
    enriched.reduce((sum, player) => sum + player.score, 0) || 1;
  const proportions = {};
  POSITION_PRIORITY.forEach((pos) => {
    const posScore = byPos[pos].reduce((sum, player) => sum + player.score, 0);
    const actual = posScore / totalScore;
    const ideal = IDEAL_PROPORTION[pos];
    proportions[pos] = {
      actual: Math.round(actual * 100),
      ideal: Math.round(ideal * 100),
      delta: Math.round((actual - ideal) * 100),
    };
  });

  const sells = enriched
    .filter((player) => player.verdict === "sell" || player.verdict === "cut")
    .sort((a, b) => a.score - b.score);
  const buys = enriched
    .filter((player) => player.verdict === "buy")
    .sort((a, b) => b.score - a.score);
  const holds = enriched.filter((player) => player.verdict === "hold");
  const avgAge = enriched.length
    ? (
        enriched.reduce((sum, player) => sum + player.age, 0) / enriched.length
      ).toFixed(1)
    : "N/A";
  const avgScore = enriched.length
    ? Math.round(
        enriched.reduce((sum, player) => sum + player.score, 0) /
          enriched.length,
      )
    : 0;

  const picksByYear = {};
  picks.forEach((pick) => {
    const year = pick.season || "Unknown";
    if (!picksByYear[year]) picksByYear[year] = [];
    picksByYear[year].push(pick);
  });

  const weakRooms = POSITION_PRIORITY.filter((pos) => {
    const room = byPos[pos];
    return (
      room.length < 2 ||
      room.filter((player) => player.verdict === "buy").length === 0
    );
  });

  const needs = getRosterNeeds(byPos, proportions);
  const surplusPositions = getRosterSurplusPositions(
    byPos,
    proportions,
    leagueContext.isSuperflex,
  );

  const tradeablePlayers = Array.from(
    new Map(
      [
        ...sells,
        ...surplusPositions.flatMap((pos) =>
          byPos[pos].slice(getKeepCount(pos, leagueContext.isSuperflex)),
        ),
        ...surplusPositions.flatMap((pos) =>
          byPos[pos].filter(
            (player, index) =>
              index >= 1 &&
              player.score >= 45 &&
              player.archetype !== "Cornerstone",
          ),
        ),
      ].map((player) => [player.id, player]),
    ).values(),
  ).sort((a, b) => b.score - a.score);

  const targetablePlayers = POSITION_PRIORITY.flatMap((pos) =>
    byPos[pos].filter((player, index) => {
      const untouchable =
        (index === 0 && player.score >= 78) ||
        player.archetype === "Cornerstone" ||
        (player.archetype === "Foundational" && player.score >= 75);
      if (untouchable) return false;
      return (
        index >=
          Math.max(1, getKeepCount(pos, leagueContext.isSuperflex) - 2) ||
        player.age >= 27
      );
    }),
  ).sort((a, b) => b.score - a.score);

  return {
    rosterId: roster.roster_id,
    ownerId: roster.owner_id,
    label:
      rosterLabelById.get(roster.roster_id) || `Roster ${roster.roster_id}`,
    enriched,
    byPos,
    sells,
    buys,
    holds,
    avgAge,
    avgScore,
    picksByYear,
    weakRooms,
    picks,
    proportions,
    needs,
    surplusPositions,
    tradeablePlayers,
    targetablePlayers,
  };
}

function createAssetLabel(asset) {
  if (asset.type === "pick") return asset.label;
  return `${asset.name} (${asset.position}, ${asset.score})`;
}

function isPremiumQuarterbackTarget(target, leagueContext, targetValue) {
  return (
    leagueContext.isSuperflex &&
    target.position === "QB" &&
    targetValue >= 88 &&
    (target.age <= 26 || target.draftRound === 1)
  );
}

function isMeaningfulAsset(asset, targetValue) {
  if (asset.type === "pick") {
    return asset.round <= 2;
  }
  return asset.value >= Math.max(58, Math.round(targetValue * 0.6));
}

function packageHasAnchorAsset(assets, targetValue, target, leagueContext) {
  return assets.some((asset) => {
    if (asset.type === "pick") {
      return (
        asset.round === 1 ||
        (asset.round === 2 &&
          isPremiumQuarterbackTarget(target, leagueContext, targetValue))
      );
    }
    if (asset.position === "QB") return asset.value >= 55;
    return asset.value >= Math.max(60, Math.round(targetValue * 0.62));
  });
}

function getTargetAssetClass(target, leagueContext, targetValue) {
  if (isPremiumQuarterbackTarget(target, leagueContext, targetValue)) {
    return "premium_qb";
  }
  if (target.position === "WR" && target.age <= 24 && targetValue >= 82) {
    return "young_premium_wr";
  }
  if (
    target.position === "TE" &&
    leagueContext.tePremium &&
    targetValue >= 78
  ) {
    return "premium_te";
  }
  if (targetValue >= 86) return "elite_asset";
  if (targetValue >= 72) return "core_asset";
  return "starter_asset";
}

function getPackageRules(target, leagueContext, targetValue) {
  const assetClass = getTargetAssetClass(target, leagueContext, targetValue);

  if (assetClass === "premium_qb") {
    return {
      assetClass,
      minMeaningfulAssets: 2,
      minPackageSize: 2,
      requireAnchorAsset: true,
      allowPickOnly: false,
      maxOverpay: 6,
      underpayTolerance: 0,
      minPlayerValue: Math.max(62, Math.round(targetValue * 0.7)),
      requireFirstOrEquivalent: true,
    };
  }

  if (assetClass === "young_premium_wr") {
    return {
      assetClass,
      minMeaningfulAssets: 2,
      minPackageSize: 2,
      requireAnchorAsset: true,
      allowPickOnly: false,
      maxOverpay: 8,
      underpayTolerance: 1,
      minPlayerValue: Math.max(58, Math.round(targetValue * 0.64)),
      requireFirstOrEquivalent: false,
    };
  }

  if (assetClass === "premium_te") {
    return {
      assetClass,
      minMeaningfulAssets: 2,
      minPackageSize: 2,
      requireAnchorAsset: true,
      allowPickOnly: false,
      maxOverpay: 8,
      underpayTolerance: 2,
      minPlayerValue: Math.max(56, Math.round(targetValue * 0.62)),
      requireFirstOrEquivalent: false,
    };
  }

  if (assetClass === "elite_asset") {
    return {
      assetClass,
      minMeaningfulAssets: 2,
      minPackageSize: 2,
      requireAnchorAsset: true,
      allowPickOnly: false,
      maxOverpay: 10,
      underpayTolerance: 2,
      minPlayerValue: Math.max(54, Math.round(targetValue * 0.58)),
      requireFirstOrEquivalent: false,
    };
  }

  if (assetClass === "core_asset") {
    return {
      assetClass,
      minMeaningfulAssets: 1,
      minPackageSize: 1,
      requireAnchorAsset: false,
      allowPickOnly: false,
      maxOverpay: 10,
      underpayTolerance: 2,
      minPlayerValue: 50,
      requireFirstOrEquivalent: false,
    };
  }

  return {
    assetClass,
    minMeaningfulAssets: 1,
    minPackageSize: 1,
    requireAnchorAsset: false,
    allowPickOnly: true,
    maxOverpay: 8,
    underpayTolerance: 3,
    minPlayerValue: 0,
    requireFirstOrEquivalent: false,
  };
}

function packageHasFirstOrEquivalent(assets, targetValue) {
  return assets.some((asset) => {
    if (asset.type === "pick") return asset.round === 1;
    return asset.value >= Math.max(70, Math.round(targetValue * 0.76));
  });
}

function isCleanTradeShape(sent, received) {
  const totalAssets = sent.length + received.length;
  if (!sent.length || !received.length) return false;
  if (sent.length > 3 || received.length > 3) return false;
  if (totalAssets > 4) return false;
  return true;
}

function isCleanPlayerComp(received, sent) {
  const receivedPlayers = received.filter((asset) => asset.type === "player");
  const sentPlayers = sent.filter((asset) => asset.type === "player");
  return (
    isCleanTradeShape(sent, received) &&
    receivedPlayers.length === 1 &&
    received.length <= 2 &&
    sentPlayers.length <= 1
  );
}

function getSuggestionTier(targetValue, marketGap, rules) {
  const gap = Math.abs(marketGap);
  if (
    rules.assetClass === "premium_qb" ||
    rules.assetClass === "young_premium_wr"
  ) {
    return gap <= 3 ? "blockbuster" : "aggressive";
  }
  if (targetValue >= 80) return gap <= 4 ? "aggressive" : "blockbuster";
  if (targetValue >= 68) return gap <= 5 ? "balanced" : "aggressive";
  return "balanced";
}

function getAssetTradeValue(
  asset,
  playerMarketMap,
  leagueContext,
  tradeMarket,
) {
  if (asset.type === "pick") {
    return estimatePickValue(asset, leagueContext, tradeMarket);
  }

  const player = playerMarketMap.get(String(asset.id)) || asset;
  const multiplier = tradeMarket?.positionMultipliers?.[player.position] || 1;
  return Math.round((player.marketValue || player.score || 40) * multiplier);
}

function pushRosterAsset(map, rosterId, asset) {
  if (rosterId == null) return;
  const key = String(rosterId);
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(asset);
}

function buildTradeMarket(transactions, leagueTeams, leagueContext) {
  const playerMarketMap = new Map(
    leagueTeams.flatMap((team) =>
      team.enriched.map((player) => [String(player.id), player]),
    ),
  );
  const positionSamples = { QB: [], RB: [], WR: [], TE: [] };
  const pickSamples = { 1: [], 2: [], 3: [], 4: [] };
  const recentTrades = [];
  let cleanTradeCount = 0;

  transactions.forEach((transaction) => {
    const sentByRoster = new Map();
    const receivedByRoster = new Map();

    Object.entries(transaction.adds || {}).forEach(([playerId, toRoster]) => {
      const fromRoster = transaction.drops?.[playerId];
      const player = playerMarketMap.get(String(playerId));
      if (!player || fromRoster == null) return;

      const asset = { ...player, type: "player", label: player.name };
      pushRosterAsset(sentByRoster, fromRoster, asset);
      pushRosterAsset(receivedByRoster, toRoster, asset);
    });

    (transaction.draft_picks || []).forEach((pick) => {
      const asset = {
        type: "pick",
        season: String(pick.season),
        round: pick.round,
        isOwn: false,
        label: `${pick.season} ${pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `${pick.round}th`}`,
      };
      pushRosterAsset(sentByRoster, pick.previous_owner_id, asset);
      pushRosterAsset(receivedByRoster, pick.owner_id, asset);
    });

    Array.from(receivedByRoster.keys()).forEach((rosterId) => {
      const received = receivedByRoster.get(rosterId) || [];
      const sent = sentByRoster.get(rosterId) || [];
      if (!received.length || !sent.length) return;

      const receivedValue = received.reduce(
        (sum, asset) =>
          sum + getAssetTradeValue(asset, playerMarketMap, leagueContext, null),
        0,
      );
      const sentValue = sent.reduce(
        (sum, asset) =>
          sum + getAssetTradeValue(asset, playerMarketMap, leagueContext, null),
        0,
      );
      if (!receivedValue || !sentValue) return;

      if (!isCleanTradeShape(sent, received)) return;

      cleanTradeCount += 1;

      const ratio = Math.max(0.82, Math.min(1.3, sentValue / receivedValue));

      received.forEach((asset) => {
        if (asset.type === "player" && positionSamples[asset.position]) {
          positionSamples[asset.position].push(ratio);
          if (recentTrades.length < 12 && isCleanPlayerComp(received, sent)) {
            recentTrades.push({
              position: asset.position,
              target: asset.name,
              cost: sent.map(createAssetLabel).join(" + "),
              shape: `${sent.length}-for-${received.length}`,
            });
          }
        }

        if (asset.type === "pick" && pickSamples[asset.round]) {
          pickSamples[asset.round].push(ratio);
        }
      });
    });
  });

  const avg = (values, fallback = 1) =>
    values.length
      ? Number(
          (
            values.reduce((sum, value) => sum + value, 0) / values.length
          ).toFixed(2),
        )
      : fallback;

  return {
    positionMultipliers: {
      QB: avg(positionSamples.QB, 1),
      RB: avg(positionSamples.RB, 1),
      WR: avg(positionSamples.WR, 1),
      TE: avg(positionSamples.TE, 1),
    },
    pickRoundMultipliers: {
      1: avg(pickSamples[1], 1),
      2: avg(pickSamples[2], 1),
      3: avg(pickSamples[3], 1),
      4: avg(pickSamples[4], 1),
    },
    sampleCount: cleanTradeCount,
    recentTrades,
  };
}

function buildOfferPackage(
  target,
  myTeam,
  partner,
  playerMarketMap,
  leagueContext,
  tradeMarket,
) {
  const partnerNeeds = new Set(partner.needs);
  const currentYear = new Date().getFullYear();
  const targetValue = getAssetTradeValue(
    { ...target, type: "player" },
    playerMarketMap,
    leagueContext,
    tradeMarket,
  );
  const premiumQuarterback = isPremiumQuarterbackTarget(
    target,
    leagueContext,
    targetValue,
  );
  const rules = getPackageRules(target, leagueContext, targetValue);
  const pickAssets = myTeam.picks
    .filter((pick) => {
      const season = Number(pick.season);
      if (season > currentYear + 1) return false;
      if (premiumQuarterback && pick.round > 2) return false;
      return pick.round <= 3;
    })
    .map((pick) => ({
      ...pick,
      type: "pick",
      value: estimatePickValue(pick, leagueContext, tradeMarket),
    }))
    .sort((a, b) => b.value - a.value);

  const playerAssets = myTeam.tradeablePlayers
    .map((player) => ({
      ...player,
      type: "player",
      value: getAssetTradeValue(
        { ...player, type: "player" },
        playerMarketMap,
        leagueContext,
        tradeMarket,
      ),
      fitBoost: partnerNeeds.has(player.position) ? 10 : 0,
    }))
    .sort((a, b) => b.fitBoost + b.value - (a.fitBoost + a.value));

  for (const player of playerAssets) {
    if (
      premiumQuarterback &&
      player.position !== "QB" &&
      player.value < rules.minPlayerValue
    ) {
      continue;
    }

    if (player.type === "player" && player.value < rules.minPlayerValue) {
      continue;
    }

    let packageAssets = [player];
    let totalValue = player.value;

    if (totalValue < targetValue - rules.underpayTolerance) {
      for (const pick of pickAssets) {
        if (
          packageAssets.some(
            (asset) =>
              asset.type === "pick" &&
              asset.round === pick.round &&
              asset.season === pick.season,
          )
        ) {
          continue;
        }
        packageAssets.push(pick);
        totalValue += pick.value;
        if (totalValue >= targetValue - rules.underpayTolerance) break;
      }
    }

    const meaningfulAssets = packageAssets.filter((asset) =>
      isMeaningfulAsset(asset, targetValue),
    ).length;
    const hasAnchorAsset = packageHasAnchorAsset(
      packageAssets,
      targetValue,
      target,
      leagueContext,
    );
    const hasFirstEquivalent = packageHasFirstOrEquivalent(
      packageAssets,
      targetValue,
    );

    if (
      totalValue >= targetValue - rules.underpayTolerance &&
      totalValue <= targetValue + rules.maxOverpay &&
      (partnerNeeds.has(player.position) || packageAssets.length > 1) &&
      packageAssets.length >= rules.minPackageSize &&
      meaningfulAssets >= rules.minMeaningfulAssets &&
      (!rules.requireAnchorAsset || hasAnchorAsset) &&
      (!rules.requireFirstOrEquivalent || hasFirstEquivalent)
    ) {
      return {
        assets: packageAssets,
        outgoingValue: totalValue,
        targetValue,
        rules,
      };
    }
  }

  if (targetValue <= 68 && !premiumQuarterback && rules.allowPickOnly) {
    let packageAssets = [];
    let totalValue = 0;
    for (const pick of pickAssets) {
      packageAssets.push(pick);
      totalValue += pick.value;
      if (totalValue >= targetValue - 3) break;
    }
    if (
      packageAssets.length &&
      totalValue >= targetValue - rules.underpayTolerance &&
      totalValue <= targetValue + rules.maxOverpay
    ) {
      return {
        assets: packageAssets,
        outgoingValue: totalValue,
        targetValue,
        rules,
      };
    }
  }

  return null;
}

function buildTradeSuggestions(
  myTeam,
  leagueTeams,
  leagueContext,
  tradeMarket,
) {
  const suggestions = [];
  const playerMarketMap = new Map(
    leagueTeams.flatMap((team) =>
      team.enriched.map((player) => [String(player.id), player]),
    ),
  );

  leagueTeams
    .filter((team) => team.rosterId !== myTeam.rosterId)
    .forEach((partner) => {
      myTeam.needs.slice(0, 3).forEach((needPos) => {
        if (partner.weakRooms.includes(needPos)) return;

        partner.targetablePlayers
          .filter((player) => player.position === needPos)
          .slice(0, 3)
          .forEach((target) => {
            const offer = buildOfferPackage(
              target,
              myTeam,
              partner,
              playerMarketMap,
              leagueContext,
              tradeMarket,
            );
            if (!offer) return;

            const partnerNeedText = partner.needs.length
              ? partner.needs.slice(0, 2).join(" / ")
              : "future pick liquidity";
            const sendText = offer.assets.map(createAssetLabel);
            const targetTradeValue = getAssetTradeValue(
              { ...target, type: "player" },
              playerMarketMap,
              leagueContext,
              tradeMarket,
            );
            const marketPremium =
              tradeMarket.positionMultipliers[target.position] || 1;
            const recentComp = tradeMarket.recentTrades.find(
              (trade) => trade.position === target.position,
            );
            const tier = getSuggestionTier(
              targetTradeValue,
              offer.outgoingValue - targetTradeValue,
              offer.rules,
            );
            const fitScore =
              targetTradeValue +
              (partner.needs.some((need) =>
                offer.assets.some((asset) => asset.position === need),
              )
                ? 12
                : 0) +
              (myTeam.surplusPositions.includes(needPos) ? -8 : 8) -
              Math.abs(targetTradeValue - offer.outgoingValue);

            suggestions.push({
              partnerTeam: partner.label,
              needPos,
              targetPlayer: target,
              tier,
              marketGap: offer.outgoingValue - targetTradeValue,
              marketNote: `${target.position} market in this league is running ${marketPremium.toFixed(2)}x baseline across ${tradeMarket.sampleCount} recent trades.`,
              recentComp,
              receive: [
                {
                  type: "player",
                  label: `${target.name} (${target.position})`,
                },
              ],
              send: sendText,
              fitScore,
              summary: `${partner.label} can spare ${needPos} help, while your outgoing package is sized to both their ${partnerNeedText} needs and your league's recent trade prices.`,
              rationale: [
                `You are thin at ${needPos} and ${target.name} carries a ${target.score}/100 dynasty score with an adjusted trade value of ${targetTradeValue}.`,
                `${partner.label} profiles weak at ${partnerNeedText}.`,
                `Suggested send: ${sendText.join(" + ")} (${offer.outgoingValue} total market value).`,
                `${leagueContext.formatLabel} boosts ${target.position} pricing in this room.`,
                recentComp
                  ? `Recent clean comp (${recentComp.shape}): ${recentComp.target} was acquired for ${recentComp.cost}.`
                  : `No exact recent comp found, so this package leans on league-rule pricing instead.`,
              ],
            });
          });
      });
    });

  return suggestions
    .sort((a, b) => b.fitScore - a.fitScore)
    .filter(
      (suggestion, index, list) =>
        list.findIndex(
          (item) =>
            item.partnerTeam === suggestion.partnerTeam &&
            item.targetPlayer.id === suggestion.targetPlayer.id,
        ) === index,
    )
    .slice(0, 6);
}

export function buildRosterAnalysis(
  myRoster,
  players,
  league,
  tradedPicks,
  stats24,
  stats23,
  stats22 = {},
  transactions = [],
  fantasyCalcValues = [],
  users = [],
  rosters = [],
  historicalStats = [],
  scoringWeights = DEFAULT_SCORING_WEIGHTS,
) {
  const currentYear = new Date().getFullYear();
  const futureSeasons = [currentYear, currentYear + 1, currentYear + 2];
  const userById = new Map(
    users.map((user) => [
      user.user_id,
      user.metadata?.team_name || user.team_name || user.display_name,
    ]),
  );
  const rosterLabelById = new Map(
    rosters.map((roster) => [
      roster.roster_id,
      userById.get(roster.owner_id) ||
        roster.settings?.team_name ||
        `Roster ${roster.roster_id}`,
    ]),
  );

  const leagueContext = getLeagueRulesContext(league);
  const benchmarks = buildBenchmarks(
    players,
    stats22,
    stats23,
    stats24,
    leagueContext,
    historicalStats,
  );
  const fantasyCalcContext = buildFantasyCalcContext(fantasyCalcValues);
  const sourceRosters = rosters.length ? rosters : [myRoster];

  const leagueTeams = sourceRosters.map((roster) =>
    buildRosterSnapshot(
      roster,
      players,
      league,
      tradedPicks,
      stats24,
      stats23,
      stats22,
      benchmarks,
      scoringWeights,
      rosterLabelById,
      leagueContext,
      fantasyCalcContext,
      futureSeasons,
    ),
  );

  const myTeam =
    leagueTeams.find((team) => team.rosterId === myRoster.roster_id) ||
    leagueTeams[0];
  const tradeMarket = buildTradeMarket(
    transactions,
    leagueTeams,
    leagueContext,
  );
  const tradeSuggestions = buildTradeSuggestions(
    myTeam,
    leagueTeams,
    leagueContext,
    tradeMarket,
  );

  return {
    ...myTeam,
    isSuperflex: leagueContext.isSuperflex,
    myTeamLabel: myTeam.label,
    leagueTeams,
    leagueContext,
    fantasyCalcSource: {
      enabled: fantasyCalcContext.totalPlayers > 0,
      totalPlayers: fantasyCalcContext.totalPlayers,
      attribution: "FantasyCalc",
      url: "https://www.fantasycalc.com/",
    },
    scoringWeights,
    tradeMarket,
    tradeSuggestions,
    tradeBlock: myTeam.tradeablePlayers.slice(0, 8),
  };
}
