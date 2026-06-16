/**
 * dynastyValue.js
 *
 * Fuses the app's two predictive engines into a single forward-looking dynasty
 * value that powers rankings:
 *
 *   1. predictionEngine.js  — empirical age curves + historical comps → a 3-year
 *      projected grade trajectory (already age-aware), plus breakout/bust odds.
 *   2. weekly projections   — the nflverse-enriched Python engine (Supabase),
 *      surfaced here as a forward *production percentile* within position. This
 *      is what lets current form move a player off their trailing-stats grade.
 *
 * The value is a time-discounted blend of present + the 3 projected years
 * (dynasty weights the future heavily but discounts its uncertainty), tilted by
 * breakout/bust asymmetry, then anchored to the existing trade-market value so it
 * stays on a familiar, calibrated scale — the same "model ⊕ market" philosophy
 * the weekly engine uses to blend with Sleeper. Pure and dependency-light so it
 * unit-tests in isolation (dynastyValue.test.mjs).
 */

import { POSITION_PRIORITY } from "../constants.js";
import { clamp } from "./scoringEngine.js";

// Dynasty horizon weights — future-tilted, but each further year is discounted
// for projection uncertainty. Sum to 1.0. A contender can re-weight toward the
// present via `yearWeights`; a rebuilder toward the out years.
export const DYNASTY_YEAR_WEIGHTS = { present: 0.30, y1: 0.28, y2: 0.24, y3: 0.18 };

// How much the nflverse weekly-projection percentile pulls the present value off
// the trailing-stats grade. The grade still leads (0.65) — the forward signal
// refines it (0.35), it doesn't replace it.
const PROJ_PRESENT_WEIGHT = 0.35;

// Final anchor to the trade-market value. Mirrors the weekly engine's Sleeper
// blend: keep the model honest against the market rather than drifting on it.
const DEFAULT_MARKET_ANCHOR = 0.45;

/**
 * @param {object} player  enriched player (rosterBuilder shape): needs .position,
 *   .score (0-99 grade), optional .marketValue, optional .prediction
 *   (predictionEngine output: { projections:[{yearsAhead,score}], breakoutProb,
 *   bustRisk }).
 * @param {object} [opts]
 * @param {number|null} [opts.projPctile]  forward production percentile (0-99)
 *   from the weekly engine, ranked within position. Null when unavailable
 *   (offseason gaps, rookies) — the value degrades gracefully to grade+prediction.
 * @param {number} [opts.marketAnchor]  weight on market value in the final blend.
 * @param {object} [opts.yearWeights]    override the dynasty horizon weights.
 * @returns {{value:number, model:number, tier:string, confidence:string,
 *   breakdown:object}|null}
 */
export function computeDynastyValue(player, opts = {}) {
  if (!player || !POSITION_PRIORITY.includes(player.position)) return null;

  const {
    projPctile = null,
    marketAnchor = DEFAULT_MARKET_ANCHOR,
    yearWeights = DYNASTY_YEAR_WEIGHTS,
  } = opts;

  const grade = clamp(Number(player.score) || 0, 0, 99);
  const pred = player.prediction || null;

  // Present value: the current grade, refined by the forward production signal.
  let present = grade;
  const hasProj = projPctile != null && Number.isFinite(Number(projPctile));
  if (hasProj) {
    present =
      (1 - PROJ_PRESENT_WEIGHT) * grade +
      PROJ_PRESENT_WEIGHT * clamp(Number(projPctile), 0, 99);
  }

  // Future values from the (age-aware) 3-yr projection; flat fallback to present.
  const proj = pred?.projections || [];
  const futScore = (n) => {
    const p = proj.find((x) => x.yearsAhead === n);
    return p && Number.isFinite(p.score) ? clamp(p.score, 0, 99) : present;
  };
  const y1 = futScore(1);
  const y2 = futScore(2);
  const y3 = futScore(3);

  const w = yearWeights;
  const wSum = (w.present + w.y1 + w.y2 + w.y3) || 1;
  let model =
    (w.present * present + w.y1 * y1 + w.y2 * y2 + w.y3 * y3) / wSum;

  // Breakout/bust asymmetric tilt — upside lifts, bust risk trims a touch more
  // (a dynasty asset that craters is costlier than one that merely plateaus).
  if (pred) {
    const breakout = clamp(Number(pred.breakoutProb) || 0, 0, 100) / 100;
    const bust = clamp(Number(pred.bustRisk) || 0, 0, 100) / 100;
    model += breakout * 4 - bust * 5;
  }
  model = clamp(model, 5, 99);

  // Anchor to the trade-market value (which carries its own premiums and can sit
  // above 99 for elite young assets). Keeps the dynasty number on a scale users
  // already read in the trade tools.
  const market = Number.isFinite(Number(player.marketValue))
    ? Number(player.marketValue)
    : null;
  let value = model;
  if (market != null) {
    value = (1 - marketAnchor) * model + marketAnchor * market;
  }
  value = Math.round(clamp(value, 1, 130));

  return {
    value,
    model: Math.round(model),
    tier: valueTier(value),
    confidence: hasProj && pred ? "high" : pred || hasProj ? "medium" : "low",
    breakdown: {
      grade: Math.round(grade),
      present: Math.round(present),
      y1: Math.round(y1),
      y2: Math.round(y2),
      y3: Math.round(y3),
      modelScore: Math.round(model),
      market,
      projPctile: hasProj ? Math.round(Number(projPctile)) : null,
      breakoutProb: pred?.breakoutProb ?? null,
      bustRisk: pred?.bustRisk ?? null,
    },
  };
}

const TIERS = [
  [95, "Cornerstone"],
  [78, "Foundation"],
  [60, "Core Starter"],
  [42, "Contributor"],
  [25, "Depth"],
  [0, "Flier"],
];

export function valueTier(value) {
  for (const [floor, label] of TIERS) if (value >= floor) return label;
  return "Flier";
}

/**
 * Rank a set of weekly-projection rows into a forward production percentile (0-99)
 * within each position, keyed by Sleeper player_id. This is the bridge that turns
 * the nflverse-enriched weekly engine's raw points into the `projPctile` the value
 * fusion consumes. `rows` are projectionsApi rows ({ player_id, position,
 * proj_ppr, ... }); pass the rest-of-season or season-pace projection per player.
 *
 * @returns {Map<string, number>} player_id → percentile 0-99
 */
export function projectionPercentiles(rows) {
  const byPos = new Map();
  for (const r of rows || []) {
    const pos = r.position;
    if (r.proj_ppr == null || r.proj_ppr === "") continue; // missing, not zero
    const pts = Number(r.proj_ppr);
    if (!POSITION_PRIORITY.includes(pos) || !Number.isFinite(pts)) continue;
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos).push({ id: String(r.player_id), pts });
  }
  const out = new Map();
  for (const list of byPos.values()) {
    list.sort((a, b) => a.pts - b.pts); // ascending → rank 0 = worst
    const n = list.length;
    if (n === 1) {
      out.set(list[0].id, 50);
      continue;
    }
    list.forEach((p, i) => {
      out.set(p.id, Math.round((i / (n - 1)) * 99));
    });
  }
  return out;
}
