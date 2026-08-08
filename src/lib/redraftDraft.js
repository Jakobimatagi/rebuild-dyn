// Redraft draft-assistant math. Where dynasty drafts optimize long-term value
// (age curves, future picks), a redraft draft optimizes *this season's points*:
// rank the board by projected production, weigh each player against the
// replacement-level starter at his position (VOR), and steer toward the slots
// you still need to fill. Pure + dependency-light so it unit-tests in isolation.

import { roomStarterCount } from "./playerGrading.js";

/**
 * Replacement PPG per position over the *currently available* pool. Replacement
 * level = the projected PPG of the last player who'd still be a league-wide
 * starter at that position (per-team starters × number of teams). Everyone above
 * that line has positive value over replacement (VOR); everyone below is
 * streamer-level. Recomputing over the undrafted pool keeps VOR meaningful as
 * the draft thins each position out.
 *
 * @param {Array}  available  undrafted players [{ position, ... }]
 * @param {(p)=>number} ppgOf projected PPG for a player
 * @param {object} leagueContext  getLeagueRulesContext output (starterCounts, …)
 * @returns {Object<string, number>} position → replacement PPG
 */
export function replacementLevels(available, ppgOf, leagueContext) {
  const numTeams = Number(leagueContext?.numTeams) || 12;
  const byPos = {};
  for (const p of available || []) {
    const ppg = Number(ppgOf(p)) || 0;
    (byPos[p.position] ||= []).push(ppg);
  }
  const levels = {};
  for (const [pos, list] of Object.entries(byPos)) {
    const perTeam = roomStarterCount(pos, leagueContext);
    if (perTeam == null) continue;
    list.sort((a, b) => b - a);
    const rank = Math.max(1, Math.round(perTeam * numTeams));
    levels[pos] = list[Math.min(rank - 1, list.length - 1)] || 0;
  }
  return levels;
}

/** Points above replacement for a player. Null when the position has no line. */
export function vorFor(player, ppg, levels) {
  const rep = levels?.[player?.position];
  if (rep == null) return null;
  return Number(ppg || 0) - rep;
}

/**
 * Positional need from a team's live starting lineup: each *unfilled* starter
 * slot adds weight to the positions that could fill it, split across a flex
 * slot's eligible positions so a dedicated hole outweighs a flex hole.
 *
 * @param {Array} myStarters  liveDraft `team.starters` [{ eligible:[], player }]
 * @returns {Object<string, number>} position → unmet-need weight
 */
export function draftRosterNeeds(myStarters) {
  const needs = {};
  for (const s of myStarters || []) {
    if (s?.player) continue; // slot already filled
    const elig = s?.eligible || [];
    if (!elig.length) continue;
    for (const pos of elig) needs[pos] = (needs[pos] || 0) + 1 / elig.length;
  }
  return needs;
}

// How much an open starting slot at a player's position lifts his draft priority.
const NEED_WEIGHT = 0.35;

/**
 * Rank the available pool for a redraft pick: VOR, nudged up for positions the
 * team still needs to start. Returns each player decorated with `ppg`, `vor`,
 * and the composite `pickScore`, highest first.
 */
export function rankRedraftBoard(available, ppgOf, levels, needs) {
  return (available || [])
    .map((p) => {
      const ppg = Number(ppgOf(p)) || 0;
      const vor = vorFor(p, ppg, levels);
      const need = needs?.[p.position] || 0;
      // Below-replacement players still sort by VOR; the need multiplier only
      // amplifies positive value so it never rewards drafting a scrub for need.
      const base = vor == null ? ppg : vor;
      const pickScore = base > 0 ? base * (1 + need * NEED_WEIGHT) : base;
      return { ...p, ppg, vor, need, pickScore };
    })
    .sort((a, b) => b.pickScore - a.pickScore);
}

/** Top-N redraft recommendations (best need-weighted VOR). */
export function recommendRedraftPicks(available, ppgOf, levels, needs, n = 3) {
  return rankRedraftBoard(available, ppgOf, levels, needs).slice(0, n);
}
