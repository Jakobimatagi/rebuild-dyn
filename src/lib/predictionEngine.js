/**
 * predictionEngine.js
 *
 * Dynasty predictive model: empirical age curves built from real historical
 * Sleeper stats, historical player comp matching, 3-year score projections,
 * breakout probability, and bust/cliff risk assessment.
 *
 * Data sources used (all free):
 *   - Sleeper /stats/nfl/regular/{year}  → up to 11 seasons (2014-2024)
 *   - Sleeper /players/nfl               → age, draft info, position
 *   - FantasyCalc                        → already blended upstream in scoring
 */

import { POSITION_PRIORITY } from '../constants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_GAMES_SEASON = 8;   // Minimum games in a season to use for curve data
const MIN_BUCKET_SIZE = 5;    // Minimum player-seasons per age bucket to trust it

// Position-specific career arc knowledge (used as fallback / guard rails)
export const POS_CAREER = {
  QB: { peak: 27, decline: 33, cliff: 38, breakoutStart: 22, breakoutEnd: 26 },
  RB: { peak: 24, decline: 27, cliff: 30, breakoutStart: 21, breakoutEnd: 23 },
  WR: { peak: 26, decline: 30, cliff: 33, breakoutStart: 22, breakoutEnd: 25 },
  TE: { peak: 27, decline: 31, cliff: 34, breakoutStart: 23, breakoutEnd: 26 },
};

// ---------------------------------------------------------------------------
// Detailed empirical age curves
// ---------------------------------------------------------------------------

/**
 * Build per-age PPG statistics from all available historical seasons.
 * Returns { QB: { 22: { median, mean, p75, p25, n }, 23: {...}, ... }, RB: {...}, ... }
 *
 * More seasons → more samples per age bucket → more reliable curves.
 * With 11 years (2014-2024) we get ~50-100 samples per age bucket at peak ages.
 */
export function buildDetailedAgeCurves(allStatYears, players) {
  const currentYear = new Date().getFullYear();
  const buckets = {};
  POSITION_PRIORITY.forEach((pos) => {
    buckets[pos] = {};
  });

  for (const { year, stats } of allStatYears) {
    if (!stats || typeof stats !== 'object') continue;
    for (const [id, s] of Object.entries(stats)) {
      if (!s?.gp || s.gp < MIN_GAMES_SEASON) continue;
      const p = players[id];
      if (!p) continue;
      const pos = p.fantasy_positions?.[0] || p.position;
      if (!POSITION_PRIORITY.includes(pos)) continue;

      const ppg = (s.pts_ppr || 0) / s.gp;
      if (ppg <= 0) continue;

      // Derive player's age during that historical season
      const ageInSeason = (p.age || 26) - (currentYear - year);
      if (ageInSeason < 20 || ageInSeason > 42) continue;

      if (!buckets[pos][ageInSeason]) buckets[pos][ageInSeason] = [];
      buckets[pos][ageInSeason].push(ppg);
    }
  }

  const detailed = {};
  for (const pos of POSITION_PRIORITY) {
    detailed[pos] = {};
    for (const [ageStr, values] of Object.entries(buckets[pos])) {
      const age = parseInt(ageStr, 10);
      if (values.length < MIN_BUCKET_SIZE) continue;
      const sorted = [...values].sort((a, b) => a - b);
      const n = sorted.length;
      detailed[pos][age] = {
        median: sorted[Math.floor(n / 2)],
        mean: sorted.reduce((a, b) => a + b, 0) / n,
        p75: sorted[Math.floor(n * 0.75)],
        p25: sorted[Math.floor(n * 0.25)],
        n,
      };
    }
    // Fill gaps between known age buckets via linear interpolation
    detailed[pos] = fillCurveGaps(detailed[pos]);
  }

  return detailed;
}

function fillCurveGaps(curve) {
  const ages = Object.keys(curve).map(Number).sort((a, b) => a - b);
  if (ages.length < 2) return curve;
  const result = { ...curve };
  const minAge = ages[0];
  const maxAge = ages[ages.length - 1];

  for (let age = minAge; age <= maxAge; age++) {
    if (result[age]) continue;
    const before = ages.filter((a) => a < age).pop();
    const after = ages.find((a) => a > age);
    if (before !== undefined && after !== undefined) {
      const t = (age - before) / (after - before);
      result[age] = {
        median: lerp(result[before].median, result[after].median, t),
        mean: lerp(result[before].mean, result[after].mean, t),
        p75: lerp(result[before].p75, result[after].p75, t),
        p25: lerp(result[before].p25, result[after].p25, t),
        n: Math.min(result[before].n, result[after].n),
        interpolated: true,
      };
    }
  }
  return result;
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Compute how much a position's median production typically changes
 * from age A to age A+n (returns a multiplier).
 *   > 1.0  →  expected improvement
 *   = 1.0  →  stable
 *   < 1.0  →  expected decline
 */
function computeAgeFactor(pos, currentAge, yearsAhead, detailedCurves, ageCurves) {
  const detailed = detailedCurves?.[pos];
  const futureAge = currentAge + yearsAhead;

  if (detailed?.[currentAge]?.median && detailed?.[futureAge]?.median) {
    return detailed[futureAge].median / detailed[currentAge].median;
  }

  // Fallback: use the existing peak/decline/cliff thresholds
  const c = ageCurves?.[pos] || POS_CAREER[pos];
  return fallbackAgeFactor(c, currentAge, futureAge);
}

function fallbackAgeFactor(curve, fromAge, toAge) {
  const scoreAt = (a) => {
    if (a <= curve.peak) return 1.0 + (a - curve.peak) * 0.025;
    if (a <= curve.decline)
      return 1.0 - ((a - curve.peak) / (curve.decline - curve.peak)) * 0.5;
    if (a <= curve.cliff)
      return 0.5 - ((a - curve.decline) / (curve.cliff - curve.decline)) * 0.35;
    return 0.15;
  };
  const from = Math.max(0.05, scoreAt(fromAge));
  const to = Math.max(0.05, scoreAt(toAge));
  return to / from;
}

// ---------------------------------------------------------------------------
// Historical snapshot database (foundation for comp matching)
// ---------------------------------------------------------------------------

/**
 * Build a map: year → position → playerId → percentile rank (0-100).
 * Used to see where each player ranked among peers in every season.
 */
function buildYearPercentiles(allStatYears, players) {
  const result = {};
  const currentYear = new Date().getFullYear();

  for (const { year, stats } of allStatYears) {
    if (!stats) continue;
    const byPos = {};

    for (const [id, s] of Object.entries(stats)) {
      if (!s?.gp || s.gp < MIN_GAMES_SEASON) continue;
      const p = players[id];
      if (!p) continue;
      const pos = p.fantasy_positions?.[0] || p.position;
      if (!POSITION_PRIORITY.includes(pos)) continue;
      const ppg = (s.pts_ppr || 0) / s.gp;
      if (ppg <= 0) continue;
      if (!byPos[pos]) byPos[pos] = [];
      byPos[pos].push({ id, ppg });
    }

    result[year] = {};
    for (const [pos, entries] of Object.entries(byPos)) {
      entries.sort((a, b) => a.ppg - b.ppg);
      result[year][pos] = {};
      entries.forEach(({ id }, idx) => {
        result[year][pos][id] = Math.round((idx / Math.max(1, entries.length - 1)) * 100);
      });
    }
  }
  return result;
}

/**
 * Build snapshot database from all historical seasons.
 *
 * Each snapshot = a player at a specific age + season, with their percentile
 * rank that year AND tracked percentile ranks in subsequent years (Y+1, Y+2, Y+3).
 *
 * This is the core dataset for finding "comparable players" — historical players
 * who were in a similar situation (age, production tier, draft capital) and
 * showing what actually happened to them.
 */
export function buildHistoricalSnapshots(allStatYears, players) {
  const currentYear = new Date().getFullYear();
  const yearPercentiles = buildYearPercentiles(allStatYears, players);
  const snapshots = [];

  for (const { year, stats } of allStatYears) {
    if (!stats) continue;

    for (const [id, s] of Object.entries(stats)) {
      if (!s?.gp || s.gp < MIN_GAMES_SEASON) continue;
      const p = players[id];
      if (!p) continue;
      const pos = p.fantasy_positions?.[0] || p.position;
      if (!POSITION_PRIORITY.includes(pos)) continue;

      const ageInSeason = (p.age || 26) - (currentYear - year);
      if (ageInSeason < 20 || ageInSeason > 40) continue;

      const ppgPctile = yearPercentiles[year]?.[pos]?.[id];
      if (ppgPctile === undefined) continue;

      // Track where this player ranked in years +1, +2, +3 after this snapshot
      const future = {};
      for (const ahead of [1, 2, 3]) {
        const fp = yearPercentiles[year + ahead]?.[pos]?.[id];
        if (fp !== undefined) future[ahead] = fp;
      }

      snapshots.push({
        playerId: id,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        year,
        age: ageInSeason,
        pos,
        ppgPctile,
        draftRound: p.draft_round != null ? Number(p.draft_round) || null : null,
        future,
      });
    }
  }

  return snapshots;
}

// ---------------------------------------------------------------------------
// Build shared prediction context (call once per session)
// ---------------------------------------------------------------------------

/**
 * Build everything needed to predict any player's future.
 * Pass the result to buildPlayerPrediction() for individual players.
 *
 * @param {Array}  allStatYears  - [{ year, stats }, ...] all historical seasons
 * @param {Object} players       - Sleeper player map (id → metadata)
 * @param {Object} ageCurves     - Peak/decline/cliff curves from scoringEngine
 */
export function buildPredictionContext(allStatYears, players, ageCurves) {
  const detailedCurves = buildDetailedAgeCurves(allStatYears, players);
  const historicalSnapshots = buildHistoricalSnapshots(allStatYears, players);
  return { detailedCurves, historicalSnapshots, ageCurves };
}

// ---------------------------------------------------------------------------
// Comparable player finder
// ---------------------------------------------------------------------------

/**
 * Find historical player-seasons that most closely resemble the given player.
 * Similarity is scored on: position match, age proximity, production tier, draft capital.
 * Only returns comps that have at least one year of future data (so we can show outcomes).
 */
function findComps(player, historicalSnapshots, limit = 5) {
  const { position, age, currentPctile = 50, draftRound } = player;
  const myRound = draftRound != null ? Number(draftRound) || 5 : 5;

  const candidates = historicalSnapshots.filter(
    (snap) =>
      snap.pos === position &&
      Math.abs(snap.age - age) <= 2 &&
      Object.keys(snap.future).length > 0,
  );

  if (!candidates.length) return [];

  const scored = candidates.map((snap) => {
    const ageDiff = Math.abs(snap.age - age);
    const pctileDiff = Math.abs(snap.ppgPctile - currentPctile);
    const snapRound = snap.draftRound != null ? snap.draftRound : 5;
    const draftDiff = Math.abs(myRound - snapRound);
    const sim = 100 - ageDiff * 15 - pctileDiff * 0.5 - draftDiff * 8;
    return { ...snap, similarity: Math.max(0, sim) };
  });

  scored.sort((a, b) => b.similarity - a.similarity);

  // One entry per player (prefer highest-similarity season if duplicates)
  const seen = new Set();
  const deduped = [];
  for (const comp of scored) {
    if (!seen.has(comp.playerId)) {
      seen.add(comp.playerId);
      deduped.push(comp);
    }
    if (deduped.length >= limit) break;
  }

  return deduped;
}

// ---------------------------------------------------------------------------
// Breakout probability
// ---------------------------------------------------------------------------

/**
 * Probability that a player improves their percentile rank by ≥15 points
 * within the next 2 seasons. Meaningful only for young/developing players.
 */
function computeBreakoutProb(player, comps) {
  const { position, age, currentPctile = 50, components, draftRound } = player;
  const career = POS_CAREER[position] || POS_CAREER.WR;
  const { breakoutStart, breakoutEnd } = career;

  // Only meaningful in or near the breakout window
  if (age > breakoutEnd + 2 || age < breakoutStart - 2) return 0;

  // Base rate from historical comps (if we have enough)
  let baseRate = 0.22;
  if (comps.length >= 3) {
    const withFuture = comps.filter(
      (c) => c.future[1] !== undefined || c.future[2] !== undefined,
    );
    if (withFuture.length > 0) {
      const breakouts = withFuture.filter((c) => {
        const y1 = c.future[1] !== undefined ? c.future[1] - c.ppgPctile : null;
        const y2 = c.future[2] !== undefined ? c.future[2] - c.ppgPctile : null;
        return (y1 !== null && y1 >= 15) || (y2 !== null && y2 >= 15);
      });
      baseRate = breakouts.length / withFuture.length;
    }
  }

  let prob = baseRate;

  // Trend: already improving? Adds credibility to breakout thesis
  const trend = components?.trend ?? 50;
  prob += trend > 65 ? 0.12 : trend > 55 ? 0.06 : trend < 40 ? -0.08 : 0;

  // Draft capital: 1st-rounders have higher ceiling, higher hit rate
  const round = draftRound != null ? Number(draftRound) : null;
  prob += round === 1 ? 0.10 : round === 2 ? 0.05 : round == null || round >= 4 ? -0.05 : 0;

  // Within prime breakout window vs fringe
  const inWindow = age >= breakoutStart && age <= breakoutEnd;
  prob += inWindow ? 0.05 : -0.05;

  // Already elite → less "breakout" room; very low floor + starter → slight upside
  if (currentPctile > 75) prob -= 0.12;
  else if (currentPctile < 30 && inWindow) prob += 0.04;

  // Role: backup has less opportunity to break out
  const situ = components?.situ ?? 50;
  if (situ < 50) prob -= 0.08;

  return Math.max(0, Math.min(0.92, prob));
}

// ---------------------------------------------------------------------------
// Bust / cliff risk
// ---------------------------------------------------------------------------

/**
 * Probability that a player loses ≥20 percentile points within the next 2 seasons.
 * Primarily meaningful for players past their peak age.
 */
function computeBustRisk(player, comps) {
  const { position, age, components } = player;
  const career = POS_CAREER[position] || POS_CAREER.WR;

  // Not meaningful before decline phase
  if (age < career.decline - 2) return 0;

  // Base risk from distance to cliff age
  const distToCliff = career.cliff - age;
  let risk =
    distToCliff <= 0 ? 0.78
    : distToCliff <= 1 ? 0.58
    : distToCliff <= 2 ? 0.38
    : distToCliff <= 3 ? 0.20
    : 0.10;

  // Blend with comp-observed bust rate
  if (comps.length >= 3) {
    const withFuture = comps.filter(
      (c) => c.future[1] !== undefined || c.future[2] !== undefined,
    );
    if (withFuture.length > 0) {
      const busts = withFuture.filter((c) => {
        const y1Drop = c.future[1] !== undefined ? c.ppgPctile - c.future[1] : null;
        const y2Drop = c.future[2] !== undefined ? c.ppgPctile - c.future[2] : null;
        return (y1Drop !== null && y1Drop >= 20) || (y2Drop !== null && y2Drop >= 25);
      });
      risk = risk * 0.5 + (busts.length / withFuture.length) * 0.5;
    }
  }

  // Trend modifier: already declining accelerates risk
  const trend = components?.trend ?? 50;
  risk += trend < 35 ? 0.15 : trend < 45 ? 0.07 : trend > 65 ? -0.08 : 0;

  // Injury history increases risk
  const avail = components?.avail ?? 50;
  if (avail < 40) risk += 0.10;

  // RBs age faster — extra penalty after 28
  if (position === 'RB' && age >= 28) risk += 0.12;

  return Math.max(0, Math.min(0.95, risk));
}

// ---------------------------------------------------------------------------
// 3-year score projections
// ---------------------------------------------------------------------------

/**
 * Project the player's dynasty score for years +1, +2, +3.
 *
 * Algorithm:
 *   projected = current_score × age_factor × trend_carry + comp_adjustment
 *   then lightly regressed toward 50 for years 2 and 3 (uncertainty grows)
 */
function projectYears(player, detailedCurves, ageCurves, comps) {
  const { position, age, score, components } = player;
  const trend = components?.trend ?? 50;

  // trend contributes ±15% to year-1, decaying each year
  const trendMult = 0.85 + (trend / 100) * 0.30;

  const projections = [];

  for (let n = 1; n <= 3; n++) {
    const ageFactor = computeAgeFactor(position, age, n, detailedCurves, ageCurves);

    // Trend influence decays: 100% Y1 → 70% Y2 → 49% Y3
    const trendCarry = Math.pow(0.70, n - 1);
    const effectiveTrend = 1 + (trendMult - 1) * trendCarry;

    // Comp-based adjustment: how did similarly-profiled players actually perform?
    let compAdj = 0;
    if (comps.length > 0) {
      const withFuture = comps.filter((c) => c.future[n] !== undefined);
      if (withFuture.length > 0) {
        const avgDelta =
          withFuture.reduce((sum, c) => sum + (c.future[n] - c.ppgPctile), 0) /
          withFuture.length;
        // Each 20-pctile swing in comps nudges projection ±5 pts (capped)
        compAdj = Math.max(-5, Math.min(5, (avgDelta / 20) * 5));
      }
    }

    // Regression toward league-average score (50) grows with projection horizon
    const regressionStrength = (n - 1) * 0.05;
    let projected =
      score * ageFactor * effectiveTrend * (1 - regressionStrength) +
      50 * regressionStrength +
      compAdj;

    projections.push({
      yearsAhead: n,
      age: age + n,
      score: Math.max(5, Math.min(99, Math.round(projected))),
    });
  }

  return projections;
}

// ---------------------------------------------------------------------------
// Labels & outlook
// ---------------------------------------------------------------------------

function getTrajectory(player, projections, breakoutProb, bustRisk) {
  const score = player.score;
  const y1 = projections[0]?.score ?? score;
  const y3 = projections[2]?.score ?? score;
  const change = y1 - score;

  if (breakoutProb > 0.42) return { label: 'Breakout Candidate', color: '#00f5a0', icon: '⚡' };
  if (bustRisk > 0.55) return { label: 'Cliff Risk', color: '#ff2d55', icon: '⚠' };
  if (change >= 8) return { label: 'Rising', color: '#00f5a0', icon: '↑' };
  if (change >= 3) return { label: 'Trending Up', color: '#7ed56f', icon: '↗' };
  if (change <= -10 || bustRisk > 0.40) return { label: 'Declining', color: '#ff6b35', icon: '↓' };
  if (change <= -5) return { label: 'Fading', color: '#ffd84d', icon: '↘' };
  if (y3 - score >= 6) return { label: 'Late Bloomer', color: '#81d4fa', icon: '→↑' };
  return { label: 'Stable', color: '#a8aec7', icon: '→' };
}

function getDynastyOutlook(player, projections, breakoutProb, bustRisk) {
  const { position, age, score, draftRound } = player;
  const career = POS_CAREER[position] || POS_CAREER.WR;
  const avgProj = projections.reduce((s, p) => s + p.score, 0) / projections.length;
  const round = draftRound != null ? Number(draftRound) : null;

  if (score >= 65 && age <= career.peak && avgProj >= 60)
    return position === 'RB'
      ? { label: 'Franchise RB', color: '#00f5a0' }
      : { label: 'Franchise Cornerstone', color: '#00f5a0' };

  if (score >= 70 && age <= career.decline && avgProj >= 62)
    return { label: 'Dynasty Asset', color: '#00f5a0' };

  if (breakoutProb > 0.42 && round != null && round <= 2)
    return { label: 'Breakout Candidate', color: '#4fc3f7' };

  if (breakoutProb > 0.32) return { label: 'Upside Play', color: '#81d4fa' };

  if (bustRisk > 0.58) return { label: 'Sell Now', color: '#ff2d55' };
  if (bustRisk > 0.38) return { label: 'Trade Window Closing', color: '#ff6b35' };

  if (score >= 55 && avgProj >= 50) return { label: 'Reliable Contributor', color: '#ffd84d' };
  if (score >= 55 && avgProj < 46) return { label: 'Sell High', color: '#ffb74d' };

  if (age <= career.breakoutEnd + 1 && score < 45) return { label: 'Developmental', color: '#90a4ae' };

  return { label: 'Depth Piece', color: '#78909c' };
}

function generateInsights(player, projections, comps, breakoutProb, bustRisk) {
  const insights = [];
  const { position, age, score, draftRound } = player;
  const career = POS_CAREER[position] || POS_CAREER.WR;

  // Age context relative to career arc
  if (age < career.peak) {
    const ytp = career.peak - age;
    insights.push(
      `${ytp} year${ytp !== 1 ? 's' : ''} from projected ${position} peak (age ${career.peak})`,
    );
  } else if (age >= career.decline) {
    insights.push(`Past typical ${position} peak — age curve is a headwind`);
  }

  // What did comparable players do?
  if (comps.length >= 3) {
    const withY1 = comps.filter((c) => c.future[1] !== undefined);
    if (withY1.length >= 2) {
      const avgChange =
        withY1.reduce((s, c) => s + (c.future[1] - c.ppgPctile), 0) / withY1.length;
      if (avgChange > 10)
        insights.push(`${withY1.length} comps improved avg +${Math.round(avgChange)} pctile pts in yr 1`);
      else if (avgChange < -10)
        insights.push(`${withY1.length} comps declined avg ${Math.round(avgChange)} pctile pts in yr 1`);
    }
  }

  // Probability callouts
  if (breakoutProb > 0.35)
    insights.push(`${Math.round(breakoutProb * 100)}% historical breakout rate for this profile`);
  if (bustRisk > 0.30)
    insights.push(`${Math.round(bustRisk * 100)}% cliff/bust risk in next 2 seasons`);

  // Year-1 score delta
  if (projections[0]) {
    const delta = projections[0].score - score;
    if (Math.abs(delta) >= 5)
      insights.push(`Score projected to ${delta > 0 ? 'rise' : 'drop'} ~${Math.abs(delta)} pts next season`);
  }

  // Draft capital signal
  const round = draftRound != null ? Number(draftRound) : null;
  if (round === 1 && age <= career.breakoutEnd + 1)
    insights.push('1st-round pedigree supports higher ceiling projection');

  return insights.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a full prediction for a single enriched player.
 *
 * @param {Object} player           - Enriched player from rosterBuilder
 * @param {Object} predictionContext - From buildPredictionContext()
 * @returns {Object|null}
 */
export function buildPlayerPrediction(player, predictionContext) {
  if (!POSITION_PRIORITY.includes(player.position)) return null;

  const { detailedCurves, historicalSnapshots, ageCurves } = predictionContext;

  const comps = findComps(player, historicalSnapshots);
  const breakoutProb = computeBreakoutProb(player, comps);
  const bustRisk = computeBustRisk(player, comps);
  const projections = projectYears(player, detailedCurves, ageCurves, comps);
  const trajectory = getTrajectory(player, projections, breakoutProb, bustRisk);
  const dynastyOutlook = getDynastyOutlook(player, projections, breakoutProb, bustRisk);
  const keyInsights = generateInsights(player, projections, comps, breakoutProb, bustRisk);

  return {
    projections,       // [{ yearsAhead, age, score }, ...] — 3 entries
    trajectory,        // { label, color, icon }
    dynastyOutlook,    // { label, color }
    breakoutProb: Math.round(breakoutProb * 100),  // 0-100
    bustRisk: Math.round(bustRisk * 100),          // 0-100
    comps: comps.map((c) => ({
      name: c.name,
      year: c.year,
      age: c.age,
      ppgPctile: c.ppgPctile,
      future1: c.future[1],
      future2: c.future[2],
      future3: c.future[3],
      similarity: Math.round(c.similarity),
    })),
    keyInsights,
  };
}
