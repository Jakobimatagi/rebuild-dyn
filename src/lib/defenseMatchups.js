// Generic matchup-multiplier engine: how much more or less fantasy production
// a position gets against a given opponent, relative to league average.
//
// JS mirror of python/projections/defense.py (defense_multipliers), extended
// with recency weighting so multiple seasons can feed one rating: each
// observation is one "opponent-position-game" (the points all players of a
// position scored against that opponent in one week), weighted by its season.
// The observed weighted mean is Bayesian-shrunk toward the league average by
// priorK pseudo-games and clamped so a tiny sample can't produce an absurd
// swing.
//
// Direction-agnostic: group offensive rows by the defense faced ("DEN allows
// 0.85x to WRs") or IDP/DEF rows by the offense faced ("LBs facing PHI produce
// 1.12x"). Dependency-free for node --test.

export const DEFAULT_PRIOR_K = 4.0;
export const DEFAULT_CLAMP = [0.75, 1.3];

/** Standard recency weights: this season full, then 0.6 / 0.3 for the two prior. */
export function defaultSeasonWeights(currentSeason) {
  const s = Number(currentSeason);
  return { [s]: 1.0, [s - 1]: 0.6, [s - 2]: 0.3 };
}

const key = (group, pos) => `${group}|${pos}`;

/**
 * Build matchup multipliers from flat rows { season, week, pos, opponent, pts }.
 * Rows missing an opponent or points are dropped. Seasons absent from
 * `seasonWeights` get weight 0 (dropped); omit `seasonWeights` to weight all
 * rows equally.
 *
 * Returns {
 *   multipliers: Map("GROUP|POS" → { mult, weightedPpg, leagueAvg, games, weight }),
 *   leagueAvgByPos: Map(pos → weighted league per-game average),
 *   groups: sorted array of the opponent groups seen,
 * }
 * `weightedPpg` is the raw (pre-shrinkage) weighted per-game production the
 * group allowed/generated — kept so the UI can show "24.1 vs 21.3 lg avg".
 */
export function buildMultipliers(rows, {
  seasonWeights = null,
  priorK = DEFAULT_PRIOR_K,
  clamp = DEFAULT_CLAMP,
} = {}) {
  const empty = { multipliers: new Map(), leagueAvgByPos: new Map(), groups: [] };
  if (!rows || rows.length === 0) return empty;

  // One observation per (season, week, opponent, pos): total pts that week.
  const obs = new Map(); // "season|week|group|pos" → { group, pos, season, sum }
  for (const r of rows) {
    if (!r || !r.opponent || !r.pos || r.pts == null) continue;
    const w = seasonWeights ? (seasonWeights[r.season] ?? 0) : 1;
    if (w <= 0) continue;
    const k = `${r.season}|${r.week}|${r.opponent}|${r.pos}`;
    const cur = obs.get(k) || { group: r.opponent, pos: r.pos, season: r.season, sum: 0 };
    cur.sum += Number(r.pts) || 0;
    obs.set(k, cur);
  }
  if (obs.size === 0) return empty;

  // Weighted mean + effective sample per (group, pos), and per-position league totals.
  const byGroupPos = new Map(); // key → { group, pos, wSum, wxSum, games }
  const league = new Map();     // pos → { wSum, wxSum }
  for (const o of obs.values()) {
    const w = seasonWeights ? (seasonWeights[o.season] ?? 0) : 1;
    const k = key(o.group, o.pos);
    const g = byGroupPos.get(k) || { group: o.group, pos: o.pos, wSum: 0, wxSum: 0, games: 0 };
    g.wSum += w;
    g.wxSum += w * o.sum;
    g.games += 1;
    byGroupPos.set(k, g);
    const l = league.get(o.pos) || { wSum: 0, wxSum: 0 };
    l.wSum += w;
    l.wxSum += w * o.sum;
    league.set(o.pos, l);
  }

  const leagueAvgByPos = new Map();
  for (const [pos, l] of league) {
    if (l.wSum > 0) leagueAvgByPos.set(pos, l.wxSum / l.wSum);
  }

  const [minMult, maxMult] = clamp;
  const multipliers = new Map();
  const groups = new Set();
  for (const [k, g] of byGroupPos) {
    const lg = leagueAvgByPos.get(g.pos);
    if (!lg || lg <= 0 || g.wSum <= 0) continue;
    const mean = g.wxSum / g.wSum;
    const shrunk = (g.wSum * mean + priorK * lg) / (g.wSum + priorK);
    const mult = Math.min(maxMult, Math.max(minMult, shrunk / lg));
    multipliers.set(k, {
      mult,
      weightedPpg: mean,
      leagueAvg: lg,
      games: g.games,
      weight: g.wSum,
    });
    groups.add(g.group);
  }

  return { multipliers, leagueAvgByPos, groups: [...groups].sort() };
}

/** Multiplier lookup with a neutral 1.0 default (unknown opponent / no sample). */
export function getMultiplier(result, group, pos) {
  if (!result || !group) return 1.0;
  return result.multipliers.get(key(group, pos))?.mult ?? 1.0;
}

/** Full entry lookup ({ mult, weightedPpg, leagueAvg, games, weight }) or null. */
export function getMatchupEntry(result, group, pos) {
  if (!result || !group) return null;
  return result.multipliers.get(key(group, pos)) ?? null;
}
