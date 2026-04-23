import { DEFAULT_SCORING_WEIGHTS, buildBenchmarks } from './scoringEngine';
import { buildFantasyCalcContext } from './fantasyCalcBlend';
import { buildRosterAuditContext } from './rosterAuditApi';
import { buildRosterSnapshot, classifyLeagueTeams, assignDraftSlots } from './rosterBuilder';
import { getLeagueRulesContext } from './marketValue';
import { buildTradeMarket, buildTradeSuggestions, evaluateTrade } from './tradeEngine';
import { buildPredictionContext } from './predictionEngine';
import { buildLeagueActivity } from './activityEngine';
import { assignPositionRanks as _assignPositionRanks } from './playerGrading';

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
    ),
  );

  // Classify all teams relative to each other (contender / retool / rebuild)
  classifyLeagueTeams(leagueTeams, leagueContext);

  // Extract draft order from Sleeper drafts endpoint.
  // The drafts array may contain multiple drafts; find the one for the
  // upcoming season (currentYear) with a draft_order set.
  let knownDraftSlots = null;
  if (sleeperDrafts?.length) {
    const targetSeason = String(currentYear);
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
  };
}
