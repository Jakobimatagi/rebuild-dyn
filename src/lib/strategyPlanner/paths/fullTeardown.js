// Full Teardown (Scorched Earth) — bottom out, stockpile picks, swing for fences.

const YOUNG_BUILD_AROUND_ARCHETYPES = new Set([
  "Cornerstone",
  "Foundational",
  "Mainstay",
  "Upside Shot",
  "JAG - Developmental",
]);

export const fullTeardown = {
  key: "fullTeardown",
  name: "Full Teardown",
  subtitle: "Scorched Earth",
  class: "rebuilder",
  tagline: "Bottom out, stockpile picks, swing for the fences",
  risk: "High",
  timeToContend: "2-3 years",
  bestFor: "Tank-friendly leagues, salary cap formats",
  mechanic:
    "Sell every player 26+, target 3-4 first-round picks per rookie draft, start rookies",

  triageRules: {
    buildAround: (player) =>
      player.age <= 24 && YOUNG_BUILD_AROUND_ARCHETYPES.has(player.archetype),
    sellNow: (player) => player.age >= 26,
    holdReassess: (player) => player.age === 25,
  },
  triageRationales: {
    buildAround: (p) => `Age ${p.age} — part of the next window`,
    sellNow: (p) =>
      `Age ${p.age} — won't be in his prime when you are ready to compete`,
    holdReassess: (p) =>
      `Age ${p.age} — reassess mid-season based on trajectory`,
  },

  targetFilter: (sug) => {
    const p = sug.targetPlayer;
    if (!p) return false;
    if (p.age > 23) return false;
    if ((p.yearsExp ?? 0) > 2) return false;
    return (
      p.archetype === "Upside Shot" ||
      p.archetype === "JAG - Developmental" ||
      p.archetype === "Mainstay" ||
      p.archetype === "Foundational"
    );
  },
  targetRerank: (sug) => {
    const p = sug.targetPlayer;
    const youthBonus = (25 - (p.age || 25)) * 4;
    const breakoutBonus = (p.prediction?.breakoutProb || 0) * 20;
    return (sug.fitScore || 0) + youthBonus + breakoutBonus;
  },
  targetReason: (p) =>
    `Age ${p.age}, ${p.archetype} — lottery ticket with a 3-year runway`,

  rookieStrategy: {
    perYear: (year, inventory, picks) => ({
      year,
      targetPicks: "Maximize 1sts — hoard everything",
      behavior: "No trade-backs; trade up when possible",
      positions: ["RB", "WR", "QB", "TE"],
      inventory,
      ownedPicks: picks,
      namedRookies: [],
      note: "Target top-5 picks. Every 1st you can acquire compounds the rebuild.",
    }),
  },

  roadmapTemplate: [
    {
      label: "Year 1 — Tank",
      objective: "Finish bottom-3; convert every vet into picks",
      lineupPhilosophy: "Start rookies over vets when close",
      winLoss: "3-11 expected",
      decisionGates: [
        "If a sub-23 player breaks out, promote him to untouchable",
        "If no contenders are buying vets, hold through trade deadline and flip next year",
      ],
    },
    {
      label: "Year 2 — Accumulate",
      objective: "Draft your core; keep cashing expiring vets",
      lineupPhilosophy: "Play the rookies every week — reps > wins",
      winLoss: "5-9 expected",
      decisionGates: [
        "If 2+ Year-2 players hit, pivot to Retool Rebuild path",
        "If the rookie draft class is weak, trade picks forward one year",
      ],
    },
    {
      label: "Year 3 — Emerge",
      objective: "Fill gaps with late-career vets; start competing",
      lineupPhilosophy: "Start the best lineup — the rebuild is over",
      winLoss: "8-6 expected",
      decisionGates: [
        "If you are 4-2 by mid-season, flip Year-4 picks for a proven vet",
      ],
    },
  ],

  marqueeMove: {
    title: "Sell-Side Marquee Moves",
    subtitle:
      "Every player 26+ with name value should be on the block. These are the trades that define the teardown.",
    sellFilter: (p) => {
      if (!p) return false;
      if (p.age < 26) return false;
      if ((p.score || 0) < 45) return false;
      // Keep only name-value vets — not ancient JAG
      return (
        p.archetype === "Cornerstone" ||
        p.archetype === "Foundational" ||
        p.archetype === "Productive Vet" ||
        p.archetype === "Short Term League Winner" ||
        p.archetype === "Short Term Production" ||
        (p.score || 0) >= 60
      );
    },
    partnerPhase: "contender",
    returnPicker: (partner, sellPlayer, ctx = {}) => {
      const enriched = partner.enriched || [];
      const skip = ctx.excludePlayerIds;
      // Primary target: their youngest player with real upside
      const target = enriched
        .filter(
          (p) =>
            !skip?.has(p.id) &&
            p.age <= 23 &&
            p.archetype !== "Replaceable" &&
            p.archetype !== "JAG - Insurance" &&
            (p.score || 0) >= 45,
        )
        .sort(
          (a, b) =>
            (b.prediction?.breakoutProb || 0) -
              (a.prediction?.breakoutProb || 0) ||
            (b.score || 0) - (a.score || 0),
        )[0];
      if (!target) return null;
      // Ask for their earliest future 1st, if they have one
      const now = new Date().getFullYear();
      const firsts = (partner.picks || [])
        .filter(
          (pk) => pk.round === 1 && Number(pk.season || 0) >= now + 1,
        )
        .sort((a, b) => Number(a.season || 0) - Number(b.season || 0));
      return { player: target, picks: firsts.slice(0, 1) };
    },
    score: (sell, ret) => {
      const base = (ret.player?.score || 0) + (ret.picks?.length ? 15 : 0);
      // Prefer the oldest sells — bigger name-value windows
      return base + (sell.age - 25) * 4;
    },
    rationale: (sell, ret, partner) =>
      `${partner.label} is a contender who needs ${sell.position} help now. Flip ${sell.name} (age ${sell.age}) for ${ret.player.name} (age ${ret.player.age})${ret.picks?.length ? " + their future 1st" : ""} — your first real rebuild assets.`,
  },

  bombshellMove: {
    mode: "liquidate",
    title: "Teardown Bombshells",
    subtitle:
      "Cash your biggest name-value vet for the biggest possible pick haul. This is the trade that defines the rebuild — your first three 1sts arrive in one phone call.",
    partnerPhase: "contender",
    // Pick the user's top 2-3 vets with real name value
    anchorPicker: (analysis) => {
      // Real name-value vets — must clear the dynasty-market floor or no
      // contender will pay a 1st. Score + FC value enforce realism.
      return (analysis.enriched || [])
        .filter(
          (p) =>
            p.age >= 26 &&
            (p.score || 0) >= 65 &&
            Number(p.fantasyCalcValue || 0) >= 2500 &&
            (p.archetype === "Cornerstone" ||
              p.archetype === "Foundational" ||
              p.archetype === "Productive Vet" ||
              p.archetype === "Short Term League Winner"),
        )
        .sort(
          (a, b) =>
            Number(b.fantasyCalcValue || 0) - Number(a.fantasyCalcValue || 0),
        )
        .slice(0, 3);
    },
    // Optional throw-in: partner's young upside piece as a sweetener
    throwInFilter: (p) =>
      p.age <= 23 &&
      (p.score || 0) >= 40 &&
      p.archetype !== "Replaceable" &&
      p.archetype !== "JAG - Insurance",
    score: (anchor, target, picks) => picks.length * 30 + (target?.score || 0),
    rationale: (anchor, target, picks, partner) => {
      const pickCount = picks.length;
      const extra = target ? ` + ${target.name}` : "";
      return `${partner.label} needs ${anchor.position} for a title push — ship ${anchor.name} (age ${anchor.age}, ${anchor.archetype}) for ${pickCount} future pick${pickCount > 1 ? "s" : ""}${extra}. The rebuild foundation lands in one deal.`;
    },
  },

  riskPatterns: [
    {
      id: "no-young-core",
      match: (analysis) => {
        const young = (analysis.enriched || []).filter(
          (p) => p.age <= 23 && p.score >= 55,
        );
        return young.length < 2;
      },
      risk: "You don't yet have a young core to build around — this path relies on hitting on picks",
      pivotTrigger:
        "If your Year-1 draft misses by midseason, reconsider Positional Arbitrage instead",
      severity: "high",
    },
    {
      id: "thin-picks",
      match: (analysis) => {
        const firsts = (analysis.picks || []).filter((p) => p.round === 1);
        return firsts.length < 2;
      },
      risk: "You own fewer than 2 first-round picks — the foundation is shaky",
      pivotTrigger:
        "If you can't accumulate 3+ 1sts by the trade deadline, switch to Retool Rebuild",
      severity: "medium",
    },
    {
      id: "league-wont-buy",
      match: (analysis) => (analysis.tradeSuggestions || []).length < 3,
      risk: "League has few active contenders — your vets may not fetch full price",
      pivotTrigger:
        "If no deals close by Week 6, hold vets and pivot to Retool Rebuild",
      severity: "medium",
    },
  ],

  haulTrades: {
    showConsolidation: false,
    showLiquidation: true,
    partnerPhase: "contender",
    title: "Teardown Liquidation Hauls",
    subtitle:
      "Max-value extraction — ship every star for the biggest pick haul you can get. Contenders will overpay for proven production.",
  },
};
