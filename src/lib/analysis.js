import { DEFAULT_SCORING_WEIGHTS, buildBenchmarks } from './scoringEngine';
import { buildFantasyCalcContext } from './fantasyCalcBlend';
import { buildRosterSnapshot, classifyLeagueTeams } from './rosterBuilder';
import { getLeagueRulesContext } from './marketValue';
import { buildTradeMarket, buildTradeSuggestions, evaluateTrade } from './tradeEngine';
import { buildPredictionContext } from './predictionEngine';
import { buildLeagueActivity } from './activityEngine';

// Re-exports — consumers that import from 'analysis' still work unchanged.
export { DEFAULT_SCORING_WEIGHTS, draftTierLabel } from './scoringEngine';
export { classifyLeagueTeams } from './rosterBuilder';
export { evaluateTrade } from './tradeEngine';
export {
  getVerdict,
  getColor,
  getRoomGrade,
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
) {
  const currentYear = new Date().getFullYear();
  const futureSeasons = [currentYear, currentYear + 1, currentYear + 2];
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
    ),
  );

  // Classify all teams relative to each other (contender / retool / rebuild)
  classifyLeagueTeams(leagueTeams, leagueContext);

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
    scoringWeights,
    tradeMarket,
    tradeSuggestions,
    tradeBlock: myTeam.tradeablePlayers.slice(0, 8),
    leagueActivity,
  };
}
