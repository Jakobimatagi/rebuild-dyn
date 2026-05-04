// Rookie Draft Plan helpers — pure logic, no UI.
//
// Everything here is intentionally lightweight. The dashboard's full team
// grade pipeline pulls 20+ historical seasons + RosterAudit + transactions;
// we don't need that here. The plan tool answers "if I draft these guys,
// how does each position room look?" — a directional, not exact, signal.

import { computeGrade, dynastyScore } from "./prospectScoring.js";
import { computePositionGrade } from "./playerGrading.js";

const POSITIONS = ["QB", "RB", "WR", "TE"];

// ── Pick ownership ───────────────────────────────────────────────────────────

// Sleeper's `/league/{id}/traded_picks` returns one row per pick that has
// changed hands. The DEFAULT (untraded) pick belongs to the original roster.
// Returns the picks the given roster currently owns for `season`, sorted by
// draft order (round + slot when known) with provenance metadata.
//
// `slotByRoster` (optional): { [originalOwnerRosterId]: slotNumber } from the
// upcoming draft's `slot_to_roster_id`. When present, picks within a round
// are ordered by slot; otherwise they're ordered own-first as a fallback.
export function ownedPicksForSeason(tradedPicks, myRosterId, totalRosters, season, maxRound = 4, slotByRoster = null) {
  const tradeRows = (tradedPicks || []).filter((t) => Number(t.season) === Number(season));
  const owned = [];
  for (let round = 1; round <= maxRound; round++) {
    for (let originalOwner = 1; originalOwner <= totalRosters; originalOwner++) {
      const trade = tradeRows.find(
        (t) => Number(t.round) === round && Number(t.roster_id) === originalOwner,
      );
      const currentOwner = trade ? Number(trade.owner_id) : originalOwner;
      if (currentOwner !== Number(myRosterId)) continue;
      const slot = slotByRoster ? Number(slotByRoster[originalOwner]) || null : null;
      owned.push({
        season:        Number(season),
        round,
        originalOwner,
        slot,
        // 1.04 → 4, 2.07 → totalRosters + 7. Used for sort + display.
        pickNumber:    slot != null ? (round - 1) * totalRosters + slot : null,
        acquired:      originalOwner !== Number(myRosterId),
      });
    }
  }
  return owned.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    // Within a round, prefer slot order when we have it; otherwise own-first.
    if (a.slot != null && b.slot != null) return a.slot - b.slot;
    if (a.slot != null) return -1;
    if (b.slot != null) return 1;
    return a.acquired - b.acquired;
  });
}

export function pickKey(pick) {
  return `${pick.season}-${pick.round}-${pick.originalOwner}`;
}

export function pickLabel(pick, rosterNameById = {}) {
  // When slot is known, lead with "1.04"-style notation (industry standard).
  if (pick.slot != null) {
    const slotStr = String(pick.slot).padStart(2, "0");
    const base = `${pick.season} ${pick.round}.${slotStr}`;
    if (!pick.acquired) return base;
    const from = rosterNameById[pick.originalOwner] || `Roster ${pick.originalOwner}`;
    return `${base} (via ${from})`;
  }
  // Fallback when slot isn't known (future drafts not yet created).
  const ord = ["", "1st", "2nd", "3rd", "4th", "5th"][pick.round] || `${pick.round}th`;
  if (!pick.acquired) return `${pick.season} ${ord}`;
  const from = rosterNameById[pick.originalOwner] || `Roster ${pick.originalOwner}`;
  return `${pick.season} ${ord} (via ${from})`;
}

// ── Player synthesis ─────────────────────────────────────────────────────────

// Rough age → component score (peak around 22-26, falls off either side).
// Mirrors the curve in prospectScoring without pulling the full function.
function ageScoreFromAge(age) {
  const a = Number(age) || 26;
  if (a <= 22) return Math.max(40, 100 - (22 - a) * 8);
  if (a <= 26) return 100;
  return Math.max(20, 100 - (a - 26) * 10);
}

// Build a lightweight player object compatible with playerGrading.computePositionGrade.
// `fcValue` is FantasyCalc's normalized 0-100 dynasty value (or 0 if unknown).
// We use it as the player's `score` and as a rough peak/current pctile —
// not exact, but FC values track production well enough for a directional grade.
export function buildLightPlayer(p, fcValue) {
  const pos = p.fantasy_positions?.[0] || p.position;
  const fc = Number(fcValue) || 0;
  const age = Number(p.age) || 26;
  const yearsExp = Number(p.years_exp ?? 0);
  return {
    id: p.player_id,
    name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.full_name || "Unknown",
    position: pos,
    age,
    yearsExp,
    score: fc,
    currentPctile: fc,
    peakPctile: fc,
    components: { situ: 60, age: ageScoreFromAge(age) },
  };
}

// Build a synthetic "drafted" rookie from a prospect record. We use the
// prospect's dynasty-adjusted grade as both score and peak — and set
// currentPctile to a fraction of peak so a freshly-drafted rookie doesn't
// instantly displace established starters in the room (they shouldn't —
// year 1 production rarely matches their long-term value).
export function synthesizeRookie(prospect, annotation = {}) {
  const { total: grade } = computeGrade(
    prospect,
    undefined,
    annotation.draftCapital || prospect.draftCapital || "",
    annotation.declared || false,
    annotation.tier || "",
  );
  const ds = dynastyScore(grade, prospect.position, prospect.seasons);
  const recent = (prospect.seasons || []).slice(-1)[0];
  const ageAtDraft = (parseFloat(recent?.age) || 21) + 1;
  return {
    id: `prospect-${prospect.id}`,
    name: prospect.name,
    position: prospect.position,
    age: ageAtDraft,
    yearsExp: 0,
    score: ds,
    currentPctile: Math.round(ds * 0.5), // ~half-impact in year 1
    peakPctile: ds,
    components: { situ: 65, age: ageScoreFromAge(ageAtDraft) },
    isRookie: true,
    grade,
    dynastyScore: ds,
  };
}

// ── Position grade impact ────────────────────────────────────────────────────

// Builds a `{ QB: [players], RB: [...], ... }` map from a flat list,
// sorted by score descending so computePositionGrade weights them correctly.
function groupByPos(players) {
  const out = { QB: [], RB: [], WR: [], TE: [] };
  for (const p of players) {
    const pos = p.position;
    if (!out[pos]) continue;
    out[pos].push(p);
  }
  for (const k of POSITIONS) out[k].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return out;
}

// Compute before/after position grades. `roster` and `rookies` are arrays of
// player-shaped objects (use buildLightPlayer / synthesizeRookie). Returns
// { QB: { before: { grade, score }, after: { grade, score }, delta }, ... }.
export function computePlanImpact(roster, rookies, isSuperflex) {
  const before = groupByPos(roster);
  const after = groupByPos([...roster, ...rookies]);
  const result = {};
  for (const pos of POSITIONS) {
    const b = computePositionGrade(before[pos], pos, isSuperflex);
    const a = computePositionGrade(after[pos], pos, isSuperflex);
    result[pos] = {
      before: b ? { grade: b.grade, score: b.score, color: b.color } : null,
      after: a ? { grade: a.grade, score: a.score, color: a.color } : null,
      delta: b && a ? a.grade - b.grade : 0,
      scoreDelta: b && a ? a.score - b.score : 0,
    };
  }
  return result;
}

// ── localStorage persistence (connection only) ───────────────────────────────
// Picks live in Supabase (table `rookie_draft_plans`). The connection — which
// Sleeper league + which roster you're managing — is small and per-device, so
// it stays in localStorage. Saving picks to the DB lets us reference past
// plans next year for retrospective grading.

const CONN_STORAGE_KEY = "dynasty_rookie_draft_plan_v1";

export function loadConnection() {
  try {
    const raw = localStorage.getItem(CONN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Strip legacy "picks" field if present from earlier versions.
    if (parsed && parsed.picks) delete parsed.picks;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConnection(conn) {
  try {
    localStorage.setItem(CONN_STORAGE_KEY, JSON.stringify(conn));
  } catch {
    // Quota or disabled storage — silently ignore; in-memory state still works.
  }
}

export function clearConnection() {
  try { localStorage.removeItem(CONN_STORAGE_KEY); } catch { /* ignore */ }
}

// ── Prospect snapshot ────────────────────────────────────────────────────────
// Captures plan-time prospect data so retrospective grading next year still
// works even if the prospect's source row is edited or its grade recalculated.
// Only the picked prospects are snapshotted (not all prospects).

export function buildProspectSnapshot(picks, prospects, annotations) {
  const idsInUse = new Set(Object.values(picks || {}));
  const out = {};
  for (const id of idsInUse) {
    const p = prospects.find((x) => x.id === id);
    if (!p) continue;
    const ann = annotations[id] || {};
    const { total: grade } = computeGrade(
      p,
      undefined,
      ann.draftCapital || p.draftCapital || "",
      ann.declared || false,
      ann.tier || "",
    );
    const ds = dynastyScore(grade, p.position, p.seasons);
    out[id] = {
      name:           p.name,
      position:       p.position,
      grade,
      dynastyScore:   ds,
      tier:           ann.tier || "",
      draftCapital:   ann.draftCapital || p.draftCapital || "",
      capturedAt:     new Date().toISOString(),
    };
  }
  return out;
}
