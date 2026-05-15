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

// True once the player is at or past their position's peak age. The
// optional `floor` parameter preserves a legacy numeric cutoff: the
// final threshold is max(floor, peakAge), so positions whose peak is
// earlier than `floor` (e.g. RB at 24-25 when floor=26) keep the old
// behavior, while positions whose peak is later (QB, often 28+) get a
// position-aware threshold instead of being falsely flagged as old.
//
// Returns false when player or position data is missing so callers
// fall through to their pre-existing logic rather than firing on
// incomplete data.
export function isPastPeak(player, ageCurves, floor = 0) {
  if (!player || player.age == null || !player.position) return false;
  const peak = getPeakAge(player.position, ageCurves);
  return player.age >= Math.max(floor, peak);
}
