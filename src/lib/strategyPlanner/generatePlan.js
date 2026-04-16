import { classifyForPlanner } from "./classifyForPlanner";
import { getPath } from "./pathDefinitions";
import { generateRosterTriage } from "./sections/generateRosterTriage";
import { generateTradeTargets } from "./sections/generateTradeTargets";
import { generateMarqueeMoves } from "./sections/generateMarqueeMoves";
import { generateBombshellMoves } from "./sections/generateBombshellMoves";
import { generateHaulTrades } from "./sections/generateHaulTrades";
import { generateTierMoves } from "./sections/generateTierMoves";
import { generateRookieStrategy } from "./sections/generateRookieStrategy";
import { generateRoadmap } from "./sections/generateRoadmap";
import { generateRiskFlags } from "./sections/generateRiskFlags";

export function generatePlan(analysis, pathKey, opts = {}) {
  const path = getPath(pathKey);
  if (!path) {
    throw new Error(`Unknown strategy path: ${pathKey}`);
  }

  const classification = classifyForPlanner(analysis, opts.override);

  const triage = generateRosterTriage(analysis, path);
  const tradeTargets = generateTradeTargets(analysis, path);
  const marqueeMoves = generateMarqueeMoves(analysis, path);
  const bombshellMoves = generateBombshellMoves(analysis, path);
  const haulTrades = generateHaulTrades(analysis, path);
  const tierMoves = generateTierMoves(analysis, path);
  const rookieStrategy = generateRookieStrategy(analysis, path);
  const roadmap = generateRoadmap(analysis, path, {
    tradeTargets,
    marqueeMoves,
    bombshellMoves,
    rookieStrategy,
  });
  const risks = generateRiskFlags(analysis, path);

  return {
    pathKey,
    pathName: path.name,
    pathSubtitle: path.subtitle || null,
    pathTagline: path.tagline,
    pathRisk: path.risk,
    pathTimeToContend: path.timeToContend,
    pathMechanic: path.mechanic,
    generatedAt: Date.now(),
    classification,
    rosterAuditSource: analysis.rosterAuditSource || null,
    sections: {
      triage,
      tradeTargets,
      marqueeMoves,
      bombshellMoves,
      haulTrades,
      tierMoves,
      rookieStrategy,
      roadmap,
      risks,
    },
  };
}
