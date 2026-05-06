/**
 * ocAdjustment.js
 * OC- and scheme-driven Year-1 PPG outlook for every player on a roster.
 *
 * The pipeline:
 *   1. For each prior season we have stats for, build a (team, position) → fantasy
 *      rank matrix from buildRankMatrix(). This tells us how the position room
 *      ranked among the 32 NFL teams in fantasy PPG that year.
 *   2. For the upcoming season's OC at each NFL team, look up that OC's prior
 *      stints (year + team) and pull their position-room ranks from the matrix.
 *   3. Convert ranks into a multiplier (rank 1 → +15%, rank 32 → −15%), weighted
 *      by recency (last season weighs the most).
 *   4. Layer a small scheme-tag bonus per position (Shanahan tree boosts RB/WR1,
 *      Air Raid boosts QB, Ground Control boosts RB, etc.).
 *   5. Apply a small first-year-OC penalty when there's no prior history at all.
 *   6. Per player, apply the multiplier to their last-season PPG to produce
 *      `projectedPpg` — the Year-1 PPG outlook under the new OC.
 *
 * Caveats:
 *   - buildTeamRoomTotals takes a `historicalRoster` map for accurate year-aware
 *     team attribution. We pass null and fall back to the current `players.team`,
 *     which is a known approximation: players who switched teams between the
 *     historical season and now will be bucketed under the wrong room. The
 *     signal averages out across multiple stints but should be refined later
 *     by threading in the historical-rosters API output.
 *   - The OC multiplier is intentionally bounded at ±20% so a single hot/cold
 *     season can't dominate a player's projection.
 */

import { OC_DATA, findOcStints, mergeOcData } from './ocData.js';
import { OC_SCHEMES } from './ocSchemes.js';
import { buildTeamRoomTotals, buildRankMatrix } from './teamFantasyRanks.js';
import { clamp } from './scoringEngine.js';

// Rank-to-modifier curve. Linear: rank 1 → +0.15, rank 16.5 → 0, rank 32 → −0.15.
function rankToModifier(rank) {
  if (!Number.isFinite(rank)) return 0;
  const center = 16.5;
  const slope = 0.15 / 15.5;
  return clamp((center - rank) * slope, -0.15, 0.15);
}

// Per-scheme position bonuses. Small relative to the rank signal — these are
// nudges that capture a tree's known fantasy tendencies, not the dominant signal.
const SCHEME_POSITION_BONUS = {
  shanahan:  { QB: 0,     RB: 0.05,  WR: 0.02,  TE: 0.01  }, // outside zone, motion-heavy WR1 boom
  reid:      { QB: 0.03,  RB: 0,     WR: 0.02,  TE: 0.03  }, // RPO-friendly, TE-friendly
  patriots:  { QB: 0,     RB: 0,     WR: -0.01, TE: 0.02  }, // matchup-driven, less stable WR1
  payton:    { QB: 0.02,  RB: 0,     WR: 0.02,  TE: 0.01  },
  airraid:   { QB: 0.05,  RB: -0.03, WR: 0.02,  TE: -0.02 },
  westcoast: { QB: 0.01,  RB: 0.01,  WR: 0.01,  TE: 0.01  },
  prostyle:  { QB: 0,     RB: 0.02,  WR: 0,     TE: 0.01  },
  ground:    { QB: -0.03, RB: 0.06,  WR: -0.04, TE: 0     },
};

// Recency weights by years-back from the target season (target − stintYear − 1).
// 0 = the season just played. After 4 seasons back, treat as background noise.
const RECENCY_WEIGHT_BY_GAP = [1.0, 0.65, 0.4, 0.2];
const FALLBACK_RECENCY = 0.1;

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

/**
 * Build the OC outlook context — a map of NFL teamAbbr → outlook info for the
 * upcoming season. Returns null if no OC data is available for `targetSeason`.
 */
export function buildOcOutlookContext({
  targetSeason,
  statsByYear = [], // [{ year: 2024, stats: stats24 }, { year: 2023, stats: stats23 }, ...]
  players,
  ocOverrides = {},
}) {
  const merged = mergeOcData(ocOverrides);
  const seasonOcs = merged[String(targetSeason)] || merged[Number(targetSeason)] || null;
  if (!seasonOcs || Object.keys(seasonOcs).length === 0) return null;

  const rankMatricesByYear = {};
  for (const { year, stats } of statsByYear) {
    if (!stats || typeof stats !== 'object') continue;
    if (!Object.keys(stats).length) continue;
    const totals = buildTeamRoomTotals(players, stats, null);
    rankMatricesByYear[String(year)] = buildRankMatrix(totals);
  }

  const out = {};
  for (const [team, ocEntry] of Object.entries(seasonOcs)) {
    if (!ocEntry?.name) continue;
    const ocName = ocEntry.name;

    const stints = findOcStints(ocName, merged).filter(
      (s) => Number(s.year) < Number(targetSeason),
    );

    const stintHistory = { QB: [], RB: [], WR: [], TE: [] };
    const positionMultipliers = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const schemeKeys = OC_SCHEMES[ocName] || [];

    for (const pos of POSITIONS) {
      let weightedSum = 0;
      let weightTotal = 0;

      for (const stint of stints) {
        const matrix = rankMatricesByYear[String(stint.year)];
        const room = matrix?.[stint.team]?.[pos];
        if (!room || !Number.isFinite(room.rank)) continue;

        const yearsBack = Number(targetSeason) - Number(stint.year) - 1;
        const recency = RECENCY_WEIGHT_BY_GAP[yearsBack] ?? FALLBACK_RECENCY;
        const w = recency * (stint.partial ? 0.5 : 1.0);

        weightedSum += rankToModifier(room.rank) * w;
        weightTotal += w;

        stintHistory[pos].push({
          year: stint.year,
          team: stint.team,
          rank: room.rank,
          ppg: Math.round(room.ppg * 10) / 10,
          partial: !!stint.partial,
        });
      }

      const rankPart = weightTotal > 0 ? weightedSum / weightTotal : 0;

      let schemeBonus = 0;
      let schemeContrib = 0;
      for (const key of schemeKeys) {
        const map = SCHEME_POSITION_BONUS[key];
        if (map && map[pos] != null) {
          schemeBonus += map[pos];
          schemeContrib += 1;
        }
      }
      if (schemeContrib > 1) schemeBonus /= schemeContrib;

      // First-year-OC penalty — a coordinator with no prior stints to lean on
      // gets a small uncertainty discount. Mid-season replacements (partial)
      // also count toward that risk.
      const firstYearPenalty =
        weightTotal === 0 ? -0.03 : ocEntry.partial ? -0.02 : 0;

      positionMultipliers[pos] = clamp(
        rankPart + schemeBonus + firstYearPenalty,
        -0.20,
        0.20,
      );
    }

    out[team] = {
      oc: {
        name: ocName,
        partial: !!ocEntry.partial,
        note: ocEntry.note || null,
      },
      schemes: schemeKeys,
      stintCount: stints.length,
      positionMultipliers,
      stintHistory,
    };
  }

  return out;
}

/**
 * For a single player, project their Year-1 PPG outlook under their team's OC
 * for `targetSeason`. Returns null if no OC data for the player's team or
 * position. The multiplier is always returned even when baselinePpg is null
 * (rookies) — surface it as a Year-1 environment chip in that case.
 */
export function buildPlayerOcOutlook(player, ocContext) {
  if (!ocContext || !player?.team) return null;
  const teamCtx = ocContext[player.team];
  if (!teamCtx) return null;

  const pos = player.position;
  const mult = teamCtx.positionMultipliers?.[pos];
  if (!Number.isFinite(mult)) return null;

  const baselinePpg = parseFloat(player.ppg);
  const hasPpg = Number.isFinite(baselinePpg) && baselinePpg > 0;
  const projectedPpg = hasPpg
    ? Math.round(baselinePpg * (1 + mult) * 10) / 10
    : null;

  return {
    ocName: teamCtx.oc.name,
    ocPartial: teamCtx.oc.partial,
    ocNote: teamCtx.oc.note,
    schemes: teamCtx.schemes,
    multiplier: mult,
    multiplierPct: Math.round(mult * 1000) / 10, // e.g. 4.2 = +4.2%
    baselinePpg: hasPpg ? Math.round(baselinePpg * 10) / 10 : null,
    projectedPpg,
    delta:
      projectedPpg != null && hasPpg
        ? Math.round((projectedPpg - baselinePpg) * 10) / 10
        : null,
    stintHistory: teamCtx.stintHistory?.[pos] || [],
    isFirstYearOC: teamCtx.stintCount === 0,
  };
}
