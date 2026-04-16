// Filter and re-rank existing tradeSuggestions through the path's lens, then
// split them into Tier 1 / Tier 2 / Tier 3 based on the path-adjusted fit score.

import { trendDelta } from "../../marketValue";

function difficultyFromGap(marketGap) {
  const abs = Math.abs(marketGap || 0);
  if (abs < 5) return "Easy";
  if (abs < 15) return "Moderate";
  return "Hard";
}

export function generateTradeTargets(analysis, path) {
  const base = analysis?.tradeSuggestions || [];
  const ctx = { analysis };

  const filtered = base.filter((sug) => {
    if (!sug || !sug.targetPlayer) return false;
    try {
      return path.targetFilter ? path.targetFilter(sug, ctx) : true;
    } catch {
      return false;
    }
  });

  const scored = filtered.map((sug) => {
    let pathFitScore = sug.fitScore || 0;
    if (typeof path.targetRerank === "function") {
      try {
        pathFitScore = path.targetRerank(sug, ctx);
      } catch {
        // fall through with base fitScore
      }
    }
    // Global trend layer — small but consistent nudge across all paths.
    pathFitScore += trendDelta(sug.targetPlayer, "buy");
    const reason =
      typeof path.targetReason === "function"
        ? (() => {
            try {
              return path.targetReason(sug.targetPlayer, ctx);
            } catch {
              return null;
            }
          })()
        : null;
    return {
      player: sug.targetPlayer,
      partnerTeam: sug.partnerTeam,
      package: sug.send || [],
      receive: sug.receive || [],
      rationale: sug.rationale || [],
      recentComp: sug.recentComp || null,
      marketGap: sug.marketGap || 0,
      difficulty: difficultyFromGap(sug.marketGap),
      pathFitScore,
      baseFitScore: sug.fitScore || 0,
      reason,
      marketNote: sug.marketNote || null,
      summary: sug.summary || null,
      needPos: sug.needPos || null,
    };
  });

  scored.sort((a, b) => b.pathFitScore - a.pathFitScore);

  // Split into tiers by relative position. Top 3 → tier1, next 4 → tier2, rest → tier3.
  const tier1 = scored.slice(0, 3);
  const tier2 = scored.slice(3, 7);
  const tier3 = scored.slice(7, 12);

  return { tier1, tier2, tier3, totalConsidered: base.length, totalKept: scored.length };
}
