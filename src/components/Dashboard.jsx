import { useState } from "react";
import { POSITION_PRIORITY } from "../constants";
import { styles } from "../styles";
import AdviceTab from "./dashboard/AdviceTab";
import GradeKeyModal from "./dashboard/GradeKeyModal";
import LeagueTab from "./dashboard/LeagueTab";
import OverviewTab from "./dashboard/OverviewTab";
import RosterTab from "./dashboard/RosterTab";
import ScoreWeightsModal from "./dashboard/ScoreWeightsModal";
import TradeTab from "./dashboard/TradeTab";
import LeagueActivityTab from "./dashboard/LeagueActivityTab";
import DocumentationTab from "./dashboard/DocumentationTab";
import RankingsTab from "./dashboard/RankingsTab";
import StrategyPlannerTab from "./dashboard/StrategyPlannerTab";
import RookieRankingsTab from "./dashboard/RookieRankingsTab";

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
  aiAdvice: aiAdviceFromAnalyze,
  aiLoading,
  aiError,
  onGetAIAdvice,
}) {
  const strategyPlannerEnabled = import.meta.env.VITE_ENABLE_STRATEGY_PLANNER === "true";
  const [strategyUnlocked, setStrategyUnlocked] = useState(false);
  const [unlockInput, setUnlockInput] = useState("");

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
    needs,
    tradeBlock,
    leagueContext,
    tradeMarket,
    fantasyCalcSource,
    rosterAuditSource,
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
          { key: "trades", label: "trades" },
          { key: "strategy", label: "strategy" },
          { key: "rankings", label: "rankings" },
          { key: "rookies", label: "rookie rankings" },
          { key: "ai", label: "analyze with ai" },
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
          posRanks={analysis.posRanks}
          onOpenGradeKey={() => setShowGradeKey(true)}
          leagueTeams={analysis.leagueTeams}
          myNeeds={needs}
          mySurplus={surplusPositions}
          myRosterId={analysis.rosterId}
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
          ageCurves={analysis.ageCurves}
          picksByYear={picksByYear}
          picks={picks}
          leagueContext={leagueContext}
          tradeMarket={tradeMarket}
          leagueTeams={analysis.leagueTeams}
          myRosterId={analysis.rosterId}
          raPickValues={rosterAuditSource?.pickValues}
          posRanks={analysis.posRanks}
          isSuperflex={analysis.leagueContext?.isSuperflex}
        />
      )}

      {activeTab === "trades" && (
        <TradeTab
          weakRooms={weakRooms}
          surplusPositions={surplusPositions}
          tradeBlock={tradeBlock}
          picks={picks}
          leagueContext={leagueContext}
          tradeMarket={tradeMarket}
          fantasyCalcSource={fantasyCalcSource}
          leagueTeams={analysis.leagueTeams}
          teamPhase={analysis.teamPhase}
          posRanks={analysis.posRanks}
          myRosterId={analysis.rosterId}
        />
      )}

      {activeTab === "strategy" && !strategyPlannerEnabled && !strategyUnlocked && (
        <PremiumGate
          icon="🧪"
          title="Strategy Planner — Coming Soon"
          description="Personalized rebuild, retool, and contender playbooks with trade packages, rookie strategy, risk flags, and a full roadmap — powered by blended FantasyCalc + RosterAudit valuations. Stay tuned."
          unlockInput={unlockInput}
          setUnlockInput={setUnlockInput}
          onUnlock={setStrategyUnlocked}
        />
      )}

      {activeTab === "strategy" && (strategyPlannerEnabled || strategyUnlocked) && (
        <StrategyPlannerTab
          analysis={analysis}
          selectedLeague={selectedLeague}
        />
      )}

      {activeTab === "rankings" && (
        <RankingsTab rosterAuditSource={analysis.rosterAuditSource} />
      )}

      {activeTab === "rookies" && <RookieRankingsTab />}

      {activeTab === "ai" && !strategyPlannerEnabled && !strategyUnlocked && (
        <PremiumGate
          icon="🤖"
          title="Analyze with AI — Premium"
          description="Personalized AI dynasty analysis grounded in current injury, depth-chart, and offseason news. Diagnoses team health, recommends a clear direction, and turns it into concrete sells, buys, and pick strategy."
          unlockInput={unlockInput}
          setUnlockInput={setUnlockInput}
          onUnlock={setStrategyUnlocked}
        />
      )}

      {activeTab === "ai" && (strategyPlannerEnabled || strategyUnlocked) && (
        <AdviceTab
          aiAdvice={aiAdviceFromAnalyze}
          aiLoading={aiLoading}
          aiError={aiError}
          onGetAIAdvice={onGetAIAdvice}
        />
      )}

      {activeTab === "league" && (
        <LeagueTab
          leagueTeams={analysis.leagueTeams}
          myTeamLabel={analysis.myTeamLabel}
          isSuperflex={analysis.isSuperflex}
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

function PremiumGate({ icon, title, description, unlockInput, setUnlockInput, onUnlock }) {
  const tryUnlock = () => {
    if (unlockInput === "LetMeIn!") onUnlock(true);
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 340,
      padding: "48px 24px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <h2 style={{ color: "#fff", margin: "0 0 8px", fontSize: 22 }}>{title}</h2>
      <p style={{ color: "#94a3b8", fontSize: 15, maxWidth: 420, lineHeight: 1.5 }}>
        {description}
      </p>
      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <input
          type="password"
          placeholder="Enter access code"
          value={unlockInput}
          onChange={(e) => setUnlockInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") tryUnlock();
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#1e2230",
            color: "#fff",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={tryUnlock}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "#00f5a0",
            color: "#141722",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
