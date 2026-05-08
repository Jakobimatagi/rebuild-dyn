/**
 * cliffCalendar.js
 *
 * Aggregates per-player 3-year projections (from predictionEngine) into a
 * team-level "shape of your window" timeline.
 *
 * For each season Y0/Y+1/Y+2/Y+3 the calendar reports:
 *   - projected starter PPG (best lineup at that horizon)
 *   - count of starters projected ≥ Foundational tier (score ≥ 65)
 *   - count of starters projected ≥ Cornerstone tier (score ≥ 75)
 *   - average starter score
 *   - departing players (cliff/severe-decline this season)
 *   - emerging players (notable score gain this season)
 *
 * "Starter" follows league rules via leagueContext.starterCounts + flexCount,
 * mirroring calcStarterPPG in rosterBuilder. The lineup is rebuilt per season
 * because aging/decline reshuffles depth charts year over year.
 */
import { POSITION_PRIORITY } from "../constants";
import { POS_CAREER } from "./predictionEngine";

const CORNERSTONE_FLOOR = 75;
const FOUNDATIONAL_FLOOR = 65;
const STARTER_FLOOR = 50;

// Position-specific PPG drop thresholds for "production-fall-off" departures.
// Set to roughly half of position-typical year-over-year PPG variance, so
// only meaningful collapses fire — not normal aging-curve drift.
const POSITIONAL_PPG_DROP_THRESHOLD = {
  QB: 5.0,
  RB: 3.5,
  WR: 3.0,
  TE: 2.0,
};

// Cornerstones get a much higher bar before we flag production-drop departures.
// They still get flagged for cliff-age and lost-lineup-spot — those are real.
const CORNERSTONE_DROP_MULTIPLIER = 1.75;
const CORNERSTONE_ARCHETYPES = new Set(["Cornerstone", "Foundational"]);

// "Real starter" floor — Y+0 starters below this score are filtered out of
// departure flags so marginal flex churn doesn't spam the timeline.
const REAL_STARTER_SCORE_FLOOR = 55;

// Rookies / players with sub-six-game samples have very noisy 3-year
// projections, so we never flag them as departing.
function isRookieLikeProfile(player) {
  const gp24 = Number(player.gp24 ?? 0);
  const yearsExp = Number(player.yearsExp ?? 0);
  return gp24 < 6 || yearsExp <= 1;
}

function isCornerstoneArchetype(player) {
  return CORNERSTONE_ARCHETYPES.has(player.archetype);
}

// Emerging filter — used by both Departing replacement-linking and the
// Emerging list. "Young upside" = age ≤ 25 (allows 2nd-yr WRs etc.).
const EMERGING_MAX_AGE = 25;

function projectedScoreFor(player, yearsAhead) {
  if (yearsAhead === 0) return Number(player.score) || 0;
  const proj = player.prediction?.projections?.find(
    (p) => p.yearsAhead === yearsAhead,
  );
  return proj ? Number(proj.score) || 0 : Number(player.score) || 0;
}

function projectedAgeFor(player, yearsAhead) {
  return (Number(player.age) || 26) + yearsAhead;
}

function ppgFloorFor(player, yearsAhead) {
  // Crude but effective: scale current PPG by the ratio of projected score
  // to current score. Falls back to 0 if no PPG history.
  const currentScore = Number(player.score) || 1;
  const proj = projectedScoreFor(player, yearsAhead);
  const ppg = parseFloat(player.ppg);
  if (!Number.isFinite(ppg) || ppg <= 0) return 0;
  return ppg * (proj / currentScore);
}

function pickStarters(enriched, leagueContext, yearsAhead) {
  const starterCounts = leagueContext?.starterCounts || {};
  const flexCount = leagueContext?.flexCount || 0;
  const isSuperflex = !!leagueContext?.isSuperflex;

  const pool = enriched
    .map((p) => ({
      ...p,
      _projScore: projectedScoreFor(p, yearsAhead),
      _projAge: projectedAgeFor(p, yearsAhead),
      _projPpg: ppgFloorFor(p, yearsAhead),
    }))
    // Sort by projected score so the best version of each player gets first pick
    .sort((a, b) => b._projScore - a._projScore);

  const used = new Set();
  const starters = [];

  for (const pos of POSITION_PRIORITY) {
    const needed = starterCounts[pos] || 0;
    let filled = 0;
    for (const p of pool) {
      if (filled >= needed) break;
      if (used.has(p.id) || p.position !== pos) continue;
      used.add(p.id);
      starters.push(p);
      filled++;
    }
  }

  const superflexSlots = isSuperflex ? 1 : 0;
  const regularFlexSlots = Math.max(0, flexCount - superflexSlots);

  for (const p of pool) {
    if (regularFlexSlots <= starters.filter((s) => s._isRegFlex).length) break;
    if (used.has(p.id) || p.position === "QB") continue;
    used.add(p.id);
    starters.push({ ...p, _isRegFlex: true });
  }

  for (const p of pool) {
    if (superflexSlots <= starters.filter((s) => s._isSf).length) break;
    if (used.has(p.id)) continue;
    used.add(p.id);
    starters.push({ ...p, _isSf: true });
  }

  return starters;
}

function summarizeStarters(starters) {
  if (!starters.length) {
    return {
      count: 0,
      avgScore: 0,
      starterPPG: 0,
      cornerstones: 0,
      foundational: 0,
      belowStarterFloor: 0,
    };
  }
  const totalScore = starters.reduce((s, p) => s + p._projScore, 0);
  const totalPPG = starters.reduce((s, p) => s + (p._projPpg || 0), 0);
  return {
    count: starters.length,
    avgScore: Math.round(totalScore / starters.length),
    starterPPG: Math.round(totalPPG * 10) / 10,
    cornerstones: starters.filter((p) => p._projScore >= CORNERSTONE_FLOOR).length,
    foundational: starters.filter((p) => p._projScore >= FOUNDATIONAL_FLOOR).length,
    belowStarterFloor: starters.filter((p) => p._projScore < STARTER_FLOOR).length,
  };
}

/**
 * Departures are anchored to *production* and *lineup status*, not raw score
 * drift. A player only counts as departing if at least one of:
 *
 *   1. RETIRED  — projected age ≥ position cliff (always, even Cornerstones).
 *   2. LINEUP   — was a Y+0 starter and is NOT a starter at this horizon.
 *                 If a same-position young upside player took the slot, the
 *                 row carries `replacement` so the UI can read "Replaced by X".
 *   3. PRODUCTION — still in the projected lineup, but projected PPG drops
 *                 by ≥ position threshold (Cornerstones require 1.75× the bar).
 *
 * Excluded:
 *   - Rookies / sub-six-game samples (projection too noisy).
 *   - Y+0 starters whose current score is < REAL_STARTER_SCORE_FLOOR (marginal
 *     flex spots churn too easily to be meaningful signal).
 */
function findDepartures(
  enriched,
  yearsAhead,
  y0StarterIds,
  projStarterIds,
) {
  const out = [];

  for (const p of enriched) {
    if (!y0StarterIds.has(p.id)) continue;
    if (isRookieLikeProfile(p)) continue;

    const currentScore = Number(p.score) || 0;
    if (currentScore < REAL_STARTER_SCORE_FLOOR) continue;

    const projScore = projectedScoreFor(p, yearsAhead);
    const projAge = projectedAgeFor(p, yearsAhead);
    const career = POS_CAREER[p.position] || POS_CAREER.WR;
    const cornerstone = isCornerstoneArchetype(p);
    const currentPpg = parseFloat(p.ppg);
    const projPpg = ppgFloorFor(p, yearsAhead);
    const ppgDrop =
      Number.isFinite(currentPpg) && currentPpg > 0
        ? currentPpg - projPpg
        : null;

    let category = null;
    let reason = null;

    // 1) RETIRED — hard cliff age. Fires for everyone.
    if (projAge >= career.cliff) {
      category = "retired";
      reason = `Cliff age ${projAge}`;
    }
    // 2) LINEUP — was a Y+0 starter, no longer in projected starters.
    else if (!projStarterIds.has(p.id)) {
      category = "lineup";
      reason = "Lost lineup spot";
    }
    // 3) PRODUCTION — still a starter, but PPG falls past position threshold.
    //    Cornerstones / Foundationals need a stiffer drop before we flag.
    else if (ppgDrop != null) {
      const baseThreshold =
        POSITIONAL_PPG_DROP_THRESHOLD[p.position] ?? 3.0;
      const threshold = cornerstone
        ? baseThreshold * CORNERSTONE_DROP_MULTIPLIER
        : baseThreshold;
      if (ppgDrop >= threshold) {
        category = "production";
        reason = `−${ppgDrop.toFixed(1)} PPG${cornerstone ? " (cornerstone)" : ""}`;
      }
    }

    if (category) {
      out.push({
        id: p.id,
        name: p.name,
        position: p.position,
        archetype: p.archetype,
        cornerstone,
        currentScore,
        projectedScore: projScore,
        currentPpg: Number.isFinite(currentPpg) ? Math.round(currentPpg * 10) / 10 : null,
        projectedPpg: projPpg > 0 ? Math.round(projPpg * 10) / 10 : null,
        ppgDrop: ppgDrop != null ? Math.round(ppgDrop * 10) / 10 : null,
        projectedAge: projAge,
        category,
        reason,
        replacement: null,
      });
    }
  }

  // retired > lineup > production, then by current score (bigger names first).
  const order = { retired: 0, lineup: 1, production: 2 };
  return out
    .sort((a, b) => {
      const da = order[a.category] ?? 9;
      const db = order[b.category] ?? 9;
      if (da !== db) return da - db;
      return b.currentScore - a.currentScore;
    })
    .slice(0, 5);
}

/**
 * Emerging = was NOT a Y+0 starter, IS a starter at this horizon, and is
 * young enough to qualify as upside. "Joined the team" is implicit because
 * everyone we look at is on the current roster — projection-driven graduation
 * into the starting lineup is what we want to surface.
 */
function findEmerging(enriched, yearsAhead, y0StarterIds, projStarterIds) {
  const out = [];
  for (const p of enriched) {
    if (y0StarterIds.has(p.id)) continue;
    if (!projStarterIds.has(p.id)) continue;

    const age = Number(p.age) || 99;
    if (age > EMERGING_MAX_AGE) continue;

    const currentScore = Number(p.score) || 0;
    const projScore = projectedScoreFor(p, yearsAhead);
    const projPpg = ppgFloorFor(p, yearsAhead);

    out.push({
      id: p.id,
      name: p.name,
      position: p.position,
      archetype: p.archetype,
      currentScore,
      projectedScore: projScore,
      projectedPpg: projPpg > 0 ? Math.round(projPpg * 10) / 10 : null,
      projectedAge: projectedAgeFor(p, yearsAhead),
      gain: Math.round(projScore - currentScore),
    });
  }

  return out
    .sort((a, b) => b.projectedScore - a.projectedScore)
    .slice(0, 4);
}

/**
 * For each "lost lineup spot" departure, attach the highest-projected
 * same-position emerging player as the replacement. Mutates `departing`.
 */
function annotateReplacements(departing, emerging) {
  const emergingByPos = {};
  for (const e of emerging) {
    if (!emergingByPos[e.position]) emergingByPos[e.position] = [];
    emergingByPos[e.position].push(e);
  }
  for (const dep of departing) {
    if (dep.category !== "lineup") continue;
    const candidates = emergingByPos[dep.position] || [];
    if (!candidates.length) continue;
    const best = candidates[0]; // emerging is already sorted by projected score
    dep.replacement = {
      id: best.id,
      name: best.name,
      archetype: best.archetype,
    };
    dep.reason = `Replaced by ${best.name}`;
  }
}

/**
 * Build the cliff calendar for a single team.
 *
 * @param {Object} team           - leagueTeam shape with `enriched`
 * @param {Object} leagueContext  - from getLeagueRulesContext
 * @returns {Object|null}         - { seasons: [{ yearsAhead, label, ... }, ...] }
 */
export function buildCliffCalendar(team, leagueContext) {
  if (!team?.enriched?.length) return null;
  const currentYear = new Date().getFullYear();

  // Lock the Y+0 starter set once — every horizon's "departing" check
  // compares against this baseline, not against the previous year.
  const y0Starters = pickStarters(team.enriched, leagueContext, 0);
  const y0StarterIds = new Set(y0Starters.map((s) => s.id));

  const seasons = [];
  for (let yr = 0; yr <= 3; yr++) {
    const starters = pickStarters(team.enriched, leagueContext, yr);
    const starterIds = new Set(starters.map((s) => s.id));
    const summary = summarizeStarters(starters);

    let departing = [];
    let emerging = [];
    if (yr > 0) {
      emerging = findEmerging(team.enriched, yr, y0StarterIds, starterIds);
      departing = findDepartures(team.enriched, yr, y0StarterIds, starterIds);
      annotateReplacements(departing, emerging);
    }

    seasons.push({
      yearsAhead: yr,
      year: currentYear + yr,
      label: yr === 0 ? "Now" : `Y+${yr}`,
      ...summary,
      topStarters: starters
        .slice()
        .sort((a, b) => b._projScore - a._projScore)
        .slice(0, 6)
        .map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          projectedScore: p._projScore,
          projectedAge: p._projAge,
        })),
      departing,
      emerging,
    });
  }

  // Diagnose the shape of the window
  const now = seasons[0];
  const y2 = seasons[2];
  const y3 = seasons[3];
  let windowVerdict = null;

  if (now.foundational >= 4 && y2.foundational >= 3) {
    windowVerdict = {
      label: "Open Window",
      tone: "good",
      note: `${now.foundational} starters ≥ Foundational now, ${y2.foundational} still there in ${y2.year}.`,
    };
  } else if (now.foundational >= 3 && y2.foundational <= 1) {
    windowVerdict = {
      label: "Closing Window",
      tone: "warn",
      note: `Foundational starters drop ${now.foundational} → ${y2.foundational} by ${y2.year}.`,
    };
  } else if (now.foundational <= 1 && y3.foundational >= 3) {
    windowVerdict = {
      label: "Opening Window",
      tone: "good",
      note: `Projection adds Foundational starters by ${y3.year} (${now.foundational} → ${y3.foundational}).`,
    };
  } else if (now.foundational <= 1 && y3.foundational <= 1) {
    windowVerdict = {
      label: "No Window Visible",
      tone: "bad",
      note: `Projects ≤ 1 Foundational starter through ${y3.year}.`,
    };
  } else {
    windowVerdict = {
      label: "Stable Mid-Tier",
      tone: "neutral",
      note: `Foundational count holds near ${now.foundational} through ${y3.year}.`,
    };
  }

  return { seasons, windowVerdict };
}
