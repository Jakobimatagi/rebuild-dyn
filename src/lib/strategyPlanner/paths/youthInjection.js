// Youth Injection — add young legs to a veteran core.

const ELITE_VETS = new Set([
  "Cornerstone",
  "Foundational",
  "Productive Vet",
]);

export const youthInjection = {
  key: "youthInjection",
  name: "Youth Injection",
  class: "retooler",
  tagline: "Add young legs to a veteran core",
  risk: "Low",
  timeToContend: "Now, extended window",
  bestFor: "Strong vet starters but thin/old depth",
  mechanic:
    "Sell future picks (2027, 2028) and depth vets for ascending Year 2 contributors",

  triageRules: {
    buildAround: (player) =>
      player.age >= 26 && ELITE_VETS.has(player.archetype) && player.score >= 60,
    sellNow: (player) =>
      (player.age >= 28 && player.archetype === "Serviceable") ||
      (player.age >= 27 && player.archetype === "JAG - Insurance"),
    holdReassess: (player) =>
      player.age <= 25 && player.archetype !== "Replaceable",
  },
  triageRationales: {
    buildAround: (p) =>
      `Elite vet starter (${p.archetype}) — the reason this window is open`,
    sellNow: (p) =>
      `Aging depth (${p.archetype}) — convert to a Year-2 contributor`,
    holdReassess: (p) =>
      `Age ${p.age} bench — could be the next injection himself`,
  },

  targetFilter: (sug) => {
    const p = sug.targetPlayer;
    if (!p) return false;
    if (p.age < 23 || p.age > 25) return false;
    return (
      p.archetype === "Mainstay" ||
      p.archetype === "Upside Shot" ||
      p.archetype === "Foundational" ||
      (p.prediction?.breakoutProb || 0) >= 30
    );
  },
  targetRerank: (sug) => {
    const p = sug.targetPlayer;
    const breakout = (p.prediction?.breakoutProb || 0) * 0.25;
    const roleBonus = (p.depthOrder ?? 9) <= 2 ? 6 : 0;
    return (sug.fitScore || 0) + breakout + roleBonus;
  },
  targetReason: (p) =>
    `Age ${p.age}, locked role, ${(p.prediction?.breakoutProb || 0).toFixed(0)}% breakout probability`,

  rookieStrategy: {
    perYear: (year, inventory, picks) => ({
      year,
      targetPicks: "Hold current-year 1sts; trade future picks for proven young players",
      behavior: "Trade future picks for known quantities",
      positions: ["Position of current-year need"],
      inventory,
      ownedPicks: picks,
      namedRookies: [],
      note: "A known Year-2 player > a hypothetical future 1st in this path.",
    }),
  },

  roadmapTemplate: [
    {
      label: "Year 1 — Inject",
      objective: "Bolt Year-2 ascenders onto the vet core",
      lineupPhilosophy: "Vets carry; young legs fill the gaps",
      winLoss: "9-5 expected",
      decisionGates: [
        "If injections hit, extend the window with one more Surgical Upgrade",
      ],
    },
    {
      label: "Year 2 — Compete",
      objective: "Sustained playoff run — window is wider than expected",
      lineupPhilosophy: "Young reinforcements start taking over",
      winLoss: "9-5 expected",
      decisionGates: [
        "If vets slip, transition to Soft Landing",
      ],
    },
    {
      label: "Year 3 — Transition",
      objective: "Young injections are now the core",
      lineupPhilosophy: "Youth-led, vet-supported",
      winLoss: "8-6 expected",
      decisionGates: [
        "Reassess team state — classifier may reclassify you",
      ],
    },
  ],

  marqueeMove: {
    title: "Youth Injection Trades",
    subtitle:
      "Trade aging depth and future picks for locked-in Year-2 starters. Keep your elite vet core.",
    sellFilter: (p) => {
      if (!p) return false;
      if (p.age < 27) return false;
      // Depth, not elite starters
      if (p.archetype === "Cornerstone" || p.archetype === "Foundational")
        return false;
      return (
        p.archetype === "Serviceable" ||
        p.archetype === "JAG - Insurance" ||
        p.archetype === "Short Term Production" ||
        ((p.score || 0) >= 40 && (p.score || 0) < 65)
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
            p.age >= 23 &&
            p.age <= 25 &&
            (p.depthOrder ?? 9) <= 2 &&
            (p.score || 0) >= 50 &&
            p.archetype !== "Cornerstone" &&
            p.archetype !== "Foundational",
        )
        .sort(
          (a, b) =>
            (b.prediction?.breakoutProb || 0) -
              (a.prediction?.breakoutProb || 0) ||
            (b.score || 0) - (a.score || 0),
        )[0];
      if (!target) return null;
      return { player: target, picks: [] };
    },
    rationale: (sell, ret, partner) =>
      `${partner.label} is rebuilding — they'd trade ${ret.player.name} (age ${ret.player.age}, locked role) for ${sell.name} plus a future pick from you.`,
  },

  bombshellMove: {
    mode: "acquire",
    title: "Youth Injection Bombshells",
    subtitle:
      "Package an aging vet + multiple future picks to pry a young locked-in Year-2 starter from a rebuilder. Keeps the window open for years.",
    partnerPhase: "rebuild",
    targetPicker: (partner, ctx = {}) => {
      const enriched = partner.enriched || [];
      const used = ctx.usedTargetIds;
      return enriched
        .filter(
          (p) =>
            !used?.has(p.id) &&
            p.age >= 22 &&
            p.age <= 25 &&
            (p.depthOrder ?? 9) <= 2 &&
            (p.score || 0) >= 65 &&
            (p.archetype === "Foundational" ||
              p.archetype === "Mainstay" ||
              p.archetype === "Upside Shot"),
        )
        .sort(
          (a, b) =>
            (b.prediction?.breakoutProb || 0) -
              (a.prediction?.breakoutProb || 0) ||
            (b.score || 0) - (a.score || 0),
        )[0];
    },
    anchorFilter: (p) => {
      if (!p) return false;
      if (p.age < 27) return false;
      if (p.archetype === "Cornerstone") return false;
      return (p.score || 0) >= 50;
    },
    score: (anchor, target) =>
      (target?.score || 0) + (target?.prediction?.breakoutProb || 0),
    rationale: (anchor, target, picks, partner) => {
      const pickCount = picks.length;
      const pickStr =
        pickCount === 0
          ? ""
          : ` + ${pickCount} future pick${pickCount > 1 ? "s" : ""}`;
      return `${partner.label} is rebuilding — send ${anchor.name} (age ${anchor.age})${pickStr} for ${target.name} (age ${target.age}, locked role). Injects prime youth into the vet core.`;
    },
  },

  riskPatterns: [
    {
      id: "vet-core-too-old",
      match: (analysis) => {
        const avg = parseFloat(analysis.avgAge) || 26;
        return avg >= 29;
      },
      risk: "Vet core is already past peak — injections may not be enough",
      pivotTrigger:
        "If 2+ vet starters decline by Week 8, shift to Soft Landing",
      severity: "medium",
    },
    {
      id: "no-future-picks",
      match: (analysis) => {
        const futures = (analysis.picks || []).filter(
          (p) => p.season && Number(p.season) >= new Date().getFullYear() + 1,
        );
        return futures.length < 2;
      },
      risk: "You don't own future picks to trade away — this path needs pick currency",
      pivotTrigger:
        "If you can't build trade packages, shift to Consolidation Play",
      severity: "high",
    },
  ],

  haulTrades: {
    showConsolidation: true,
    showLiquidation: false,
    title: "Youth Injection Haul Trades",
    subtitle:
      "Bundle mid-tier depth pieces to land a young ascending contributor. Fewer roster spots, higher upside.",
  },
};
