/**
 * rosterBuilder.js
 * Builds enriched roster snapshots: per-player scoring, positional breakdowns,
 * needs/surplus analysis, and tradeable/targetable player lists.
 */
import { POSITION_PRIORITY, IDEAL_PROPORTION } from "../constants";
import { clamp } from "./scoringEngine";
import { playerPctiles, calcScore, draftTierLabel } from "./scoringEngine";
import {
  getVerdict,
  getArchetype,
  getArchetypeTags,
  getConfidence,
} from "./playerGrading";
import { computeBlendedScore } from "./fantasyCalcBlend";
import {
  buildPlayerMarketValue,
  getKeepCount,
  estimatePickValue,
} from "./marketValue";
import { buildPlayerPrediction } from "./predictionEngine";

// ---------------------------------------------------------------------------
// Own/acquired draft picks for a roster
// ---------------------------------------------------------------------------

export function buildRosterPicks(
  rosterId,
  league,
  tradedPicks,
  rosterLabelById,
  futureSeasons,
) {
  const draftRounds = league.settings?.draft_rounds || 5;

  const tradedAway = new Set(
    tradedPicks
      .filter(
        (pick) => pick.roster_id === rosterId && pick.owner_id !== rosterId,
      )
      .map((pick) => `${pick.season}_${pick.round}_${pick.roster_id}`),
  );

  const ownPicks = futureSeasons.flatMap((season) =>
    Array.from({ length: draftRounds }, (_, index) => index + 1)
      .filter((round) => !tradedAway.has(`${season}_${round}_${rosterId}`))
      .map((round) => ({
        season: String(season),
        round,
        isOwn: true,
        label: `${season} ${round === 1 ? "1st" : round === 2 ? "2nd" : round === 3 ? "3rd" : `${round}th`}`,
      })),
  );

  const acquiredPicks = tradedPicks
    .filter((pick) => pick.owner_id === rosterId && pick.roster_id !== rosterId)
    .map((pick) => ({
      season: String(pick.season),
      round: pick.round,
      isOwn: false,
      fromTeam:
        rosterLabelById.get(pick.roster_id) || `Roster ${pick.roster_id}`,
      label: `${pick.season} ${pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `${pick.round}th`} via ${rosterLabelById.get(pick.roster_id) || `Roster ${pick.roster_id}`}`,
    }));

  return [...ownPicks, ...acquiredPicks].sort(
    (a, b) => a.season.localeCompare(b.season) || a.round - b.round,
  );
}

// ---------------------------------------------------------------------------
// Roster balance analysis
// ---------------------------------------------------------------------------

export function getRosterNeeds(byPos, proportions) {
  return POSITION_PRIORITY.filter((pos) => {
    const room = byPos[pos] || [];
    const roomAvg = room.length
      ? room.reduce((sum, player) => sum + player.score, 0) / room.length
      : 0;
    const premiumCount = room.filter((player) => player.score >= 65).length;
    return (
      room.length < 2 ||
      premiumCount === 0 ||
      roomAvg < 48 ||
      (proportions[pos]?.delta ?? 0) <= -5
    );
  }).sort(
    (a, b) => (proportions[a]?.delta ?? 0) - (proportions[b]?.delta ?? 0),
  );
}

export function getRosterSurplusPositions(byPos, proportions, isSuperflex) {
  return POSITION_PRIORITY.filter((pos) => {
    const room = byPos[pos] || [];
    const keepCount = getKeepCount(pos, isSuperflex);
    const goodDepth = room.filter((player) => player.score >= 55).length;
    return (
      room.length > keepCount ||
      goodDepth >= keepCount ||
      (proportions[pos]?.delta ?? 0) >= 5
    );
  }).sort(
    (a, b) => (proportions[b]?.delta ?? 0) - (proportions[a]?.delta ?? 0),
  );
}

// ---------------------------------------------------------------------------
// Team phase classification
// ---------------------------------------------------------------------------

export function getTeamPhase(enriched, byPos, weakRooms, picks, avgScore, avgAge) {
  const signals = [];
  let score = 0;

  // 1. Average dynasty score (0-25)
  const numAvgScore = typeof avgScore === "string" ? parseFloat(avgScore) : avgScore;
  const avgScoreSignal = clamp(((numAvgScore - 35) / (65 - 35)) * 25, 0, 25);
  score += avgScoreSignal;

  // 2. Elite archetype count (0-20)
  const eliteCount = enriched.filter(
    (p) => p.archetype === "Cornerstone" || p.archetype === "Foundational",
  ).length;
  const eliteSignal = clamp((eliteCount / 4) * 20, 0, 20);
  score += eliteSignal;
  if (eliteCount >= 3) signals.push(`${eliteCount} elite-tier players`);
  if (eliteCount === 0) signals.push("No Cornerstone/Foundational players");

  // 3. Weak rooms — fewer = more competitive (0-15)
  const weakSignal = clamp(((4 - weakRooms.length) / 3) * 15, 0, 15);
  score += weakSignal;
  if (weakRooms.length >= 3) signals.push(`${weakRooms.length} weak position rooms`);
  if (weakRooms.length === 0) signals.push("No weak position rooms");

  // 4. Starter coverage — positions with a score-55+ player (0-15)
  const coveredPositions = POSITION_PRIORITY.filter((pos) => {
    const room = byPos[pos] || [];
    return room.length > 0 && room[0].score >= 55;
  }).length;
  score += (coveredPositions / 4) * 15;
  if (coveredPositions <= 2) signals.push("Missing quality starters at multiple positions");
  if (coveredPositions === 4) signals.push("Quality starter at every position");

  // 5. Buy verdict ratio (0-10)
  const buyRatio =
    enriched.filter((p) => p.verdict === "buy").length /
    Math.max(1, enriched.length);
  score += clamp((buyRatio / 0.4) * 10, 0, 10);

  // 6. Age window fit (0-10)
  const ageNum = typeof avgAge === "string" ? parseFloat(avgAge) : avgAge;
  const ageIdeal =
    ageNum >= 24 && ageNum <= 28 ? 10 : ageNum >= 22 && ageNum <= 30 ? 6 : 2;
  score += ageIdeal;
  if (ageNum < 23) signals.push("Very young roster — developing");
  if (ageNum > 29) signals.push("Aging roster — window closing");

  // 7. Pick capital — fewer early picks = contender (spent capital) (0-5)
  const earlyPicks = picks.filter((p) => p.round <= 2).length;
  const pickSignal = clamp(((6 - earlyPicks) / 6) * 5, 0, 5);
  score += pickSignal;
  if (earlyPicks >= 5) signals.push("Rich in early draft capital");

  score = Math.round(clamp(score, 0, 100));

  let phase;
  if (score >= 62) phase = "contender";
  else if (score >= 40) phase = "retool";
  else phase = "rebuild";

  return { phase, score, signals };
}

// ---------------------------------------------------------------------------
// Full roster snapshot
// ---------------------------------------------------------------------------

export function buildRosterSnapshot(
  roster,
  players,
  league,
  tradedPicks,
  stats24,
  stats23,
  stats22,
  benchmarks,
  scoringWeights,
  rosterLabelById,
  leagueContext,
  fantasyCalcContext,
  futureSeasons,
  lastSeasonYear,
  predictionContext = null,
) {
  const playerIds = roster.players || [];
  const picks = buildRosterPicks(
    roster.roster_id,
    league,
    tradedPicks,
    rosterLabelById,
    futureSeasons,
  );

  const enriched = playerIds
    .map((id) => {
      const p = players[id];
      if (!p) return null;
      const pos = p.fantasy_positions?.[0] || p.position;
      if (!POSITION_PRIORITY.includes(pos)) return null;

      const s24 = stats24[id] || null;
      const s23 = stats23[id] || null;
      const s22 = stats22[id] || null;
      const age = p.age || 26;
      const yearsExp = p.years_exp ?? 0;
      // Sleeper stores draft info on p directly (number) or in metadata (string).
      // Parse to numbers so all === 1, === 2 comparisons work regardless of source.
      const rawDraftRound = p.draft_round ?? p.metadata?.draft_round;
      const rawDraftSlot = p.draft_slot ?? p.metadata?.draft_slot;
      const draftRound =
        rawDraftRound != null ? Number(rawDraftRound) || null : null;
      const draftSlot =
        rawDraftSlot != null ? Number(rawDraftSlot) || null : null;
      const draftYear = p.draft_year ?? p.metadata?.draft_year ?? null;

      const playerData = {
        position: pos,
        age,
        yearsExp,
        draftRound,
        draftSlot,
        team: p.team || "FA",
        injuryStatus: p.injury_status || null,
        depthOrder: p.depth_chart_order || 2,
      };

      const pctiles = playerPctiles(
        s24,
        s23,
        s22,
        pos,
        benchmarks,
        lastSeasonYear,
      );
      const { score: internalScore, components } = calcScore(
        playerData,
        s24,
        s23,
        pctiles.current,
        benchmarks.ageCurves,
        scoringWeights,
      );
      const ppg = s24?.gp > 0 ? ((s24.pts_ppr || 0) / s24.gp).toFixed(1) : null;
      const gp24 = s24?.gp || 0;

      // Blend internal score with FC market data NOW so every downstream grade
      // (verdict, archetype, room quality, trade value) uses the FC-informed score.
      const fantasyCalcEntry = fantasyCalcContext.bySleeperId.get(String(id));
      const { score, fantasyCalcNormalized } = computeBlendedScore(
        internalScore,
        fantasyCalcEntry,
        fantasyCalcContext,
        gp24,
        yearsExp,
        scoringWeights,
      );

      const verdict = getVerdict(score);

      const enrichedPlayer = {
        id,
        score,
        internalScore,
        fantasyCalcNormalized,
        components,
        verdict,
        name: `${p.first_name} ${p.last_name}`,
        position: pos,
        team: p.team || "FA",
        age,
        yearsExp,
        draftRound,
        draftSlot,
        draftYear,
        injuryStatus: p.injury_status || null,
        ppg,
        gp24,
        lastSeasonYear,
        peakPctile: pctiles.peak,
        currentPctile: pctiles.current,
        pctileLast: pctiles.pLast,
        pctilePrev: pctiles.pPrev,
        pctileOlder: pctiles.pOlder,
        draftTier: draftTierLabel(draftRound, draftSlot),
      };

      enrichedPlayer.archetype = getArchetype(enrichedPlayer);
      enrichedPlayer.tags = getArchetypeTags(enrichedPlayer);
      enrichedPlayer.confidence = getConfidence(enrichedPlayer);
      const market = buildPlayerMarketValue(
        enrichedPlayer,
        leagueContext,
        fantasyCalcEntry,
      );
      enrichedPlayer.marketValue = market.marketValue;
      enrichedPlayer.internalValue = market.internalValue;
      enrichedPlayer.fantasyCalcValue = market.fantasyCalcValue;
      enrichedPlayer.fantasyCalcRank = market.fantasyCalcRank;
      enrichedPlayer.fantasyCalcTrend = market.fantasyCalcTrend;

      if (predictionContext) {
        enrichedPlayer.prediction = buildPlayerPrediction(enrichedPlayer, predictionContext);
      }

      return enrichedPlayer;
    })
    .filter(Boolean);

  const byPos = {};
  POSITION_PRIORITY.forEach((pos) => {
    byPos[pos] = enriched
      .filter((player) => player.position === pos)
      .sort((a, b) => b.score - a.score);
  });

  const totalScore =
    enriched.reduce((sum, player) => sum + player.score, 0) || 1;
  const proportions = {};
  POSITION_PRIORITY.forEach((pos) => {
    const posScore = byPos[pos].reduce((sum, player) => sum + player.score, 0);
    const actual = posScore / totalScore;
    const ideal = IDEAL_PROPORTION[pos];
    proportions[pos] = {
      actual: Math.round(actual * 100),
      ideal: Math.round(ideal * 100),
      delta: Math.round((actual - ideal) * 100),
    };
  });

  const sells = enriched
    .filter((player) => player.verdict === "sell" || player.verdict === "cut")
    .sort((a, b) => a.score - b.score);
  const buys = enriched
    .filter((player) => player.verdict === "buy")
    .sort((a, b) => b.score - a.score);
  const holds = enriched.filter((player) => player.verdict === "hold");
  const avgAge = enriched.length
    ? (
        enriched.reduce((sum, player) => sum + player.age, 0) / enriched.length
      ).toFixed(1)
    : "N/A";
  const avgScore = enriched.length
    ? Math.round(
        enriched.reduce((sum, player) => sum + player.score, 0) /
          enriched.length,
      )
    : 0;

  const picksByYear = {};
  picks.forEach((pick) => {
    const year = pick.season || "Unknown";
    if (!picksByYear[year]) picksByYear[year] = [];
    picksByYear[year].push(pick);
  });

  const weakRooms = POSITION_PRIORITY.filter((pos) => {
    const room = byPos[pos];
    return (
      room.length < 2 ||
      room.filter((player) => player.verdict === "buy").length === 0
    );
  });

  const needs = getRosterNeeds(byPos, proportions);
  const surplusPositions = getRosterSurplusPositions(
    byPos,
    proportions,
    leagueContext.isSuperflex,
  );

  const tradeablePlayers = Array.from(
    new Map(
      [
        ...sells,
        ...surplusPositions.flatMap((pos) =>
          byPos[pos].slice(getKeepCount(pos, leagueContext.isSuperflex)),
        ),
        ...surplusPositions.flatMap((pos) =>
          byPos[pos].filter(
            (player, index) =>
              index >= 1 &&
              player.score >= 45 &&
              player.archetype !== "Cornerstone",
          ),
        ),
      ].map((player) => [player.id, player]),
    ).values(),
  ).sort((a, b) => b.score - a.score);

  const targetablePlayers = POSITION_PRIORITY.flatMap((pos) =>
    byPos[pos].filter((player, index) => {
      const untouchable =
        (index === 0 && player.score >= 78) ||
        player.archetype === "Cornerstone" ||
        (player.archetype === "Foundational" && player.score >= 75);
      if (untouchable) return false;
      return (
        index >=
          Math.max(1, getKeepCount(pos, leagueContext.isSuperflex) - 2) ||
        player.age >= 27
      );
    }),
  ).sort((a, b) => b.score - a.score);

  const teamPhase = getTeamPhase(enriched, byPos, weakRooms, picks, avgScore, avgAge);

  return {
    rosterId: roster.roster_id,
    ownerId: roster.owner_id,
    label:
      rosterLabelById.get(roster.roster_id) || `Roster ${roster.roster_id}`,
    enriched,
    byPos,
    sells,
    buys,
    holds,
    avgAge,
    avgScore,
    picksByYear,
    weakRooms,
    picks,
    proportions,
    needs,
    surplusPositions,
    tradeablePlayers,
    targetablePlayers,
    teamPhase,
  };
}
