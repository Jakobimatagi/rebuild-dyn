// Power rankings + playoff / championship odds for a fantasy league.
//
// The engine is projection-led: a team's strength is the *max points* it can put
// up in a week — i.e. its optimal starting lineup from the weekly projection
// model (python/projections → Supabase). Each team's projected best lineup gives
// a weekly scoring mean and a sigma (recovered from the floor/ceiling band).
// From those distributions we Monte-Carlo a full round-robin season plus a
// seeded single-elimination playoff bracket → playoff% and championship%.
//
// Everything here is pure and dependency-free (only the dependency-free
// lineupMath helpers) so it stays unit-testable in isolation — see
// powerRankings.test.mjs.

import { optimalLineup } from "./lineupMath.js";

// ── Deterministic RNG ───────────────────────────────────────────────────────
// A seeded generator keeps the odds stable across re-renders (no flicker) while
// still giving a well-mixed Monte-Carlo sample. mulberry32 is small and fast.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One draw from N(mean, sigma) via Box–Muller, using a [0,1) rng. */
export function gaussian(rng, mean, sigma) {
  if (!(sigma > 0)) return mean;
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + sigma * z;
}

// ── Schedule ────────────────────────────────────────────────────────────────
/**
 * Balanced round-robin pairings via the circle method. Returns `n-1` (or `n`
 * for odd counts) rounds, each an array of [i, j] index pairs. Odd team counts
 * get a bye (the partner is `null`). Indices reference positions in the team
 * array passed to the simulator.
 */
export function roundRobin(n) {
  const idx = [...Array(n).keys()];
  if (n % 2 === 1) idx.push(null); // bye marker
  const m = idx.length;
  const rounds = [];
  for (let r = 0; r < m - 1; r++) {
    const pairs = [];
    for (let i = 0; i < m / 2; i++) {
      const a = idx[i];
      const b = idx[m - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    // rotate, keeping the first element fixed
    idx.splice(1, 0, idx.pop());
  }
  return rounds;
}

/** A `weeks`-long schedule built by cycling round-robin rounds. */
export function buildSchedule(n, weeks) {
  if (n < 2 || weeks < 1) return [];
  const rounds = roundRobin(n);
  const schedule = [];
  for (let w = 0; w < weeks; w++) schedule.push(rounds[w % rounds.length]);
  return schedule;
}

// ── Team strength ───────────────────────────────────────────────────────────
/**
 * Turn a roster's projected players into its weekly scoring distribution. The
 * mean is the optimal-lineup total (the team's "max points" for a week); the
 * sigma is the lineup variance recovered from each starter's floor/ceiling band,
 * floored to a sensible minimum so a team with thin projections still has spread.
 *
 * `players` are already merged with projections: { id, pos, proj, floor, ceiling }.
 */
export function lineupStrength(players, rosterPositions) {
  const lineup = optimalLineup(players, rosterPositions);
  const mean = lineup.total || 0;
  // variance from the bands; fall back to a typical weekly CV when bands missing.
  const sigma = Math.max(Math.sqrt(lineup.variance || 0), mean * 0.18, 6);
  return { mean, sigma, lineup };
}

/**
 * Normalize a list of teams into the strength inputs the simulator needs,
 * applying graceful fallbacks when projections are unavailable.
 *
 * Each input team: {
 *   rosterId, label,
 *   projMean,            // optimal projected lineup total (preferred strength)
 *   projSigma,           // weekly sigma for projMean
 *   actualPPG,           // real points-for per game so far (validation / fallback)
 *   wins, losses, ties,  // record to date (carried into the projected season)
 * }
 *
 * Returns the same teams with resolved { mean, sigma, gamesPlayed, priorWins }.
 */
export function buildStrengths(teams, { blendActual = 0.25 } = {}) {
  const haveProj = teams.some((t) => Number(t.projMean) > 0);
  const haveActual = teams.some((t) => Number(t.actualPPG) > 0);

  return teams.map((t) => {
    const gamesPlayed = (t.wins || 0) + (t.losses || 0) + (t.ties || 0);
    let mean;
    let sigma;

    if (haveProj && Number(t.projMean) > 0) {
      mean = Number(t.projMean);
      sigma = Number(t.projSigma) > 0 ? Number(t.projSigma) : mean * 0.18;
      // Nudge toward realized scoring once games have been played and we have it.
      if (haveActual && Number(t.actualPPG) > 0 && gamesPlayed > 0) {
        const w = Math.min(blendActual, gamesPlayed / 14);
        mean = mean * (1 - w) + Number(t.actualPPG) * w;
      }
    } else if (haveActual && Number(t.actualPPG) > 0) {
      mean = Number(t.actualPPG);
      sigma = mean * 0.2;
    } else {
      // No projections, no scoring history → flat field; odds collapse to even.
      mean = 100;
      sigma = 18;
    }

    return {
      rosterId: t.rosterId,
      label: t.label,
      mean,
      sigma,
      gamesPlayed,
      priorWins: (t.wins || 0) + (t.ties || 0) * 0.5,
    };
  });
}

// ── Monte-Carlo simulation ───────────────────────────────────────────────────
// When `focusIdx >= 0` we also return `trace`: the focus team's *cumulative*
// wins after each scheduled week, used to animate season "paths". Tracing is a
// single extra read per round, so the untraced hot path (focusIdx = -1) is
// unaffected.
function simulateOneSeason(strengths, schedule, rng, focusIdx = -1) {
  const n = strengths.length;
  const wins = new Array(n).fill(0);
  const pf = new Array(n).fill(0);
  const trace = focusIdx >= 0 ? new Array(schedule.length) : null;

  schedule.forEach((round, wi) => {
    for (const [a, b] of round) {
      const sa = gaussian(rng, strengths[a].mean, strengths[a].sigma);
      const sb = gaussian(rng, strengths[b].mean, strengths[b].sigma);
      pf[a] += sa;
      pf[b] += sb;
      if (sa >= sb) wins[a] += 1;
      else wins[b] += 1;
    }
    if (trace) trace[wi] = wins[focusIdx]; // cumulative wins through this week
  });
  return { wins, pf, trace };
}

/**
 * Play one full simulated season + playoff and fold the outcome into the shared
 * `counters` (madePlayoffs / champ / sumWins / sumSeed). Returns the raw
 * per-team results so a caller tracking a focus team can read its win total,
 * final standing, and title. Keeping this in one place means the instant
 * one-shot `simulatePowerRankings` and the streaming `createSeasonSimulator`
 * advance the RNG in exactly the same order.
 */
function runOneSim(strengths, schedule, rng, field, priorWins, counters, focusIdx = -1) {
  const n = strengths.length;
  const { wins, pf, trace } = simulateOneSeason(strengths, schedule, rng, focusIdx);
  const order = seedStandings(wins, pf, priorWins);
  for (let rank = 0; rank < n; rank++) {
    const ti = order[rank];
    counters.sumWins[ti] += wins[ti] + priorWins[ti];
    counters.sumSeed[ti] += rank + 1;
  }
  const seeds = order.slice(0, field);
  for (const ti of seeds) counters.madePlayoffs[ti] += 1;
  const championIdx = simulatePlayoffs(seeds, strengths, rng);
  if (championIdx != null) counters.champ[championIdx] += 1;
  return { wins, order, championIdx, trace };
}

/** Fresh, zeroed counter set for a league of `n` teams. */
function makeCounters(n) {
  return {
    madePlayoffs: new Array(n).fill(0),
    champ: new Array(n).fill(0),
    sumWins: new Array(n).fill(0),
    sumSeed: new Array(n).fill(0),
  };
}

/**
 * Turn accumulated counters into the sorted, ranked per-team results. Shared by
 * the one-shot simulator and the streaming runner so both emit identical shapes.
 */
function finalizeResults(strengths, counters, sims) {
  const n = strengths.length;
  const means = strengths.map((s) => s.mean);
  const powerScoreOf = (mean) => {
    const below = means.filter((v) => v < mean).length;
    return n > 1 ? Math.round((below / (n - 1)) * 100) : 50;
  };

  const results = strengths.map((s, i) => ({
    rosterId: s.rosterId,
    label: s.label,
    mean: s.mean,
    sigma: s.sigma,
    playoffOdds: sims ? counters.madePlayoffs[i] / sims : 0,
    championOdds: sims ? counters.champ[i] / sims : 0,
    avgWins: sims ? counters.sumWins[i] / sims : 0,
    avgSeed: sims ? counters.sumSeed[i] / sims : 0,
    powerScore: powerScoreOf(s.mean),
  }));

  results.sort((a, b) => b.championOdds - a.championOdds || b.mean - a.mean);
  results.forEach((r, i) => {
    r.powerRank = i + 1;
  });
  return results;
}

/** Seed standings by wins, breaking ties on total points-for. Returns indices. */
function seedStandings(wins, pf, priorWins) {
  const order = wins.map((_, i) => i);
  order.sort((x, y) => {
    const wx = wins[x] + priorWins[x];
    const wy = wins[y] + priorWins[y];
    if (wy !== wx) return wy - wx;
    return pf[y] - pf[x];
  });
  return order;
}

/**
 * Single-elimination bracket over the top `playoffTeams` seeds. Standard 1-v-N
 * seeding; byes for the top seeds when the field isn't a power of two. Each game
 * is decided by a fresh score draw. Returns the champion's team index.
 */
function simulatePlayoffs(seeds, strengths, rng) {
  let field = [...seeds];
  // Pad to the next power of two with `null` byes so high seeds advance free.
  const size = 1 << Math.ceil(Math.log2(field.length));
  // Standard bracket pairing: seed i plays seed (size-1-i).
  const slots = new Array(size).fill(null);
  for (let i = 0; i < field.length; i++) slots[i] = field[i];
  // Reorder into bracket so 1 meets the lowest, etc.
  let bracket = [];
  for (let i = 0; i < size / 2; i++) {
    bracket.push(slots[i]);
    bracket.push(slots[size - 1 - i]);
  }

  while (bracket.length > 1) {
    const next = [];
    for (let i = 0; i < bracket.length; i += 2) {
      const a = bracket[i];
      const b = bracket[i + 1];
      if (a == null) { next.push(b); continue; }
      if (b == null) { next.push(a); continue; }
      const sa = gaussian(rng, strengths[a].mean, strengths[a].sigma);
      const sb = gaussian(rng, strengths[b].mean, strengths[b].sigma);
      next.push(sa >= sb ? a : b);
    }
    bracket = next;
  }
  return bracket[0];
}

/**
 * Run the full Monte-Carlo and return per-team odds, sorted by power rank.
 *
 * @param teams   strength inputs (see buildStrengths)
 * @param opts.weeks         regular-season games per team (default 14)
 * @param opts.playoffTeams  size of the playoff field (default 6)
 * @param opts.sims          iterations (default 4000)
 * @param opts.seed          RNG seed for reproducibility (default 1337)
 *
 * Each result: {
 *   rosterId, label, mean, sigma,
 *   playoffOdds, championOdds,   // 0..1
 *   avgWins, avgSeed,            // projected final record context
 *   powerScore,                 // 0..100 strength index (max-points based)
 *   powerRank,                  // 1 = strongest
 * }
 */
export function simulatePowerRankings(teams, opts = {}) {
  const {
    weeks = 14,
    playoffTeams = 6,
    sims = 4000,
    seed = 1337,
    blendActual = 0.25,
  } = opts;

  const strengths = buildStrengths(teams, { blendActual });
  const n = strengths.length;
  if (n === 0) return [];

  const field = Math.min(Math.max(2, playoffTeams), n);
  const schedule = buildSchedule(n, weeks);
  const rng = mulberry32(seed);
  const priorWins = strengths.map((s) => s.priorWins);
  const counters = makeCounters(n);

  for (let s = 0; s < sims; s++) {
    runOneSim(strengths, schedule, rng, field, priorWins, counters);
  }

  return finalizeResults(strengths, counters, sims);
}

/**
 * A stateful, batch-drivable version of the Monte-Carlo for the animated
 * "Run Simulations" experience. Build it once with the same team inputs the
 * one-shot simulator takes, then call `runBatch(count)` repeatedly (e.g. from a
 * requestAnimationFrame loop) to advance the sim without blocking the UI. Each
 * batch returns a fresh `snapshot()`.
 *
 * Beyond the league-wide odds, it tracks — for an optional `focusRosterId`
 * (the viewing manager's team) — a win-total histogram, a final-seed histogram,
 * and a capped ring buffer of sampled season "paths" (cumulative wins by week)
 * for the animation. The default `seed` is fresh each call so re-running feels
 * alive; pass a fixed `seed` for reproducibility.
 *
 * @returns {{ runBatch(count:number): object, snapshot(): object, simsDone:number,
 *             weeks:number, field:number, numTeams:number, focusIdx:number }}
 */
export function createSeasonSimulator(teams, opts = {}) {
  const {
    weeks = 14,
    playoffTeams = 6,
    seed = (Math.random() * 2 ** 32) >>> 0,
    blendActual = 0.25,
    focusRosterId = null,
    sampleTrajectories = 40,
  } = opts;

  const strengths = buildStrengths(teams, { blendActual });
  const n = strengths.length;
  const field = Math.min(Math.max(2, playoffTeams), Math.max(2, n));
  const schedule = buildSchedule(n, weeks);
  const rng = mulberry32(seed >>> 0);
  const priorWins = strengths.map((s) => s.priorWins);
  const counters = makeCounters(n);
  const focusIdx =
    focusRosterId != null
      ? strengths.findIndex((s) => String(s.rosterId) === String(focusRosterId))
      : -1;

  let simsDone = 0;

  // Focus-team accumulators (only populated when focusIdx >= 0).
  const winsHistogram = new Array(weeks + 1).fill(0); // final wins 0..weeks
  const seedHistogram = new Array(n + 1).fill(0); // final seed 1..n (index 0 unused)
  let focusWinsSum = 0;
  const trajectories = []; // ring buffer of { wins:number[], champ, madePlayoffs, finalWins }
  let trajCursor = 0;

  // The focus team's fixed weekly opponent (the round-robin pairing is
  // deterministic, so it faces the same opponent index every sim in a given
  // week). -1 marks a bye. `weekWins[w]` counts sims the focus won that week,
  // giving a per-week win probability for the week-by-week deep dive.
  const focusOpp =
    focusIdx >= 0
      ? schedule.map((round) => {
          for (const [a, b] of round) {
            if (a === focusIdx) return b;
            if (b === focusIdx) return a;
          }
          return -1;
        })
      : [];
  const weekWins = new Array(schedule.length).fill(0);

  function runBatch(count) {
    for (let k = 0; k < count && n > 0; k++) {
      const { wins, order, championIdx, trace } = runOneSim(
        strengths, schedule, rng, field, priorWins, counters, focusIdx,
      );
      simsDone++;

      if (focusIdx >= 0) {
        const fw = wins[focusIdx];
        winsHistogram[Math.min(weeks, Math.max(0, fw))]++;
        focusWinsSum += fw;
        const seedRank = order.indexOf(focusIdx) + 1; // 1-based standing
        if (seedRank >= 1 && seedRank <= n) seedHistogram[seedRank]++;
        const made = seedRank >= 1 && seedRank <= field;
        const won = championIdx === focusIdx;
        if (trace) {
          // Per-week win from the cumulative-wins trace (delta is 0 or 1).
          let prev = 0;
          for (let w = 0; w < trace.length; w++) {
            if (focusOpp[w] >= 0 && trace[w] > prev) weekWins[w] += 1;
            prev = trace[w];
          }
          const entry = { wins: trace, champ: won, madePlayoffs: made, finalWins: fw };
          if (trajectories.length < sampleTrajectories) {
            trajectories.push(entry);
          } else {
            trajectories[trajCursor] = entry;
            trajCursor = (trajCursor + 1) % sampleTrajectories;
          }
        }
      }
    }
    return snapshot();
  }

  function snapshot() {
    const results = finalizeResults(strengths, counters, simsDone);
    let focus = null;
    if (focusIdx >= 0) {
      const fid = String(strengths[focusIdx].rosterId);
      const fr = results.find((r) => String(r.rosterId) === fid);
      focus = {
        rosterId: strengths[focusIdx].rosterId,
        label: strengths[focusIdx].label,
        playoffOdds: fr ? fr.playoffOdds : 0,
        championOdds: fr ? fr.championOdds : 0,
        powerRank: fr ? fr.powerRank : null,
        avgWins: simsDone ? focusWinsSum / simsDone : 0, // simulated wins (excl. carried record)
        weeks,
        field,
        winsHistogram: winsHistogram.slice(),
        seedHistogram: seedHistogram.slice(),
        trajectories: trajectories.slice(),
        weekly: focusOpp.map((opp, w) => ({
          week: w + 1,
          bye: opp < 0,
          opponentRosterId: opp >= 0 ? strengths[opp].rosterId : null,
          opponentLabel: opp >= 0 ? strengths[opp].label : null,
          opponentMean: opp >= 0 ? strengths[opp].mean : null,
          winOdds: opp >= 0 && simsDone ? weekWins[w] / simsDone : null,
        })),
      };
    }
    return { simsDone, results, focus };
  }

  return {
    runBatch,
    snapshot,
    get simsDone() { return simsDone; },
    weeks,
    field,
    numTeams: n,
    focusIdx,
  };
}
