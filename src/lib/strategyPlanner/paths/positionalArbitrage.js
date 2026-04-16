// Positional Arbitrage — exploit how your league values positions.

// Identify positions where the league-context premium is meaningfully
// above or below 1.0 — those are the over/undervalued positions in this
// specific format.
function inefficientPositions(analysis) {
  const prem = analysis?.leagueContext?.positionPremiums || {};
  const entries = Object.entries(prem);
  const undervalued = entries.filter(([, v]) => v >= 1.05).map(([k]) => k);
  const overvalued = entries.filter(([, v]) => v <= 0.95).map(([k]) => k);
  return { undervalued, overvalued };
}

export const positionalArbitrage = {
  key: "positionalArbitrage",
  name: "Positional Arbitrage",
  class: "rebuilder",
  tagline: "Exploit how your league values positions",
  risk: "Medium",
  timeToContend: "1-2 years",
  bestFor: "Active trading leagues",
  mechanic:
    "1QB — sell WRs at peak, buy young RBs / pre-breakout TEs. SF — hoard young QBs",

  triageRules: {
    buildAround: (player, ctx) => {
      const { undervalued } = inefficientPositions(ctx.analysis);
      return (
        undervalued.includes(player.position) &&
        player.age <= 26 &&
        player.score >= 55
      );
    },
    sellNow: (player, ctx) => {
      const { overvalued } = inefficientPositions(ctx.analysis);
      return (
        overvalued.includes(player.position) &&
        player.age >= 26 &&
        player.verdict !== "cut"
      );
    },
    holdReassess: (player, ctx) => {
      const { undervalued, overvalued } = inefficientPositions(ctx.analysis);
      return (
        !undervalued.includes(player.position) &&
        !overvalued.includes(player.position)
      );
    },
  },
  triageRationales: {
    buildAround: (p) =>
      `${p.position} is league-undervalued — young ${p.position}s appreciate here`,
    sellNow: (p) =>
      `${p.position} sells at a premium in this format — cash out at age ${p.age}`,
    holdReassess: (p) => `Neutral-value ${p.position} — no arbitrage edge`,
  },

  targetFilter: (sug, ctx) => {
    const p = sug.targetPlayer;
    if (!p) return false;
    const { undervalued } = inefficientPositions(ctx.analysis);
    if (!undervalued.length) return p.age <= 26;
    return undervalued.includes(p.position) && p.age <= 27;
  },
  targetRerank: (sug, ctx) => {
    const prem = ctx.analysis?.leagueContext?.positionPremiums || {};
    const p = sug.targetPlayer;
    const positionalBonus = ((prem[p.position] || 1) - 1) * 40;
    return (sug.fitScore || 0) + positionalBonus;
  },
  targetReason: (p, ctx) => {
    const prem =
      ctx.analysis?.leagueContext?.positionPremiums?.[p.position] || 1;
    return `${p.position} carries a ${prem.toFixed(2)}x premium in this league — arbitrage target`;
  },

  rookieStrategy: {
    perYear: (year, inventory, picks) => ({
      year,
      targetPicks: "Draft the inefficient position; trade away picks at premium positions",
      behavior: "Position-aware: swap picks between positions based on value gaps",
      positions: ["Follow league inefficiency"],
      inventory,
      ownedPicks: picks,
      namedRookies: [],
      note: "Your edge is format-specific. Don't reach for consensus BPA — take the positional arbitrage.",
    }),
  },

  roadmapTemplate: [
    {
      label: "Year 1 — Identify",
      objective: "Tag every over/undervalued position in your league",
      lineupPhilosophy: "Play the best lineup while hunting inefficiencies",
      winLoss: "6-8 expected",
      decisionGates: [
        "If format shifts (new settings), re-score inefficiencies immediately",
      ],
    },
    {
      label: "Year 2 — Execute",
      objective: "Flip overvalued positions for undervalued assets",
      lineupPhilosophy: "Lineup heavily weighted to undervalued positions",
      winLoss: "7-7 expected",
      decisionGates: [
        "If inefficiency closes, cash your new assets at the new premium",
      ],
    },
    {
      label: "Year 3 — Harvest",
      objective: "Sell your arbitrage winners back into the market",
      lineupPhilosophy: "Compete — the edge has paid off",
      winLoss: "9-5 expected",
      decisionGates: [
        "If another inefficiency opens, rotate into it rather than contending",
      ],
    },
  ],

  marqueeMove: {
    title: "Arbitrage Sell-Side Moves",
    subtitle:
      "Ship your overvalued-position vets to partners who pay the premium — pick up undervalued young assets in return.",
    sellFilter: (p, { analysis }) => {
      if (!p) return false;
      const prem = analysis?.leagueContext?.positionPremiums || {};
      const isOver = (prem[p.position] || 1) <= 0.95;
      if (!isOver) return false;
      return p.age >= 26 && (p.score || 0) >= 50;
    },
    partnerPhase: "any",
    returnPicker: (partner, sellPlayer, ctx = {}) => {
      const analysis = ctx.analysis;
      const skip = ctx.excludePlayerIds;
      const prem = analysis?.leagueContext?.positionPremiums || {};
      const undervalued = Object.keys(prem).filter((k) => prem[k] >= 1.05);
      if (!undervalued.length) return null;
      const enriched = partner.enriched || [];
      const target = enriched
        .filter(
          (p) =>
            !skip?.has(p.id) &&
            undervalued.includes(p.position) &&
            p.age <= 26 &&
            (p.score || 0) >= 45 &&
            p.archetype !== "Cornerstone",
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      if (!target) return null;
      return { player: target, picks: [] };
    },
    rationale: (sell, ret, partner) => {
      return `${partner.label}: swap ${sell.name} (${sell.position}) for ${ret.player.name} (${ret.player.position}) — exploits the format's position premium gap.`;
    },
  },

  bombshellMove: {
    mode: "liquidate",
    title: "Arbitrage Bombshells",
    subtitle:
      "Cash an over-premium-position star for a young undervalued-position asset + pick haul. Single trade extracts the whole positional edge.",
    partnerPhase: "any",
    anchorPicker: (analysis) => {
      const prem = analysis?.leagueContext?.positionPremiums || {};
      return (analysis.enriched || [])
        .filter((p) => {
          const isOver = (prem[p.position] || 1) <= 0.95;
          return (
            isOver &&
            (p.score || 0) >= 65 &&
            Number(p.fantasyCalcValue || 0) >= 2500 &&
            p.age >= 25 &&
            p.archetype !== "Short Term Production" &&
            p.archetype !== "JAG - Insurance" &&
            p.archetype !== "JAG - Developmental" &&
            p.archetype !== "Replaceable"
          );
        })
        .sort(
          (a, b) =>
            Number(b.fantasyCalcValue || 0) - Number(a.fantasyCalcValue || 0),
        )
        .slice(0, 3);
    },
    throwInFilter: (p) => (p.score || 0) >= 45 && p.age <= 26,
    rationale: (anchor, target, picks, partner) => {
      const pickCount = picks.length;
      const extra = target ? ` + ${target.name}` : "";
      return `${partner.label} will pay the ${anchor.position} premium. Ship ${anchor.name} for ${pickCount} pick${pickCount > 1 ? "s" : ""}${extra} — reinvests the edge into your undervalued positions.`;
    },
  },

  riskPatterns: [
    {
      id: "no-inefficiency",
      match: (analysis) => {
        const { undervalued, overvalued } = inefficientPositions(analysis);
        return undervalued.length === 0 && overvalued.length === 0;
      },
      risk: "League position premiums are all near 1.0 — no meaningful arbitrage exists",
      pivotTrigger:
        "If premiums stay flat through Week 8, abandon this path and pick a rebuild-or-contend path",
      severity: "high",
    },
    {
      id: "illiquid-market",
      match: (analysis) => (analysis.tradeSuggestions || []).length < 4,
      risk: "League isn't trading much — arbitrage needs liquidity",
      pivotTrigger:
        "If you can't close 2 arbitrage trades by Week 10, shift to Retool Rebuild",
      severity: "medium",
    },
  ],

  haulTrades: {
    showConsolidation: false,
    showLiquidation: true,
    title: "Arbitrage Liquidation Hauls",
    subtitle:
      "Cash overvalued-position stars for pick hauls while the position premium is still inflated.",
  },
};
