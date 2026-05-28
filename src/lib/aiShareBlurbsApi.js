// Client wrapper for /api/ai-share-blurbs — one-sentence per-player
// rationales rendered under each row of the share cards (Top Players and
// Rookies). Cached locally by player-set fingerprint so flipping between
// position tabs or toggling shareLimit doesn't re-burn Gemini quota when
// the underlying set is unchanged.

import { safeLocalStorageWrite } from "./sleeperApi.js";

const CACHE_PREFIX = "ai_share_blurbs_v1";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Order-sensitive fingerprint of the player payload. Any rank shuffle or
// scope change busts the cache; same ids/scores in the same order reuses.
function blurbFingerprint(kind, scope, players) {
  const parts = players.map((p) => {
    if (kind === "top-players") return `${p.id}:${p.finalScore}`;
    if (kind === "oc-usage") return `${p.id}:${p.metric ?? ""}`;
    return `${p.id}:${p.grade}`;
  });
  const seed = `${kind}|${scope?.year ?? ""}|${scope?.season ?? ""}|${scope?.board ?? ""}|${scope?.position ?? ""}|${parts.join(",")}`;
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function cacheKey(fp) {
  return `${CACHE_PREFIX}_${fp}`;
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
// fetchShareBlurbs
//   kind:    "top-players" | "rookies"
//   players: array of compact summaries (see builders below)
//   scope:   { year?, position? } — optional metadata for the prompt + cache
//
// Returns: { blurbsById: Map<id, blurb>, cached, generatedAt }
// ---------------------------------------------------------------------------
export async function fetchShareBlurbs(kind, players, scope = {}, { force = false } = {}) {
  if (!Array.isArray(players) || players.length === 0) {
    return { blurbsById: new Map(), cached: false, generatedAt: null };
  }

  const fp = blurbFingerprint(kind, scope, players);
  const key = cacheKey(fp);

  if (!force) {
    const cached = readCache(key);
    if (cached) {
      return {
        blurbsById: new Map(cached.result.blurbs.map((b) => [b.id, b.blurb])),
        tweet: cached.result.tweet ?? null,
        cached: true,
        generatedAt: cached.timestamp,
      };
    }
  }

  const res = await fetch("/api/ai-share-blurbs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, players, scope }),
  });

  if (res.status === 429) {
    throw new Error("Daily AI insight limit reached. Try again tomorrow.");
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
        `Insight request 404 — ${upstreamMsg || "endpoint not found. Has /api/ai-share-blurbs been deployed yet?"}`,
      );
    }
    throw new Error(
      upstreamMsg
        ? `Insight request failed (${res.status}): ${upstreamMsg}`
        : `Insight request failed (${res.status})`,
    );
  }

  const data = await res.json();
  if (!data?.result?.blurbs) throw new Error("Empty result from insight model");

  const stamped = { result: data.result, timestamp: Date.now() };
  safeLocalStorageWrite(key, JSON.stringify(stamped));

  return {
    blurbsById: new Map(data.result.blurbs.map((b) => [b.id, b.blurb])),
    tweet: data.result.tweet ?? null,
    cached: false,
    generatedAt: stamped.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Summary builders — keep the model's input compact and consistent. Both
// share modals call these so the AI sees identical field names regardless
// of whichever entry point invoked it.
// ---------------------------------------------------------------------------

export function buildTopPlayerBlurbInput(player) {
  // player is a row from AdminTopPlayers' `filtered` / `sharePositions[pos]`
  // shape, which contains everything except a "tier" key — we surface the
  // tier letter explicitly so the prompt doesn't have to remember our
  // breakpoint math.
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    team: player.team,
    age: player.age,
    yearsExp: player.yearsExp,
    finalScore: player.displayScore,
    tier: player.displayTier?.key || null,
    internal: player.internalScore,
    fc: player.fantasyCalcNormalized,
    ra: player.rosterAuditNormalized,
    ppg: player.ppg != null ? Number(player.ppg) : null,
    gp: player.gp24,
    careerYears: player.careerYearsScored,
    ocPct: player.ocOutlook?.multiplierPct ?? null,
    capped: !!player.isUnproven,
  };
}

export function buildRookieBlurbInput(player) {
  // player is a row from RookieShareModal's `graded` list. We also fold in
  // the most recent college season stats so the model can cite production
  // numbers without us having to enumerate the field names per position.
  const seasons = Array.isArray(player.seasons) ? player.seasons : [];
  const sortedSeasons = [...seasons].sort(
    (a, b) => Number(a.season_year) - Number(b.season_year),
  );
  const last = sortedSeasons[sortedSeasons.length - 1] || null;
  const recent = last
    ? Object.fromEntries(
        Object.entries(last).filter(([k, v]) => v !== "" && v != null && k !== "school"),
      )
    : null;

  return {
    id: player.id,
    name: player.name,
    position: player.position,
    school: player.school || null,
    grade: player.grade,
    tier: player.tierLabel || null,
    capital: player.capitalKey || null,
    landing: player.landingSpot || null,
    comp: player.comp || null,
    adp: player.rookieAdp || null,
    recent,
  };
}

// Compact usage summary for the OC share cards. `subject` is a normalized
// usage row assembled by OcShareModal (player row, team-season row, OC
// fingerprint, or single player). Only the present fields are forwarded —
// the model is told to lean on whichever metric is load-bearing. `metric` is
// the card's headline value, used for the blurb cache fingerprint.
export function buildOcBlurbInput(subject) {
  const round = (v, d = 3) =>
    v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d));
  const out = {
    id: subject.id,
    name: subject.name ?? null,
    team: subject.team ?? null,
    pos: subject.pos ?? null,
    season: subject.season ?? null,
    oc: subject.oc ?? null,
    metric: subject.metric ?? null,
  };
  const numFields = [
    "snapShare", "targetShare", "carryShare", "rzTargetShare", "rzCarryShare",
    "adot", "airYardShare", "wopr", "passRate", "teamAdot",
    "leadCarryShare", "leadTargetShare", "carryHHI", "targetHHI",
  ];
  for (const f of numFields) {
    if (subject[f] != null) out[f] = round(subject[f]);
  }
  for (const f of ["touches", "targets", "carries", "rzTgt", "rzCarry"]) {
    if (subject[f] != null) out[f] = subject[f];
  }
  return out;
}
