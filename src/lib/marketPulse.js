/**
 * marketPulse.js
 *
 * Aggregates per-player RosterAudit trend signals into position- and
 * tier-level deltas, plus a "biggest movers" feed. Lets users see whether
 * the market is moving for/against a position or tier in aggregate, instead
 * of having to scan a hundred-row table to infer it.
 *
 * Inputs: the raw RA rankings array from rosterAuditSource.rankings.
 * Output:
 *   {
 *     positions: { QB: {...}, RB: {...}, WR: {...}, TE: {...} },
 *     tiers:     { 1: {...}, 2: {...}, ... },
 *     risers7d:  [{ name, position, tier, trend7d, trend30d, value }, ...],
 *     fallers7d: [...],
 *     risers30d: [...],
 *     fallers30d:[...],
 *     summary: { sampleSize, asOf }
 *   }
 *
 * Aggregation is value-weighted so movement on RB1s carries more weight
 * than movement on RB60s — a 5-pt drop on a $9000 stud means a lot more
 * to the position market than a 5-pt drop on a $200 stash.
 */

const TRACKED_POSITIONS = ["QB", "RB", "WR", "TE"];
const VALUE_FLOOR = 200; // ignore deep-bench noise in movers feed

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function valueWeightedAvg(rows, getter) {
  let totalW = 0;
  let totalSum = 0;
  for (const r of rows) {
    const w = num(r.value);
    if (w <= 0) continue;
    totalW += w;
    totalSum += getter(r) * w;
  }
  return totalW > 0 ? totalSum / totalW : 0;
}

function summarizeBucket(rows) {
  if (!rows.length) return null;

  const trend7Avg = valueWeightedAvg(rows, (r) => num(r.trend_7d));
  const trend30Avg = valueWeightedAvg(rows, (r) => num(r.trend_30d));

  // Risers / fallers within the bucket — restrict to non-trivial value so
  // we don't surface +20% on a $50 player.
  const meaningful = rows.filter((r) => num(r.value) >= VALUE_FLOOR);

  const top = (key) => {
    const sorted = [...meaningful].sort((a, b) => num(b[key]) - num(a[key]));
    return sorted.slice(0, 3).map((r) => ({
      name: r.name,
      position: r.position,
      team: r.team || null,
      tier: r.tier,
      trend7d: num(r.trend_7d),
      trend30d: num(r.trend_30d),
      value: num(r.value),
    }));
  };
  const bottom = (key) => {
    const sorted = [...meaningful].sort((a, b) => num(a[key]) - num(b[key]));
    return sorted.slice(0, 3).map((r) => ({
      name: r.name,
      position: r.position,
      team: r.team || null,
      tier: r.tier,
      trend7d: num(r.trend_7d),
      trend30d: num(r.trend_30d),
      value: num(r.value),
    }));
  };

  // Share of the bucket moving up vs down — "is the market broadly behind
  // this group, or just one or two outliers?"
  const upCount = rows.filter((r) => num(r.trend_30d) > 0).length;
  const downCount = rows.filter((r) => num(r.trend_30d) < 0).length;

  return {
    count: rows.length,
    avg7d: Math.round(trend7Avg * 10) / 10,
    avg30d: Math.round(trend30Avg * 10) / 10,
    upShare: rows.length > 0 ? Math.round((upCount / rows.length) * 100) : 0,
    downShare: rows.length > 0 ? Math.round((downCount / rows.length) * 100) : 0,
    risers7d: top("trend_7d"),
    fallers7d: bottom("trend_7d"),
    risers30d: top("trend_30d"),
    fallers30d: bottom("trend_30d"),
  };
}

export function buildMarketPulse(rankings) {
  if (!Array.isArray(rankings) || !rankings.length) return null;

  const positions = {};
  for (const pos of TRACKED_POSITIONS) {
    const rows = rankings.filter((r) => r.position === pos);
    const summary = summarizeBucket(rows);
    if (summary) positions[pos] = summary;
  }

  const tiers = {};
  for (let t = 1; t <= 6; t++) {
    const rows = rankings.filter(
      (r) => String(r.tier) === String(t) && TRACKED_POSITIONS.includes(r.position),
    );
    const summary = summarizeBucket(rows);
    if (summary && summary.count >= 5) tiers[t] = summary;
  }

  // Global movers — bigger floor so we surface needle-movers, not noise.
  const meaningful = rankings.filter(
    (r) =>
      TRACKED_POSITIONS.includes(r.position) && num(r.value) >= VALUE_FLOOR * 2,
  );

  const sortedBy = (key, dir) =>
    [...meaningful]
      .sort((a, b) => (dir === "asc" ? num(a[key]) - num(b[key]) : num(b[key]) - num(a[key])))
      .slice(0, 6)
      .map((r) => ({
        name: r.name,
        position: r.position,
        team: r.team || null,
        age: num(r.age),
        tier: r.tier,
        trend7d: num(r.trend_7d),
        trend30d: num(r.trend_30d),
        value: num(r.value),
        rankPos: num(r.rank_pos),
      }));

  return {
    positions,
    tiers,
    risers7d: sortedBy("trend_7d", "desc").filter((r) => r.trend7d > 0),
    fallers7d: sortedBy("trend_7d", "asc").filter((r) => r.trend7d < 0),
    risers30d: sortedBy("trend_30d", "desc").filter((r) => r.trend30d > 0),
    fallers30d: sortedBy("trend_30d", "asc").filter((r) => r.trend30d < 0),
    summary: {
      sampleSize: rankings.length,
      meaningfulSize: meaningful.length,
    },
  };
}
