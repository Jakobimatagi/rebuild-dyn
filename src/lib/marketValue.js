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
  const slot = pick.round === 1 ? 16 : 24;
  let value = draftCapitalScore(pick.round, slot) || 12;

  if (pick.round === 1 && leagueContext.isSuperflex) value += 8;
  if (pick.round === 1 && leagueContext.tePremium) value += 2;
  if (yearsOut === 1) value -= 4;
  if (yearsOut >= 2) value -= 10;
  if (!pick.isOwn) value += 3;

  const marketMultiplier = tradeMarket?.pickRoundMultipliers?.[pick.round] || 1;
  return Math.max(8, Math.round(value * marketMultiplier));
}
