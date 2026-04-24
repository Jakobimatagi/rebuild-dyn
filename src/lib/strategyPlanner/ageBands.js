// Position-aware age helpers for path triage rules.
//
// Paths historically used fixed age cutoffs (e.g. `age >= 26 => sell`), but
// the scoring engine's per-position curves disagree: a 26yo QB is at peak,
// while a 26yo RB is already declining. These helpers let triage rules
// key off the actual peak/decline ages so the verdict tracks the score.

import { AGE_CURVES_FALLBACK } from "../scoringEngine";

function curveFor(position, ageCurves) {
  return (
    (ageCurves && ageCurves[position]) ||
    AGE_CURVES_FALLBACK[position] ||
    AGE_CURVES_FALLBACK.WR
  );
}

export function getPeakAge(position, ageCurves) {
  return curveFor(position, ageCurves).peak;
}

export function getDeclineAge(position, ageCurves) {
  return curveFor(position, ageCurves).decline;
}

// Positive = past peak; negative = still ascending; 0 = at peak.
export function yearsPastPeak(player, ageCurves) {
  if (!player || player.age == null || !player.position) return 0;
  return player.age - getPeakAge(player.position, ageCurves);
}

// True once the player has entered the decline band for their position
// (per scoringEngine curves, not a blanket age cutoff).
export function isInDecline(player, ageCurves) {
  if (!player || player.age == null || !player.position) return false;
  return player.age >= getDeclineAge(player.position, ageCurves);
}
