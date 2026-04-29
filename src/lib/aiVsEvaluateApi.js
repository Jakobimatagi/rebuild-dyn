// Client wrapper for the /api/ai-vs-evaluate proxy.
//
// Sends the current VS-comparison ranked list to Gemini and gets back an
// overview of the ranking logic + a tweet for each of the top 10 prospects.
//
// Cached locally by ranked-list fingerprint so re-clicks on the same list
// don't re-burn Gemini quota. Cache invalidates whenever ranks change.

import { safeLocalStorageWrite } from "./sleeperApi.js";
import { deriveSchool } from "./prospectScoring.js";

const CACHE_PREFIX = "ai_vs_eval_v1";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Build the compact prospect summary the model sees. Only top 15 ship to the
// API — the model only writes tweets for the top 10 anyway, but the extra
// context helps it judge where the cutoff sits.
// ---------------------------------------------------------------------------
export function buildVsRankedSummary(merged) {
  return merged.slice(0, 15).map((x, i) => {
    const seasons = [...(x.p.seasons || [])].sort(
      (a, b) => Number(a.season_year) - Number(b.season_year),
    );
    const recent = seasons[seasons.length - 1] || {};
    const num = (k) => {
      const v = parseFloat(recent[k]);
      return Number.isFinite(v) ? v : null;
    };
    const stats = {};
    if (x.p.position === "WR" || x.p.position === "TE") {
      stats.games = num("games");
      stats.target_share_pct = num("target_share_pct");
      stats.catch_rate_pct = num("catch_rate_pct");
      stats.yards_per_reception = num("yards_per_reception");
      stats.receiving_yards = num("receiving_yards");
      stats.receiving_tds = num("receiving_tds");
    } else if (x.p.position === "QB") {
      stats.games = num("games");
      stats.completion_pct = num("completion_pct");
      stats.yards_per_attempt = num("yards_per_attempt");
      stats.passer_rating = num("passer_rating");
      stats.passing_tds = num("passing_tds");
      stats.interceptions = num("interceptions");
    } else if (x.p.position === "RB") {
      stats.games = num("games");
      stats.yards_per_carry = num("yards_per_carry");
      stats.rushing_yards = num("rushing_yards");
      stats.rushing_tds = num("rushing_tds");
      stats.receptions = num("receptions");
      stats.receiving_tds = num("receiving_tds");
    }
    return {
      rank: i + 1,
      name: x.p.name,
      position: x.p.position,
      school: deriveSchool(x.p) || null,
      draftYear: x.p.projectedDraftYear ?? x.classYear ?? null,
      grade: x.grade,
      ds: Math.round(x.ds),
      tier: x.ann?.tier || null,
      comp: x.p.comparablePlayer || null,
      declared: !!x.declared,
      seasons: seasons.length,
      recent: stats,
    };
  });
}

// ---------------------------------------------------------------------------
// Fingerprint of the ranked list — name + grade per slot. Order-sensitive,
// so a re-rank busts the cache.
// ---------------------------------------------------------------------------
function rankedFingerprint(merged) {
  const parts = merged.slice(0, 15).map((x) => `${x.p.id}:${x.grade}`);
  let h = 5381;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function cacheKey(yearA, yearB, fp) {
  return `${CACHE_PREFIX}_${yearA}_${yearB}_${fp}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.result || !parsed?.timestamp) return null;
    if (Date.now() - parsed.timestamp > ONE_DAY_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main entry. Returns { result, cached, generatedAt }.
// `result` shape: { overview: string, tweets: [{ rank, name, tweet, reasoning }] }
// ---------------------------------------------------------------------------
export async function fetchVsEvaluation(merged, classes, { force = false } = {}) {
  if (!Array.isArray(merged) || merged.length === 0) {
    throw new Error("Empty ranked list");
  }

  const fp = rankedFingerprint(merged);
  const key = cacheKey(classes?.a ?? "x", classes?.b ?? "x", fp);

  if (!force) {
    const cached = readCache(key);
    if (cached) {
      return {
        result: cached.result,
        cached: true,
        generatedAt: cached.timestamp,
      };
    }
  }

  const rankedList = buildVsRankedSummary(merged);

  const res = await fetch("/api/ai-vs-evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rankedList, classes }),
  });

  if (res.status === 429) {
    throw new Error("Daily AI evaluation limit reached. Try again tomorrow.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    const upstreamMsg =
      parsed?.detail?.error?.message ||
      parsed?.detail?.error ||
      parsed?.error ||
      text?.slice(0, 200);
    if (res.status === 404) {
      throw new Error(
        `AI request 404 — ${upstreamMsg || "endpoint not found. Has /api/ai-vs-evaluate been deployed yet?"}`,
      );
    }
    throw new Error(
      upstreamMsg
        ? `AI request failed (${res.status}): ${upstreamMsg}`
        : `AI request failed (${res.status})`,
    );
  }

  const data = await res.json();
  if (!data?.result) throw new Error("Empty result from AI evaluator");

  const stamped = { result: data.result, timestamp: Date.now() };
  safeLocalStorageWrite(key, JSON.stringify(stamped));

  return { result: data.result, cached: false, generatedAt: stamped.timestamp };
}
