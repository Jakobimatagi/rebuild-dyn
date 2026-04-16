// Retool Rebuild (Soft Rebuild) — stay competitive while pivoting younger.

const ELITE = new Set(["Cornerstone", "Foundational"]);

export const retoolRebuild = {
  key: "retoolRebuild",
  name: "Retool Rebuild",
  subtitle: "Soft Rebuild",
  class: "rebuilder",
  tagline: "Stay competitive while pivoting younger",
  risk: "Medium",
  timeToContend: "1-2 years",
  bestFor: "Rosters with 3-4 ascending young players already in place",
  mechanic:
    "Keep young core, sell aging depth for Year 2 breakouts and 2nds/early 3rds",

  triageRules: {
    buildAround: (player) => {
      if (player.age > 25) return false;
      if (player.verdict === "cut" || player.verdict === "sell") return false;
      return (
        player.archetype === "Mainstay" ||
        player.archetype === "Upside Shot" ||
        player.archetype === "Foundational" ||
        (player.tags || []).includes("Ascending")
      );
    },
    sellNow: (player) => player.age >= 26 && !ELITE.has(player.archetype),
    holdReassess: (player) => player.age >= 26 && ELITE.has(player.archetype),
  },
  triageRationales: {
    buildAround: (p) =>
      `${p.archetype}, age ${p.age} — core of the next competitive window`,
    sellNow: (p) =>
      `Age ${p.age}, ${p.archetype} — cash out while he still has name value`,
    holdReassess: (p) =>
      `Elite vet (${p.archetype}) — hold unless a contender overpays`,
  },

  targetFilter: (sug) => {
    const p = sug.targetPlayer;
    if (!p) return false;
    if (p.age > 25) return false;
    if ((p.yearsExp ?? 0) < 1 || (p.yearsExp ?? 0) > 3) return false;
    return p.verdict !== "cut" && p.archetype !== "Replaceable";
  },
  targetRerank: (sug) => {
    const p = sug.targetPlayer;
    const downYearBonus = (p.tags || []).includes("Undervalued") ? 10 : 0;
    const breakoutBonus = (p.prediction?.breakoutProb || 0) * 15;
    return (sug.fitScore || 0) + downYearBonus + breakoutBonus;
  },
  targetReason: (p) => {
    const tag = (p.tags || []).includes("Undervalued")
      ? "buy-low window"
      : "Year-2 ascender";
    return `Age ${p.age}, ${p.archetype} — ${tag}`;
  },

  rookieStrategy: {
    perYear: (year, inventory, picks) => ({
      year,
      targetPicks: "Trade back from late 1sts into multiple 2nds",
      behavior: "Trade back; quantity over quality",
      positions: ["WR", "RB"],
      inventory,
      ownedPicks: picks,
      namedRookies: [],
      note: "Year-2 breakout hits come from 2nd/3rd rounders — build volume.",
    }),
  },

  roadmapTemplate: [
    {
      label: "Year 1 — Pivot",
      objective: "Cash aging depth; keep core intact",
      lineupPhilosophy: "Compete weekly with the young core",
      winLoss: "6-8 expected",
      decisionGates: [
        "If young core outperforms, accelerate to Veteran Pivot path",
        "If you're 2-6 by Week 8, pivot harder toward Full Teardown",
      ],
    },
    {
      label: "Year 2 — Compete",
      objective: "Year-2 players carry you into the playoff hunt",
      lineupPhilosophy: "Your young core is the engine",
      winLoss: "8-6 expected",
      decisionGates: [
        "If a contender window opens, shift to Youth Injection to reinforce",
      ],
    },
    {
      label: "Year 3 — Contend",
      objective: "Open the window — core is in its prime",
      lineupPhilosophy: "Max out the lineup weekly",
      winLoss: "10-4 expected",
      decisionGates: [
        "If you win the league, pivot to Soft Landing for a sustained run",
      ],
    },
  ],

  marqueeMove: {
    title: "Sell-Side Marquee Moves",
    subtitle:
      "Flip aging non-elite depth into Year-2 ascenders. Keep your elite vets — they are the bridge.",
    sellFilter: (p) => {
      if (!p) return false;
      if (p.age < 26) return false;
      // Non-elite vets with remaining name value
      if (p.archetype === "Cornerstone" || p.archetype === "Foundational")
        return false;
      return (p.score || 0) >= 45;
    },
    partnerPhase: "contender",
    returnPicker: (partner, sellPlayer, ctx = {}) => {
      const enriched = partner.enriched || [];
      const skip = ctx.excludePlayerIds;
      // Year-2/3 players with breakout upside
      const target = enriched
        .filter(
          (p) =>
            !skip?.has(p.id) &&
            p.age >= 22 &&
            p.age <= 25 &&
            (p.yearsExp || 0) >= 1 &&
            (p.yearsExp || 0) <= 3 &&
            (p.score || 0) >= 45 &&
            (p.score || 0) < 72 &&
            p.archetype !== "Cornerstone",
        )
        .sort(
          (a, b) =>
            (b.prediction?.breakoutProb || 0) -
              (a.prediction?.breakoutProb || 0) ||
            (b.score || 0) - (a.score || 0),
        )[0];
      if (!target) return null;
      // Ask for an early 2nd or late 1st as sweetener
      const now = new Date().getFullYear();
      const sweetener = (partner.picks || [])
        .filter(
          (pk) =>
            (pk.round === 2 || pk.round === 1) &&
            Number(pk.season || 0) >= now + 1,
        )
        .sort(
          (a, b) =>
            (b.round === 1 ? 1 : 0) - (a.round === 1 ? 1 : 0) ||
            Number(a.season || 0) - Number(b.season || 0),
        );
      return { player: target, picks: sweetener.slice(0, 1) };
    },
    rationale: (sell, ret, partner) =>
      `${partner.label} needs production now. Ship ${sell.name} (age ${sell.age}) for ${ret.player.name} — a Year-${(ret.player.yearsExp || 1) + 1} ascender who ages with your window${ret.picks?.length ? " — plus a pick sweetener" : ""}.`,
  },

  bombshellMove: {
    mode: "liquidate",
    title: "Retool Bombshells",
    subtitle:
      "Cash your top aging vet into a pick haul + young ascender package. Accelerates the bridge without tearing down the whole roster.",
    partnerPhase: "contender",
    anchorPicker: (analysis) => {
      // Real name-value vets only. Score 55 STPs (boom-bust WR3s) don't
      // command pick hauls — anchors must be genuine starters with
      // dynasty market value to make a contender give up a real 1st.
      return (analysis.enriched || [])
        .filter(
          (p) =>
            p.age >= 27 &&
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
    throwInFilter: (p) =>
      p.age >= 22 &&
      p.age <= 25 &&
      (p.score || 0) >= 45 &&
      p.archetype !== "Replaceable" &&
      p.archetype !== "JAG - Insurance",
    score: (anchor, target, picks) => picks.length * 25 + (target?.score || 0),
    rationale: (anchor, target, picks, partner) => {
      const pickCount = picks.length;
      const extra = target ? ` + ${target.name} (${target.age}yo ascender)` : "";
      return `${partner.label} will overpay for ${anchor.position} help. Flip ${anchor.name} (age ${anchor.age}) for ${pickCount} future pick${pickCount > 1 ? "s" : ""}${extra} — the exact assets that bridge to your next window.`;
    },
  },

  riskPatterns: [
    {
      id: "core-too-thin",
      match: (analysis) => {
        const core = (analysis.enriched || []).filter(
          (p) =>
            p.age <= 25 &&
            (p.archetype === "Foundational" ||
              p.archetype === "Mainstay" ||
              p.archetype === "Upside Shot"),
        );
        return core.length < 3;
      },
      risk: "Young core is too thin — fewer than 3 ascending players",
      pivotTrigger:
        "If you can't assemble a 4-player young core by Week 8, shift to Full Teardown",
      severity: "high",
    },
    {
      id: "aging-depth-low-value",
      match: (analysis) => {
        const agingTradeable = (analysis.enriched || []).filter(
          (p) => p.age >= 27 && p.score >= 50,
        );
        return agingTradeable.length < 3;
      },
      risk: "Not enough aging depth with trade value — fuel for the pivot is limited",
      pivotTrigger:
        "If you only get picks for vets, consider holding and playing it out",
      severity: "medium",
    },
  ],

  haulTrades: {
    showConsolidation: false,
    showLiquidation: true,
    partnerPhase: "contender",
    title: "Retool Liquidation Hauls",
    subtitle:
      "Cash your name-value vets for a pick haul + young throw-in. Accelerates the bridge without a full teardown.",
  },
};
