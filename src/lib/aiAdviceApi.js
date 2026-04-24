// Client-side wrapper for the /api/ai-analyze proxy.
//
// Free Gemini quota is shared across all users of this app, so we throttle
// HARD on the client: each (league, roster) gets ONE successful generation
// per UTC day. We key the cache on a roster fingerprint so any roster change
// busts it; otherwise the same advice is served instantly all day.

import { safeLocalStorageWrite } from "./sleeperApi.js";

const CACHE_PREFIX = "ai_advice_v1";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Build a compact summary of the analysis object for the model.
// The full analysis object is huge (full league + historical stats); the
// model only needs the user's roster + league context to give useful advice.
// ---------------------------------------------------------------------------
export function buildAiTeamSummary(analysis, league) {
  if (!analysis) return null;

  const myTeam = analysis.leagueTeams?.find(
    (t) => t.rosterId === analysis.rosterId,
  );

  const topPlayers = (analysis.byPos ? Object.values(analysis.byPos).flat() : [])
    .filter(Boolean)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 18)
    .map((p) => ({
      name: p.full_name || p.name,
      pos: p.position,
      team: p.team,
      age: p.age,
      score: round(p.score),
      verdict: p.verdict,
      archetype: p.archetype,
      cliffRisk: p.predictionContext?.cliffRisk,
      breakoutPct: p.predictionContext?.breakoutPct,
    }));

  const picks = (analysis.picks || []).slice(0, 12).map((pk) => ({
    season: pk.season,
    round: pk.round,
    label: pk.label,
  }));

  return {
    league: {
      name: league?.name,
      teams: league?.total_rosters,
      superflex: !!analysis.isSuperflex,
      scoring: analysis.leagueContext?.scoringType,
    },
    teamPhase: {
      label: analysis.teamPhase?.label,
      score: analysis.teamPhase?.score,
      verdict: analysis.teamPhase?.verdict,
    },
    avgAge: analysis.avgAge,
    avgScore: analysis.avgScore,
    needs: analysis.needs,
    surplus: analysis.surplusPositions,
    weakRooms: analysis.weakRooms,
    posRanks: myTeam?.posRanks,
    topPlayers,
    picks,
  };
}

function round(n) {
  if (typeof n !== "number") return n;
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Cache key: stable fingerprint of the roster so any add/drop/trade busts it
// ---------------------------------------------------------------------------
function rosterFingerprint(analysis) {
  const ids = (analysis?.byPos ? Object.values(analysis.byPos).flat() : [])
    .map((p) => p?.player_id || p?.id)
    .filter(Boolean)
    .sort()
    .join(",");
  // Cheap djb2 hash to keep the key short.
  let h = 5381;
  for (let i = 0; i < ids.length; i++) {
    h = ((h << 5) + h + ids.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function cacheKey(leagueId, rosterId, fp) {
  return `${CACHE_PREFIX}_${leagueId}_${rosterId}_${fp}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.advice || !parsed?.timestamp) return null;
    if (Date.now() - parsed.timestamp > ONE_DAY_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main entry: returns { advice, cached, generatedAt }
// Throws on hard failure. UI should catch and show a friendly message.
// ---------------------------------------------------------------------------
export async function fetchAiAdvice(analysis, league, { force = false } = {}) {
  if (!analysis) throw new Error("No analysis available");

  const fp = rosterFingerprint(analysis);
  const key = cacheKey(league?.league_id || "x", analysis.rosterId || "x", fp);

  if (!force) {
    const cached = readCache(key);
    if (cached) {
      return {
        advice: cached.advice,
        cached: true,
        generatedAt: cached.timestamp,
      };
    }
  }

  const teamSummary = buildAiTeamSummary(analysis, league);

  const res = await fetch("/api/ai-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamSummary }),
  });

  if (res.status === 429) {
    throw new Error(
      "Daily AI analysis limit reached. Try again tomorrow.",
    );
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
        `AI request 404 — ${upstreamMsg || "endpoint not found. Has /api/ai-analyze been deployed to Vercel yet?"}`,
      );
    }
    throw new Error(
      upstreamMsg
        ? `AI request failed (${res.status}): ${upstreamMsg}`
        : `AI request failed (${res.status})`,
    );
  }

  const data = await res.json();
  if (!data?.advice) throw new Error("Empty advice response");

  const stamped = { advice: data.advice, timestamp: Date.now() };
  safeLocalStorageWrite(key, JSON.stringify(stamped));

  return { advice: data.advice, cached: false, generatedAt: stamped.timestamp };
}
