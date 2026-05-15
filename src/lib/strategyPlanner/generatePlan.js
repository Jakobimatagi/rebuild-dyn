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
  const rawPath = getPath(pathKey);
  if (!rawPath) {
    throw new Error(`Unknown strategy path: ${pathKey}`);
  }

  // Composite paths (e.g. rebuild) defer their full config until a
  // variant is chosen. Non-composite paths pass through unchanged.
  const path =
    typeof rawPath.build === "function"
      ? rawPath.build(opts.variant || rawPath.defaultVariant)
      : rawPath;

  const classification = classifyForPlanner(analysis, opts.override);

  // Shared across the four trade sections so the same partner+anchor or
  // partner+target can't be recommended multiple times in different
  // wrappers. Order below = priority (first to claim wins).
  const usedPairings = new Set();
  const sectionOpts = { usedPairings };

  const triage = generateRosterTriage(analysis, path);
  const tradeTargets = generateTradeTargets(analysis, path);
  const marqueeMoves = generateMarqueeMoves(analysis, path, sectionOpts);
  const bombshellMoves = generateBombshellMoves(analysis, path, sectionOpts);
  const haulTrades = generateHaulTrades(analysis, path, sectionOpts);
  const tierMoves = generateTierMoves(analysis, path, sectionOpts);
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
    variant: path.variantKey || null,
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
