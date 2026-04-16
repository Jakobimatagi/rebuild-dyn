/**
 * rosterBuilder.js
 * Builds enriched roster snapshots: per-player scoring, positional breakdowns,
 * needs/surplus analysis, and tradeable/targetable player lists.
 */
import { POSITION_PRIORITY, IDEAL_PROPORTION } from "../constants";
import { clamp, playerPctiles, calcScore, draftTierLabel } from "./scoringEngine";
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
// Projected starting lineup PPG
// ---------------------------------------------------------------------------

/**
 * Simulates the optimal starting lineup using league roster slot rules.
 * Returns total projected weekly PPG for the team's best possible starters.
 */
export function calcStarterPPG(enriched, leagueContext) {
  const { starterCounts, flexCount, isSuperflex } = leagueContext;
  const used = new Set();

  // Pool of available players sorted by PPG (highest first)
  const pool = enriched
    .filter((p) => p.ppg != null && parseFloat(p.ppg) > 0)
    .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg));

  let totalPPG = 0;

  // Fill required position slots first (QB, RB, WR, TE)
  for (const pos of POSITION_PRIORITY) {
    const needed = starterCounts[pos] || 0;
    let filled = 0;
    for (const p of pool) {
      if (filled >= needed) break;
      if (used.has(p.id) || p.position !== pos) continue;
      totalPPG += parseFloat(p.ppg);
      used.add(p.id);
      filled++;
    }
  }

  // Fill FLEX slots with best remaining non-QB (or QB for superflex)
  let flexFilled = 0;
  const superflexSlots = isSuperflex ? 1 : 0;
  const regularFlexSlots = flexCount - superflexSlots;

  // Regular FLEX (RB/WR/TE)
  for (const p of pool) {
    if (flexFilled >= regularFlexSlots) break;
    if (used.has(p.id) || p.position === "QB") continue;
    totalPPG += parseFloat(p.ppg);
    used.add(p.id);
    flexFilled++;
  }

  // SUPER_FLEX (any position)
  let sfFilled = 0;
  for (const p of pool) {
    if (sfFilled >= superflexSlots) break;
    if (used.has(p.id)) continue;
    totalPPG += parseFloat(p.ppg);
    used.add(p.id);
    sfFilled++;
  }

  return Math.round(totalPPG * 10) / 10;
}

// ---------------------------------------------------------------------------
// Team phase classification (league-relative)
// ---------------------------------------------------------------------------

/**
 * Classify all teams in the league relative to each other.
 * Must be called AFTER all individual snapshots are built.
 *
 * Uses: points for (actual), projected starter PPG, dynasty score,
 * roster construction, and league-relative percentiles.
 */
export function classifyLeagueTeams(leagueTeams, leagueContext) {
  if (!leagueTeams.length) return;

  const numTeams = leagueTeams.length;

  // Compute per-team competitive metrics
  const metrics = leagueTeams.map((team) => {
    const starterPPG = calcStarterPPG(team.enriched, leagueContext);

    // Actual points for from Sleeper (season total)
    const pointsFor = team.pointsFor || 0;

    // Roster construction scores (absolute, not relative)
    const eliteCount = team.enriched.filter(
      (p) => p.archetype === "Cornerstone" || p.archetype === "Foundational",
    ).length;
    const avgScore =
      typeof team.avgScore === "string"
        ? parseFloat(team.avgScore)
        : team.avgScore || 0;
    const avgAge =
      typeof team.avgAge === "string"
        ? parseFloat(team.avgAge)
        : team.avgAge || 26;
    const earlyPicks = team.picks.filter((p) => p.round <= 2).length;

    return {
      rosterId: team.rosterId,
      starterPPG,
      pointsFor,
      eliteCount,
      avgScore,
      avgAge,
      weakRooms: team.weakRooms.length,
      wins: team.wins || 0,
      losses: team.losses || 0,
      earlyPicks,
    };
  });

  // Build league-relative percentiles (0-100) for key metrics
  const percentile = (arr, value) => {
    const below = arr.filter((v) => v < value).length;
    return Math.round((below / Math.max(1, arr.length - 1)) * 100);
  };

  const allStarterPPG = metrics.map((m) => m.starterPPG);
  const allPointsFor = metrics.map((m) => m.pointsFor);
  const allAvgScore = metrics.map((m) => m.avgScore);
  const allElite = metrics.map((m) => m.eliteCount);
  const allWins = metrics.map((m) => m.wins);
  const hasPointsFor = allPointsFor.some((pf) => pf > 0);
  const hasRecord = allWins.some((w) => w > 0);

  for (let i = 0; i < leagueTeams.length; i++) {
    const m = metrics[i];
    const signals = [];
    let score = 0;

    // 1. Projected starter PPG — league percentile (0-25, most important)
    //    This is the best predictor of "can this team win games NOW"
    const ppgPctile = percentile(allStarterPPG, m.starterPPG);
    score += (ppgPctile / 100) * 25;
    const ppgRank = allStarterPPG.filter((v) => v > m.starterPPG).length + 1;
    signals.push(
      `Projected starter PPG: ${m.starterPPG} (${ppgRank}${ordinal(ppgRank)} of ${numTeams})`,
    );

    // 2. Actual points for — league percentile (0-20)
    //    Real results from the season validate the projection
    if (hasPointsFor) {
      const pfPctile = percentile(allPointsFor, m.pointsFor);
      score += (pfPctile / 100) * 20;
      const pfRank =
        allPointsFor.filter((v) => v > m.pointsFor).length + 1;
      signals.push(
        `Points for: ${m.pointsFor.toFixed(1)} (${pfRank}${ordinal(pfRank)} of ${numTeams})`,
      );
    } else {
      // No PF data — redistribute weight to starter PPG
      score += (ppgPctile / 100) * 10;
    }

    // 3. Win/loss record (0-10)
    if (hasRecord) {
      const totalGames = m.wins + m.losses;
      const winPct = totalGames > 0 ? m.wins / totalGames : 0.5;
      score += winPct * 10;
      signals.push(`Record: ${m.wins}-${m.losses}`);
    }

    // 4. Dynasty score — league percentile (0-15)
    //    Measures overall roster quality for sustained contention
    const scorePctile = percentile(allAvgScore, m.avgScore);
    score += (scorePctile / 100) * 15;

    // 5. Elite player count — league percentile (0-10)
    const elitePctile = percentile(allElite, m.eliteCount);
    score += (elitePctile / 100) * 10;
    if (m.eliteCount >= 3) signals.push(`${m.eliteCount} elite-tier players`);
    if (m.eliteCount === 0) signals.push("No Cornerstone/Foundational players");

    // 6. Roster completeness — weak rooms penalty (0-10)
    const weakPenalty = clamp(((4 - m.weakRooms) / 3) * 10, 0, 10);
    score += weakPenalty;
    if (m.weakRooms >= 3) signals.push(`${m.weakRooms} weak position rooms`);
    if (m.weakRooms === 0) signals.push("No weak position rooms");

    // 7. Age window & future outlook (0-10)
    //    Young + strong = dynasty asset; old + weak = time to sell
    const ageIdeal =
      m.avgAge >= 24 && m.avgAge <= 28
        ? 8
        : m.avgAge >= 22 && m.avgAge <= 30
          ? 5
          : 2;
    // Bonus if young AND strong — the future is bright
    const futureBonus =
      m.avgAge < 26 && scorePctile >= 60 ? 2 : 0;
    score += ageIdeal + futureBonus;
    if (m.avgAge < 23) signals.push("Very young roster — developing");
    if (m.avgAge > 29) signals.push("Aging roster — window closing");

    score = Math.round(clamp(score, 0, 100));

    // Phase thresholds
    let phase;
    if (score >= 60) phase = "contender";
    else if (score >= 38) phase = "retool";
    else phase = "rebuild";

    // Override: if your starter PPG is bottom 25% of the league, you can't be a contender
    if (phase === "contender" && ppgPctile < 25) {
      phase = "retool";
      signals.push("Starter PPG too low to contend despite strong roster value");
    }

    // Override: if your starter PPG is top 3 in the league, you're at least retooling
    if (phase === "rebuild" && ppgRank <= 3) {
      phase = "retool";
      signals.push("Strong starting lineup keeps you in the retool window");
    }

    leagueTeams[i].teamPhase = { phase, score, signals, starterPPG: m.starterPPG };
  }
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
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
  rosterAuditContext = null,
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

      const depthOrder = p.depth_chart_order || 2;

      const playerData = {
        position: pos,
        age,
        yearsExp,
        draftRound,
        draftSlot,
        team: p.team || "FA",
        injuryStatus: p.injury_status || null,
        depthOrder,
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

      // Blend internal score with FC + RA market data NOW so every downstream grade
      // (verdict, archetype, room quality, trade value) uses the community-informed score.
      const fantasyCalcEntry = fantasyCalcContext.bySleeperId.get(String(id));
      const raEntry = rosterAuditContext?.bySleeperId?.get(String(id));
      const { score, fantasyCalcNormalized, rosterAuditNormalized } = computeBlendedScore(
        internalScore,
        fantasyCalcEntry,
        fantasyCalcContext,
        raEntry,
        rosterAuditContext,
      );

      const verdict = getVerdict(score);

      const enrichedPlayer = {
        id,
        score,
        internalScore,
        fantasyCalcNormalized,
        rosterAuditNormalized,
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
        depthOrder,
        peakPctile: pctiles.peak,
        currentPctile: pctiles.current,
        pctileLast: pctiles.pLast,
        pctilePrev: pctiles.pPrev,
        pctileOlder: pctiles.pOlder,
        draftTier: draftTierLabel(draftRound, draftSlot),
      };

      // RosterAudit enrichment (before archetype so RA signals are available)
      if (raEntry) {
        enrichedPlayer.rosterAuditValue = raEntry.value;
        enrichedPlayer.rosterAuditPosRank = raEntry.rankPos;
        enrichedPlayer.rosterAuditTrend = raEntry.trend30d;
        enrichedPlayer.rosterAuditTier = raEntry.tier;
        enrichedPlayer.rosterAuditBuyLow = raEntry.buyLow;
        enrichedPlayer.rosterAuditSellHigh = raEntry.sellHigh;
        enrichedPlayer.rosterAuditBreakout = raEntry.breakout;
      }

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

      const fc = Number(enrichedPlayer.fantasyCalcValue || 0);
      const ra = Number(enrichedPlayer.rosterAuditValue || 0);
      // FC carries more weight (larger community, more liquid market)
      enrichedPlayer.dynastyMarketValue =
        fc > 0 && ra > 0 ? fc * 0.60 + ra * 0.40 : fc > 0 ? fc : ra;

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

  // Extract season record & points for from Sleeper roster settings
  const rosterSettings = roster.settings || {};
  const wins = Number(rosterSettings.wins ?? 0);
  const losses = Number(rosterSettings.losses ?? 0);
  const ties = Number(rosterSettings.ties ?? 0);
  // Sleeper stores fpts as integer + fpts_decimal separately (e.g. 1842 + 56 = 1842.56)
  const pointsFor =
    Number(rosterSettings.fpts ?? 0) +
    Number(rosterSettings.fpts_decimal ?? 0) / 100;
  const pointsAgainst =
    Number(rosterSettings.fpts_against ?? 0) +
    Number(rosterSettings.fpts_against_decimal ?? 0) / 100;

  // teamPhase will be set by classifyLeagueTeams() after all snapshots are built
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
    wins,
    losses,
    ties,
    pointsFor,
    pointsAgainst,
    teamPhase: null, // populated by classifyLeagueTeams
  };
}
