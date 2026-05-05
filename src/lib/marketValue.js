/**
 * marketValue.js
 * League format context, archetype premiums, per-player market value,
 * pick value estimates, and roster-keep counts.
 */
import { draftCapitalScore } from "./scoringEngine";

// ---------------------------------------------------------------------------
// League rules context
// ---------------------------------------------------------------------------

export function getLeagueRulesContext(league) {
  const scoring = league.scoring_settings || {};
  const rosterPositions = league.roster_positions || [];
  const passTd = Number(scoring.pass_td ?? 4);
  const recBase = Number(scoring.rec ?? 0);
  const teRec = Number(scoring.rec_te ?? recBase);
  const wrRec = Number(scoring.rec_wr ?? recBase);
  const rbRec = Number(scoring.rec_rb ?? recBase);
  const flexCount = rosterPositions.filter((slot) =>
    ["FLEX", "REC_FLEX", "WRRB_FLEX", "WRTE_FLEX", "SUPER_FLEX"].includes(slot),
  ).length;
  const starterCounts = {
    QB: rosterPositions.filter((slot) => slot === "QB").length,
    RB: rosterPositions.filter((slot) => slot === "RB").length,
    WR: rosterPositions.filter((slot) => slot === "WR").length,
    TE: rosterPositions.filter((slot) => slot === "TE").length,
  };
  const isSuperflex =
    starterCounts.QB > 1 || rosterPositions.includes("SUPER_FLEX");
  const tePremium = teRec > Math.max(wrRec, rbRec, recBase);

  return {
    isSuperflex,
    tePremium,
    passTd,
    ppr: recBase,
    numTeams: Number(league.total_rosters || 12),
    starterCounts,
    flexCount,
    formatLabel: [
      isSuperflex ? "Superflex" : "1QB",
      tePremium ? "TE Premium" : null,
      recBase >= 1 ? "PPR" : recBase > 0 ? "Half PPR" : "Standard-ish",
      passTd >= 6 ? "6pt Pass TD" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    positionPremiums: {
      QB: isSuperflex ? 24 + Math.max(0, starterCounts.QB - 1) * 5 : 0,
      RB: starterCounts.RB >= 2 ? 2 : 0,
      WR: starterCounts.WR >= 3 || flexCount >= 2 ? 4 : 0,
      TE: tePremium ? 10 + Math.max(0, starterCounts.TE - 1) * 3 : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Archetype premium (used internally by buildPlayerMarketValue)
// ---------------------------------------------------------------------------

function getArchetypePremium(archetype) {
  return (
    {
      Cornerstone: 18,
      Foundational: 13,
      Mainstay: 8,
      "Upside Shot": 10,
      "Productive Vet": 4,
      "Short Term League Winner": 6,
      "Short Term Production": 3,
      Serviceable: 0,
      "JAG - Insurance": -6,
      "JAG - Developmental": 2,
      Replaceable: -14,
    }[archetype] || 0
  );
}

// ---------------------------------------------------------------------------
// Player market value
// ---------------------------------------------------------------------------

export function buildPlayerMarketValue(
  player,
  leagueContext,
  fantasyCalcEntry,
) {
  // player.score is already FC-blended; build trade-specific market value on top.
  // Separately track internalValue (from raw internal score) for display/comparison.
  const applyPremiums = (base) => {
    let v = base + (leagueContext.positionPremiums[player.position] || 0) * 0.6;
    // Smooth youth premium curve: age 20 = +10/+8, decays linearly to 0 at 27, penalty at 29+
    if (player.age >= 29) {
      v -= player.position === "RB" ? 14 : 7;
    } else if (player.age < 27) {
      const maxBonus = player.position === "QB" ? 10 : 8;
      v += Math.round(maxBonus * Math.max(0, (27 - player.age) / 7));
    }
    if (player.draftRound === 1) v += player.draftSlot <= 12 ? 8 : 5;
    else if (player.draftRound === 2) v += 2;
    v += getArchetypePremium(player.archetype) * 0.70;
    v += Math.max(0, ((player.currentPctile || 0) - 55) * 0.18);
    v += Math.max(0, ((player.peakPctile || 0) - 75) * 0.1);
    if (player.gp24 < 4) v -= player.draftRound === 1 ? 4 : 10;
    if (player.yearsExp <= 1 && (player.currentPctile || 0) < 45)
      v -= player.draftRound === 1 ? 3 : 8;
    if (player.position === "RB" && player.yearsExp <= 1 && player.score < 65)
      v -= 7;
    if (
      player.position !== "QB" &&
      player.archetype === "Upside Shot" &&
      player.score < 62
    )
      v -= 5;
    return Math.max(10, Math.round(v));
  };

  return {
    marketValue: applyPremiums(player.score),
    internalValue: applyPremiums(player.internalScore),
    fantasyCalcValue: Number(fantasyCalcEntry?.value || 0) || null,
    fantasyCalcRank: Number(fantasyCalcEntry?.overallRank || 0) || null,
    fantasyCalcTrend: Number(fantasyCalcEntry?.trend30Day || 0) || 0,
  };
}

// ---------------------------------------------------------------------------
// Pick value & roster keep count
// ---------------------------------------------------------------------------

export function getKeepCount(pos, isSuperflex) {
  const counts = isSuperflex
    ? { QB: 3, RB: 4, WR: 5, TE: 2 }
    : { QB: 2, RB: 4, WR: 5, TE: 2 };
  return counts[pos] || 2;
}

export function estimatePickValue(pick, leagueContext, tradeMarket = null) {
  if (!pick?.round) return 12;

  const currentYear = new Date().getFullYear();
  const yearsOut = Math.max(
    0,
    Number(pick.season || currentYear) - currentYear,
  );
  // Use actual projected slot when available, otherwise default mid-round
  const slot = pick.slot != null ? pick.slot : (pick.round === 1 ? 16 : 24);
  let value = draftCapitalScore(pick.round, slot) || 12;

  if (pick.round === 1 && leagueContext.isSuperflex) value += 8;
  if (pick.round === 1 && leagueContext.tePremium) value += 2;
  if (yearsOut === 1) value -= 4;
  if (yearsOut >= 2) value -= 10;
  if (!pick.isOwn) value += 3;

  const marketMultiplier = tradeMarket?.pickRoundMultipliers?.[pick.round] || 1;
  return Math.max(8, Math.round(value * marketMultiplier));
}

// ---------------------------------------------------------------------------
// Phase-aware pick valuation (used by strategy planner)
// ---------------------------------------------------------------------------
// estimatePickValue() above hardcodes the slot to 16/24 because it doesn't
// know whose pick it is. The strategy planner DOES know — a contender's 1st
// projects late, a rebuilder's 1st projects early. These two valuers respect
// that. valueOfPickPhase returns score-scale (8-95). pickFcValue returns
// dollar-scale calibrated to the dynasty market.

function phaseSlot(round, ownerPhase) {
  if (round !== 1) return 24;
  if (ownerPhase === "rebuild") return 6;
  if (ownerPhase === "retool") return 14;
  if (ownerPhase === "contender") return 24;
  return 16;
}

export function pickSlotLabel(round, ownerPhase) {
  if (round !== 1) return null;
  if (ownerPhase === "rebuild") return "early";
  if (ownerPhase === "retool") return "mid";
  if (ownerPhase === "contender") return "late";
  return null;
}

export function valueOfPickPhase(pick, ownerPhase, leagueContext) {
  if (!pick?.round) return 12;
  const currentYear = new Date().getFullYear();
  const yearsOut = Math.max(
    0,
    Number(pick.season || currentYear) - currentYear,
  );
  const slot = phaseSlot(pick.round, ownerPhase);
  let value = draftCapitalScore(pick.round, slot) || 12;
  if (pick.round === 1 && leagueContext?.isSuperflex) value += 8;
  if (pick.round === 1 && leagueContext?.tePremium) value += 2;
  if (yearsOut === 1) value -= 4;
  if (yearsOut >= 2) value -= 10;
  return Math.max(8, Math.round(value));
}

// Calibrated FC-DOLLAR equivalent for picks. The score-scale valuer
// systematically undervalues picks relative to FantasyCalc reality —
// a late 1st in the dynasty market is ~$3500, but in score-scale it's ~78,
// which makes WR3 vets look like fair trade for 1sts when they're not.
// This table is the dynasty-market truth.
//
// NOTE: this is the canonical fallback. If RosterAudit `/picks` data is
// available in `pickValueOverrides`, those values take precedence — they're
// market-calibrated rather than estimated.
export function pickFcValue(
  pick,
  ownerPhase,
  leagueContext,
  pickValueOverrides = null,
) {
  if (!pick?.round) return 100;
  const currentYear = new Date().getFullYear();
  const yearsOut = Math.max(
    0,
    Number(pick.season || currentYear) - currentYear,
  );
  const round = pick.round;
  const slot = phaseSlot(round, ownerPhase);

  // RosterAudit override path — supports both RA native keys
  // (`${season}-${round}-${slotLabel}`, year discount already baked in)
  // and legacy keys (`${round}-${slot}` or `${round}`).
  if (pickValueOverrides) {
    const season = Number(pick.season || currentYear);
    const slotLabel = ownerPhase === "rebuild" ? "early"
      : ownerPhase === "contender" ? "late"
      : "mid";
    // Try RA native key first (already year-discounted)
    const raKey = `${season}-${round}-${slotLabel}`;
    const raVal = pickValueOverrides[raKey];
    if (raVal != null) {
      // RA already applies year discount and format awareness —
      // only adjust for TE premium (which RA doesn't track).
      let v = Number(raVal);
      if (round === 1 && leagueContext?.tePremium) v *= 1.05;
      return Math.max(50, Math.round(v));
    }
    // Legacy fallback: numeric-slot key
    const slotKey = `${round}-${slot}`;
    const roundKey = `${round}`;
    const override =
      pickValueOverrides[slotKey] ?? pickValueOverrides[roundKey] ?? null;
    if (override != null) {
      let v = Number(override);
      if (yearsOut === 1) v *= 0.85;
      else if (yearsOut === 2) v *= 0.7;
      else if (yearsOut >= 3) v *= 0.55;
      if (round === 1 && leagueContext?.isSuperflex) v *= 1.18;
      if (round === 1 && leagueContext?.tePremium) v *= 1.05;
      return Math.max(50, Math.round(v));
    }
  }

  let base;
  if (round === 1) {
    if (slot <= 6) base = 5800;
    else if (slot <= 10) base = 5000;
    else if (slot <= 14) base = 4400;
    else if (slot <= 20) base = 3700;
    else base = 3000;
  } else if (round === 2) base = 1200;
  else if (round === 3) base = 500;
  else if (round === 4) base = 200;
  else base = 100;

  if (yearsOut === 1) base *= 0.85;
  else if (yearsOut === 2) base *= 0.7;
  else if (yearsOut >= 3) base *= 0.55;

  if (round === 1 && leagueContext?.isSuperflex) base *= 1.18;
  if (round === 1 && leagueContext?.tePremium) base *= 1.05;

  return Math.max(50, Math.round(base));
}

// ---------------------------------------------------------------------------
// Shared pick display utilities (used by RosterTab and PicksTab)
// ---------------------------------------------------------------------------

export const PHASE_TO_SLOT = { rebuild: "early", retool: "mid", contender: "late" };

/**
 * Slot value for a COMPLETED rookie draft pick where the exact slot is known.
 * Uses RA early/mid/late anchors (when available) interpolated to the exact
 * slot position, so 1.04 ≠ 1.10 while still being RA-calibrated.
 * Falls back to a static curve when RA data isn't present.
 *
 * `totalSlots` = total picks per round (= number of league teams).
 * `raPickValues` = the pickValues map from rosterAuditApi (optional).
 * `season`       = the draft year string, e.g. "2026".
 */
export function pickSlotValueExact(round, slot, totalSlots, leagueContext, raPickValues, season) {
  const slots = Math.max(2, totalSlots || 12);
  const fraction = (slot - 1) / (slots - 1); // 0 = first pick, 1 = last pick

  // --- RA path: interpolate between early / mid / late anchors ---
  if (raPickValues && season) {
    const yr = String(season);
    const raEarly = raPickValues[`${yr}-${round}-early`];
    const raMid   = raPickValues[`${yr}-${round}-mid`];
    const raLate  = raPickValues[`${yr}-${round}-late`];

    if (raEarly != null && raMid != null && raLate != null) {
      // Treat early=fraction 0, mid=fraction 0.5, late=fraction 1
      let raVal;
      if (fraction <= 0.5) {
        raVal = raEarly + (raMid - raEarly) * (fraction / 0.5);
      } else {
        raVal = raMid + (raLate - raMid) * ((fraction - 0.5) / 0.5);
      }
      return Math.max(50, Math.round(raVal));
    }
  }

  // --- Static fallback curve ---
  let base;
  if (round === 1) {
    base = Math.round(7500 - fraction * 4700); // 7 500 (1.01) → 2 800 (last)
  } else if (round === 2) {
    base = Math.round(1800 - fraction * 1100); // 1 800 → 700
  } else if (round === 3) {
    base = Math.round(600 - fraction * 400);   // 600 → 200
  } else if (round === 4) {
    base = Math.round(220 - fraction * 120);   // 220 → 100
  } else {
    base = 100;
  }

  if (round === 1 && leagueContext?.isSuperflex) base = Math.round(base * 1.18);
  if (round === 1 && leagueContext?.tePremium)   base = Math.round(base * 1.05);

  return Math.max(50, base);
}

export function getPickValue(pick, ownerPhase, raPickValues, leagueContext, tradeMarket) {
  if (raPickValues && pick?.round) {
    if (pick.slot != null) {
      const exactKey = `${pick.season}-${pick.round}-${pick.slot}`;
      const exactVal = raPickValues[exactKey];
      if (exactVal != null) return { value: exactVal, source: "ra" };
    }
    const slot = PHASE_TO_SLOT[ownerPhase] || "mid";
    const key = `${pick.season}-${pick.round}-${slot}`;
    const raVal = raPickValues[key];
    if (raVal != null) return { value: raVal, source: "ra" };
  }
  if (leagueContext) {
    return { value: estimatePickValue(pick, leagueContext, tradeMarket), source: "est" };
  }
  return null;
}

export function formatPickValue(val) {
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return String(val);
}

// ---------------------------------------------------------------------------
// Trend scoring delta — reusable across all planner sections.
// ---------------------------------------------------------------------------
// `fantasyCalcTrend` is the raw 30-day $ change in FC value. We normalize
// to a percent of the player's current FC value so a $200 move on a $400
// JAG carries more rerank weight than a $200 move on a $4000 star.
// Capped at ±15 to keep trend modest vs path-specific fit scoring.
//
// mode = "buy":  trending UP target = harder to extract (negative)
// mode = "sell": trending DOWN player = sell urgency (positive)
export function trendDelta(player, mode = "buy") {
  const trend = Number(player?.fantasyCalcTrend || 0);
  const fc = Number(player?.fantasyCalcValue || 0);
  if (!trend || fc <= 0) return 0;
  const pct = trend / fc; // -0.5 to +0.5 typical extremes
  const clamped = Math.max(-0.5, Math.min(0.5, pct));
  const sign = mode === "buy" ? -1 : 1;
  return sign * clamped * 30; // ±15 max
}
