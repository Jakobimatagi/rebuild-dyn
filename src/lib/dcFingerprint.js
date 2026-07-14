// Presentation math for DC defensive fingerprints (defense_scheme_seasons):
// league percentiles/ranks per (season, metric), the metric registry the
// visual components render from, and career aggregation for a coach's
// share card. Pure functions over the rows fetched by dcHistoryApi.js —
// no imports with browser-only dependencies, so node --test can load it.

// ── Metric registry ──────────────────────────────────────────────────────────
// kind "quality": more of the percentile = better defense (bar fills toward
// good; lowerIsBetter flips the orientation before the percentile is taken).
// kind "funnel":  identity, not quality — shown as a diverging bar around the
// league median (pass-funnel side vs run-funnel side), never good/bad colored.
export const DC_METRIC_GROUPS = [
  {
    key: "efficiency",
    label: "Efficiency allowed",
    metrics: [
      { key: "epa_play_allowed", label: "EPA/play", fmt: "signed3", kind: "quality", lowerIsBetter: true },
      { key: "pass_epa_allowed", label: "Pass EPA", fmt: "signed3", kind: "quality", lowerIsBetter: true },
      { key: "rush_epa_allowed", label: "Rush EPA", fmt: "signed3", kind: "quality", lowerIsBetter: true },
      { key: "success_rate_allowed", label: "Success%", fmt: "pct1", kind: "quality", lowerIsBetter: true },
      { key: "cpoe_allowed", label: "CPOE", fmt: "signed1", kind: "quality", lowerIsBetter: true },
    ],
  },
  {
    key: "havoc",
    label: "Pressure & takeaways",
    metrics: [
      { key: "sack_rate", label: "Sack rate", fmt: "pct1", kind: "quality", lowerIsBetter: false },
      { key: "qb_hit_rate", label: "QB hit rate", fmt: "pct1", kind: "quality", lowerIsBetter: false },
      { key: "int_rate", label: "INT rate", fmt: "pct1", kind: "quality", lowerIsBetter: false },
    ],
  },
  {
    key: "funnel",
    label: "How offenses attack it",
    metrics: [
      { key: "proe_faced", label: "PROE faced", fmt: "signed1", kind: "funnel", hiNote: "pass funnel", loNote: "run funnel" },
      { key: "pass_rate_faced", label: "Pass rate faced", fmt: "pct0", kind: "funnel", hiNote: "passed on", loNote: "run at" },
      { key: "adot_faced", label: "aDOT faced", fmt: "dec1", kind: "funnel", hiNote: "tested deep", loNote: "tested short" },
      { key: "deep_rate_allowed", label: "Deep shot rate", fmt: "pct0", kind: "funnel", hiNote: "deep shots", loNote: "few deep shots" },
    ],
  },
];

export const DC_METRICS = DC_METRIC_GROUPS.flatMap((g) => g.metrics);
const METRIC_BY_KEY = Object.fromEntries(DC_METRICS.map((m) => [m.key, m]));

const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

export function fmtMetric(fmtOrKey, value) {
  const v = num(value);
  if (v == null) return "—";
  const fmt = METRIC_BY_KEY[fmtOrKey]?.fmt || fmtOrKey;
  switch (fmt) {
    case "signed3": return (v > 0 ? "+" : "") + v.toFixed(3);
    case "signed1": return (v > 0 ? "+" : "") + v.toFixed(1);
    case "pct1":    return `${(v * 100).toFixed(1)}%`;
    case "pct0":    return `${(v * 100).toFixed(0)}%`;
    case "dec1":    return v.toFixed(1);
    default:        return String(v);
  }
}

// ── League context per season ────────────────────────────────────────────────
function seasonValues(rows, season, key) {
  const out = [];
  for (const r of rows || []) {
    if (Number(r.season) !== Number(season)) continue;
    const v = num(r[key]);
    if (v != null) out.push(v);
  }
  return out;
}

/**
 * Percentile of `value` among that season's league values, oriented so that
 * 1.0 = the most of whatever the caller asked for (flip with lowerIsBetter
 * for "good defense" metrics). Midranked on ties; null when the league
 * context is too thin to rank against (fewer than 8 teams).
 */
export function metricPercentile(rows, season, key, value, { lowerIsBetter = false } = {}) {
  const v = num(value);
  if (v == null) return null;
  const vals = seasonValues(rows, season, key);
  if (vals.length < 8) return null;
  let beaten = 0;
  let tied = 0;
  for (const x of vals) {
    if (lowerIsBetter ? x > v : x < v) beaten += 1;
    else if (x === v) tied += 1;
  }
  // The value itself is one of `vals`; midrank its tie group.
  const rankFromBottom = beaten + Math.max(tied - 1, 0) / 2;
  return rankFromBottom / (vals.length - 1);
}

/** League rank (1 = best by the metric's own orientation) and field size. */
export function metricRank(rows, season, key, value, { lowerIsBetter = false } = {}) {
  const v = num(value);
  if (v == null) return null;
  const vals = seasonValues(rows, season, key);
  if (vals.length < 8) return null;
  let better = 0;
  for (const x of vals) if (lowerIsBetter ? x < v : x > v) better += 1;
  return { rank: better + 1, of: vals.length };
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Everything the visual components need for one metric of one fingerprint
 * row: formatted value, oriented percentile, league rank, and — for funnel
 * metrics — the signed offset from the league median (-0.5..+0.5) plus the
 * side note ("pass funnel" / "tested short").
 */
export function metricDisplay(rows, fp, key) {
  const metric = METRIC_BY_KEY[key];
  const v = num(fp?.[key]);
  if (!metric || v == null) return null;
  const season = Number(fp.season);
  if (metric.kind === "funnel") {
    const pctHigh = metricPercentile(rows, season, key, v);
    const offset = pctHigh == null ? null : pctHigh - 0.5;
    const note = offset == null || Math.abs(offset) < 0.15
      ? null
      : offset > 0 ? metric.hiNote : metric.loNote;
    return { metric, value: v, text: fmtMetric(key, v), kind: "funnel", offset, note };
  }
  const pct = metricPercentile(rows, season, key, v, { lowerIsBetter: metric.lowerIsBetter });
  const rank = metricRank(rows, season, key, v, { lowerIsBetter: metric.lowerIsBetter });
  return { metric, value: v, text: fmtMetric(key, v), kind: "quality", pct, rank };
}

/** Overall defense rank for the headline badge — EPA/play allowed. */
export function defenseRank(rows, fp) {
  if (!fp) return null;
  return metricRank(rows, Number(fp.season), "epa_play_allowed", fp.epa_play_allowed, { lowerIsBetter: true });
}

// ── Coach career ─────────────────────────────────────────────────────────────

/**
 * Career defensive profile for a coach name — DC stints from the entries data
 * merged with every pbp season where they're listed as head coach, so clicking
 * an HC (or a DC who became one) shows their whole defensive track record.
 */
export function buildCoachProfile(name, allDcs, schemeRows) {
  const key = (name || "").trim().toLowerCase();
  if (!key) return null;
  const dc = (allDcs || []).find((d) => d.name.toLowerCase() === key);
  const byKey = new Map();
  for (const s of dc?.stints || []) byKey.set(`${s.year}-${s.team}`, { ...s });
  for (const r of schemeRows || []) {
    if ((r.head_coach || "").trim().toLowerCase() !== key) continue;
    const k = `${Number(r.season)}-${r.team}`;
    const existing = byKey.get(k);
    if (existing) existing.headCoach = true;
    else byKey.set(k, { year: Number(r.season), team: r.team, headCoach: true });
  }
  const stints = [...byKey.values()].sort((a, b) => b.year - a.year || a.team.localeCompare(b.team));
  return stints.length > 0 ? { name: dc?.name || name.trim(), stints } : null;
}

/** Every coach name that can produce a profile: DC entries + pbp head coaches. */
export function allCoachNames(allDcs, schemeRows) {
  const names = new Map(); // lowercase -> display
  for (const d of allDcs || []) names.set(d.name.toLowerCase(), d.name);
  for (const r of schemeRows || []) {
    const hc = (r.head_coach || "").trim();
    if (hc && !names.has(hc.toLowerCase())) names.set(hc.toLowerCase(), hc);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Career rollup across a coach's stints, matched to fingerprints (exact season
 * only — no nearest-below fallback, so an unpublished year contributes no
 * misattributed data). Returns null when no stint has a fingerprint.
 *   points    per-stint {year, team, fp, pct, rank} oldest-first (trend chart)
 *   seasons   stints with pbp data
 *   avgEpa    plays-weighted career EPA/play allowed
 *   avgPct    mean defense percentile (EPA/play, per season)
 *   best      the stint with the best league rank
 *   top10     count of top-10 defenses by EPA/play
 */
export function careerDefenseSummary(stints, rows) {
  const points = [];
  for (const s of [...(stints || [])].sort((a, b) => a.year - b.year)) {
    const fp = (rows || []).find((r) => r.team === s.team && Number(r.season) === Number(s.year));
    if (!fp) continue;
    const pct = metricPercentile(rows, s.year, "epa_play_allowed", fp.epa_play_allowed, { lowerIsBetter: true });
    const rank = metricRank(rows, s.year, "epa_play_allowed", fp.epa_play_allowed, { lowerIsBetter: true });
    points.push({ year: s.year, team: s.team, fp, pct, rank });
  }
  if (points.length === 0) return null;

  let epaSum = 0;
  let playSum = 0;
  let pctSum = 0;
  let pctN = 0;
  let best = null;
  let top10 = 0;
  for (const p of points) {
    const epa = num(p.fp.epa_play_allowed);
    const plays = num(p.fp.plays) || 0;
    if (epa != null && plays > 0) { epaSum += epa * plays; playSum += plays; }
    if (p.pct != null) { pctSum += p.pct; pctN += 1; }
    if (p.rank && (!best || p.rank.rank < best.rank.rank)) best = p;
    if (p.rank && p.rank.rank <= 10) top10 += 1;
  }
  return {
    points,
    seasons: points.length,
    avgEpa: playSum > 0 ? epaSum / playSum : null,
    avgPct: pctN > 0 ? pctSum / pctN : null,
    best,
    top10,
  };
}
