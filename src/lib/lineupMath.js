// Pure lineup-optimization and matchup math for the Projections tab.
// No external dependencies (no Supabase, no fetch) so it stays unit-testable in
// isolation — see lineupMath.test.mjs. projectionsApi.js re-exports these.

// Which positions can fill each Sleeper lineup slot.
export const FLEX_ELIGIBILITY = {
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  WRRB_WRT: ["RB", "WR", "TE"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};
const NON_STARTER_SLOTS = new Set(["BN", "IR", "TAXI"]);

/** Positions a player may occupy, given a lineup slot label. */
export function slotEligibility(slot) {
  return FLEX_ELIGIBILITY[slot] || [slot]; // else a dedicated slot (QB/RB/WR/TE/…)
}

/**
 * Greedy optimal lineup: fill dedicated slots first with the best eligible
 * projected player, then flex slots from the remaining pool (so a specialist
 * isn't burned on a flex). Returns { starters:[{slot, player}], total, floor,
 * ceiling, variance }.
 *
 * `players` are roster players already merged with their projection
 * (`proj`, `floor`, `ceiling`, `pos`, `id`). Missing projections count as 0.
 */
export function optimalLineup(players, rosterPositions) {
  const slots = (rosterPositions || []).filter((s) => !NON_STARTER_SLOTS.has(s));
  const ordered = [...slots].sort(
    (a, b) => (FLEX_ELIGIBILITY[a] ? 1 : 0) - (FLEX_ELIGIBILITY[b] ? 1 : 0),
  );

  const pool = [...players].sort((a, b) => (b.proj || 0) - (a.proj || 0));
  const used = new Set();
  const starters = [];
  for (const slot of ordered) {
    const elig = slotEligibility(slot);
    const pick = pool.find((p) => !used.has(p.id) && elig.includes(p.pos));
    if (pick) used.add(pick.id);
    starters.push({ slot, player: pick || null });
  }

  let total = 0, floor = 0, ceiling = 0, variance = 0;
  for (const { player } of starters) {
    if (!player) continue;
    total += player.proj || 0;
    floor += player.floor || 0;
    ceiling += player.ceiling || 0;
    // Recover a per-player sigma from the p15..p85 band (z≈1.036 each side).
    const sigma = ((player.ceiling || 0) - (player.floor || 0)) / (2 * 1.036);
    variance += sigma * sigma;
  }
  return { starters, total, floor, ceiling, variance };
}

/** Standard-normal CDF (Abramowitz & Stegun 7.1.26 erf approximation). */
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/** P(my team outscores opponent) from two lineup projections (normal approx). */
export function winProbability(mine, opp) {
  const diffMean = (mine.total || 0) - (opp.total || 0);
  const sd = Math.sqrt((mine.variance || 0) + (opp.variance || 0));
  if (sd <= 0) return diffMean === 0 ? 0.5 : diffMean > 0 ? 1 : 0;
  return normCdf(diffMean / sd);
}
