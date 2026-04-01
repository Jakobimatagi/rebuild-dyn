/**
 * fantasyCalcBlend.js
 * Normalizes FantasyCalc market data and blends it with internal scores.
 */
import {
  clamp,
  getWeightDeviationRatio,
  DEFAULT_SCORING_WEIGHTS,
} from "./scoringEngine";

export function buildFantasyCalcContext(fantasyCalcValues = []) {
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

export function normalizeFantasyCalcValue(entry, context) {
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
export function computeBlendedScore(
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
