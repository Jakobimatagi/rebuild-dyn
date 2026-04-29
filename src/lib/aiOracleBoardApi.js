// Client wrapper for /api/ai-oracle-board — the Prospect Board's "ASK ORACLE"
// admin feature. Companion to aiVsEvaluateApi.js but works on the Board's
// year-filtered list (full grade, not raw mode), and re-uses the same compact
// prospect-summary shape so the model sees identical fields whichever entry
// point it's invoked from.

import { safeLocalStorageWrite } from "./sleeperApi.js";
import { buildVsRankedSummary } from "./aiVsEvaluateApi.js";

const CACHE_PREFIX = "ai_oracle_board_v1";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function rankedFingerprint(rows) {
  const parts = rows.slice(0, 15).map((x) => `${x.p.id}:${x.grade}`);
  let h = 5381;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function cacheKey(year, fp) {
  return `${CACHE_PREFIX}_${year}_${fp}`;
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
// rows: the Board's `byGrade` list (full grade, sorted desc by grade)
// scope: { year } — either a draft-year string or "all"
// ---------------------------------------------------------------------------
export async function fetchOracleBoardEvaluation(rows, scope, { force = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Empty ranked list");
  }

  const fp = rankedFingerprint(rows);
  const key = cacheKey(scope?.year ?? "x", fp);

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

  // Reuse the VS summary builder — same prospect shape, same field names. The
  // backend prompt differs but the data going in is identical.
  const rankedList = buildVsRankedSummary(rows);

  const res = await fetch("/api/ai-oracle-board", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rankedList, scope }),
  });

  if (res.status === 429) {
    throw new Error("Daily ORACLE limit reached. Try again tomorrow.");
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
        `ORACLE 404 — ${upstreamMsg || "endpoint not found. Has /api/ai-oracle-board been deployed yet?"}`,
      );
    }
    throw new Error(
      upstreamMsg
        ? `ORACLE request failed (${res.status}): ${upstreamMsg}`
        : `ORACLE request failed (${res.status})`,
    );
  }

  const data = await res.json();
  if (!data?.result) throw new Error("Empty result from ORACLE");

  const stamped = { result: data.result, timestamp: Date.now() };
  safeLocalStorageWrite(key, JSON.stringify(stamped));

  return { result: data.result, cached: false, generatedAt: stamped.timestamp };
}
