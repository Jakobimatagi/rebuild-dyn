// Client wrapper for /api/ai-oc-analyze — the OC Rankings page ORACLE feature.
// Builds the 32-team landscape payload, manages a 24-hour localStorage cache,
// and returns { result, cached, generatedAt }.

import { safeLocalStorageWrite } from "./sleeperApi.js";

const CACHE_PREFIX = "ai_oc_analyze_v1";
const ONE_DAY_MS   = 24 * 60 * 60 * 1000;

function teamFingerprint(teams) {
  const parts = teams
    .slice(0, 32)
    .map((t) => `${t.abbr}:${t.oc}:${t.QB}:${t.RB}:${t.WR}:${t.TE}:${t.QB_ppg}:${t.RB_ppg}:${t.WR_ppg}:${t.TE_ppg}`);
  let h = 5381;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function cacheKey(season, fp) {
  return `${CACHE_PREFIX}_${season}_${fp}`;
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

/**
 * teams: array built from the matrix + ocsBySeason (see OffensiveCoordinators.jsx)
 * season: e.g. 2025
 * force: bypass cache
 */
export async function fetchOcAnalysis(teams, season, { force = false } = {}) {
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error("No team data to analyze");
  }

  const fp  = teamFingerprint(teams);
  const key = cacheKey(season, fp);

  if (!force) {
    const cached = readCache(key);
    if (cached) {
      return { result: cached.result, cached: true, generatedAt: cached.timestamp };
    }
  }

  const res = await fetch("/api/ai-oc-analyze", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ teams, season }),
  });

  if (res.status === 429) {
    throw new Error("Daily ORACLE limit reached. Try again tomorrow.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    throw new Error(parsed?.error || `API error ${res.status}`);
  }

  const data   = await res.json();
  const result = data.result;
  safeLocalStorageWrite(key, JSON.stringify({ result, timestamp: Date.now() }));

  return { result, cached: false, generatedAt: Date.now() };
}
