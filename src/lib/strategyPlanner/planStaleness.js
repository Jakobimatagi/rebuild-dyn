// Plan staleness check. Saved plans live in localStorage and can sit
// unrefreshed for weeks while the underlying roster, transactions, and
// market move on. This computes two staleness signals so the UI can
// nudge the user to regenerate before acting on out-of-date advice:
//
//   1. Time-based: how old the snapshot is.
//   2. Data-based: which plan-cited players on the user's send side are
//      no longer on the user's current roster (traded, dropped). The
//      strongest "this advice is bad" signal — a recommendation to ship
//      a player we don't own anymore is straight noise.
//
// Partner-side player drift is intentionally NOT checked. Tracking
// every other team's roster turnover is a separate problem; the user-
// side check catches the cases that matter most for action-taking.

const FRESH_DAYS = 7;
const AGING_DAYS = 21;

function daysBetween(thenMs, nowMs) {
  if (!thenMs) return null;
  const ms = nowMs - thenMs;
  if (ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Pull every user-side player reference out of the four trade sections.
// Returns an array of { id, name } so we can name missing players in
// the warning, not just count them.
function collectMySidePlayers(plan) {
  const out = [];
  const sections = plan?.sections || {};

  const pushPlayer = (p) => {
    if (!p || !p.id) return;
    out.push({ id: String(p.id), name: p.name || "Unknown" });
  };

  for (const m of sections.marqueeMoves?.moves || []) pushPlayer(m.send);
  for (const m of sections.bombshellMoves?.moves || []) pushPlayer(m.send);
  for (const m of sections.haulTrades?.moves || []) {
    for (const p of m.sendPlayers || []) pushPlayer(p);
  }
  for (const m of sections.tierMoves?.tierUps || []) pushPlayer(m.send);
  for (const m of sections.tierMoves?.tierDowns || []) pushPlayer(m.send);

  return out;
}

export function computePlanStaleness(plan, analysis, nowMs = Date.now()) {
  if (!plan || !plan.generatedAt) {
    return { severity: "fresh", daysOld: null, missingPlayers: [] };
  }

  const daysOld = daysBetween(plan.generatedAt, nowMs);

  const rosterIds = new Set(
    (analysis?.enriched || [])
      .map((p) => (p && p.id != null ? String(p.id) : null))
      .filter(Boolean),
  );

  // If the roster lookup is empty (analysis still loading, or no enriched
  // players yet) we can't meaningfully check drift — skip the data
  // signal rather than fire a false "everyone's missing" alarm.
  let missingPlayers = [];
  if (rosterIds.size > 0) {
    const seen = new Set();
    for (const ref of collectMySidePlayers(plan)) {
      if (seen.has(ref.id)) continue;
      seen.add(ref.id);
      if (!rosterIds.has(ref.id)) missingPlayers.push(ref);
    }
  }

  // Severity rolls up both signals; missing players always wins.
  let severity = "fresh";
  if (missingPlayers.length > 0) {
    severity = "missing";
  } else if (daysOld != null && daysOld >= AGING_DAYS) {
    severity = "stale";
  } else if (daysOld != null && daysOld >= FRESH_DAYS) {
    severity = "aging";
  }

  return { severity, daysOld, missingPlayers };
}
