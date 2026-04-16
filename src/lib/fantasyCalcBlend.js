/**
 * fantasyCalcBlend.js
 * Normalizes FantasyCalc market data and blends it with internal scores.
 */
import { clamp } from "./scoringEngine";

// Binary search for the percentile rank of `value` within a pre-sorted array.
// Returns the fraction of entries strictly less than `value` (0..1).
// O(log n) vs the O(n) .filter(...).length it replaces — matters when called
// per player in the roster since sortedValues is league-wide (~500 entries).
function percentileOf(value, sortedValues) {
  if (!sortedValues?.length) return 0.5;
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedValues[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedValues.length;
}

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

  // Pre-sort ascending so percentileOf() can binary-search per player.
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

  // Percentile rank within all FC values: reflects actual market position.
  const valuePercentile = context.allSortedValues?.length > 0
    ? percentileOf(value, context.allSortedValues)
    : clamp(Math.sqrt(value / context.maxValue), 0, 1);

  // Rank score: linear inverse rank (1 = #1 overall, 0 = last)
  const rankScore = clamp(
    1 -
      (Number(entry.overallRank || context.maxOverallRank) - 1) /
        context.maxOverallRank,
    0,
    1,
  );

  // Trend: ±1000-point 30-day swing = ±12 pts. More responsive to market momentum.
  const trendAdj = clamp(Number(entry.trend30Day || 0) / 1000, -0.12, 0.12);

  // Rank is the more stable signal; value percentile captures real market spread.
  return Math.round(
    clamp((rankScore * 0.55 + valuePercentile * 0.45 + trendAdj) * 100, 5, 100),
  );
}

// Normalize a RosterAudit entry to a 5–100 score using the same percentile
// approach as normalizeFantasyCalcValue. Requires raContext to expose
// allSortedValues and maxRankOverall (built in buildRosterAuditContext).
export function normalizeRosterAuditValue(raEntry, raContext) {
  if (!raEntry || !raContext) return null;

  const value = Number(raEntry.value || 0);
  if (value <= 0) return null;

  const valuePercentile = percentileOf(value, raContext.allSortedValues);

  const rankScore = clamp(
    1 - (Number(raEntry.rankOverall || raContext.maxRankOverall) - 1) / raContext.maxRankOverall,
    0,
    1,
  );

  const trendAdj = clamp(Number(raEntry.trend30d || 0) / 1000, -0.12, 0.12);

  return Math.round(
    clamp((rankScore * 0.55 + valuePercentile * 0.45 + trendAdj) * 100, 5, 100),
  );
}

// Blends internal score with FC and RosterAudit market data.
// Weights heavily favor community/expert consensus since internal model
// is not consensus-calibrated:
//   FC + RA both present → internal 20%, FC 55%, RA 25%
//   FC only              → internal 25%, FC 75%
//   RA only              → internal 40%, RA 60%
//   Neither              → internal 100% (fallback)
export function computeBlendedScore(
  internalScore,
  fantasyCalcEntry,
  fantasyCalcContext,
  rosterAuditEntry = null,
  rosterAuditContext = null,
) {
  const fantasyCalcNormalized = normalizeFantasyCalcValue(fantasyCalcEntry, fantasyCalcContext);
  const rosterAuditNormalized = normalizeRosterAuditValue(rosterAuditEntry, rosterAuditContext);

  const hasFc = fantasyCalcNormalized != null;
  const hasRa = rosterAuditNormalized != null;

  if (!hasFc && !hasRa) {
    return { score: internalScore, fantasyCalcNormalized: null, rosterAuditNormalized: null };
  }

  let score;
  if (hasFc && hasRa) {
    score = Math.max(5, Math.round(
      internalScore * 0.20 + fantasyCalcNormalized * 0.55 + rosterAuditNormalized * 0.25,
    ));
  } else if (hasFc) {
    score = Math.max(5, Math.round(
      internalScore * 0.25 + fantasyCalcNormalized * 0.75,
    ));
  } else {
    score = Math.max(5, Math.round(
      internalScore * 0.40 + rosterAuditNormalized * 0.60,
    ));
  }

  return { score, fantasyCalcNormalized, rosterAuditNormalized };
}
