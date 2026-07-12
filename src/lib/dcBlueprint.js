// Coordinator-continuity weighting for the matchup multiplier engine.
//
// The multiplier engine recency-weights three seasons the same for every
// team, but a defense with a new DC (or an offense with a new OC) shouldn't
// carry its old identity at full weight. Given a coordinator dataset in the
// ocData.js/dcData.js shape — { [year]: { [team]: { name } } } — this builds
// the per-(team, season) weight factors buildMultipliers consumes: seasons a
// team played under a DIFFERENT coordinator than its current one get their
// weight multiplied down (not zeroed — the roster still carries over).
// Teams or seasons with no data stay neutral, so the feature only sharpens
// where the dataset is filled in. Dependency-free for node --test.

// Weight kept for seasons under a different coordinator. Scheme matters, but
// personnel persists — 0.35 keeps a changed season as a one-third voice.
export const CHANGED_COORD_FACTOR = 0.35;

/** Coordinator name for (season, team), or null when unknown/vacant. */
export function coordinatorFor(data, season, team) {
  const name = data?.[season]?.[team]?.name?.trim();
  if (!name || /^vacant$/i.test(name)) return null;
  return name;
}

/**
 * Build the Map("TEAM|season" → factor) of weight overrides for
 * buildMultipliers' `groupSeasonFactors` option.
 *
 * For each team with a known coordinator in `anchorSeason`, every other listed
 * season whose coordinator differs gets `changedFactor`. Unknown entries (team
 * missing, season not imported, "Vacant") produce no override — neutral 1.
 */
export function coordinatorContinuityFactors(data, anchorSeason, {
  changedFactor = CHANGED_COORD_FACTOR,
} = {}) {
  const factors = new Map();
  if (!data) return factors;

  const seasons = Object.keys(data).map(Number).filter(Number.isFinite);
  const teams = new Set();
  for (const season of seasons) {
    for (const team of Object.keys(data[season] || {})) teams.add(team);
  }

  for (const team of teams) {
    const current = coordinatorFor(data, anchorSeason, team);
    if (!current) continue; // no anchor coordinator → stay neutral everywhere
    for (const season of seasons) {
      if (season === Number(anchorSeason)) continue;
      const past = coordinatorFor(data, season, team);
      if (past && past !== current) factors.set(`${team}|${season}`, changedFactor);
    }
  }
  return factors;
}
