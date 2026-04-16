// All-In (Mortgage the Future) — win now, deal with the rebuild later.

export const allIn = {
  key: "allIn",
  name: "All-In",
  subtitle: "Mortgage the Future",
  class: "contender",
  tagline: "Win now, deal with the rebuild later",
  risk: "High",
  timeToContend: "This year only",
  bestFor: "Genuine top-2 teams with an aging core",
  mechanic:
    "Trade every future 1st/2nd and young bench for proven vet upgrades",

  triageRules: {
    buildAround: (player) =>
      player.score >= 65 &&
      (player.archetype === "Cornerstone" ||
        player.archetype === "Foundational" ||
        player.archetype === "Productive Vet" ||
        player.archetype === "Short Term League Winner"),
    sellNow: (player) =>
      player.age <= 23 && player.score < 60,
    holdReassess: (player) => player.age >= 24 && player.age <= 27,
  },
  triageRationales: {
    buildAround: (p) =>
      `${p.archetype} — current elite production, he IS the window`,
    sellNow: (p) =>
      `Age ${p.age}, unproven — convert to a current-year producer`,
    holdReassess: (p) =>
      `Age ${p.age} — playoff contributor, hold unless swap brings clear upgrade`,
  },

  targetFilter: (sug) => {
    const p = sug.targetPlayer;
    if (!p) return false;
    if (p.age < 26 || p.age > 29) return false;
    return (
      p.archetype === "Productive Vet" ||
      p.archetype === "Cornerstone" ||
      p.archetype === "Short Term League Winner"
    );
  },
  targetRerank: (sug) => {
    const p = sug.targetPlayer;
    const ppgBonus = (p.ppg || 0) * 0.8;
    return (sug.fitScore || 0) + ppgBonus;
  },
  targetReason: (p) =>
    `Age ${p.age}, ${p.ppg || "?"}ppg — proven top-24 producer for the title run`,

  rookieStrategy: {
    perYear: (year, inventory, picks) => {
      const current = new Date().getFullYear();
      const isFuture = Number(year) > current;
      return {
        year,
        targetPicks: isFuture
          ? "Trade ALL — future 1sts and 2nds go out the door"
          : "Convert picks into current production",
        behavior: isFuture ? "Sell everything" : "Use as trade currency",
        positions: ["N/A — picks become players"],
        inventory,
        ownedPicks: picks,
        namedRookies: [],
        note: isFuture
          ? "You won't be around to use these — cash them in."
          : "Current-year picks can still become veteran acquisitions.",
      };
    },
  },

  roadmapTemplate: [
    {
      label: "Year 1 — Title Run",
      objective: "Convert every future asset into current production",
      lineupPhilosophy: "Max lineup every week; no load management",
      winLoss: "11-3 expected",
      decisionGates: [
        "If you don't make playoffs, the rebuild starts immediately",
        "If a star gets injured, panic-trade a young player for insurance",
      ],
    },
    {
      label: "Year 2 — Aftermath",
      objective: "Accept the reality — survey the damage",
      lineupPhilosophy: "Compete as long as the core plays",
      winLoss: "6-8 expected",
      decisionGates: [
        "Pivot to Full Teardown — your window closed",
      ],
    },
    {
      label: "Year 3 — Rebuild",
      objective: "New classifier run — you're probably a rebuilder now",
      lineupPhilosophy: "Start over",
      winLoss: "4-10 expected",
      decisionGates: [
        "Run the planner again from scratch",
      ],
    },
  ],

  marqueeMove: {
    title: "All-In Sell-Side Moves",
    subtitle:
      "Trade every young bench player and future 1st for current-year production. This is how you mortgage the future.",
    sellFilter: (p) => {
      if (!p) return false;
      // Young benchers and unproven upside plays — the "future" you're mortgaging
      if (p.age > 23) return false;
      if ((p.score || 0) >= 70) return false; // keep clear starters
      return (
        p.archetype === "JAG - Developmental" ||
        p.archetype === "Upside Shot" ||
        p.archetype === "Mainstay" ||
        (p.score || 0) < 60
      );
    },
    partnerPhase: "rebuild",
    returnPicker: (partner, sellPlayer, ctx = {}) => {
      const enriched = partner.enriched || [];
      const skip = ctx.excludePlayerIds;
      const target = enriched
        .filter(
          (p) =>
            !skip?.has(p.id) &&
            p.age >= 26 &&
            p.age <= 29 &&
            (p.score || 0) >= 60 &&
            (p.archetype === "Productive Vet" ||
              p.archetype === "Cornerstone" ||
              p.archetype === "Short Term League Winner" ||
              p.archetype === "Foundational"),
        )
        .sort((a, b) => (b.ppg || 0) - (a.ppg || 0) || (b.score || 0) - (a.score || 0))[0];
      if (!target) return null;
      return { player: target, picks: [] };
    },
    score: (sell, ret) => (ret.player?.ppg || 0) * 2 + (ret.player?.score || 0),
    rationale: (sell, ret, partner) =>
      `${partner.label} is rebuilding — package ${sell.name} with your future 1st to land ${ret.player.name} (${ret.player.ppg || "?"}ppg, age ${ret.player.age}) for the title run.`,
  },

  bombshellMove: {
    mode: "acquire",
    title: "All-In Bombshells",
    subtitle:
      "Mortgage everything — package a young anchor + multiple future firsts to pry an elite producer off a rebuilder. This is the title-or-bust move.",
    partnerPhase: "rebuild",
    // Target the partner's top elite vet producer (score gate high on purpose)
    targetPicker: (partner, ctx = {}) => {
      const enriched = partner.enriched || [];
      const used = ctx.usedTargetIds;
      return enriched
        .filter(
          (p) =>
            !used?.has(p.id) &&
            p.age >= 25 &&
            p.age <= 29 &&
            (p.score || 0) >= 75 &&
            (p.archetype === "Productive Vet" ||
              p.archetype === "Cornerstone" ||
              p.archetype === "Foundational" ||
              p.archetype === "Short Term League Winner"),
        )
        .sort(
          (a, b) =>
            (b.score || 0) - (a.score || 0) || (b.ppg || 0) - (a.ppg || 0),
        )[0];
    },
    // Anchor from user's side: a young player with real market value that
    // a rebuilder would actually want
    anchorFilter: (p) => {
      if (!p) return false;
      if (p.age > 24) return false;
      if ((p.score || 0) < 55) return false;
      if (p.archetype === "Cornerstone") return false; // keep your untouchables
      return (
        p.archetype === "Foundational" ||
        p.archetype === "Upside Shot" ||
        p.archetype === "Mainstay" ||
        (p.prediction?.breakoutProb || 0) >= 25
      );
    },
    score: (anchor, target) =>
      (target?.ppg || 0) * 2 + (target?.score || 0),
    rationale: (anchor, target, picks, partner) => {
      const pickCount = picks.length;
      const pickStr =
        pickCount === 0
          ? ""
          : ` + ${pickCount} future pick${pickCount > 1 ? "s" : ""}`;
      return `${partner.label} is rebuilding and wants youth + picks. Package ${anchor.name}${pickStr} to land ${target.name} — the kind of elite producer that actually wins you a title.`;
    },
  },

  riskPatterns: [
    {
      id: "not-actually-contender",
      match: (analysis) => {
        const score = analysis.teamPhase?.score || 0;
        return score < 65;
      },
      risk: "Your contender score is borderline — All-In may not yield a title",
      pivotTrigger:
        "If you're not top-2 by Week 6, switch to Surgical Upgrade instead",
      severity: "high",
    },
    {
      id: "core-not-elite",
      match: (analysis) => {
        const elite = (analysis.enriched || []).filter(
          (p) =>
            p.archetype === "Cornerstone" || p.archetype === "Foundational",
        );
        return elite.length < 3;
      },
      risk: "Fewer than 3 elite-tier players — the ceiling may not be high enough to justify mortgaging",
      pivotTrigger:
        "If you can't land a star in the first trade, fall back to Surgical Upgrade",
      severity: "medium",
    },
    {
      id: "injury-exposure",
      match: (analysis) => {
        const injured = (analysis.enriched || []).filter(
          (p) => p.injuryStatus && p.injuryStatus !== "Questionable",
        );
        return injured.length >= 2;
      },
      risk: "Multiple starters are currently injured — the window is fragile",
      pivotTrigger:
        "If a key starter is ruled out for 4+ weeks, shift to Surgical Upgrade and preserve future capital",
      severity: "high",
    },
  ],

  haulTrades: {
    showConsolidation: true,
    showLiquidation: false,
    partnerPhase: "rebuild",
    title: "All-In Haul Trades",
    subtitle:
      "Package depth into an elite difference-maker. Rebuilding partners will sell stars for roster volume.",
  },
};
