import { POSITION_PRIORITY } from "../constants";
import { styles } from "../styles";
import GradeKeyModal from "./dashboard/GradeKeyModal";
import LeagueTab from "./dashboard/LeagueTab";
import OverviewTab from "./dashboard/OverviewTab";
import PicksTab from "./dashboard/PicksTab";
import RosterTab from "./dashboard/RosterTab";
import ScoreWeightsModal from "./dashboard/ScoreWeightsModal";
import TradeTab from "./dashboard/TradeTab";
import LeagueActivityTab from "./dashboard/LeagueActivityTab";
import DocumentationTab from "./dashboard/DocumentationTab";
import RankingsTab from "./dashboard/RankingsTab";
import StrategyPlannerTab from "./dashboard/StrategyPlannerTab";

export default function Dashboard({
  analysis,
  selectedLeague,
  activeTab,
  setActiveTab,
  showGradeKey,
  setShowGradeKey,
  collapsedRooms,
  expandedBars,
  onToggleRoom,
  onToggleBars,
  onSwitchLeague,
  onLogout,
  showScoreWeights,
  setShowScoreWeights,
  onConfirmScoreWeights,
  recalculating,
}) {
  const strategyPlannerEnabled = import.meta.env.VITE_ENABLE_STRATEGY_PLANNER === "true";

  const {
    byPos,
    sells,
    avgAge,
    avgScore,
    picksByYear,
    weakRooms,
    aiAdvice,
    picks,
    proportions,
    surplusPositions,
    tradeSuggestions,
    tradeBlock,
    leagueContext,
    tradeMarket,
    fantasyCalcSource,
  } = analysis;

  return (
    <>
      <div style={styles.header}>
        <div
          className="dyn-header-top-row"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={styles.logo}>Dynasty OS — {selectedLeague?.name}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="dyn-btn-ghost"
              style={styles.btnGhost}
              onClick={onSwitchLeague}
            >
              Switch League
            </button>
            
            <button
              className="dyn-btn-ghost"
              style={styles.btnGhost}
              onClick={() => setShowScoreWeights(true)}
              disabled={recalculating}
            >
              Adjust Weights
            </button>
            <button
              className="dyn-btn-ghost"
              style={styles.btnGhost}
              onClick={onLogout}
            >
              Log out
            </button>
            {recalculating && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: "#d9deef",
                  textTransform: "uppercase",
                }}
              >
                <span className="dyn-spinner" />
                Recalculating
              </div>
            )}
          </div>
        </div>
        <div
          className="dyn-header-bottom-row"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div>
            <h1 style={styles.title}>Dynasty Dashboard</h1>
            <p style={styles.subtitle}>
              Avg age: {avgAge} · Dynasty score: {avgScore}/100 · {picks.length}{" "}
              picks · {analysis.isSuperflex ? "Superflex" : "1QB"} · Weights A
              {analysis.scoringWeights?.age ?? 35}/P
              {analysis.scoringWeights?.prod ?? 30}/V
              {analysis.scoringWeights?.avail ?? 15}/T
              {analysis.scoringWeights?.trend ?? 10}/S
              {analysis.scoringWeights?.situ ?? 10}
            </p>
          </div>

        </div>
      </div>

      <div
        className="dyn-tabs-row"
        role="tablist"
        aria-label="Dashboard sections"
        style={{
          display: "flex",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          marginBottom: 32,
        }}
      >
        {[
          { key: "overview", label: "overview" },
          { key: "roster", label: "roster" },
          { key: "picks", label: "picks" },
          { key: "trades", label: "trades" },
          { key: "strategy", label: "strategy" },
          { key: "rankings", label: "rankings" },
          { key: "league", label: "league" },
          { key: "activity", label: "activity" },
          { key: "docs", label: "Calculation Documentation" },
        ].map((tab) => (
          <button
            key={tab.key}
            className="dyn-tab"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-label={`${tab.label} tab`}
            style={styles.tab(activeTab === tab.key)}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showGradeKey && <GradeKeyModal onClose={() => setShowGradeKey(false)} />}
      {showScoreWeights && (
        <ScoreWeightsModal
          initialWeights={analysis.scoringWeights}
          onClose={() => setShowScoreWeights(false)}
          onConfirm={onConfirmScoreWeights}
          isConfirming={recalculating}
        />
      )}

      {activeTab === "overview" && (
        <OverviewTab
          byPos={byPos}
          sells={sells}
          weakRooms={weakRooms}
          proportions={proportions}
          aiAdvice={aiAdvice}
          teamPhase={analysis.teamPhase}
          onOpenGradeKey={() => setShowGradeKey(true)}
        />
      )}

      {activeTab === "roster" && (
        <RosterTab
          byPos={byPos}
          collapsedRooms={collapsedRooms}
          expandedBars={expandedBars}
          onToggleRoom={onToggleRoom}
          onToggleBars={onToggleBars}
          positionPriority={POSITION_PRIORITY}
          scoringWeights={analysis.scoringWeights}
        />
      )}

      {activeTab === "picks" && (
        <PicksTab picksByYear={picksByYear} picks={picks} />
      )}

      {activeTab === "trades" && (
        <TradeTab
          tradeSuggestions={tradeSuggestions}
          weakRooms={weakRooms}
          surplusPositions={surplusPositions}
          tradeBlock={tradeBlock}
          picks={picks}
          leagueContext={leagueContext}
          tradeMarket={tradeMarket}
          fantasyCalcSource={fantasyCalcSource}
          leagueTeams={analysis.leagueTeams}
          teamPhase={analysis.teamPhase}
        />
      )}

      {activeTab === "strategy" && !strategyPlannerEnabled && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 340,
          padding: "48px 24px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧪</div>
          <h2 style={{ color: "#fff", margin: "0 0 8px", fontSize: 22 }}>Strategy Planner — Coming Soon</h2>
          <p style={{ color: "#94a3b8", fontSize: 15, maxWidth: 420, lineHeight: 1.5 }}>
            Personalized rebuild, retool, and contender playbooks with trade packages,
            rookie strategy, risk flags, and a full roadmap — powered by blended FantasyCalc
            + RosterAudit valuations. Stay tuned.
          </p>
        </div>
      )}

      {activeTab === "strategy" && strategyPlannerEnabled && (
        <StrategyPlannerTab
          analysis={analysis}
          selectedLeague={selectedLeague}
        />
      )}

      {activeTab === "rankings" && (
        <RankingsTab rosterAuditSource={analysis.rosterAuditSource} />
      )}

      {activeTab === "league" && (
        <LeagueTab
          leagueTeams={analysis.leagueTeams}
          myTeamLabel={analysis.myTeamLabel}
        />
      )}

      {activeTab === "activity" && (
        <LeagueActivityTab
          leagueActivity={analysis.leagueActivity}
          myTeamLabel={analysis.myTeamLabel}
        />
      )}

      {activeTab === "docs" && <DocumentationTab />}
    </>
  );
}
