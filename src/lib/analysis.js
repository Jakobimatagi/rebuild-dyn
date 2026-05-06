import { DEFAULT_SCORING_WEIGHTS, buildBenchmarks } from './scoringEngine';
import { buildFantasyCalcContext } from './fantasyCalcBlend';
import { buildFantasyCalcTradeIndex } from './fantasyCalcTradeIndex';
import { buildRosterAuditContext } from './rosterAuditApi';
import { buildRosterSnapshot, classifyLeagueTeams, assignDraftSlots } from './rosterBuilder';
import { getLeagueRulesContext } from './marketValue';
import { buildTradeMarket, buildTradeSuggestions, evaluateTrade } from './tradeEngine';
import { buildPredictionContext } from './predictionEngine';
import { buildLeagueActivity } from './activityEngine';
import { assignPositionRanks as _assignPositionRanks } from './playerGrading';
import { buildDraftRecap } from './draftRecap';
import { buildOcOutlookContext } from './ocAdjustment';

// Re-exports — consumers that import from 'analysis' still work unchanged.
export { DEFAULT_SCORING_WEIGHTS, draftTierLabel } from './scoringEngine';
export { classifyLeagueTeams } from './rosterBuilder';
export { evaluateTrade } from './tradeEngine';
export {
  getVerdict,
  getColor,
  computeRoomQuality,
  assignPositionRanks,
  rankLabel,
  getArchetype,
  getArchetypeTags,
  getConfidence,
} from './playerGrading';

export function buildRosterAnalysis(
  myRoster,
  players,
  league,
  tradedPicks,
  stats24,
  stats23,
  stats22 = {},
  transactions = [],
  fantasyCalcValues = [],
  users = [],
  rosters = [],
  historicalStats = [],
  scoringWeights = DEFAULT_SCORING_WEIGHTS,
  lastSeasonYear = (() => {
    const now = new Date();
    return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  })(),
  rosterAuditValues = [],
  rosterAuditPicks = null,
  sleeperDrafts = [],
  fantasyCalcTrades = [],
  currentDraftStatus = null, // 'complete' | 'incomplete' | null (auto-detect)
  recentDraft = null,
  recentDraftPicks = [],
  allCompletedDrafts = [],
  allDraftPicksMap = {},
) {
  const currentYear = new Date().getFullYear();
  // Sleeper's `season` field on a draft can be the upcoming NFL season (2026)
  // or the prior offseason year (2025) depending on how the league was set up.
  // Match by recency instead: any completed draft whose start_time is within
  // the last ~9 months is treated as the league's current rookie draft.
  const NINE_MONTHS_MS = 9 * 30 * 24 * 60 * 60 * 1000;
  const sleeperDraftComplete = sleeperDrafts.some(
    (d) =>
      d.status === "complete" &&
      d.start_time &&
      Date.now() - Number(d.start_time) < NINE_MONTHS_MS,
  );
  const draftComplete =
    currentDraftStatus === "complete" ||
    (currentDraftStatus !== "incomplete" && sleeperDraftComplete);
  const baseYear = draftComplete ? currentYear + 1 : currentYear;
  const futureSeasons = [baseYear, baseYear + 1, baseYear + 2];
  const userById = new Map(
    users.map((user) => [
      user.user_id,
      user.metadata?.team_name || user.team_name || user.display_name,
    ]),
  );
  const rosterLabelById = new Map(
    rosters.map((roster) => [
      roster.roster_id,
      userById.get(roster.owner_id) ||
        roster.settings?.team_name ||
        `Roster ${roster.roster_id}`,
    ]),
  );

  const leagueContext = getLeagueRulesContext(league);
  const benchmarks = buildBenchmarks(
    players,
    stats22,
    stats23,
    stats24,
    leagueContext,
    historicalStats,
    lastSeasonYear,
  );
  const fantasyCalcContext = buildFantasyCalcContext(fantasyCalcValues);
  const marketCompsBySleeperId = buildFantasyCalcTradeIndex(fantasyCalcTrades);
  const raFormat = leagueContext.isSuperflex ? 'sf' : '1qb';
  const rosterAuditContext = buildRosterAuditContext(
    rosterAuditValues,
    rosterAuditPicks,
    raFormat,
  );

  // Build prediction context from all available seasons (recent 3 + all historical).
  // This builds empirical age curves and the historical snapshot DB for comp matching.
  const allStatYears = [
    { year: lastSeasonYear, stats: stats24 },
    { year: lastSeasonYear - 1, stats: stats23 },
    { year: lastSeasonYear - 2, stats: stats22 },
    ...historicalStats,
  ];
  const predictionContext = buildPredictionContext(
    allStatYears,
    players,
    benchmarks.ageCurves,
  );

  const sourceRosters = rosters.length ? rosters : [myRoster];

  // OC outlook context — keyed by NFL team abbr → per-position multiplier and
  // stint history for the upcoming NFL season's coordinator. Pass `null`
  // historicalRoster falls through to current player.team in teamFantasyRanks
  // (acceptable approximation; caveats in ocAdjustment.js).
  const ocTargetSeason = lastSeasonYear + 1;
  const ocOutlookContext = buildOcOutlookContext({
    targetSeason: ocTargetSeason,
    statsByYear: [
      { year: lastSeasonYear,     stats: stats24 },
      { year: lastSeasonYear - 1, stats: stats23 },
      { year: lastSeasonYear - 2, stats: stats22 },
    ],
    players,
  });

  const leagueTeams = sourceRosters.map((roster) =>
    buildRosterSnapshot(
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
      predictionContext,
      rosterAuditContext,
      ocOutlookContext,
    ),
  );

  // Classify all teams relative to each other (contender / retool / rebuild)
  classifyLeagueTeams(leagueTeams, leagueContext);

  // Extract draft order from Sleeper drafts endpoint.
  // The drafts array may contain multiple drafts; find the one for the
  // next upcoming season (baseYear) with a draft_order set.
  let knownDraftSlots = null;
  if (sleeperDrafts?.length) {
    const targetSeason = String(baseYear);
    const draft = sleeperDrafts.find(
      (d) => String(d.season) === targetSeason && d.draft_order,
    ) || sleeperDrafts.find((d) => d.draft_order);
    if (draft?.draft_order) {
      // Sleeper draft_order is keyed by user_id, but we track teams by roster_id.
      // Build a userId → rosterId lookup from the rosters array.
      const userToRoster = new Map(
        rosters.map((r) => [String(r.owner_id), r.roster_id]),
      );
      knownDraftSlots = new Map();
      for (const [userId, slot] of Object.entries(draft.draft_order)) {
        const rosterId = userToRoster.get(String(userId));
        if (rosterId != null) {
          knownDraftSlots.set(String(rosterId), Number(slot));
        }
      }
    }
  }

  // Project draft order from competitive scores (worst = 1.01, best = 1.N)
  assignDraftSlots(leagueTeams, knownDraftSlots);

  // Rank every team's position rooms 1..N across the league.
  _assignPositionRanks(leagueTeams, leagueContext.isSuperflex);

  const myTeam =
    leagueTeams.find((team) => team.rosterId === myRoster.roster_id) ||
    leagueTeams[0];
  const tradeMarket = buildTradeMarket(
    transactions,
    leagueTeams,
    leagueContext,
  );
  const tradeSuggestions = buildTradeSuggestions(
    myTeam,
    leagueTeams,
    leagueContext,
    tradeMarket,
  );
  const leagueActivity = buildLeagueActivity(
    transactions,
    sourceRosters,
    users,
    players,
  );

  const rostersByIdForRecap = new Map(
    leagueTeams.map((t) => [
      t.rosterId,
      { label: t.label, phase: t.teamPhase?.phase || "retool" },
    ]),
  );
  const recapSharedParams = {
    rostersById: rostersByIdForRecap,
    fcByPlayerId: fantasyCalcContext.bySleeperId,
    raByPlayerId: rosterAuditContext.bySleeperId,
    raPickValues: rosterAuditContext.pickValues,
    leagueContext,
    tradeMarket,
  };
  const draftRecap = buildDraftRecap({
    draft: recentDraft,
    picks: recentDraftPicks,
    ...recapSharedParams,
  });

  // Build recaps for every completed draft so the UI can offer a season switcher.
  const allDraftRecaps = allCompletedDrafts
    .map((draft) => buildDraftRecap({
      draft,
      picks: allDraftPicksMap[draft.draft_id] || [],
      ...recapSharedParams,
    }))
    .filter(Boolean);

  return {
    ...myTeam,
    isSuperflex: leagueContext.isSuperflex,
    myTeamLabel: myTeam.label,
    leagueTeams,
    leagueContext,
    fantasyCalcSource: {
      enabled: fantasyCalcContext.totalPlayers > 0,
      totalPlayers: fantasyCalcContext.totalPlayers,
      attribution: 'FantasyCalc',
      url: 'https://www.fantasycalc.com/',
    },
    rosterAuditSource: {
      enabled: rosterAuditContext.bySleeperId.size > 0,
      totalPlayers: rosterAuditContext.bySleeperId.size,
      pickValues: rosterAuditContext.pickValues,
      rankings: rosterAuditValues,
      attribution: 'RosterAudit',
      url: 'https://rosteraudit.com/',
    },
    scoringWeights,
    ageCurves: benchmarks.ageCurves,
    tradeMarket,
    tradeSuggestions,
    tradeBlock: myTeam.tradeablePlayers.slice(0, 8),
    leagueActivity,
    marketCompsBySleeperId,
    marketCompsSource: {
      enabled: marketCompsBySleeperId.size > 0,
      totalPlayers: marketCompsBySleeperId.size,
      totalTrades: Array.isArray(fantasyCalcTrades) ? fantasyCalcTrades.length : 0,
      attribution: 'FantasyCalc',
      url: 'https://www.fantasycalc.com/',
    },
    draftRecap,
    allDraftRecaps,
    ocOutlook: {
      targetSeason: ocTargetSeason,
      enabled: !!ocOutlookContext,
      byTeam: ocOutlookContext || {},
    },
  };
}
