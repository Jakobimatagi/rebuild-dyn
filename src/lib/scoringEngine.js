/**
 * scoringEngine.js
 * Core math for player scoring: weight constants, score components,
 * stat benchmarks, and age curves.
 */
import { POSITION_PRIORITY } from "../constants";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

export const DEFAULT_SCORING_WEIGHTS = {
  age: 35,
  prod: 30,
  avail: 15,
  trend: 10,
  situ: 10,
};

export function normalizeScoringWeights(weights = DEFAULT_SCORING_WEIGHTS) {
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

export function getWeightDeviationRatio(weights = DEFAULT_SCORING_WEIGHTS) {
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

// ---------------------------------------------------------------------------
// Age curves
// ---------------------------------------------------------------------------

export const AGE_CURVES_FALLBACK = {
  QB: { peak: 27, decline: 32, cliff: 35 },
  RB: { peak: 24, decline: 27, cliff: 30 },
  WR: { peak: 26, decline: 30, cliff: 33 },
  TE: { peak: 27, decline: 30, cliff: 33 },
};

// Derives age-production curves from actual player-season data.
// Each bucket needs MIN_BUCKET_SIZE samples before we trust it; positions with
// insufficient data fall back to the hardcoded curves above.
const MIN_BUCKET_SIZE = 8;

export function buildAgeCurves(players, allStatYears) {
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

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

export function buildBenchmarks(
  players,
  stats22,
  stats23,
  stats24,
  leagueContext = null,
  historicalStats = [],
  lastSeasonYear,
) {
  const yr0 = String(lastSeasonYear);
  const yr1 = String(lastSeasonYear - 1);
  const yr2 = String(lastSeasonYear - 2);

  const raw = { QB: {}, RB: {}, WR: {}, TE: {} };
  POSITION_PRIORITY.forEach((pos) => {
    raw[pos] = { [yr0]: [], [yr1]: [], [yr2]: [] };
  });

  const allStats = { [yr0]: stats24, [yr1]: stats23, [yr2]: stats22 };
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
    [yr0, yr1, yr2].forEach((yr) => {
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
    { year: lastSeasonYear, stats: stats24 },
    { year: lastSeasonYear - 1, stats: stats23 },
    { year: lastSeasonYear - 2, stats: stats22 },
    ...historicalStats,
  ];
  const ageCurves = buildAgeCurves(players, allForAgeCurves);

  return { raw, replacementLevel, ageCurves };
}

export function getPctileRank(ppg, sorted) {
  if (!ppg || !sorted?.length) return null;
  const below = sorted.filter((v) => v < ppg).length;
  return Math.round((below / sorted.length) * 100);
}

export function playerPctiles(s24, s23, s22, pos, benchmarks, lastSeasonYear) {
  // Support both old format (raw arrays) and new format ({ raw, replacementLevel })
  const raw = benchmarks.raw || benchmarks;
  const rl = benchmarks.replacementLevel?.[pos] || {};
  const b = raw[pos] || {};

  const yr0 = String(lastSeasonYear);
  const yr1 = String(lastSeasonYear - 1);
  const yr2 = String(lastSeasonYear - 2);

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

  const pLast = parAdjPctile(ppgOf(s24), b[yr0], rl[yr0] || 0);
  const pPrev = parAdjPctile(ppgOf(s23), b[yr1], rl[yr1] || 0);
  const pOlder = parAdjPctile(ppgOf(s22), b[yr2], rl[yr2] || 0);
  const valid = [pLast, pPrev, pOlder].filter((v) => v !== null);
  const peak = valid.length > 0 ? Math.max(...valid) : null;
  const current = pLast ?? (peak != null ? Math.round(peak * 0.65) : 40);
  return { current, peak, pLast, pPrev, pOlder };
}

// ---------------------------------------------------------------------------
// Draft capital scoring
// ---------------------------------------------------------------------------

export function draftCapitalScore(round, slot) {
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

// ---------------------------------------------------------------------------
// Score components
// ---------------------------------------------------------------------------

export function ageComponent(pos, age, ageCurves) {
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

export function availComponent(seasonStats, injuryStatus) {
  // seasonStats is [sLast, sPrev, ...] ordered most-recent to oldest
  // Fall back to the most recent season that has game data (handles rookies)
  const s = Array.isArray(seasonStats)
    ? seasonStats.find((s) => s?.gp > 0) || null
    : seasonStats;
  const gp = s?.gp || 0;
  const base = (gp / 17) * 100;
  const penalty =
    { IR: 20, Out: 10, Doubtful: 5, Questionable: 2, PUP: 15 }[injuryStatus] ||
    0;
  return Math.max(0, Math.min(100, base - penalty));
}

export function trendComponent(s24, s23) {
  const gpLast = s24?.gp || 0;
  const gpPrev = s23?.gp || 0;
  // Need enough games in last season to say anything meaningful
  if (gpLast < 4) return 50;
  const ppgLast = (s24.pts_ppr || 0) / gpLast;
  // Single-season player (rookie / only 1 year of data): score against a
  // cross-position baseline of 10 ppg so strong rookies trend up, weak ones down.
  if (gpPrev < 4) {
    const baseline = 10;
    const pct = (ppgLast - baseline) / baseline;
    return Math.min(100, Math.max(0, 60 + pct * 100));
  }
  const ppgPrev = (s23.pts_ppr || 0) / gpPrev;
  if (ppgPrev === 0) return 50;
  const pct = (ppgLast - ppgPrev) / ppgPrev;
  return Math.min(100, Math.max(0, 60 + pct * 100));
}

export function situComponent(depthOrder, team) {
  if (!team || team === "FA") return 20;
  if (depthOrder === 1) return 90;
  if (depthOrder === 2) return 55;
  return 30;
}

// ---------------------------------------------------------------------------
// Combined score
// ---------------------------------------------------------------------------

export function calcScore(
  player,
  s24,
  s23,
  currentPctile,
  ageCurves,
  scoringWeights = DEFAULT_SCORING_WEIGHTS,
) {
  const age = ageComponent(player.position, player.age, ageCurves);
  const avail = availComponent([s24, s23], player.injuryStatus);
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
