// Flatten the roster and run each player through the path's triage rules.
// Each player ends up in exactly one bucket: Build Around, Sell Now, or
// Hold/Reassess. The first matching rule wins (priority: build > sell > hold).

function flattenRoster(analysis) {
  const byPos = analysis?.byPos || {};
  return ["QB", "RB", "WR", "TE"].flatMap((pos) => byPos[pos] || []);
}

export function generateRosterTriage(analysis, path) {
  const players = flattenRoster(analysis);
  const ctx = { analysis };

  const buildAround = [];
  const sellNow = [];
  const holdReassess = [];

  const rules = path.triageRules || {};
  const rationales = path.triageRationales || {};

  const rationale = (bucket, player) => {
    const fn = rationales[bucket];
    if (typeof fn === "function") {
      try {
        return fn(player, ctx);
      } catch {
        return null;
      }
    }
    return null;
  };

  for (const player of players) {
    if (typeof rules.buildAround === "function" && rules.buildAround(player, ctx)) {
      buildAround.push({ player, rationale: rationale("buildAround", player) });
    } else if (typeof rules.sellNow === "function" && rules.sellNow(player, ctx)) {
      sellNow.push({ player, rationale: rationale("sellNow", player) });
    } else if (
      typeof rules.holdReassess === "function" &&
      rules.holdReassess(player, ctx)
    ) {
      holdReassess.push({
        player,
        rationale: rationale("holdReassess", player),
      });
    } else {
      holdReassess.push({
        player,
        rationale: rationale("holdReassess", player) || "Reassess at the trade deadline",
      });
    }
  }

  const byScoreDesc = (a, b) => (b.player.score || 0) - (a.player.score || 0);
  buildAround.sort(byScoreDesc);
  sellNow.sort(byScoreDesc);
  holdReassess.sort(byScoreDesc);

  return { buildAround, sellNow, holdReassess };
}
