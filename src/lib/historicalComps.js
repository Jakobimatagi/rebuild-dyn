// Match a current prospect against the historical_players reference set
// using whatever features overlap between the two data shapes.
//
// Two outputs:
//   - findCompsByName(): exact/normalized name lookup against the historical
//     set. Cheap; used to enrich the existing free-text comparable_player.
//   - rankCompsForProspect(): KNN over normalized feature vectors. Used to
//     auto-suggest the top N similar historical players.
//
// Position scope: WR and RB only (the dataset's coverage). QB / TE prospects
// silently get an empty result.
//
// "Hit rate" semantics: ten_plus_ppg_seasons is the most direct outcome
// signal we have. avg_top_finish is included alongside but is "lower is
// better" so we don't bake it into a single score.

import { normalizeName } from "../components/rookieAdmin/utils.js";

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// ── Feature extraction ───────────────────────────────────────────────────────

function bmi(heightIn, weightLbs) {
  const h = num(heightIn), w = num(weightLbs);
  if (!h || !w) return null;
  return (w / (h * h)) * 703;
}

// Pull the comparable feature vector out of a *prospect* (in-app shape).
function prospectFeatures(p) {
  const ath = p.athletic || {};
  const seasons = (p.seasons || []).map((s) => ({
    rushing_yards:       num(s.rushing_yards) ?? 0,
    receiving_yards:     num(s.receiving_yards) ?? 0,
    receptions:          num(s.receptions) ?? 0,
    yards_per_carry:     num(s.yards_per_carry),
    yards_per_reception: num(s.yards_per_reception),
    target_share_pct:    num(s.target_share_pct),
  }));
  const peakYardage = seasons.length
    ? Math.max(...seasons.map((s) => s.rushing_yards + s.receiving_yards))
    : null;
  const peakRec = seasons.length ? Math.max(...seasons.map((s) => s.receptions)) : null;
  const ypcs = seasons.map((s) => s.yards_per_carry).filter((v) => v != null && v > 0);
  const yprs = seasons.map((s) => s.yards_per_reception).filter((v) => v != null && v > 0);

  if (p.position === "WR") {
    return {
      forty_time: num(ath.fortyYardDash),
      bmi:        bmi(ath.heightIn, ath.weightLbs),
      ypr:        yprs.length ? Math.max(...yprs) : null,
    };
  }
  if (p.position === "RB") {
    return {
      forty_time:    num(ath.fortyYardDash),
      speed_score:   num(ath.speedScore),
      burst_score:   num(ath.burstScore),
      weight:        num(ath.weightLbs),
      bmi:           bmi(ath.heightIn, ath.weightLbs),
      peak_yardage:  peakYardage,
      peak_rec:      peakRec,
      college_ypa:   ypcs.length ? ypcs.reduce((a, b) => a + b, 0) / ypcs.length : null,
    };
  }
  return null;
}

// Pull the comparable vector out of a *historical_players* row.
function historicalFeatures(h) {
  const m = h.metrics || {};
  if (h.position === "WR") {
    return {
      forty_time: num(h.forty_time),
      bmi:        num(m.bmi),
      ypr:        num(m.ypr),
    };
  }
  if (h.position === "RB") {
    return {
      forty_time:    num(h.forty_time),
      speed_score:   num(m.speed_score),
      burst_score:   num(m.burst_score),
      weight:        num(m.weight),
      bmi:           num(m.bmi),
      peak_yardage:  num(m.peak_yardage),
      peak_rec:      num(m.peak_rec),
      college_ypa:   num(m.college_ypa),
    };
  }
  return null;
}

const FEATURE_KEYS = {
  WR: ["forty_time", "bmi", "ypr"],
  RB: ["forty_time", "speed_score", "burst_score", "weight", "bmi", "peak_yardage", "peak_rec", "college_ypa"],
};

// Faster comps will look "better" against the same vector, so for forty_time
// we invert the distance contribution (lower = closer to the prospect's faster
// time means we don't want to penalize). Easier: leave it euclidean. The
// z-score normalization already centers each feature; we just use raw z-dist.

// ── Population stats (mean/stddev per feature, per position) ─────────────────

function computeStats(rows, position) {
  const keys = FEATURE_KEYS[position] || [];
  const stats = {};
  for (const k of keys) {
    const vals = rows
      .filter((r) => r.position === position)
      .map((r) => historicalFeatures(r)?.[k])
      .filter((v) => v != null);
    if (vals.length === 0) { stats[k] = { mean: 0, std: 1 }; continue; }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const std = Math.sqrt(variance) || 1;
    stats[k] = { mean, std };
  }
  return stats;
}

export function buildCompIndex(historicalRows) {
  return {
    rows: historicalRows,
    statsByPosition: {
      WR: computeStats(historicalRows, "WR"),
      RB: computeStats(historicalRows, "RB"),
    },
  };
}

// ── Distance ─────────────────────────────────────────────────────────────────

function zDistance(a, b, stats, keys) {
  let sum = 0;
  let used = 0;
  for (const k of keys) {
    const av = a[k], bv = b[k];
    if (av == null || bv == null) continue;
    const s = stats[k]?.std || 1;
    const az = (av - stats[k].mean) / s;
    const bz = (bv - stats[k].mean) / s;
    sum += (az - bz) ** 2;
    used++;
  }
  if (used === 0) return null;
  // Penalize matches that share fewer features so we don't pick comps based on
  // a single dimension. Square-root normalize by feature count.
  return Math.sqrt(sum / used);
}

// ── Public API ───────────────────────────────────────────────────────────────

// Find historical players whose name matches a free-text "comparable_player".
// Returns an array (usually 0 or 1 entry, occasionally 2 if the name exists
// in two different draft years — exceedingly rare but possible).
export function findCompsByName(historicalRows, freeText) {
  if (!freeText) return [];
  const target = normalizeName(freeText);
  if (!target) return [];
  return historicalRows.filter((r) => normalizeName(r.name) === target);
}

// KNN top-N for a prospect. Returns ranked candidates with distance.
// `limit` defaults to 5. Excludes historical players whose draft year matches
// the prospect's (so a 2026 prospect doesn't get matched against itself).
export function rankCompsForProspect(prospect, index, limit = 5) {
  if (!prospect || !index) return [];
  const keys = FEATURE_KEYS[prospect.position];
  if (!keys) return [];

  const target = prospectFeatures(prospect);
  if (!target) return [];
  const presentInTarget = keys.filter((k) => target[k] != null);
  if (presentInTarget.length < 2) return []; // not enough signal

  const stats = index.statsByPosition[prospect.position];
  const candidates = [];

  for (const h of index.rows) {
    if (h.position !== prospect.position) continue;
    if (h.draft_year === prospect.projectedDraftYear) continue;

    const hf = historicalFeatures(h);
    if (!hf) continue;
    const dist = zDistance(target, hf, stats, presentInTarget);
    if (dist == null) continue;

    candidates.push({ row: h, distance: dist });
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, limit);
}

// ── Production-profile comps (CFBD-driven, all positions) ────────────────────
// The KNN above keys on athletic measurables (forty, speed score, BMI), which
// CFBD can't supply. This second engine matches on COLLEGE PRODUCTION instead —
// the stats CFBD does fill — so it works for QB/TE too and compares a prospect
// against your imported past classes (the `pool`), surfacing how the closest
// statistical comps actually panned out (draft capital).

const PROD_KEYS = {
  WR: ["ts", "ypg", "ypr", "tdpg", "cr"],
  TE: ["ts", "ypg", "ypr", "tdpg", "cr"],
  RB: ["rupg", "ypc", "tdpg", "recpg"],
  QB: ["ypa", "cp", "tdrate", "intrate", "rtg"],
};

// Peak-season production vector for a prospect (in-app shape). Peak = the season
// with the most primary yardage, so a player is judged by their best tape.
function productionFeatures(p) {
  const seasons = p.seasons || [];
  if (!seasons.length) return null;
  const g = (s) => Math.max(1, num(s.games) || 1);
  const pos = p.position;

  if (pos === "WR" || pos === "TE") {
    const peak = seasons.reduce((a, b) => ((num(b.receiving_yards) || 0) > (num(a.receiving_yards) || 0) ? b : a));
    return {
      ts:   num(peak.target_share_pct),
      ypg:  (num(peak.receiving_yards) ?? 0) / g(peak),
      ypr:  num(peak.yards_per_reception),
      tdpg: (num(peak.receiving_tds) ?? 0) / g(peak),
      cr:   num(peak.catch_rate_pct),
    };
  }
  if (pos === "RB") {
    const peak = seasons.reduce((a, b) => ((num(b.rushing_yards) || 0) > (num(a.rushing_yards) || 0) ? b : a));
    const tds = (num(peak.total_tds) ?? ((num(peak.rushing_tds) || 0) + (num(peak.receiving_tds) || 0)));
    return {
      rupg:  (num(peak.rushing_yards) ?? 0) / g(peak),
      ypc:   num(peak.yards_per_carry),
      tdpg:  tds / g(peak),
      recpg: (num(peak.receptions) ?? 0) / g(peak),
    };
  }
  if (pos === "QB") {
    const peak = seasons.reduce((a, b) => ((num(b.passing_yards) || 0) > (num(a.passing_yards) || 0) ? b : a));
    const att = Math.max(1, num(peak.pass_attempts) || 1);
    return {
      ypa:     num(peak.yards_per_attempt),
      cp:      num(peak.completion_pct),
      tdrate:  (num(peak.passing_tds) ?? 0) / att * 100,
      intrate: (num(peak.interceptions) ?? 0) / att * 100,
      rtg:     num(peak.passer_rating),
    };
  }
  return null;
}

function prodStats(pool, position) {
  const keys = PROD_KEYS[position] || [];
  const stats = {};
  for (const k of keys) {
    const vals = pool
      .filter((x) => x.position === position)
      .map((x) => productionFeatures(x)?.[k])
      .filter((v) => v != null);
    if (!vals.length) { stats[k] = { mean: 0, std: 1 }; continue; }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
    stats[k] = { mean, std };
  }
  return stats;
}

// Nearest production comps for `prospect` within `pool` (past prospects, each
// carrying a `_capital` outcome). Returns [{ p, distance, capital }].
export function rankProductionComps(prospect, pool, limit = 5) {
  const keys = PROD_KEYS[prospect?.position];
  if (!keys || !pool?.length) return [];
  const target = productionFeatures(prospect);
  if (!target) return [];
  const present = keys.filter((k) => target[k] != null);
  if (present.length < 2) return [];

  const stats = prodStats(pool, prospect.position);
  const cands = [];
  for (const x of pool) {
    if (x.position !== prospect.position) continue;
    if (x.id === prospect.id) continue;
    if (x.name && prospect.name && normalizeName(x.name) === normalizeName(prospect.name)) continue;
    const xf = productionFeatures(x);
    if (!xf) continue;
    const dist = zDistance(target, xf, stats, present);
    if (dist == null) continue;
    cands.push({ p: x, distance: dist, capital: x._capital || "" });
  }
  cands.sort((a, b) => a.distance - b.distance);
  return cands.slice(0, limit);
}

// Outcome blurb for a historical row — used by both UI paths.
export function summarizeOutcome(h) {
  if (!h) return "";
  const parts = [];
  if (h.draft_capital) parts.push(h.draft_capital);
  if (h.ten_plus_ppg_seasons != null) parts.push(`${h.ten_plus_ppg_seasons} PPG seasons`);
  if (h.avg_top_finish != null && h.avg_top_finish > 0) {
    parts.push(`avg #${Math.round(h.avg_top_finish)} finish`);
  }
  if (parts.length === 0) parts.push("no NFL data yet");
  return parts.join(" · ");
}

// Convenience for callers: given a prospect, build a compact comp report.
export function compsReport(prospect, index, namedComp) {
  const named = namedComp ? findCompsByName(index?.rows || [], namedComp)[0] : null;
  const knn = index ? rankCompsForProspect(prospect, index, 5) : [];
  return {
    named,                       // historical row matching the manually-set comp, if any
    namedSummary: summarizeOutcome(named),
    knn,                         // [{ row, distance }, ...] — top 5 algorithmic comps
  };
}
