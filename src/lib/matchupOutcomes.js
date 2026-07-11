// Ceiling / average / floor outcome odds for an offense-vs-defense pairing.
//
// Every offensive player-week is classified against the player's OWN scoring
// range (floor game = at/below his 25th percentile, ceiling game = at/above
// his 75th), so a defense that holds stars to role-player lines counts as
// forcing floor games even when the raw totals look ordinary. Aggregating
// those classifications per defense (and position) gives empirical odds that
// a matchup produces a ceiling, average, or floor game — recency-weighted and
// shrunk toward the league base rates so a few weird games can't dominate.
// Dependency-free for node --test.

export const OUTCOMES = ["ceiling", "average", "floor"];

/** Interpolated percentile (q in 0..1) of an ascending-sorted numeric array. */
function percentile(sorted, q) {
  if (sorted.length === 0) return null;
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Per-player scoring profiles from flat weekly rows
 * { player_id, name, pos, season, week, pts }. Players with fewer than
 * `minGames` scored games are omitted — their percentiles are noise.
 *
 * Returns Map(player_id → { player_id, name, pos, games, avg, floor, ceiling })
 * where floor/ceiling are the player's own p25/p75 single-game points.
 */
export function buildPlayerProfiles(rows, { minGames = 6 } = {}) {
  const byPlayer = new Map();
  for (const r of rows || []) {
    if (!r?.player_id || r.pts == null) continue;
    const cur = byPlayer.get(r.player_id) || { name: r.name, pos: r.pos, pts: [] };
    cur.pts.push(Number(r.pts));
    // Rows arrive newest-season-first; keep the freshest name/pos we saw first.
    cur.name = cur.name || r.name;
    cur.pos = cur.pos || r.pos;
    byPlayer.set(r.player_id, cur);
  }

  const profiles = new Map();
  for (const [id, p] of byPlayer) {
    if (p.pts.length < minGames) continue;
    const sorted = [...p.pts].sort((a, b) => a - b);
    const avg = sorted.reduce((s, x) => s + x, 0) / sorted.length;
    profiles.set(id, {
      player_id: id,
      name: p.name,
      pos: p.pos,
      games: sorted.length,
      avg,
      floor: percentile(sorted, 0.25),
      ceiling: percentile(sorted, 0.75),
    });
  }
  return profiles;
}

/** Classify one game against the player's own range. */
export function classifyGame(profile, pts) {
  if (pts >= profile.ceiling) return "ceiling";
  if (pts <= profile.floor) return "floor";
  return "average";
}

const rateKey = (defense, pos) => `${defense}|${pos}`;

function normalize(counts) {
  const total = OUTCOMES.reduce((s, o) => s + counts[o], 0);
  if (total <= 0) return null;
  return {
    ceiling: counts.ceiling / total,
    average: counts.average / total,
    floor: counts.floor / total,
    n: total,
  };
}

/**
 * Empirical outcome odds per defense (and per defense-position) from the same
 * flat rows fed to buildPlayerProfiles. Each qualifying player-game is
 * classified vs the player's own range, weighted by `seasonWeights` (omit to
 * weight equally), tallied under BOTH the position and the "ALL" bucket, and
 * finally shrunk toward the league base rate for that bucket by `priorN`
 * weighted pseudo-games.
 *
 * Returns {
 *   byDefense: Map("DEF|POS" and "DEF|ALL" → { ceiling, average, floor, n, games }),
 *   base: Map(pos / "ALL" → { ceiling, average, floor, n }),
 * } — all probabilities in 0..1; `n` is the weighted sample, `games` raw count.
 */
export function buildOutcomeRates(rows, profiles, {
  seasonWeights = null,
  priorN = 20,
} = {}) {
  const zero = () => ({ ceiling: 0, average: 0, floor: 0, games: 0 });
  const byDefRaw = new Map();
  const baseRaw = new Map();

  for (const r of rows || []) {
    if (!r?.opponent || r.pts == null) continue;
    const profile = profiles.get(r.player_id);
    if (!profile) continue;
    const w = seasonWeights ? (seasonWeights[r.season] ?? 0) : 1;
    if (w <= 0) continue;
    const outcome = classifyGame(profile, Number(r.pts));
    for (const pos of [profile.pos, "ALL"]) {
      const dk = rateKey(r.opponent, pos);
      const d = byDefRaw.get(dk) || zero();
      d[outcome] += w;
      d.games += 1;
      byDefRaw.set(dk, d);
      const b = baseRaw.get(pos) || zero();
      b[outcome] += w;
      baseRaw.set(pos, b);
    }
  }

  const base = new Map();
  for (const [pos, counts] of baseRaw) {
    const p = normalize(counts);
    if (p) base.set(pos, p);
  }

  const byDefense = new Map();
  for (const [dk, counts] of byDefRaw) {
    const pos = dk.split("|")[1];
    const basePos = base.get(pos);
    const raw = normalize(counts);
    if (!raw || !basePos) continue;
    const n = raw.n;
    const blend = (o) => (n * raw[o] + priorN * basePos[o]) / (n + priorN);
    byDefense.set(dk, {
      ceiling: blend("ceiling"),
      average: blend("average"),
      floor: blend("floor"),
      n,
      games: counts.games,
    });
  }

  return { byDefense, base };
}

/** Odds lookup for a defense/position ("ALL" for the whole offense) — null if unseen. */
export function getOutcomeRate(rates, defense, pos = "ALL") {
  if (!rates || !defense) return null;
  return rates.byDefense.get(rateKey(defense, pos)) ?? null;
}

/**
 * Verdict for a matchup: which outcome the defense tilts toward, judged by
 * lift over the league base rate (raw "average" would win almost every time).
 * Returns { verdict: "ceiling"|"average"|"floor", lift } — "average" when no
 * tilt clears `minLift` (probability points, default 3).
 */
export function outcomeVerdict(rate, baseRate, { minLift = 0.03 } = {}) {
  if (!rate || !baseRate) return { verdict: "average", lift: 0 };
  const ceilingLift = rate.ceiling - baseRate.ceiling;
  const floorLift = rate.floor - baseRate.floor;
  if (ceilingLift >= floorLift && ceilingLift >= minLift) {
    return { verdict: "ceiling", lift: ceilingLift };
  }
  if (floorLift > ceilingLift && floorLift >= minLift) {
    return { verdict: "floor", lift: floorLift };
  }
  return { verdict: "average", lift: Math.max(ceilingLift, floorLift, 0) };
}
