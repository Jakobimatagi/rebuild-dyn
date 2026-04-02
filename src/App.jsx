import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import InputScreen from "./components/InputScreen";
import Layout from "./components/Layout";
import LeaguePickerScreen from "./components/LeaguePickerScreen";
import { POSITION_PRIORITY } from "./constants";
import { buildRosterAnalysis, DEFAULT_SCORING_WEIGHTS } from "./lib/analysis";
import { fetchFantasyCalcValues } from "./lib/fantasyCalcApi";
import {
  fetchDeepHistoricalStats,
  fetchHistoricalStats,
  fetchLeagueTransactions,
  fetchSleeper,
} from "./lib/sleeperApi";

export default function App() {
  const [step, setStep] = useState("input");
  const [username, setUsername] = useState(
    () => localStorage.getItem("sleeper_username") || "",
  );
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
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
    );
  }

  function toggleRoom(pos) {
    setCollapsedRooms((prev) => ({ ...prev, [pos]: !prev[pos] }));
  }

  function toggleBars(id) {
    setExpandedBars((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  useEffect(() => {
    const savedUsername = localStorage.getItem("sleeper_username");
    const savedLeague = localStorage.getItem("sleeper_league");
    if (savedUsername && savedLeague) {
      setUsername(savedUsername);
      loadDashboard(JSON.parse(savedLeague), savedUsername);
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

  async function handleLeagueSelect(league) {
    localStorage.setItem("sleeper_league", JSON.stringify(league));
    await loadDashboard(league, username);
  }

  async function getAIAdvice() {
    if (!analysis) return;
    setAiLoading(true);

    try {
      const prompt = `You are an expert dynasty fantasy football advisor. Analyze this roster and give sharp, actionable Dynastyadvice.

ROSTER SUMMARY (score 0-100, archetype, ppg = 2024 PPR pts/game):
${POSITION_PRIORITY.map(
  (pos) =>
    `${pos}: ${
      analysis.byPos[pos]
        .map(
          (p) =>
            `${p.name} (${p.age}yo, score ${p.score}, ${p.archetype}, ${p.ppg ? `${p.ppg}ppg/${p.gp24}g` : "no stats"})`,
        )
        .join(" | ") || "EMPTY"
    }`,
).join("\n")}

POSITION VALUE BALANCE (actual% vs ideal%):
${POSITION_PRIORITY.map(
  (pos) =>
    `${pos}: ${analysis.proportions[pos].actual}% actual vs ${analysis.proportions[pos].ideal}% ideal (${analysis.proportions[pos].delta > 0 ? "+" : ""}${analysis.proportions[pos].delta}%)`,
).join(" · ")}

DRAFT PICKS: ${analysis.picks.length} picks across ${Object.keys(analysis.picksByYear).join(", ")}
WEAK ROOMS: ${analysis.weakRooms.join(", ") || "None"}
AVG ROSTER AGE: ${analysis.avgAge} · AVG DYNASTY SCORE: ${analysis.avgScore}/100
FORMAT: ${analysis.isSuperflex ? "Superflex" : "1QB"}

Give advice in this EXACT JSON format (no markdown, no backticks):
{
  "overallVerdict": "one sentence on Dynastystatus",
  "rebuildScore": 1-10,
  "topSells": [{"name": "player name", "reason": "why sell now"}],
  "topBuys": [{"position": "pos", "target": "type of player to target", "why": "reason"}],
  "pickStrategy": "one paragraph on pick strategy",
  "timelineToContend": "realistic timeline estimate",
  "winNowMoves": ["move 1", "move 2"],
  "strengths": ["strength 1", "strength 2"],
  "warnings": ["warning 1", "warning 2"]
}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      const text = data.content?.map((c) => c.text || "").join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setAnalysis((prev) => ({ ...prev, aiAdvice: parsed }));
    } catch (e) {
      console.error("AI error:", e);
    }

    setAiLoading(false);
  }

  if (step === "input") {
    return (
      <Layout>
        <InputScreen
          username={username}
          setUsername={setUsername}
          onSubmit={handleUsernameSubmit}
          loading={loading}
          error={error}
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
            setStep("leagues");
          }}
          onGetAIAdvice={getAIAdvice}
          aiLoading={aiLoading}
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
