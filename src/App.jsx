import { useEffect, useRef, useState } from "react";
import Dashboard from "./components/Dashboard";
import DashboardSkeleton from "./components/DashboardSkeleton";
import ErrorBoundary from "./components/ErrorBoundary";
import ExploreScreen from "./components/ExploreScreen";
import InputScreen from "./components/InputScreen";
import Layout from "./components/Layout";
import LeaguePickerScreen from "./components/LeaguePickerScreen";
import LoadingScreen from "./components/LoadingScreen";
import { identify } from "./lib/analytics";
import { fetchAiAdvice } from "./lib/aiAdviceApi";
import { buildRosterAnalysis, DEFAULT_SCORING_WEIGHTS } from "./lib/analysis";
import { fetchFantasyCalcValues, fetchFantasyCalcTrades } from "./lib/fantasyCalcApi";
import { fetchSeasonPaceProjPercentiles } from "./lib/projectionsApi";
import { fetchPlayerContractMap } from "./lib/contractsApi";
import {
  fetchRosterAuditValues,
  fetchRosterAuditPicks,
} from "./lib/rosterAuditApi";
import {
  fetchFFUserLeagues,
  loadFleaflickerLeague,
} from "./lib/fleaflickerApi";
import { loadEspnLeague, fetchEspnLeagueTeams } from "./lib/espnApi";
import { deriveFormatMode } from "./lib/formatMode";
import {
  fetchDeepHistoricalStats,
  fetchDraftPicks,
  fetchHistoricalStats,
  fetchLeagueTransactions,
  fetchPlayersDb,
  fetchSleeper,
  safeLocalStorageWrite,
} from "./lib/sleeperApi";
import { fetchTradeValueSnapshots, signOutAccount, getAccount, getSleeperUsername, setSleeperUsername } from "./lib/supabase";

const NINE_MONTHS_MS = 9 * 30 * 24 * 60 * 60 * 1000;

function pickRecentCompletedDraft(drafts = []) {
  return (
    drafts
      .filter(
        (d) =>
          d.status === "complete" &&
          d.start_time &&
          Date.now() - Number(d.start_time) < NINE_MONTHS_MS,
      )
      .sort((a, b) => Number(b.start_time) - Number(a.start_time))[0] || null
  );
}

export default function App() {
  const [platform, setPlatform] = useState(
    () => localStorage.getItem("dynasty_os_platform") || "sleeper",
  );
  const [step, setStep] = useState(() => {
    const savedPlatform = localStorage.getItem("dynasty_os_platform");
    if (savedPlatform === "fleaflicker") {
      return localStorage.getItem("ff_email") &&
        localStorage.getItem("ff_league")
        ? "loading"
        : "input";
    }
    if (savedPlatform === "espn") {
      return localStorage.getItem("espn_league") ? "loading" : "input";
    }
    const savedUsername = localStorage.getItem("sleeper_username");
    const savedLeague = localStorage.getItem("sleeper_league");
    return savedUsername && savedLeague ? "loading" : "input";
  });
  const [username, setUsername] = useState(
    () => localStorage.getItem("sleeper_username") || "",
  );
  const [ffEmail, setFfEmail] = useState(
    () => localStorage.getItem("ff_email") || "",
  );
  // ESPN connect inputs: league id + the two private-league cookies. Persisted
  // in the browser only (never server-side), like the Fleaflicker email.
  const [espnLeagueId, setEspnLeagueId] = useState(
    () => localStorage.getItem("espn_league_id") || "",
  );
  const [espnS2, setEspnS2] = useState(
    () => localStorage.getItem("espn_s2") || "",
  );
  const [espnSwid, setEspnSwid] = useState(
    () => localStorage.getItem("espn_swid") || "",
  );
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(() => {
    try {
      const savedPlatform = localStorage.getItem("dynasty_os_platform");
      const key =
        savedPlatform === "fleaflicker"
          ? "ff_league"
          : savedPlatform === "espn"
            ? "espn_league"
            : "sleeper_league";
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState("");

  // Monotonic token: bumped at the start of every load so background enrichment
  // from a superseded load (e.g. the user switched leagues) can detect it's stale
  // and skip its setState instead of clobbering the current league's analysis.
  const loadTokenRef = useRef(0);
  // Latest scoring weights, readable from an in-flight enrichment closure without
  // recapturing — keeps a weight change made during enrichment from being undone.
  // Seeded with the default (scoringWeights state is declared below); an effect
  // keeps it in sync.
  const scoringWeightsRef = useRef(DEFAULT_SCORING_WEIGHTS);
  const [analysis, setAnalysis] = useState(null);
  // Dynasty vs redraft. `formatMode` is the resolved mode used for the current
  // analysis; `formatModeOverride` is the user's manual pick (persisted), which
  // wins over auto-detection until they switch leagues. See formatMode.js.
  const [formatMode, setFormatMode] = useState("dynasty");
  const [formatModeOverride, setFormatModeOverride] = useState(
    () => localStorage.getItem("format_mode_override") || null,
  );
  const [activeTab, setActiveTab] = useState("overview");
  const [showGradeKey, setShowGradeKey] = useState(false);
  const [showScoreWeights, setShowScoreWeights] = useState(false);
  const [scoringWeights, setScoringWeights] = useState(DEFAULT_SCORING_WEIGHTS);
  const [recalculating, setRecalculating] = useState(false);
  const [analysisPayload, setAnalysisPayload] = useState(null);
  const [collapsedRooms, setCollapsedRooms] = useState({});
  const [expandedBars, setExpandedBars] = useState({});
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  async function handleGetAIAdvice() {
    if (!analysis || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    try {
      const { advice } = await fetchAiAdvice(analysis, selectedLeague);
      setAiAdvice(advice);
    } catch (e) {
      setAiError(e.message || "Failed to generate AI advice.");
    } finally {
      setAiLoading(false);
    }
  }

  function computeAnalysis(payload, nextWeights = scoringWeights, mode = formatMode) {
    return buildRosterAnalysis(
      payload.myRoster,
      payload.players,
      payload.league,
      payload.tradedPicks,
      payload.stats24,
      payload.stats23,
      payload.stats22,
      payload.transactions,
      payload.fantasyCalcValues,
      payload.users,
      payload.rosters,
      payload.historicalStats,
      nextWeights,
      payload.lastSeason,
      payload.rosterAuditValues,
      payload.rosterAuditPicks,
      payload.sleeperDrafts,
      payload.fantasyCalcTrades,
      payload.currentDraftComplete ? "complete" : null,
      payload.recentDraft,
      payload.recentDraftPicks,
      payload.allCompletedDrafts,
      payload.allDraftPicksMap,
      payload.liveDraft,
      payload.liveDraftPicks,
      payload.projPctileMap ?? null,
      payload.valueSnapshots ?? null,
      payload.contractMap ?? null,
      mode,
    );
  }

  function toggleRoom(pos) {
    setCollapsedRooms((prev) => ({ ...prev, [pos]: !prev[pos] }));
  }

  function toggleBars(id) {
    setExpandedBars((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  useEffect(() => {
    const id = platform === "fleaflicker" ? ffEmail : username;
    if (id) identify(id, { platform });
  }, [username, ffEmail, platform]);

  useEffect(() => {
    scoringWeightsRef.current = scoringWeights;
  }, [scoringWeights]);

  useEffect(() => {
    const savedPlatform = localStorage.getItem("dynasty_os_platform");

    if (savedPlatform === "fleaflicker") {
      const savedEmail = localStorage.getItem("ff_email");
      const savedLeague = localStorage.getItem("ff_league");
      if (savedEmail && savedLeague) {
        setFfEmail(savedEmail);
        setPlatform("fleaflicker");
        loadFleaflickerDashboard(JSON.parse(savedLeague));
      }
    } else if (savedPlatform === "espn") {
      const savedLeague = localStorage.getItem("espn_league");
      if (savedLeague) {
        setPlatform("espn");
        loadEspnDashboard(JSON.parse(savedLeague));
      }
    } else {
      const savedUsername = localStorage.getItem("sleeper_username");
      const savedLeague = localStorage.getItem("sleeper_league");
      if (savedUsername && savedLeague) {
        setUsername(savedUsername);
        loadDashboard(JSON.parse(savedLeague), savedUsername);
      }
    }
  }, []);

  async function loadDashboard(league, uname, { returnToLeagues = false } = {}) {
    const token = (loadTokenRef.current += 1);
    setSelectedLeague(league);
    setLoading(true);
    setEnriching(false);
    setError("");

    try {
      const now = new Date();
      const lastSeason =
        now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

      // Per-request progress: each fetch ticks the counter as it resolves so the
      // skeleton can show a real "x of N" bar instead of a static spinner. Promise.all
      // resolves in arbitrary order, so `label` reflects the most recent completion.
      let done = 0;
      let total = 0;
      const track = (label, p) =>
        p.finally(() => {
          done += 1;
          setLoadProgress({ done, total, label });
        });
      const step = (label) => {
        done += 1;
        setLoadProgress({ done, total, label });
      };

      // ----- Tier 1 (core): everything needed for a correct Overview / Roster /
      // Trades / League first paint. The dashboard renders the moment these land.
      const coreTasks = [
        track("League managers", fetchSleeper(`/league/${league.league_id}/users`)),
        track("Rosters", fetchSleeper(`/league/${league.league_id}/rosters`)),
        track("Player database", fetchPlayersDb().catch(() => ({}))),
        track("Traded picks", fetchSleeper(`/league/${league.league_id}/traded_picks`).catch(
          () => [],
        )),
        track("Recent stats", fetchSleeper(`/stats/nfl/regular/${lastSeason}`).catch(() => ({}))),
        track("Recent stats", fetchSleeper(`/stats/nfl/regular/${lastSeason - 1}`).catch(() => ({}))),
        track("Recent stats", fetchSleeper(`/stats/nfl/regular/${lastSeason - 2}`).catch(() => ({}))),
        track("League activity", fetchLeagueTransactions(league).catch(() => [])),
        track("Player values", fetchFantasyCalcValues(league).catch(() => [])),
        track("Player values", fetchRosterAuditValues(league).catch(() => [])),
        track("Pick values", fetchRosterAuditPicks().catch(() => null)),
        track("Drafts", fetchSleeper(`/league/${league.league_id}/drafts`).catch(() => [])),
      ];
      total = coreTasks.length + 1; // +1 analysis crunch
      setLoadProgress({ done: 0, total, label: "Connecting…" });

      const [
        users,
        rosters,
        players,
        tradedPicks,
        stats24,
        stats23,
        stats22,
        transactions,
        fantasyCalcValues,
        rosterAuditValues,
        rosterAuditPicks,
        sleeperDrafts,
      ] = await Promise.all(coreTasks);

      const userObj = users.find(
        (u) => u.display_name?.toLowerCase() === uname.toLowerCase(),
      );
      if (!userObj)
        throw new Error("Could not find your roster in this league.");

      const myRoster = rosters.find((r) => r.owner_id === userObj.user_id);
      if (!myRoster) throw new Error("Roster not found.");

      // Draft metadata is derived from the (already-fetched) drafts list — no
      // network. The picks themselves are fetched in Tier 2.
      const recentDraft = pickRecentCompletedDraft(sleeperDrafts);
      const allCompletedDrafts = [...sleeperDrafts]
        .filter((d) => d.status === "complete" && d.start_time)
        .sort((a, b) => Number(b.start_time) - Number(a.start_time))
        .slice(0, 5);
      const liveDraft = sleeperDrafts.find(
        (d) =>
          d.status === "drafting" ||
          d.status === "paused" ||
          d.status === "pre_draft",
      ) || null;

      // Tier-2 fields start empty; buildRosterAnalysis already defaults them, so
      // the first render is correct, just lighter (no deep age curves, market
      // comps, or draft recaps yet).
      const corePayload = {
        myRoster,
        players,
        league,
        tradedPicks,
        stats24,
        stats23,
        stats22,
        transactions,
        fantasyCalcValues,
        fantasyCalcTrades: [],
        rosterAuditValues,
        rosterAuditPicks,
        sleeperDrafts,
        recentDraft,
        recentDraftPicks: [],
        liveDraft,
        liveDraftPicks: [],
        allCompletedDrafts,
        allDraftPicksMap: {},
        users,
        rosters,
        lastSeason,
        historicalStats: [],
      };

      step("Crunching analysis");
      // Resolve dynasty vs redraft from the normalized league (unless the user
      // has overridden it). Captured here so the enrichment recompute reuses it.
      const mode = formatModeOverride || deriveFormatMode(corePayload.league);
      setFormatMode(mode);
      setAnalysisPayload(corePayload);
      setAnalysis(computeAnalysis(corePayload, scoringWeightsRef.current, mode));
      setStep("dashboard");
      setLoading(false);
      setLoadProgress(null);

      // ----- Tier 2 (enrichment): deep history, market comps, and draft picks,
      // fetched after first paint. Recompute the full analysis when they land.
      setEnriching(true);
      (async () => {
        try {
          const [
            stats21, stats20, stats19, stats18,
            stats17, stats16, stats15, stats14,
            stats13, stats12, stats11, stats10, stats09,
            fantasyCalcTrades,
            liveDraftPicks,
            projPctileMap,
            contractMap,
          ] = await Promise.all([
            fetchHistoricalStats(2021),
            fetchHistoricalStats(2020),
            fetchHistoricalStats(2019),
            fetchHistoricalStats(2018),
            fetchDeepHistoricalStats(2017),
            fetchDeepHistoricalStats(2016),
            fetchDeepHistoricalStats(2015),
            fetchDeepHistoricalStats(2014),
            fetchDeepHistoricalStats(2013),
            fetchDeepHistoricalStats(2012),
            fetchDeepHistoricalStats(2011),
            fetchDeepHistoricalStats(2010),
            fetchDeepHistoricalStats(2009),
            fetchFantasyCalcTrades(league).catch(() => []),
            liveDraft
              ? fetchDraftPicks(liveDraft.draft_id).catch(() => [])
              : Promise.resolve([]),
            // Forward production percentiles from the nflverse-enriched weekly
            // projections (upcoming season) → fused dynasty value. Best-effort.
            fetchSeasonPaceProjPercentiles(lastSeason + 1).catch(() => new Map()),
            // Active-player contracts (OTC via nflverse) → roster + deep-dive. Best-effort.
            fetchPlayerContractMap().catch(() => new Map()),
          ]);

          const allDraftPicksResults = await Promise.all(
            allCompletedDrafts.map((d) => fetchDraftPicks(d.draft_id).catch(() => [])),
          );
          const allDraftPicksMap = {};
          allCompletedDrafts.forEach((d, i) => {
            allDraftPicksMap[d.draft_id] = allDraftPicksResults[i];
          });
          const recentDraftPicks = recentDraft
            ? (allDraftPicksMap[recentDraft.draft_id] || [])
            : [];

          // Dated value snapshots for the Trade Report Card's "value then" lens.
          // Scoped to the players actually involved in trades (traded players +
          // players drafted with traded picks) so the query stays bounded. Empty
          // until snapshots accumulate; the card degrades to value-now gracefully.
          const snapshotIds = new Set();
          for (const tx of corePayload.transactions || []) {
            if (tx.type !== "trade") continue;
            for (const pid of Object.keys(tx.adds || {})) snapshotIds.add(String(pid));
          }
          for (const picks of Object.values(allDraftPicksMap)) {
            for (const p of picks || []) {
              if (p.player_id) snapshotIds.add(String(p.player_id));
            }
          }
          const valueSnapshots = await fetchTradeValueSnapshots([...snapshotIds]).catch(
            () => null,
          );

          // A newer load (e.g. league switch) superseded us — drop this result.
          if (loadTokenRef.current !== token) return;

          const fullPayload = {
            ...corePayload,
            fantasyCalcTrades,
            recentDraftPicks,
            liveDraftPicks,
            allDraftPicksMap,
            valueSnapshots,
            projPctileMap,
            contractMap,
            historicalStats: [
              { year: 2021, stats: stats21 },
              { year: 2020, stats: stats20 },
              { year: 2019, stats: stats19 },
              { year: 2018, stats: stats18 },
              { year: 2017, stats: stats17 },
              { year: 2016, stats: stats16 },
              { year: 2015, stats: stats15 },
              { year: 2014, stats: stats14 },
              { year: 2013, stats: stats13 },
              { year: 2012, stats: stats12 },
              { year: 2011, stats: stats11 },
              { year: 2010, stats: stats10 },
              { year: 2009, stats: stats09 },
            ],
          };

          setAnalysisPayload(fullPayload);
          setAnalysis(computeAnalysis(fullPayload, scoringWeightsRef.current, mode));
        } catch {
          // Enrichment is best-effort; the core analysis already rendered.
        } finally {
          if (loadTokenRef.current === token) setEnriching(false);
        }
      })();
    } catch (e) {
      localStorage.removeItem("sleeper_league");
      setError(e.message || "Failed to load dashboard. Try selecting your league again.");
      setStep(returnToLeagues ? "leagues" : "input");
      setLoading(false);
      setLoadProgress(null);
    }
  }

  async function loadFleaflickerDashboard(league, { returnToLeagues = false } = {}) {
    const token = (loadTokenRef.current += 1);
    setSelectedLeague(league);
    setLoading(true);
    setEnriching(false);
    setError("");

    try {
      const now = new Date();
      const lastSeason =
        now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

      // Per-request progress: each fetch ticks the counter so the skeleton can show
      // a real "x of N" bar. See loadDashboard for the same pattern.
      let done = 0;
      let total = 0;
      const track = (label, p) =>
        p.finally(() => {
          done += 1;
          setLoadProgress({ done, total, label });
        });
      const step = (label) => {
        done += 1;
        setLoadProgress({ done, total, label });
      };

      // ----- Tier 1 (core): Sleeper player DB + recent stats, then normalize the
      // Fleaflicker league, then current-season values. Enough for first paint.
      const corePhase1 = [
        track("Player database", fetchPlayersDb().catch(() => ({}))),
        track("Recent stats", fetchSleeper(`/stats/nfl/regular/${lastSeason}`).catch(() => ({}))),
        track("Recent stats", fetchSleeper(`/stats/nfl/regular/${lastSeason - 1}`).catch(() => ({}))),
        track("Recent stats", fetchSleeper(`/stats/nfl/regular/${lastSeason - 2}`).catch(() => ({}))),
      ];
      // +1 Fleaflicker normalize, +3 value fetches, +1 analysis crunch.
      total = corePhase1.length + 1 + 3 + 1;
      setLoadProgress({ done: 0, total, label: "Connecting…" });

      const [players, stats24, stats23, stats22] = await Promise.all(corePhase1);

      // Phase 2: Normalize Fleaflicker data (mutates players with synthetic entries)
      step("Your league");
      const ffData = await loadFleaflickerLeague(
        league._ff_league_id,
        league._ff_team_id,
        players,
      );

      // Fold the normalized roster/scoring settings into selectedLeague so tabs
      // reading it directly (Power Rankings, Projections) get real lineup slots.
      setSelectedLeague((prev) => ({
        ...(prev || league),
        roster_positions: ffData.league.roster_positions,
        scoring_settings: ffData.league.scoring_settings,
        settings: { ...(league.settings || {}), ...ffData.league.settings },
        total_rosters: ffData.league.total_rosters,
      }));

      // Phase 3: current-season values, using normalized league settings.
      const [fantasyCalcValues, rosterAuditValues, rosterAuditPicks] =
        await Promise.all([
          track("Player values", fetchFantasyCalcValues(ffData.league).catch(() => [])),
          track("Player values", fetchRosterAuditValues(ffData.league).catch(() => [])),
          track("Pick values", fetchRosterAuditPicks().catch(() => null)),
        ]);

      // Tier-2 fields (deep history, market comps) start empty — defaulted by
      // buildRosterAnalysis — and are filled in after first paint.
      const corePayload = {
        myRoster: ffData.myRoster,
        players,
        league: ffData.league,
        tradedPicks: ffData.tradedPicks,
        currentDraftComplete: ffData.currentDraftComplete,
        stats24,
        stats23,
        stats22,
        transactions: ffData.transactions,
        fantasyCalcValues,
        fantasyCalcTrades: [],
        rosterAuditValues,
        rosterAuditPicks,
        users: ffData.users,
        rosters: ffData.rosters,
        lastSeason,
        historicalStats: [],
      };

      step("Crunching analysis");
      // Resolve dynasty vs redraft from the normalized league (unless the user
      // has overridden it). Captured here so the enrichment recompute reuses it.
      const mode = formatModeOverride || deriveFormatMode(corePayload.league);
      setFormatMode(mode);
      setAnalysisPayload(corePayload);
      setAnalysis(computeAnalysis(corePayload, scoringWeightsRef.current, mode));
      setStep("dashboard");
      setLoading(false);
      setLoadProgress(null);

      // ----- Tier 2 (enrichment): deep history + market comps after first paint.
      const ffLeague = ffData.league;
      setEnriching(true);
      (async () => {
        try {
          const [
            stats21, stats20, stats19, stats18,
            stats17, stats16, stats15, stats14,
            stats13, stats12, stats11, stats10, stats09,
            fantasyCalcTrades,
            projPctileMap,
          ] = await Promise.all([
            fetchHistoricalStats(2021),
            fetchHistoricalStats(2020),
            fetchHistoricalStats(2019),
            fetchHistoricalStats(2018),
            fetchDeepHistoricalStats(2017),
            fetchDeepHistoricalStats(2016),
            fetchDeepHistoricalStats(2015),
            fetchDeepHistoricalStats(2014),
            fetchDeepHistoricalStats(2013),
            fetchDeepHistoricalStats(2012),
            fetchDeepHistoricalStats(2011),
            fetchDeepHistoricalStats(2010),
            fetchDeepHistoricalStats(2009),
            fetchFantasyCalcTrades(ffLeague).catch(() => []),
            // Forward production percentiles (upcoming season) → drives redraft
            // rankings and the fused value's present signal. Best-effort.
            fetchSeasonPaceProjPercentiles(lastSeason + 1).catch(() => new Map()),
          ]);

          if (loadTokenRef.current !== token) return;

          const fullPayload = {
            ...corePayload,
            fantasyCalcTrades,
            projPctileMap,
            historicalStats: [
              { year: 2021, stats: stats21 },
              { year: 2020, stats: stats20 },
              { year: 2019, stats: stats19 },
              { year: 2018, stats: stats18 },
              { year: 2017, stats: stats17 },
              { year: 2016, stats: stats16 },
              { year: 2015, stats: stats15 },
              { year: 2014, stats: stats14 },
              { year: 2013, stats: stats13 },
              { year: 2012, stats: stats12 },
              { year: 2011, stats: stats11 },
              { year: 2010, stats: stats10 },
              { year: 2009, stats: stats09 },
            ],
          };

          setAnalysisPayload(fullPayload);
          setAnalysis(computeAnalysis(fullPayload, scoringWeightsRef.current, mode));
        } catch {
          // Enrichment is best-effort; the core analysis already rendered.
        } finally {
          if (loadTokenRef.current === token) setEnriching(false);
        }
      })();
    } catch (e) {
      localStorage.removeItem("ff_league");
      setError(e.message || "Failed to load Fleaflicker dashboard. Try selecting your league again.");
      setStep(returnToLeagues ? "leagues" : "input");
      setLoading(false);
      setLoadProgress(null);
    }
  }

  // ESPN dashboard loader. Structurally identical to loadFleaflickerDashboard —
  // the only substantive difference is the normalizer (loadEspnLeague) and that
  // it forwards the private-league cookies, read from localStorage so a restored
  // session on reload still has them.
  async function loadEspnDashboard(league, { returnToLeagues = false } = {}) {
    const token = (loadTokenRef.current += 1);
    setSelectedLeague(league);
    setLoading(true);
    setEnriching(false);
    setError("");

    try {
      const now = new Date();
      const lastSeason =
        now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

      let done = 0;
      let total = 0;
      const track = (label, p) =>
        p.finally(() => {
          done += 1;
          setLoadProgress({ done, total, label });
        });
      const step = (label) => {
        done += 1;
        setLoadProgress({ done, total, label });
      };

      const corePhase1 = [
        track("Player database", fetchPlayersDb().catch(() => ({}))),
        track("Recent stats", fetchSleeper(`/stats/nfl/regular/${lastSeason}`).catch(() => ({}))),
        track("Recent stats", fetchSleeper(`/stats/nfl/regular/${lastSeason - 1}`).catch(() => ({}))),
        track("Recent stats", fetchSleeper(`/stats/nfl/regular/${lastSeason - 2}`).catch(() => ({}))),
      ];
      total = corePhase1.length + 1 + 3 + 1;
      setLoadProgress({ done: 0, total, label: "Connecting…" });

      const [players, stats24, stats23, stats22] = await Promise.all(corePhase1);

      step("Your league");
      const creds = {
        espn_s2: localStorage.getItem("espn_s2") || espnS2 || "",
        swid: localStorage.getItem("espn_swid") || espnSwid || "",
        season: league.season,
      };
      const espnData = await loadEspnLeague(
        league._espn_league_id,
        league._espn_team_id,
        players,
        creds,
      );

      // The picker stub has no roster/scoring settings — fold in the normalized
      // league's so tabs reading `selectedLeague` directly (Power Rankings,
      // Projections, Waivers) get real lineup slots and scoring, not defaults.
      setSelectedLeague((prev) => ({
        ...(prev || league),
        roster_positions: espnData.league.roster_positions,
        scoring_settings: espnData.league.scoring_settings,
        settings: { ...(league.settings || {}), ...espnData.league.settings },
        total_rosters: espnData.league.total_rosters,
        // Real fantasy matchup schedule → schedule-aware Power Rankings sim.
        schedule: espnData.schedule,
      }));

      const [fantasyCalcValues, rosterAuditValues, rosterAuditPicks] =
        await Promise.all([
          track("Player values", fetchFantasyCalcValues(espnData.league).catch(() => [])),
          track("Player values", fetchRosterAuditValues(espnData.league).catch(() => [])),
          track("Pick values", fetchRosterAuditPicks().catch(() => null)),
        ]);

      const corePayload = {
        myRoster: espnData.myRoster,
        players,
        league: espnData.league,
        tradedPicks: espnData.tradedPicks,
        currentDraftComplete: espnData.currentDraftComplete,
        stats24,
        stats23,
        stats22,
        transactions: espnData.transactions,
        fantasyCalcValues,
        fantasyCalcTrades: [],
        rosterAuditValues,
        rosterAuditPicks,
        users: espnData.users,
        rosters: espnData.rosters,
        lastSeason,
        historicalStats: [],
      };

      step("Crunching analysis");
      // Resolve dynasty vs redraft from the normalized league (unless the user
      // has overridden it). Captured here so the enrichment recompute reuses it.
      const mode = formatModeOverride || deriveFormatMode(corePayload.league);
      setFormatMode(mode);
      setAnalysisPayload(corePayload);
      setAnalysis(computeAnalysis(corePayload, scoringWeightsRef.current, mode));
      setStep("dashboard");
      setLoading(false);
      setLoadProgress(null);

      const espnLeague = espnData.league;
      setEnriching(true);
      (async () => {
        try {
          const [
            stats21, stats20, stats19, stats18,
            stats17, stats16, stats15, stats14,
            stats13, stats12, stats11, stats10, stats09,
            fantasyCalcTrades,
            projPctileMap,
          ] = await Promise.all([
            fetchHistoricalStats(2021),
            fetchHistoricalStats(2020),
            fetchHistoricalStats(2019),
            fetchHistoricalStats(2018),
            fetchDeepHistoricalStats(2017),
            fetchDeepHistoricalStats(2016),
            fetchDeepHistoricalStats(2015),
            fetchDeepHistoricalStats(2014),
            fetchDeepHistoricalStats(2013),
            fetchDeepHistoricalStats(2012),
            fetchDeepHistoricalStats(2011),
            fetchDeepHistoricalStats(2010),
            fetchDeepHistoricalStats(2009),
            fetchFantasyCalcTrades(espnLeague).catch(() => []),
            // Forward production percentiles (upcoming season) → drives redraft
            // rankings and the fused value's present signal. Best-effort.
            fetchSeasonPaceProjPercentiles(lastSeason + 1).catch(() => new Map()),
          ]);

          if (loadTokenRef.current !== token) return;

          const fullPayload = {
            ...corePayload,
            fantasyCalcTrades,
            projPctileMap,
            historicalStats: [
              { year: 2021, stats: stats21 },
              { year: 2020, stats: stats20 },
              { year: 2019, stats: stats19 },
              { year: 2018, stats: stats18 },
              { year: 2017, stats: stats17 },
              { year: 2016, stats: stats16 },
              { year: 2015, stats: stats15 },
              { year: 2014, stats: stats14 },
              { year: 2013, stats: stats13 },
              { year: 2012, stats: stats12 },
              { year: 2011, stats: stats11 },
              { year: 2010, stats: stats10 },
              { year: 2009, stats: stats09 },
            ],
          };

          setAnalysisPayload(fullPayload);
          setAnalysis(computeAnalysis(fullPayload, scoringWeightsRef.current, mode));
        } catch {
          // Enrichment is best-effort; the core analysis already rendered.
        } finally {
          if (loadTokenRef.current === token) setEnriching(false);
        }
      })();
    } catch (e) {
      localStorage.removeItem("espn_league");
      setError(e.message || "Failed to load ESPN dashboard. Check your league ID (and cookies for a private league).");
      setStep(returnToLeagues ? "leagues" : "input");
      setLoading(false);
      setLoadProgress(null);
    }
  }

  async function handleConfirmScoreWeights(nextWeights) {
    setRecalculating(true);
    setScoringWeights(nextWeights);

    await new Promise((resolve) => setTimeout(resolve, 120));

    if (analysisPayload) {
      const nextAnalysis = computeAnalysis(analysisPayload, nextWeights);
      setAnalysis(nextAnalysis);
    }

    setRecalculating(false);
    setShowScoreWeights(false);
  }

  // Toggle dynasty ↔ redraft. The choice is an override that persists (and beats
  // auto-detection) until the user switches leagues. Recomputes from the cached
  // payload — no refetch — like the score-weights recompute above.
  async function handleToggleFormatMode(nextMode) {
    if (nextMode === formatMode) return;
    setRecalculating(true);
    setFormatMode(nextMode);
    setFormatModeOverride(nextMode);
    localStorage.setItem("format_mode_override", nextMode);

    await new Promise((resolve) => setTimeout(resolve, 120));

    if (analysisPayload) {
      setAnalysis(computeAnalysis(analysisPayload, scoringWeightsRef.current, nextMode));
    }
    setRecalculating(false);
  }

  // Fetch a Sleeper user's leagues. Shared by the manual entry flow
  // and the "Switch League" button so switching works even after a reload
  // (where `leagues` state was never populated).
  async function fetchSleeperLeagues(uname) {
    const user = await fetchSleeper(`/user/${uname}`);
    if (!user?.user_id) throw new Error("User not found");

    const now = new Date();
    const currentSeason = now.getFullYear();

    let leagueData = await fetchSleeper(
      `/user/${user.user_id}/leagues/nfl/${currentSeason}`,
    ).catch(() => []);

    if (!leagueData?.length) {
      leagueData = await fetchSleeper(
        `/user/${user.user_id}/leagues/nfl/${currentSeason - 1}`,
      ).catch(() => []);
    }

    // Return all NFL leagues — dynasty and redraft alike. Format is detected
    // per-league (deriveFormatMode) and the dashboard has a Dynasty/Redraft
    // toggle, so we no longer hide non-dynasty leagues at the picker.
    return leagueData;
  }

  async function handleUsernameSubmit(overrideName) {
    // overrideName lets the Sleeper-verified account flow advance straight to
    // the league picker with the verified username, before `username` state
    // (set in the same tick) has flushed.
    const source = typeof overrideName === "string" ? overrideName : username;
    const trimmed = source.trim();
    if (!trimmed) return;
    if (trimmed !== username) setUsername(trimmed);

    setLoading(true);
    setError("");

    try {
      const fetched = await fetchSleeperLeagues(trimmed);
      localStorage.setItem("dynasty_os_platform", "sleeper");
      localStorage.setItem("sleeper_username", trimmed);
      // If signed in, remember this username on the account so future logins go
      // straight to their teams. Best-effort — never block league loading on it.
      getAccount().then((u) => {
        if (u && getSleeperUsername(u) !== trimmed) {
          setSleeperUsername(trimmed).catch(() => {});
        }
      }).catch(() => {});
      setLeagues(fetched);
      setStep("leagues");
    } catch (e) {
      setError(
        e.message || "Could not find user. Check your Sleeper username.",
      );
    }

    setLoading(false);
  }

  // Fetch + normalize a Fleaflicker user's leagues. Shared by the manual entry
  // flow and the "Switch League" button.
  async function fetchFleaflickerLeagues(email) {
    const data = await fetchFFUserLeagues(email);
    if (!data.leagues?.length)
      throw new Error("No NFL leagues found for this email.");

    const normalizedLeagues = data.leagues.map((lg) => ({
      league_id: `ff_${lg.id}`,
      name: lg.name,
      total_rosters: lg.size || null,
      season: String(data.season || new Date().getFullYear()),
      _platform: "fleaflicker",
      _ff_league_id: lg.id,
      _ff_team_id: lg.owned_team?.id,
      _ff_team_name: lg.owned_team?.name,
    }));

    if (!normalizedLeagues.length)
      throw new Error("No NFL leagues found for this email.");

    return normalizedLeagues;
  }

  async function handleFleaflickerSubmit() {
    const trimmedEmail = ffEmail.trim();
    if (trimmedEmail !== ffEmail) setFfEmail(trimmedEmail);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const normalizedLeagues = await fetchFleaflickerLeagues(trimmedEmail);
      localStorage.setItem("dynasty_os_platform", "fleaflicker");
      localStorage.setItem("ff_email", trimmedEmail);
      setLeagues(normalizedLeagues);
      setStep("leagues");
    } catch (e) {
      setError(
        e.message ||
          "Could not find leagues. Check your Fleaflicker email.",
      );
    }

    setLoading(false);
  }

  // ESPN connect: user supplies a league ID (+ optional cookies for private
  // leagues). We fetch the league's teams so they can pick which one is theirs.
  async function handleEspnSubmit() {
    const leagueId = espnLeagueId.trim().replace(/[{}]/g, "");
    if (!/^\d+$/.test(leagueId)) {
      setError("Enter a numeric ESPN league ID.");
      return;
    }
    const s2 = espnS2.trim();
    const swid = espnSwid.trim();

    setLoading(true);
    setError("");

    try {
      // ESPN keys leagues by calendar year (the lib also falls back to year-1).
      const season = new Date().getFullYear();
      const teamEntries = await fetchEspnLeagueTeams(leagueId, season, {
        espn_s2: s2,
        swid,
      });

      localStorage.setItem("dynasty_os_platform", "espn");
      localStorage.setItem("espn_league_id", leagueId);
      if (s2) localStorage.setItem("espn_s2", s2);
      else localStorage.removeItem("espn_s2");
      if (swid) localStorage.setItem("espn_swid", swid);
      else localStorage.removeItem("espn_swid");

      // Surface the user's own team first when the SWID identified it.
      const sorted = [...teamEntries].sort(
        (a, b) => (b._espn_is_mine ? 1 : 0) - (a._espn_is_mine ? 1 : 0),
      );
      setLeagues(sorted);
      setStep("leagues");
    } catch (e) {
      setError(
        e.message ||
          "Could not load that ESPN league. Check the league ID (and cookies for a private league).",
      );
    }

    setLoading(false);
  }

  // Switch League: go to the picker and ensure the league list is loaded. When
  // the dashboard was restored from localStorage on reload, `leagues` was never
  // populated, so we re-fetch it here for the saved account.
  async function handleSwitchLeague() {
    localStorage.removeItem("sleeper_league");
    localStorage.removeItem("ff_league");
    localStorage.removeItem("espn_league");
    setStep("leagues");

    if (leagues.length) return;

    setLoading(true);
    setError("");
    try {
      if (platform === "fleaflicker") {
        const savedEmail = ffEmail || localStorage.getItem("ff_email") || "";
        if (savedEmail) setLeagues(await fetchFleaflickerLeagues(savedEmail));
      } else if (platform === "espn") {
        const savedId =
          espnLeagueId || localStorage.getItem("espn_league_id") || "";
        if (savedId) {
          setLeagues(
            await fetchEspnLeagueTeams(savedId, new Date().getFullYear(), {
              espn_s2: localStorage.getItem("espn_s2") || "",
              swid: localStorage.getItem("espn_swid") || "",
            }),
          );
        }
      } else {
        const savedUsername =
          username || localStorage.getItem("sleeper_username") || "";
        if (savedUsername)
          setLeagues(await fetchSleeperLeagues(savedUsername));
      }
    } catch (e) {
      setError(e.message || "Could not load your leagues. Try again.");
    }
    setLoading(false);
  }

  async function handleLeagueSelect(league) {
    // A freshly chosen league should auto-detect its format; drop any prior
    // manual override (it only applies to the league it was set on).
    setFormatModeOverride(null);
    localStorage.removeItem("format_mode_override");
    if (league._platform === "fleaflicker") {
      safeLocalStorageWrite("ff_league", JSON.stringify(league));
      await loadFleaflickerDashboard(league, { returnToLeagues: true });
    } else if (league._platform === "espn") {
      safeLocalStorageWrite("espn_league", JSON.stringify(league));
      await loadEspnDashboard(league, { returnToLeagues: true });
    } else {
      safeLocalStorageWrite("sleeper_league", JSON.stringify(league));
      await loadDashboard(league, username, { returnToLeagues: true });
    }
  }

  async function handleLogout() {
    // End the Supabase session too — otherwise getAccount() restores it on the
    // next load and the user is silently "signed in" again after logging out.
    try { await signOutAccount(); } catch { /* best-effort */ }
    localStorage.removeItem("sleeper_username");
    localStorage.removeItem("sleeper_league");
    localStorage.removeItem("dynasty_os_platform");
    localStorage.removeItem("ff_email");
    localStorage.removeItem("ff_league");
    localStorage.removeItem("espn_league");
    localStorage.removeItem("espn_league_id");
    localStorage.removeItem("espn_s2");
    localStorage.removeItem("espn_swid");
    localStorage.removeItem("format_mode_override");
    setFormatMode("dynasty");
    setFormatModeOverride(null);
    setUsername("");
    setFfEmail("");
    setEspnLeagueId("");
    setEspnS2("");
    setEspnSwid("");
    setPlatform("sleeper");
    setLeagues([]);
    setSelectedLeague(null);
    setAnalysis(null);
    setAnalysisPayload(null);
    setError("");
    setStep("input");
  }



  if (step === "input") {
    return (
      <Layout>
        <InputScreen
          username={username}
          setUsername={setUsername}
          onSubmit={
            platform === "sleeper"
              ? handleUsernameSubmit
              : platform === "espn"
                ? handleEspnSubmit
                : handleFleaflickerSubmit
          }
          onAccountTeams={(name) => {
            setPlatform("sleeper");
            handleUsernameSubmit(name);
          }}
          loading={loading}
          error={error}
          clearError={() => setError("")}
          platform={platform}
          onSetPlatform={setPlatform}
          ffEmail={ffEmail}
          setFfEmail={setFfEmail}
          espnLeagueId={espnLeagueId}
          setEspnLeagueId={setEspnLeagueId}
          espnS2={espnS2}
          setEspnS2={setEspnS2}
          espnSwid={espnSwid}
          setEspnSwid={setEspnSwid}
          onExplore={() => setStep("explore")}
        />
      </Layout>
    );
  }

  if (step === "explore") {
    return (
      <Layout>
        <ExploreScreen onConnect={() => setStep("input")} />
      </Layout>
    );
  }

  if (step === "leagues") {
    if (loading && selectedLeague) {
      return (
        <Layout>
          <DashboardSkeleton leagueName={selectedLeague.name} progress={loadProgress} />
        </Layout>
      );
    }
    return (
      <Layout>
        <LeaguePickerScreen
          leagues={leagues}
          onSelectLeague={handleLeagueSelect}
          loading={loading}
          selectedLeague={selectedLeague}
          error={error}
        />
      </Layout>
    );
  }

  if (step === "dashboard" && analysis) {
    return (
      <ErrorBoundary>
      <Layout>
        <Dashboard
          analysis={analysis}
          selectedLeague={selectedLeague}
          formatMode={formatMode}
          onToggleFormatMode={handleToggleFormatMode}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          showGradeKey={showGradeKey}
          setShowGradeKey={setShowGradeKey}
          collapsedRooms={collapsedRooms}
          expandedBars={expandedBars}
          onToggleRoom={toggleRoom}
          onToggleBars={toggleBars}
          onSwitchLeague={handleSwitchLeague}
          onLogout={handleLogout}

          showScoreWeights={showScoreWeights}
          setShowScoreWeights={setShowScoreWeights}
          onConfirmScoreWeights={handleConfirmScoreWeights}
          recalculating={recalculating}
          aiAdvice={aiAdvice}
          aiLoading={aiLoading}
          aiError={aiError}
          onGetAIAdvice={handleGetAIAdvice}
        />
      </Layout>
      {enriching && (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 20,
            background: "rgba(10,14,20,0.92)",
            border: "1px solid rgba(0,245,160,0.25)",
            color: "#6b7390",
            fontSize: 11,
            letterSpacing: 0.5,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            zIndex: 50,
          }}
        >
          <span
            className="dyn-spinner"
            style={{
              width: 12,
              height: 12,
              border: "2px solid rgba(0,245,160,0.2)",
              borderTopColor: "#00f5a0",
            }}
          />
          Loading market &amp; draft data…
        </div>
      )}
      </ErrorBoundary>
    );
  }

  if (selectedLeague) {
    return (
      <Layout>
        <DashboardSkeleton leagueName={selectedLeague.name} progress={loadProgress} />
      </Layout>
    );
  }

  return <LoadingScreen message="Loading your league…" />;
}
