import { DEFAULT_SCORING_WEIGHTS, buildBenchmarks } from './scoringEngine';
import { buildFantasyCalcContext, buildFantasyCalcPickMap } from './fantasyCalcBlend';
import { buildFantasyCalcTradeIndex } from './fantasyCalcTradeIndex';
import { buildRosterAuditContext } from './rosterAuditApi';
import { buildRosterSnapshot, classifyLeagueTeams, assignDraftSlots } from './rosterBuilder';
import { getLeagueRulesContext } from './marketValue';
import { buildTradeMarket, buildTradeSuggestions, evaluateTrade } from './tradeEngine';
import { buildPredictionContext } from './predictionEngine';
import { buildLeagueActivity } from './activityEngine';
import { buildTradeReview } from './tradeReview';
import { assignPositionRanks as _assignPositionRanks, assignPickRanks as _assignPickRanks } from './playerGrading';
import { buildDraftRecap } from './draftRecap';
import { buildOcOutlookContext } from './ocAdjustment';
import { buildCliffCalendar } from './cliffCalendar';
import { resolveUserAvatar } from './sleeperAvatar';

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
  getConvictionTier,
} from './playerGrading';

/**
 * Combined dynasty value lookup keyed by Sleeper player_id, for grading live
 * draft rosters. RosterAudit is preferred when present, FantasyCalc fills gaps —
 * the same precedence buildDraftRecap applies to its player values.
 */
function buildValueBySleeperId(fcBySleeperId, raBySleeperId) {
  const out = {};
  const add = (map, preferred) => {
    if (!map?.forEach) return;
    map.forEach((entry, sleeperId) => {
      const value = Number(entry?.value || 0);
      if (value <= 0) return;
      if (preferred || out[sleeperId] == null) out[sleeperId] = value;
    });
  };
  add(fcBySleeperId, false); // baseline
  add(raBySleeperId, true); // RA overrides FC
  return out;
}

const LIVE_DRAFT_POSITIONS = new Set([
  "QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB",
]);

/**
 * Value-ranked list of draftable players for the live "Best Available" board.
 * Joins the combined value map to the Sleeper players map for name/position/team
 * and keeps the top `limit` to bound the payload.
 */
function buildBestAvailablePool(valueBySleeperId, players, limit = 400) {
  const out = [];
  for (const [playerId, value] of Object.entries(valueBySleeperId)) {
    const p = players?.[playerId];
    if (!p) continue;
    // Drop retired / out-of-league players (Sleeper flags these active:false)
    // so stale names like a retired QB don't sit on the board with a misleading
    // historical PPG.
    if (p.active === false) continue;
    const position = (p.fantasy_positions?.[0] || p.position || "").toUpperCase();
    if (!LIVE_DRAFT_POSITIONS.has(position)) continue;
    const name =
      p.full_name ||
      `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
      `Player ${playerId}`;
    out.push({ playerId, name, position, team: p.team || "", value });
  }
  out.sort((a, b) => b.value - a.value);
  return out.slice(0, limit);
}

/**
 * Per-player points-per-game keyed by Sleeper id, for the live draft's expected
 * team PPG. Blends the last two seasons (recent weighted heavier) and uses the
 * scoring column that matches the league's PPR setting. A gp >= 6 floor avoids
 * small-sample inflation (same convention as scoringEngine). Players with no
 * qualifying season (e.g. rookies) simply contribute 0.
 */
function buildPpgBySleeperId(lastSeasonStats, priorSeasonStats, ppr = 1) {
  const col = ppr >= 1 ? "pts_ppr" : ppr >= 0.5 ? "pts_half_ppr" : "pts_std";
  const ppgOf = (stat) => {
    const gp = Number(stat?.gp || 0);
    if (gp < 6) return null;
    return (Number(stat?.[col]) || 0) / gp;
  };

  const out = {};
  const ids = new Set([
    ...Object.keys(lastSeasonStats || {}),
    ...Object.keys(priorSeasonStats || {}),
  ]);
  for (const id of ids) {
    const recent = ppgOf(lastSeasonStats?.[id]);
    const prior = ppgOf(priorSeasonStats?.[id]);
    let ppg;
    if (recent != null && prior != null) ppg = recent * 0.65 + prior * 0.35;
    else ppg = recent ?? prior ?? 0;
    if (ppg > 0) out[id] = ppg;
  }
  return out;
}

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
  liveDraft = null,
  liveDraftPicks = [],
  projPctileMap = null, // player_id → forward production percentile (weekly engine)
  valueSnapshots = null, // dated value snapshots for trade "value then" (see tradeReview)
  contractMap = null, // sleeper_id → current contract (player_contracts; see contractsApi)
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
  const userAvatarById = new Map(
    users.map((user) => [user.user_id, resolveUserAvatar(user, { thumb: true })]),
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
  // Make FantasyCalc's own pick values the source of truth for pick pricing, so
  // picks and players share one market scale everywhere getAssetTradeValue →
  // pickFcValue runs (Trade Calculator, Targets, Finder). Attached to the
  // leagueContext that flows to those surfaces.
  leagueContext.fcPickValues = buildFantasyCalcPickMap(fantasyCalcValues);
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

  const completedDraftSeasons = new Set(
    (sleeperDrafts || [])
      .filter((d) => d.status === "complete")
      .map((d) => String(d.season)),
  );

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
      completedDraftSeasons,
      projPctileMap,
      contractMap,
    ),
  );

  for (const team of leagueTeams) {
    team.avatar = userAvatarById.get(team.ownerId) || null;
  }

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

  // Rank each team's draft pick capital 1..N across the league.
  _assignPickRanks(leagueTeams, leagueContext, tradeMarket);
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
  // Dynasty Oracle's own per-player model value, for the "Oracle" trade lens.
  // Built from the enriched rosters (every traded player is owned by some league
  // team). Prefer the pure internal-model value; fall back to the fused dynasty
  // value, then market value, then the composite score.
  const internalByPlayerId = new Map();
  for (const team of leagueTeams) {
    for (const p of team.enriched || []) {
      const v = Number(
        p.internalValue ?? p.dynastyValue?.value ?? p.marketValue ?? p.score ?? 0,
      );
      if (p.id != null && v > 0) internalByPlayerId.set(String(p.id), { value: v });
    }
  }
  const tradeReview = buildTradeReview({
    transactions,
    rosterLabelById,
    players,
    fcByPlayerId: fantasyCalcContext.bySleeperId,
    raByPlayerId: rosterAuditContext.bySleeperId,
    internalByPlayerId,
    leagueContext,
    sleeperDrafts,
    allDraftPicksMap,
    rosters,
    valueSnapshots,
  });

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

  // Live-draft value lookup + best-available pool (only built when a draft is in
  // progress, so we don't pay for it on the normal dashboard path).
  const liveValueBySleeperId = liveDraft
    ? buildValueBySleeperId(
        fantasyCalcContext.bySleeperId,
        rosterAuditContext.bySleeperId,
      )
    : {};
  const bestAvailablePool = liveDraft
    ? buildBestAvailablePool(liveValueBySleeperId, players)
    : [];
  const livePpgBySleeperId = liveDraft
    ? buildPpgBySleeperId(stats24, stats23, leagueContext.ppr)
    : {};

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
    cliffCalendar: buildCliffCalendar(myTeam, leagueContext),
    leagueActivity,
    tradeReview,
    marketCompsBySleeperId,
    marketCompsSource: {
      enabled: marketCompsBySleeperId.size > 0,
      totalPlayers: marketCompsBySleeperId.size,
      totalTrades: Array.isArray(fantasyCalcTrades) ? fantasyCalcTrades.length : 0,
      attribution: 'FantasyCalc',
      url: 'https://www.fantasycalc.com/',
    },
    fantasyCalcTrades,
    draftRecap,
    allDraftRecaps,
    // In-progress draft passed straight through; the LiveDraftTab polls Sleeper
    // for fresh picks rather than depending on this one-time analysis build.
    // valueBySleeperId lets the tab grade rosters live (RosterAudit preferred,
    // FantasyCalc fallback — same precedence the draft recap uses).
    // bestAvailablePool is the value-ranked board the tab filters drafted
    // players out of.
    liveDraft: liveDraft
      ? {
          draft: liveDraft,
          initialPicks: liveDraftPicks,
          rosterPositions: league.roster_positions || [],
          valueBySleeperId: liveValueBySleeperId,
          ppgBySleeperId: livePpgBySleeperId,
          bestAvailablePool,
          leagueId: league.league_id,
          players,
          tradeTransactions: (transactions || []).filter(
            (t) => t?.type === "trade",
          ),
          // Everything buildTradeReview needs *except* transactions, so the live
          // tab can re-grade over freshly-polled draft trades with the exact same
          // engine the Activity-tab Trade Report Card uses.
          tradeReviewInputs: {
            rosterLabelById,
            players,
            fcByPlayerId: fantasyCalcContext.bySleeperId,
            raByPlayerId: rosterAuditContext.bySleeperId,
            internalByPlayerId,
            leagueContext,
            sleeperDrafts,
            allDraftPicksMap,
            rosters,
            valueSnapshots,
          },
        }
      : null,
    ocOutlook: {
      targetSeason: ocTargetSeason,
      enabled: !!ocOutlookContext,
      byTeam: ocOutlookContext || {},
    },
  };
}
