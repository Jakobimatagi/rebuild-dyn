import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import DashboardSkeleton from "./components/DashboardSkeleton";
import ErrorBoundary from "./components/ErrorBoundary";
import InputScreen from "./components/InputScreen";
import Layout from "./components/Layout";
import LeaguePickerScreen from "./components/LeaguePickerScreen";
import LoadingScreen from "./components/LoadingScreen";
import { fetchAiAdvice } from "./lib/aiAdviceApi";
import { buildRosterAnalysis, DEFAULT_SCORING_WEIGHTS } from "./lib/analysis";
import { fetchFantasyCalcValues, fetchFantasyCalcTrades } from "./lib/fantasyCalcApi";
import {
  fetchRosterAuditValues,
  fetchRosterAuditPicks,
} from "./lib/rosterAuditApi";
import {
  fetchFFUserLeagues,
  loadFleaflickerLeague,
} from "./lib/fleaflickerApi";
import {
  fetchDeepHistoricalStats,
  fetchDraftPicks,
  fetchHistoricalStats,
  fetchLeagueTransactions,
  fetchSleeper,
} from "./lib/sleeperApi";

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
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
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

  function computeAnalysis(payload, nextWeights = scoringWeights) {
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
    );
  }

  function toggleRoom(pos) {
    setCollapsedRooms((prev) => ({ ...prev, [pos]: !prev[pos] }));
  }

  function toggleBars(id) {
    setExpandedBars((prev) => ({ ...prev, [id]: !prev[id] }));
  }

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
    setSelectedLeague(league);
    setLoading(true);
    setError("");

    try {
      const now = new Date();
      const lastSeason =
        now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

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
        stats21,
        stats20,
        stats19,
        stats18,
        // Deep historical seasons (2009-2017) for richer age curves and comp matching.
        // Cached 30 days — these seasons never change. Sleeper has real data back
        // to 2009; 2008 and earlier return placeholder zeros so we stop there.
        stats17,
        stats16,
        stats15,
        stats14,
        stats13,
        stats12,
        stats11,
        stats10,
        stats09,
        rosterAuditValues,
        rosterAuditPicks,
        sleeperDrafts,
        fantasyCalcTrades,
      ] = await Promise.all([
        fetchSleeper(`/league/${league.league_id}/users`),
        fetchSleeper(`/league/${league.league_id}/rosters`),
        fetchSleeper(`/players/nfl`).catch(() => ({})),
        fetchSleeper(`/league/${league.league_id}/traded_picks`).catch(
          () => [],
        ),
        fetchSleeper(`/stats/nfl/regular/${lastSeason}`).catch(() => ({})),
        fetchSleeper(`/stats/nfl/regular/${lastSeason - 1}`).catch(() => ({})),
        fetchSleeper(`/stats/nfl/regular/${lastSeason - 2}`).catch(() => ({})),
        fetchLeagueTransactions(league).catch(() => []),
        fetchFantasyCalcValues(league).catch(() => []),
        // Recent historical seasons: 7-day cache
        fetchHistoricalStats(2021),
        fetchHistoricalStats(2020),
        fetchHistoricalStats(2019),
        fetchHistoricalStats(2018),
        // Deep historical seasons: 30-day cache
        fetchDeepHistoricalStats(2017),
        fetchDeepHistoricalStats(2016),
        fetchDeepHistoricalStats(2015),
        fetchDeepHistoricalStats(2014),
        fetchDeepHistoricalStats(2013),
        fetchDeepHistoricalStats(2012),
        fetchDeepHistoricalStats(2011),
        fetchDeepHistoricalStats(2010),
        fetchDeepHistoricalStats(2009),
        // RosterAudit — second dynasty value source
        fetchRosterAuditValues(league).catch(() => []),
        fetchRosterAuditPicks().catch(() => null),
        fetchSleeper(`/league/${league.league_id}/drafts`).catch(() => []),
        fetchFantasyCalcTrades(league).catch(() => []),
      ]);

      const userObj = users.find(
        (u) => u.display_name?.toLowerCase() === uname.toLowerCase(),
      );
      if (!userObj)
        throw new Error("Could not find your roster in this league.");

      const myRoster = rosters.find((r) => r.owner_id === userObj.user_id);
      if (!myRoster) throw new Error("Roster not found.");

      const recentDraft = pickRecentCompletedDraft(sleeperDrafts);

      // Fetch picks for all completed drafts (most recent 5) so the recap tab
      // can offer a season switcher. recentDraftPicks is kept for compat.
      const allCompletedDrafts = [...sleeperDrafts]
        .filter((d) => d.status === "complete" && d.start_time)
        .sort((a, b) => Number(b.start_time) - Number(a.start_time))
        .slice(0, 5);
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

      console.log("[draft-debug] /league/<id>/drafts:", sleeperDrafts);
      console.log("[draft-debug] selected recent draft:", recentDraft);
      console.log(
        "[draft-debug] picks fetched for that draft:",
        recentDraftPicks.length,
        recentDraftPicks,
      );
      console.log(
        "[draft-debug] /league/<id>/traded_picks:",
        tradedPicks.length,
        tradedPicks,
      );

      const payload = {
        myRoster,
        players,
        league,
        tradedPicks,
        stats24,
        stats23,
        stats22,
        transactions,
        fantasyCalcValues,
        fantasyCalcTrades,
        rosterAuditValues,
        rosterAuditPicks,
        sleeperDrafts,
        recentDraft,
        recentDraftPicks,
        allCompletedDrafts,
        allDraftPicksMap,
        users,
        rosters,
        lastSeason,
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

      setAnalysisPayload(payload);
      const nextAnalysis = computeAnalysis(payload, scoringWeights);
      setAnalysis(nextAnalysis);
      setStep("dashboard");
    } catch (e) {
      localStorage.removeItem("sleeper_league");
      setError(e.message || "Failed to load dashboard. Try selecting your league again.");
      setStep(returnToLeagues ? "leagues" : "input");
    }

    setLoading(false);
  }

  async function loadFleaflickerDashboard(league, { returnToLeagues = false } = {}) {
    setSelectedLeague(league);
    setLoading(true);
    setError("");

    try {
      const now = new Date();
      const lastSeason =
        now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

      // Phase 1: Fetch Sleeper player DB + historical stats in parallel
      const [
        players,
        stats24,
        stats23,
        stats22,
        stats21,
        stats20,
        stats19,
        stats18,
        stats17,
        stats16,
        stats15,
        stats14,
        stats13,
        stats12,
        stats11,
        stats10,
        stats09,
      ] = await Promise.all([
        fetchSleeper("/players/nfl").catch(() => ({})),
        fetchSleeper(`/stats/nfl/regular/${lastSeason}`).catch(() => ({})),
        fetchSleeper(`/stats/nfl/regular/${lastSeason - 1}`).catch(() => ({})),
        fetchSleeper(`/stats/nfl/regular/${lastSeason - 2}`).catch(() => ({})),
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
      ]);

      // Phase 2: Normalize Fleaflicker data (mutates players with synthetic entries)
      const ffData = await loadFleaflickerLeague(
        league._ff_league_id,
        league._ff_team_id,
        players,
      );

      // Phase 3: Fetch FantasyCalc values using normalized league settings
      const [
        fantasyCalcValues,
        fantasyCalcTrades,
        rosterAuditValues,
        rosterAuditPicks,
      ] = await Promise.all([
        fetchFantasyCalcValues(ffData.league).catch(() => []),
        fetchFantasyCalcTrades(ffData.league).catch(() => []),
        fetchRosterAuditValues(ffData.league).catch(() => []),
        fetchRosterAuditPicks().catch(() => null),
      ]);

      const payload = {
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
        fantasyCalcTrades,
        rosterAuditValues,
        rosterAuditPicks,
        users: ffData.users,
        rosters: ffData.rosters,
        lastSeason,
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

      setAnalysisPayload(payload);
      const nextAnalysis = computeAnalysis(payload, scoringWeights);
      setAnalysis(nextAnalysis);
      setStep("dashboard");
    } catch (e) {
      localStorage.removeItem("ff_league");
      setError(e.message || "Failed to load Fleaflicker dashboard. Try selecting your league again.");
      setStep(returnToLeagues ? "leagues" : "input");
    }

    setLoading(false);
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

  async function handleUsernameSubmit() {
    const trimmed = username.trim();
    if (!trimmed) return;
    if (trimmed !== username) setUsername(trimmed);

    setLoading(true);
    setError("");

    try {
      const user = await fetchSleeper(`/user/${trimmed}`);
      if (!user?.user_id) throw new Error("User not found");

      localStorage.setItem("dynasty_os_platform", "sleeper");
      localStorage.setItem("sleeper_username", trimmed);
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

      const dynasty = leagueData.filter(
        (league) =>
          league.settings?.type === 2 ||
          league.name?.toLowerCase().includes("dynasty"),
      );

      setLeagues(dynasty.length ? dynasty : leagueData);
      setStep("leagues");
    } catch (e) {
      setError(
        e.message || "Could not find user. Check your Sleeper username.",
      );
    }

    setLoading(false);
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
      const data = await fetchFFUserLeagues(trimmedEmail);
      if (!data.leagues?.length)
        throw new Error("No NFL leagues found for this email.");

      localStorage.setItem("dynasty_os_platform", "fleaflicker");
      localStorage.setItem("ff_email", ffEmail);

      const normalizedLeagues = data.leagues
        .map((lg) => ({
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

  async function handleLeagueSelect(league) {
    if (league._platform === "fleaflicker") {
      localStorage.setItem("ff_league", JSON.stringify(league));
      await loadFleaflickerDashboard(league, { returnToLeagues: true });
    } else {
      localStorage.setItem("sleeper_league", JSON.stringify(league));
      await loadDashboard(league, username, { returnToLeagues: true });
    }
  }

  function handleLogout() {
    localStorage.removeItem("sleeper_username");
    localStorage.removeItem("sleeper_league");
    localStorage.removeItem("dynasty_os_platform");
    localStorage.removeItem("ff_email");
    localStorage.removeItem("ff_league");
    setUsername("");
    setFfEmail("");
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
              : handleFleaflickerSubmit
          }
          loading={loading}
          error={error}
          platform={platform}
          onSetPlatform={setPlatform}
          ffEmail={ffEmail}
          setFfEmail={setFfEmail}
        />
      </Layout>
    );
  }

  if (step === "leagues") {
    if (loading && selectedLeague) {
      return (
        <Layout>
          <DashboardSkeleton leagueName={selectedLeague.name} />
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
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          showGradeKey={showGradeKey}
          setShowGradeKey={setShowGradeKey}
          collapsedRooms={collapsedRooms}
          expandedBars={expandedBars}
          onToggleRoom={toggleRoom}
          onToggleBars={toggleBars}
          onSwitchLeague={() => {
            localStorage.removeItem("sleeper_league");
            localStorage.removeItem("ff_league");
            setStep("leagues");
          }}
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
      </ErrorBoundary>
    );
  }

  return <LoadingScreen message="Loading your league…" />;
}
