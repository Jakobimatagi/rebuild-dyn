// Pure streak/over-performance math for the Admin "Hot & Cold" board.
//
// The idea: for each week we know a player's *projected* fantasy points and
// their *actual* fantasy points (both PPR, from Sleeper). The residual
// (actual − projected) tells us whether they beat or missed expectations.
// Stringing the recent weeks together gives a "hot streak" (consistently
// outscoring projection → perceived value inflated → sell high) or a "cold
// streak" (underperforming → depressed value → buy low).
//
// This module is dependency-free so it can be unit-tested in isolation
// (hotStreaks.test.mjs). The component handles fetching + rendering.

// Only evaluate weeks where the player was projected to be a real contributor.
// Below this we'd be grading garbage-time / deep-bench projections as "misses".
export const MIN_PROJ_FLOOR = 4;

// How many recent evaluated weeks define "recent form".
export const RECENT_N = 4;

// A player who hasn't suited up for this many of the most recent league weeks is
// treated as out (injury / season cut short) rather than "active". This pulls
// guys like a mid-season-injured riser off the live sell-high/buy-low lists and
// onto the dedicated injured list, where their last-played form is pre-injury.
export const MISSED_TAIL_WEEKS = 3;

// Default eligibility for showing up on the board at all.
//
// The projection floor is position-aware: a backup TE projected ~6 PPG can blow
// past that low bar in a couple flash games and show up as the "hottest" player
// despite never being a real fantasy asset (e.g. Jake Tonges). Requiring a
// genuinely *startable* average projection keeps the board to players whose
// hot/cold actually matters for sell-high / buy-low. QBs project much higher
// than skill positions, and TE is the shallowest, so the bar varies by spot.
export const DEFAULT_ELIGIBILITY = {
  minEvaluatedWeeks: 3, // need enough graded weeks for a streak to mean something
  minAvgProj: 8,        // baseline startable floor (fallback when position unknown)
  minAvgProjByPos: { QB: 14, RB: 9, WR: 9, TE: 7 },
};

// Looser eligibility for the injured list: a season cut short by injury (or a
// rookie who tore something in week 4) leaves a smaller sample, so we require
// fewer graded weeks but still gate on fantasy relevance.
export const INJURED_ELIGIBILITY = {
  minEvaluatedWeeks: 2,
  minAvgProj: 6,
};

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Group flat weekly entries into per-player streak metrics.
 *
 * @param entries Array of { player_id, position, name, team, week, proj, actual }.
 *                `proj`/`actual` are PPR points (numbers) or null. Order doesn't
 *                matter — we sort by week internally.
 * @returns Array of player metric objects (unsorted, unfiltered):
 *   {
 *     player_id, position, name, team,
 *     weeks: [{ week, proj, actual, residual, beat }],  // evaluated weeks, asc
 *     evaluatedWeeks, beatCount, beatRate,
 *     currentStreak,        // signed run from latest week (+3 = beat 3 straight)
 *     recentAvgResidual,    // mean residual over last RECENT_N evaluated weeks
 *     seasonAvgResidual,    // mean residual over all evaluated weeks
 *     avgProj, avgActual,
 *     momentum,             // ranking signal (see below)
 *   }
 */
export function buildPlayerStreaks(entries) {
  const byPlayer = new Map();
  // Latest league week anyone actually played — the reference point for "how
  // many recent weeks has this player missed".
  let leagueLastWeek = 0;
  for (const e of entries || []) {
    if (e && e.actual != null) leagueLastWeek = Math.max(leagueLastWeek, Number(e.week));
  }
  for (const e of entries || []) {
    if (!e || e.player_id == null) continue;
    const id = String(e.player_id);
    let p = byPlayer.get(id);
    if (!p) {
      p = { player_id: id, position: e.position || null, name: e.name || "", team: e.team || null, _weeks: new Map() };
      byPlayer.set(id, p);
    }
    // Latest non-empty metadata wins (player may change teams mid-season).
    if (e.position) p.position = e.position;
    if (e.name) p.name = e.name;
    if (e.team) p.team = e.team;
    // One entry per week; later writes overwrite (dedupe).
    p._weeks.set(Number(e.week), { proj: e.proj, actual: e.actual });
  }

  const out = [];
  for (const p of byPlayer.values()) {
    const weeks = [];
    const allWeeks = [];
    for (const [week, { proj, actual }] of p._weeks) {
      // A week is "evaluated" only when we have a real projection above the
      // floor AND an actual score (the player suited up).
      const evaluated = proj != null && actual != null && proj >= MIN_PROJ_FLOOR;
      const residual = proj != null && actual != null ? actual - proj : null;
      // allWeeks keeps the full picture (DNP / below-floor included) so the UI
      // can show every week behind a streak, flagging which ones counted.
      allWeeks.push({ week, proj, actual, residual, evaluated, beat: residual != null ? residual > 0 : null });
      if (!evaluated) continue;
      weeks.push({ week, proj, actual, residual, beat: residual > 0 });
    }
    weeks.sort((a, b) => a.week - b.week);
    allWeeks.sort((a, b) => a.week - b.week);
    if (weeks.length === 0) continue;

    const evaluatedWeeks = weeks.length;
    const beatCount = weeks.filter((w) => w.beat).length;
    const beatRate = beatCount / evaluatedWeeks;

    // Current streak: walk backward from the latest evaluated week, counting
    // consecutive weeks of the same sign. residual exactly 0 breaks the run.
    let currentStreak = 0;
    const lastSign = Math.sign(weeks[weeks.length - 1].residual);
    if (lastSign !== 0) {
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (Math.sign(weeks[i].residual) === lastSign) currentStreak += lastSign;
        else break;
      }
    }

    const recent = weeks.slice(-RECENT_N);
    const recentAvgResidual = round1(recent.reduce((s, w) => s + w.residual, 0) / recent.length);
    const seasonAvgResidual = round1(weeks.reduce((s, w) => s + w.residual, 0) / evaluatedWeeks);
    const avgProj = round1(weeks.reduce((s, w) => s + w.proj, 0) / evaluatedWeeks);
    const avgActual = round1(weeks.reduce((s, w) => s + w.actual, 0) / evaluatedWeeks);

    // Momentum blends recent over/under-performance with streak consistency.
    // recentAvgResidual is the magnitude; the streak term rewards stringing
    // beats (or misses) together so a steady riser outranks a one-week fluke.
    const momentum = round1(recentAvgResidual + currentStreak * 0.75);

    // Availability: when did they last suit up, and how many recent weeks have
    // they missed since? A long trailing gap (≥ MISSED_TAIL_WEEKS) flags an
    // injury / season cut short, so their "recent form" above is pre-injury.
    const playedWeeks = allWeeks.filter((w) => w.actual != null);
    const gamesPlayed = playedWeeks.length;
    const lastPlayedWeek = gamesPlayed ? playedWeeks[playedWeeks.length - 1].week : null;
    const weeksMissedRecent =
      lastPlayedWeek != null ? Math.max(0, leagueLastWeek - lastPlayedWeek) : 0;
    const seasonEndedEarly =
      lastPlayedWeek != null && weeksMissedRecent >= MISSED_TAIL_WEEKS;

    out.push({
      player_id: p.player_id,
      position: p.position,
      name: p.name,
      team: p.team,
      weeks,
      allWeeks,
      evaluatedWeeks,
      beatCount,
      beatRate,
      currentStreak,
      recentAvgResidual,
      seasonAvgResidual,
      avgProj,
      avgActual,
      momentum,
      gamesPlayed,
      lastPlayedWeek,
      weeksMissedRecent,
      seasonEndedEarly,
    });
  }
  return out;
}

/** True when a player has enough sample + relevance to appear on the board. */
export function isEligible(player, eligibility = DEFAULT_ELIGIBILITY) {
  const posFloor =
    eligibility.minAvgProjByPos?.[player.position] ?? eligibility.minAvgProj;
  return (
    player.evaluatedWeeks >= eligibility.minEvaluatedWeeks &&
    player.avgProj >= posFloor
  );
}

/**
 * Hot players (sell-high candidates): currently outperforming projection.
 * Sorted hottest-first by the headline last-4-week residual (the number shown
 * on each row), so the list reads strictly hottest → least-hot top to bottom.
 * Momentum (which folds in streak length) breaks ties.
 */
export function rankHot(players, eligibility = DEFAULT_ELIGIBILITY) {
  return players
    .filter((p) => isEligible(p, eligibility) && !p.seasonEndedEarly && p.recentAvgResidual > 0 && p.momentum > 0)
    .sort((a, b) => b.recentAvgResidual - a.recentAvgResidual || b.momentum - a.momentum);
}

/**
 * Cold players (buy-low candidates): currently underperforming projection.
 * Sorted coldest-first by the headline last-4-week residual; momentum breaks ties.
 * Injured players are excluded — their cold weeks aren't a live buy-low signal.
 */
export function rankCold(players, eligibility = DEFAULT_ELIGIBILITY) {
  return players
    .filter((p) => isEligible(p, eligibility) && !p.seasonEndedEarly && p.recentAvgResidual < 0 && p.momentum < 0)
    .sort((a, b) => a.recentAvgResidual - b.recentAvgResidual || a.momentum - b.momentum);
}

/**
 * Injured / season-cut-short players (e.g., a riser who tore something
 * mid-year, or a stud "heavily affected" by injury). These were producing,
 * then stopped suiting up for the recent stretch, so they no longer belong on
 * the live hot/cold lists — but they're prime buy-low / stash watch. The
 * recent-form numbers reflect their last-played (pre-injury) games. Sorted by
 * how hot they were before going down, then by how much of the season they lost.
 */
export function rankInjured(players, eligibility = INJURED_ELIGIBILITY) {
  return players
    .filter(
      (p) =>
        p.seasonEndedEarly &&
        p.evaluatedWeeks >= eligibility.minEvaluatedWeeks &&
        p.avgProj >= eligibility.minAvgProj,
    )
    .sort((a, b) => b.recentAvgResidual - a.recentAvgResidual || b.weeksMissedRecent - a.weeksMissedRecent);
}
