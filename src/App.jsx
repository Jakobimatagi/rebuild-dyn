import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import InputScreen from "./components/InputScreen";
import Layout from "./components/Layout";
import LeaguePickerScreen from "./components/LeaguePickerScreen";
import { buildRosterAnalysis, DEFAULT_SCORING_WEIGHTS } from "./lib/analysis";
import { fetchFantasyCalcValues } from "./lib/fantasyCalcApi";
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
  fetchHistoricalStats,
  fetchLeagueTransactions,
  fetchSleeper,
} from "./lib/sleeperApi";

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

  async function loadDashboard(league, uname) {
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
        // Deep historical seasons (2014-2017) for richer age curves and comp matching.
        // Cached 30 days — these seasons never change.
        stats17,
        stats16,
        stats15,
        stats14,
        rosterAuditValues,
        rosterAuditPicks,
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
        // RosterAudit — second dynasty value source
        fetchRosterAuditValues(league).catch(() => []),
        fetchRosterAuditPicks().catch(() => null),
      ]);

      const userObj = users.find(
        (u) => u.display_name?.toLowerCase() === uname.toLowerCase(),
      );
      if (!userObj)
        throw new Error("Could not find your roster in this league.");

      const myRoster = rosters.find((r) => r.owner_id === userObj.user_id);
      if (!myRoster) throw new Error("Roster not found.");

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
        rosterAuditValues,
        rosterAuditPicks,
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
        ],
      };

      setAnalysisPayload(payload);
      const nextAnalysis = computeAnalysis(payload, scoringWeights);
      setAnalysis(nextAnalysis);
      setStep("dashboard");
    } catch (e) {
      localStorage.removeItem("sleeper_league");
      setError(e.message || "Failed to load dashboard.");
      setStep("input");
    }

    setLoading(false);
  }

  async function loadFleaflickerDashboard(league) {
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
      ]);

      // Phase 2: Normalize Fleaflicker data (mutates players with synthetic entries)
      const ffData = await loadFleaflickerLeague(
        league._ff_league_id,
        league._ff_team_id,
        players,
      );

      // Phase 3: Fetch FantasyCalc values using normalized league settings
      const [fantasyCalcValues, rosterAuditValues, rosterAuditPicks] =
        await Promise.all([
          fetchFantasyCalcValues(ffData.league).catch(() => []),
          fetchRosterAuditValues(ffData.league).catch(() => []),
          fetchRosterAuditPicks().catch(() => null),
        ]);

      const payload = {
        myRoster: ffData.myRoster,
        players,
        league: ffData.league,
        tradedPicks: ffData.tradedPicks,
        stats24,
        stats23,
        stats22,
        transactions: ffData.transactions,
        fantasyCalcValues,
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
        ],
      };

      setAnalysisPayload(payload);
      const nextAnalysis = computeAnalysis(payload, scoringWeights);
      setAnalysis(nextAnalysis);
      setStep("dashboard");
    } catch (e) {
      localStorage.removeItem("ff_league");
      setError(e.message || "Failed to load Fleaflicker dashboard.");
      setStep("input");
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
    setLoading(true);
    setError("");

    try {
      const user = await fetchSleeper(`/user/${username}`);
      if (!user?.user_id) throw new Error("User not found");

      localStorage.setItem("dynasty_os_platform", "sleeper");
      localStorage.setItem("sleeper_username", username);
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
    setLoading(true);
    setError("");

    try {
      const data = await fetchFFUserLeagues(ffEmail);
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
      await loadFleaflickerDashboard(league);
    } else {
      localStorage.setItem("sleeper_league", JSON.stringify(league));
      await loadDashboard(league, username);
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
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ textAlign: "center", padding: 80, color: "#d1d7ea" }}>
        Loading...
      </div>
    </Layout>
  );
}
