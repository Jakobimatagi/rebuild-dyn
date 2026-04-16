// Veteran Pivot — trade the past for the present.

const CORE = new Set(["Cornerstone", "Foundational", "Productive Vet"]);

export const veteranPivot = {
  key: "veteranPivot",
  name: "Veteran Pivot",
  class: "retooler",
  tagline: "Trade the past for the present",
  risk: "Medium",
  timeToContend: "1 year",
  bestFor: "Multiple aging vets (28+) still holding name value",
  mechanic:
    "Sell aging vets for proven Year 3-4 prime players, not picks",

  triageRules: {
    buildAround: (player) => {
      if (player.age <= 25) return true; // young core
      return player.age <= 28 && CORE.has(player.archetype);
    },
    sellNow: (player) => player.age >= 28 && !CORE.has(player.archetype),
    holdReassess: (player) => player.age === 26 || player.age === 27,
  },
  triageRationales: {
    buildAround: (p) =>
      p.age <= 25
        ? `Age ${p.age} — keep around the core`
        : `${p.archetype}, age ${p.age} — elite vet worth keeping`,
    sellNow: (p) =>
      `Age ${p.age}, ${p.archetype} — still has name value, move now`,
    holdReassess: (p) =>
      `Age ${p.age} — mid-tier vet, reassess at the deadline`,
  },

  targetFilter: (sug) => {
    const p = sug.targetPlayer;
    if (!p) return false;
    if (p.age < 25 || p.age > 27) return false;
    if ((p.confidence ?? 0) < 55) return false;
    return (
      p.archetype === "Productive Vet" ||
      p.archetype === "Foundational" ||
      p.archetype === "Cornerstone" ||
      p.archetype === "Mainstay"
    );
  },
  targetRerank: (sug) => {
    const p = sug.targetPlayer;
    const primeBonus = p.age >= 25 && p.age <= 27 ? 8 : 0;
    const confidenceBonus = ((p.confidence || 60) - 60) / 4;
    return (sug.fitScore || 0) + primeBonus + confidenceBonus;
  },
  targetReason: (p) =>
    `Age ${p.age}, ${p.archetype} — proven production with 3+ year runway`,

  rookieStrategy: {
    perYear: (year, inventory, picks) => ({
      year,
      targetPicks: "Use picks as currency — minimal rookie draft involvement",
      behavior: "Package picks into proven-vet trades",
      positions: ["Whatever fits the vet deal"],
      inventory,
      ownedPicks: picks,
      namedRookies: [],
      note: "You don't need rookies — you need the 3rd-year proven guy.",
    }),
  },

  roadmapTemplate: [
    {
      label: "Year 1 — Pivot",
      objective: "Flip aging name-value vets for prime proven players",
      lineupPhilosophy: "Playoff-chase lineup",
      winLoss: "8-6 expected",
      decisionGates: [
        "If you're 6-2, add one more prime vet and push for a title",
        "If you're 3-5, hold the pivot — don't sell further",
      ],
    },
    {
      label: "Year 2 — Compete",
      objective: "New prime core drives a sustained playoff run",
      lineupPhilosophy: "Weekly max lineup",
      winLoss: "9-5 expected",
      decisionGates: [
        "If health cooperates, promote to All-In",
      ],
    },
    {
      label: "Year 3 — Harvest",
      objective: "Window peak — go for the title",
      lineupPhilosophy: "All-in at trade deadline",
      winLoss: "10-4 expected",
      decisionGates: [
        "After this season, reassess — prime players will be 28+",
      ],
    },
  ],

  marqueeMove: {
    title: "Veteran Pivot Trades",
    subtitle:
      "Cash the 28+ name-value vets for prime-age (25-27) proven producers. No pick returns — player-for-player.",
    sellFilter: (p) => {
      if (!p) return false;
      if (p.age < 28) return false;
      if ((p.score || 0) < 50) return false;
      if (p.archetype === "Cornerstone") return false; // keep true elites
      return true;
    },
    partnerPhase: "any",
    returnPicker: (partner, sellPlayer, ctx = {}) => {
      const enriched = partner.enriched || [];
      const skip = ctx.excludePlayerIds;
      const target = enriched
        .filter(
          (p) =>
            !skip?.has(p.id) &&
            p.age >= 25 &&
            p.age <= 27 &&
            (p.confidence ?? 60) >= 55 &&
            (p.score || 0) >= 55 &&
            (p.archetype === "Productive Vet" ||
              p.archetype === "Foundational" ||
              p.archetype === "Mainstay"),
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      if (!target) return null;
      return { player: target, picks: [] };
    },
    score: (sell, ret) =>
      (ret.player?.score || 0) * 1.2 - Math.abs(27 - (ret.player?.age || 27)) * 3,
    rationale: (sell, ret, partner) =>
      `${partner.label}: straight-up swap ${sell.name} (age ${sell.age}) for ${ret.player.name} (age ${ret.player.age}) — same name value, 3 more years of prime production.`,
  },

  bombshellMove: {
    mode: "acquire",
    title: "Prime-Age Bombshells",
    subtitle:
      "Package an aging vet + future picks to land a 25-27 proven producer at the peak of their window. Three years of prime in one move.",
    partnerPhase: "any",
    targetPicker: (partner, ctx = {}) => {
      const enriched = partner.enriched || [];
      const used = ctx.usedTargetIds;
      return enriched
        .filter(
          (p) =>
            !used?.has(p.id) &&
            p.age >= 25 &&
            p.age <= 27 &&
            (p.score || 0) >= 72 &&
            (p.confidence ?? 60) >= 60 &&
            (p.archetype === "Productive Vet" ||
              p.archetype === "Foundational" ||
              p.archetype === "Cornerstone"),
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    },
    anchorFilter: (p) => {
      if (!p) return false;
      if (p.age < 27) return false;
      if ((p.score || 0) < 50) return false;
      if (p.archetype === "Cornerstone") return false;
      return true;
    },
    score: (anchor, target) => (target?.score || 0) * 1.3,
    rationale: (anchor, target, picks, partner) => {
      const pickCount = picks.length;
      const pickStr =
        pickCount === 0
          ? ""
          : ` + ${pickCount} future pick${pickCount > 1 ? "s" : ""}`;
      return `Send ${anchor.name} (age ${anchor.age}, declining)${pickStr} to ${partner.label} for ${target.name} (age ${target.age}, prime). Resets your window to age-27 peak.`;
    },
  },

  riskPatterns: [
    {
      id: "no-prime-targets",
      match: (analysis) => {
        const primeTargets = (analysis.tradeSuggestions || []).filter((s) => {
          const p = s.targetPlayer;
          return p && p.age >= 25 && p.age <= 27 && (p.confidence ?? 0) >= 55;
        });
        return primeTargets.length < 2;
      },
      risk: "League has few prime-age proven targets available",
      pivotTrigger:
        "If you can't land a prime vet by Week 8, shift to Consolidation Play",
      severity: "medium",
    },
    {
      id: "vets-past-peak",
      match: (analysis) => {
        const oldVetsWithValue = (analysis.enriched || []).filter(
          (p) => p.age >= 29 && p.score >= 55,
        );
        return oldVetsWithValue.length === 0;
      },
      risk: "No aging vets with trade value — the pivot has no fuel",
      pivotTrigger:
        "If no vets sell for value, switch to Youth Injection instead",
      severity: "high",
    },
  ],

  haulTrades: {
    showConsolidation: true,
    showLiquidation: true,
    title: "Pivot Haul Trades",
    subtitle:
      "Consolidate depth into proven prime-age vets, or liquidate aging depth for picks + ascending youth.",
  },
};
