// Surgical Upgrade — fix the one hole, keep the future.

function biggestHole(analysis) {
  // Prefer weakRooms if present, otherwise lowest-avg-score position.
  const weak = analysis?.weakRooms || [];
  if (weak.length) return weak[0];
  const byPos = analysis?.byPos || {};
  let worstPos = null;
  let worstAvg = Infinity;
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    const room = byPos[pos] || [];
    if (!room.length) return pos;
    const avg = room.reduce((s, p) => s + (p.score || 0), 0) / room.length;
    if (avg < worstAvg) {
      worstAvg = avg;
      worstPos = pos;
    }
  }
  return worstPos;
}

export const surgicalUpgrade = {
  key: "surgicalUpgrade",
  name: "Surgical Upgrade",
  class: "contender",
  tagline: "Fix the one hole, keep the future",
  risk: "Low",
  timeToContend: "This year + sustained window",
  bestFor: "90%-there teams with one weak starting spot",
  mechanic:
    "Package depth + mid picks for one targeted upgrade, then stop",

  triageRules: {
    buildAround: (player) => player.score >= 55,
    sellNow: (player, ctx) => {
      const hole = biggestHole(ctx.analysis);
      // Sell only mid-tier depth that isn't part of the hole position
      return (
        player.position !== hole &&
        player.score >= 40 &&
        player.score < 58 &&
        player.archetype !== "Cornerstone"
      );
    },
    holdReassess: (player) => player.score >= 58 && player.score < 65,
  },
  triageRationales: {
    buildAround: (p) => `Score ${p.score}/100 — part of the core, stays`,
    sellNow: (p) =>
      `Score ${p.score}/100 — depth ammunition, trade for the one upgrade`,
    holdReassess: (p) =>
      `Score ${p.score}/100 — might be needed as depth after the upgrade lands`,
  },

  targetFilter: (sug, ctx) => {
    const p = sug.targetPlayer;
    if (!p) return false;
    const hole = biggestHole(ctx.analysis);
    return p.position === hole && (p.score || 0) >= 65 && p.age <= 29;
  },
  targetRerank: (sug) => {
    const p = sug.targetPlayer;
    const fitBonus = Math.max(0, (p.score || 0) - 65);
    return (sug.fitScore || 0) + fitBonus;
  },
  targetReason: (p, ctx) => {
    const hole = biggestHole(ctx.analysis);
    return `Plugs your ${hole} hole — score ${p.score}/100, age ${p.age}`;
  },

  rookieStrategy: {
    perYear: (year, inventory, picks) => ({
      year,
      targetPicks: "Keep all 1sts; trade only mid-round picks",
      behavior: "Surgical — mid picks go out, 1sts stay",
      positions: ["BPA — 1sts protect the future"],
      inventory,
      ownedPicks: picks,
      namedRookies: [],
      note: "One trade, then stop. Don't over-mortgage for a 90%-there team.",
    }),
  },

  roadmapTemplate: [
    {
      label: "Year 1 — Surgery",
      objective: "Land the one upgrade, then stop trading",
      lineupPhilosophy: "Full lineup with the fix in place",
      winLoss: "10-4 expected",
      decisionGates: [
        "After the upgrade, ignore all other trade offers",
      ],
    },
    {
      label: "Year 2 — Sustain",
      objective: "Keep the window open — run it back",
      lineupPhilosophy: "Same core, same lineup",
      winLoss: "10-4 expected",
      decisionGates: [
        "If a new hole opens, run Surgical again — do not All-In",
      ],
    },
    {
      label: "Year 3 — Reload",
      objective: "Start buying low on Year-2 ascenders for the next window",
      lineupPhilosophy: "Main core + young reinforcements",
      winLoss: "9-5 expected",
      decisionGates: [
        "Transition to Soft Landing if the core ages out",
      ],
    },
  ],

  marqueeMove: {
    title: "The One Upgrade",
    subtitle:
      "Package your depth into one targeted starter at the weak position. One trade, then stop.",
    sellFilter: (p, { analysis }) => {
      if (!p) return false;
      const weak = (analysis?.weakRooms || [])[0];
      // Ammo: depth NOT at the weak position
      if (weak && p.position === weak) return false;
      return (
        (p.score || 0) >= 42 &&
        (p.score || 0) < 65 &&
        p.archetype !== "Cornerstone"
      );
    },
    partnerPhase: "any",
    returnPicker: (partner, sellPlayer, ctx = {}) => {
      const analysis = ctx.analysis;
      const skip = ctx.excludePlayerIds;
      const weak = (analysis?.weakRooms || [])[0];
      if (!weak) return null;
      const enriched = partner.enriched || [];
      const target = enriched
        .filter(
          (p) =>
            !skip?.has(p.id) &&
            p.position === weak &&
            (p.score || 0) >= 65 &&
            p.age <= 29 &&
            p.archetype !== "Cornerstone",
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      if (!target) return null;
      return { player: target, picks: [] };
    },
    score: (sell, ret) => (ret.player?.score || 0) * 2,
    rationale: (sell, ret, partner) =>
      `Package ${sell.name} + a mid pick to ${partner.label} for ${ret.player.name} — plugs your biggest hole without touching the core.`,
  },

  bombshellMove: {
    mode: "acquire",
    title: "Position-Fix Bombshell",
    subtitle:
      "Your hole is too big for depth alone — package your best non-core piece + picks to land a top-12 at the weak spot in one shot.",
    partnerPhase: "any",
    targetPicker: (partner, ctx = {}) => {
      const analysis = ctx.analysis;
      const used = ctx.usedTargetIds;
      const weak = (analysis?.weakRooms || [])[0];
      if (!weak) return null;
      const enriched = partner.enriched || [];
      return enriched
        .filter(
          (p) =>
            !used?.has(p.id) &&
            p.position === weak &&
            (p.score || 0) >= 72 &&
            p.age <= 29 &&
            p.archetype !== "Replaceable",
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    },
    anchorFilter: (p, { analysis }) => {
      if (!p) return false;
      const weak = (analysis?.weakRooms || [])[0];
      // Don't ship from the weak room itself
      if (weak && p.position === weak) return false;
      if ((p.score || 0) < 55) return false;
      if (p.archetype === "Cornerstone") return false;
      return true;
    },
    score: (anchor, target) => (target?.score || 0) * 2,
    rationale: (anchor, target, picks, partner) => {
      const pickCount = picks.length;
      const pickStr =
        pickCount === 0
          ? ""
          : ` + ${pickCount} pick${pickCount > 1 ? "s" : ""}`;
      return `One surgical strike: ${anchor.name}${pickStr} to ${partner.label} for ${target.name} — plugs your ${target.position} hole with a real top-12.`;
    },
  },

  riskPatterns: [
    {
      id: "too-many-holes",
      match: (analysis) => (analysis.weakRooms || []).length > 1,
      risk: "You have multiple weak positions — surgical may not be enough",
      pivotTrigger:
        "If more than 1 weak room persists after the first trade, shift to Consolidation Play",
      severity: "medium",
    },
    {
      id: "hole-has-no-target",
      match: (analysis) => {
        const hole = biggestHole(analysis);
        const targets = (analysis.tradeSuggestions || []).filter(
          (s) =>
            s.targetPlayer &&
            s.targetPlayer.position === hole &&
            (s.targetPlayer.score || 0) >= 65,
        );
        return targets.length === 0;
      },
      risk: "No top-tier target is available at your weak position",
      pivotTrigger:
        "If no upgrade lands by Week 8, pivot to All-In or Soft Landing",
      severity: "high",
    },
  ],

  haulTrades: {
    showConsolidation: true,
    showLiquidation: false,
    title: "Surgical Consolidation Hauls",
    subtitle:
      "Package depth + mid-tier pieces to land the one elite player that fixes your weakest spot.",
  },
};
