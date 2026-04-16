// Soft Landing — contend now, reload for next year.

const ELITE_VETS = new Set([
  "Cornerstone",
  "Foundational",
  "Productive Vet",
]);

export const softLanding = {
  key: "softLanding",
  name: "Soft Landing",
  class: "contender",
  tagline: "Contend now, reload for next year",
  risk: "Low",
  timeToContend: "This year and next",
  bestFor: "Contenders with young foundation already in place",
  mechanic:
    "Win-now moves using only vets and late picks; quietly buy low on Year 2 players",

  triageRules: {
    buildAround: (player) =>
      (player.age <= 25 && player.score >= 55) ||
      (player.age <= 28 && ELITE_VETS.has(player.archetype)),
    sellNow: (player) =>
      player.age >= 29 && !ELITE_VETS.has(player.archetype),
    holdReassess: (player) => player.age >= 22 && player.age <= 25,
  },
  triageRationales: {
    buildAround: (p) =>
      p.age <= 25
        ? `Age ${p.age} — young foundation for the next window`
        : `${p.archetype} — elite vet anchor`,
    sellNow: (p) =>
      `Age ${p.age}, ${p.archetype} — cash out before he drops off`,
    holdReassess: (p) =>
      `Age ${p.age} — reassess as a potential Year-2 breakout yourself`,
  },

  targetFilter: (sug) => {
    const p = sug.targetPlayer;
    if (!p) return false;
    if (p.age > 25) return false;
    const undervalued =
      (p.tags || []).includes("Undervalued") ||
      p.verdict === "buy" ||
      (p.prediction?.breakoutProb || 0) >= 0.25;
    return undervalued && p.archetype !== "Replaceable";
  },
  targetRerank: (sug) => {
    const p = sug.targetPlayer;
    const undervaluedBonus = (p.tags || []).includes("Undervalued") ? 10 : 0;
    const buyLowBonus = p.verdict === "buy" ? 6 : 0;
    return (sug.fitScore || 0) + undervaluedBonus + buyLowBonus;
  },
  targetReason: (p) => {
    const tag = (p.tags || []).includes("Undervalued")
      ? "undervalued buy-low"
      : "Year-2 ascender";
    return `Age ${p.age} — ${tag}, keeps the next window open`;
  },

  rookieStrategy: {
    perYear: (year, inventory, picks) => ({
      year,
      targetPicks: "Hold 1sts; trade 2nds and 3rds for buy-low Year-2 players",
      behavior: "Conservative — preserve top picks, flip mid picks",
      positions: ["Value-based, not position-based"],
      inventory,
      ownedPicks: picks,
      namedRookies: [],
      note: "The young foundation is already here. Use picks to buy known quantities from rebuilders.",
    }),
  },

  roadmapTemplate: [
    {
      label: "Year 1 — Contend",
      objective: "Compete for a title with vet core intact",
      lineupPhilosophy: "Max lineup every week",
      winLoss: "10-4 expected",
      decisionGates: [
        "If you win a title, stay the course — do NOT promote to All-In",
      ],
    },
    {
      label: "Year 2 — Transition",
      objective: "Quietly buy low on Year-2 players while still contending",
      lineupPhilosophy: "Young reinforcements start seeing snaps",
      winLoss: "9-5 expected",
      decisionGates: [
        "If vet core slips, accelerate transition",
      ],
    },
    {
      label: "Year 3 — Reloaded",
      objective: "Young core takes over — a second window opens",
      lineupPhilosophy: "Youth-led with a few vet holdovers",
      winLoss: "9-5 expected",
      decisionGates: [
        "Re-run classifier — likely back to contender status",
      ],
    },
  ],

  marqueeMove: {
    title: "Soft Landing Trades",
    subtitle:
      "Cash late-career vets to contenders AND buy low on Year-2 players from rebuilders. Two-sided moves that open a second window.",
    sellFilter: (p) => {
      if (!p) return false;
      if (p.age < 29) return false;
      if (p.archetype === "Cornerstone") return false;
      return (p.score || 0) >= 45;
    },
    partnerPhase: "any",
    returnPicker: (partner, sellPlayer, ctx = {}) => {
      const enriched = partner.enriched || [];
      const skip = ctx.excludePlayerIds;
      // Buy-low Year-2 player — target rebuild or retool partners preferentially
      const target = enriched
        .filter(
          (p) =>
            !skip?.has(p.id) &&
            p.age <= 25 &&
            ((p.tags || []).includes("Undervalued") ||
              p.verdict === "buy" ||
              (p.prediction?.breakoutProb || 0) >= 0.25) &&
            p.archetype !== "Replaceable" &&
            (p.score || 0) >= 45,
        )
        .sort(
          (a, b) =>
            ((b.prediction?.breakoutProb || 0) -
              (a.prediction?.breakoutProb || 0)) ||
            (b.score || 0) - (a.score || 0),
        )[0];
      if (!target) return null;
      return { player: target, picks: [] };
    },
    rationale: (sell, ret, partner) =>
      `${partner.label}: ship ${sell.name} (age ${sell.age}, last good year) for ${ret.player.name} — a Year-2 buy-low who bridges to your next contending window.`,
  },

  bombshellMove: {
    mode: "liquidate",
    title: "Soft Landing Bombshells",
    subtitle:
      "Cash your biggest late-career vet to a contender for a haul of picks + a Year-2 ascender. Opens the next window without a rebuild.",
    partnerPhase: "contender",
    anchorPicker: (analysis) => {
      return (analysis.enriched || [])
        .filter(
          (p) =>
            p.age >= 28 &&
            (p.score || 0) >= 65 &&
            Number(p.fantasyCalcValue || 0) >= 2500 &&
            p.archetype !== "Cornerstone" &&
            p.archetype !== "Short Term Production" &&
            p.archetype !== "JAG - Insurance" &&
            p.archetype !== "JAG - Developmental" &&
            p.archetype !== "Replaceable",
        )
        .sort(
          (a, b) =>
            Number(b.fantasyCalcValue || 0) - Number(a.fantasyCalcValue || 0),
        )
        .slice(0, 3);
    },
    throwInFilter: (p) => p.age <= 25 && (p.score || 0) >= 45,
    rationale: (anchor, target, picks, partner) => {
      const pickCount = picks.length;
      const extra = target ? ` + ${target.name} (age ${target.age})` : "";
      return `${partner.label} is contending and overpaying. Ship ${anchor.name} (age ${anchor.age}) for ${pickCount} future pick${pickCount > 1 ? "s" : ""}${extra} — the softest landing possible.`;
    },
  },

  riskPatterns: [
    {
      id: "no-young-foundation",
      match: (analysis) => {
        const young = (analysis.enriched || []).filter(
          (p) => p.age <= 25 && p.score >= 55,
        );
        return young.length < 3;
      },
      risk: "Young foundation is thin — the soft landing is hard",
      pivotTrigger:
        "If you can't build a 4-player young core, shift to Veteran Pivot",
      severity: "high",
    },
    {
      id: "no-buy-lows",
      match: (analysis) => {
        const buyLows = (analysis.tradeSuggestions || []).filter(
          (s) =>
            s.targetPlayer &&
            ((s.targetPlayer.tags || []).includes("Undervalued") ||
              s.targetPlayer.verdict === "buy"),
        );
        return buyLows.length < 2;
      },
      risk: "No clear buy-low targets in the league right now",
      pivotTrigger:
        "If no buy-lows emerge, shift to Surgical Upgrade",
      severity: "medium",
    },
  ],

  haulTrades: {
    showConsolidation: false,
    showLiquidation: true,
    title: "Soft Landing Liquidation Hauls",
    subtitle:
      "Cash late-career vets for future picks + Year-2 ascenders. Keep the window cracked open while storing assets.",
  },
};
