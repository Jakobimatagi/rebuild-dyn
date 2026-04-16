// Consolidation Play — two good for one great.

export const consolidationPlay = {
  key: "consolidationPlay",
  name: "Consolidation Play",
  class: "retooler",
  tagline: "Two good for one great",
  risk: "Medium-High",
  timeToContend: "1 year",
  bestFor: "Deep but unspectacular rosters",
  mechanic:
    "Package 2-for-1 and 3-for-1 trades for difference-makers",

  triageRules: {
    buildAround: (player) => player.score >= 70 && player.age <= 28,
    sellNow: (player) => {
      // Anyone in the "mid-tier" band — the ammunition for consolidation
      return (
        player.score >= 40 &&
        player.score < 65 &&
        player.archetype !== "Cornerstone"
      );
    },
    holdReassess: (player) => player.score >= 65 && player.score < 70,
  },
  triageRationales: {
    buildAround: (p) =>
      `Score ${p.score}/100 — top-tier starter, the "great" you're consolidating around`,
    sellNow: (p) =>
      `Score ${p.score}/100 — mid-tier depth, fuel for a 2-for-1 package`,
    holdReassess: (p) =>
      `Score ${p.score}/100 — borderline ammo, reassess when a package comes together`,
  },

  targetFilter: (sug) => {
    const p = sug.targetPlayer;
    if (!p) return false;
    return (
      (p.archetype === "Cornerstone" || p.archetype === "Foundational") &&
      (p.score ?? 0) >= 75 &&
      p.age <= 28
    );
  },
  targetRerank: (sug) => {
    const p = sug.targetPlayer;
    const starBonus = Math.max(0, (p.score || 0) - 75) * 0.8;
    return (sug.fitScore || 0) + starBonus;
  },
  targetReason: (p) =>
    `${p.archetype}, score ${p.score}/100 — worth consolidating 2-3 assets into`,

  rookieStrategy: {
    perYear: (year, inventory, picks) => ({
      year,
      targetPicks: "Package picks with players for star acquisitions",
      behavior: "Picks are part of the 2-for-1 package, not standalone",
      positions: ["Star-driven, not position-driven"],
      inventory,
      ownedPicks: picks,
      namedRookies: [],
      note: "A pick alone rarely moves a star. Add it to a player package.",
    }),
  },

  roadmapTemplate: [
    {
      label: "Year 1 — Package",
      objective: "Assemble 2-3 consolidation trades for difference-makers",
      lineupPhilosophy: "Starters only — depth doesn't matter",
      winLoss: "8-6 expected",
      decisionGates: [
        "If stars become available at discount, go harder",
      ],
    },
    {
      label: "Year 2 — Contend",
      objective: "Top-heavy lineup competes for titles",
      lineupPhilosophy: "Starters carry; rely on waivers for depth",
      winLoss: "9-5 expected",
      decisionGates: [
        "If injuries expose thin depth, pivot to Surgical Upgrade",
      ],
    },
    {
      label: "Year 3 — Sustain",
      objective: "Keep the star core healthy and productive",
      lineupPhilosophy: "Consolidated top, churn the bottom",
      winLoss: "9-5 expected",
      decisionGates: [
        "If you win a title, shift to Soft Landing",
      ],
    },
  ],

  marqueeMove: {
    title: "2-for-1 Consolidation Targets",
    subtitle:
      "Package your mid-tier depth around one star acquisition. Names on both sides of the deal.",
    sellFilter: (p) => {
      if (!p) return false;
      if ((p.score || 0) < 40 || (p.score || 0) >= 68) return false;
      if (p.archetype === "Cornerstone" || p.archetype === "Foundational")
        return false;
      return true;
    },
    partnerPhase: "any",
    returnPicker: (partner, sellPlayer, ctx = {}) => {
      const enriched = partner.enriched || [];
      const skip = ctx.excludePlayerIds;
      // The "great" in the 2-for-1
      const target = enriched
        .filter(
          (p) =>
            !skip?.has(p.id) &&
            (p.score || 0) >= 75 &&
            p.age <= 28 &&
            (p.archetype === "Cornerstone" ||
              p.archetype === "Foundational"),
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      if (!target) return null;
      return { player: target, picks: [] };
    },
    score: (sell, ret) => (ret.player?.score || 0) * 1.5,
    rationale: (sell, ret, partner) =>
      `Package ${sell.name} + 1-2 more mid-tier pieces to ${partner.label} for ${ret.player.name} (${ret.player.archetype}, ${ret.player.score}/100). Classic 2-for-1 consolidation.`,
  },

  bombshellMove: {
    mode: "acquire",
    title: "Star Acquisition Bombshells",
    subtitle:
      "The \"two good + a 1st for one great\" move — package your best mid-tier piece with premium picks to land a true difference-maker.",
    partnerPhase: "any",
    targetPicker: (partner, ctx = {}) => {
      const enriched = partner.enriched || [];
      const used = ctx.usedTargetIds;
      return enriched
        .filter(
          (p) =>
            !used?.has(p.id) &&
            (p.score || 0) >= 78 &&
            p.age <= 28 &&
            (p.archetype === "Cornerstone" ||
              p.archetype === "Foundational"),
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    },
    // Anchor: your best mid-tier piece — good enough to start the package
    // but not a core untouchable
    anchorFilter: (p) => {
      if (!p) return false;
      if ((p.score || 0) < 58 || (p.score || 0) >= 75) return false;
      if (p.archetype === "Cornerstone") return false;
      return true;
    },
    score: (anchor, target) => (target?.score || 0) * 1.5,
    rationale: (anchor, target, picks, partner) => {
      const pickCount = picks.length;
      const pickStr =
        pickCount === 0
          ? ""
          : ` + ${pickCount} pick${pickCount > 1 ? "s" : ""}`;
      return `Consolidate ${anchor.name}${pickStr} into ${target.name} (${target.archetype}, ${target.score}/100) from ${partner.label}. Top-heavy lineup, stars carry.`;
    },
  },

  riskPatterns: [
    {
      id: "too-thin-already",
      match: (analysis) => {
        const depth = (analysis.enriched || []).filter((p) => p.score >= 40)
          .length;
        return depth < 15;
      },
      risk: "Roster is already thin — consolidation will leave critical holes",
      pivotTrigger:
        "If you can't field a legal lineup after the first consolidation, stop and pivot to Surgical Upgrade",
      severity: "high",
    },
    {
      id: "no-stars-on-market",
      match: (analysis) => {
        const stars = (analysis.tradeSuggestions || []).filter(
          (s) =>
            s.targetPlayer &&
            (s.targetPlayer.score || 0) >= 75 &&
            (s.targetPlayer.archetype === "Cornerstone" ||
              s.targetPlayer.archetype === "Foundational"),
        );
        return stars.length < 2;
      },
      risk: "No stars are on the market — consolidation has no target",
      pivotTrigger:
        "If no star becomes available by Week 8, shift to Veteran Pivot",
      severity: "high",
    },
  ],

  haulTrades: {
    showConsolidation: true,
    showLiquidation: false,
    title: "Consolidation Haul Trades",
    subtitle:
      "The core move of this path — package 2-3 mid-tier pieces for one star. Quantity \u2192 quality.",
  },
};
