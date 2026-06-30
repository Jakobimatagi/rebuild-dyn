import { useEffect, useState } from "react";
import { POSITION_PRIORITY } from "../constants";
import { styles } from "../styles";
import ProfileModal from "./ProfileModal";
import { getAccount, onAuthChange } from "../lib/supabase";
import AdviceTab from "./dashboard/AdviceTab";
import GradeKeyModal from "./dashboard/GradeKeyModal";
import LeagueTab from "./dashboard/LeagueTab";
import OverviewTab from "./dashboard/OverviewTab";
import RosterTab from "./dashboard/RosterTab";
import ScoreWeightsModal from "./dashboard/ScoreWeightsModal";
import TradeTab from "./dashboard/TradeTab";
import TradeTinderTab from "./dashboard/TradeTinderTab";
import PerceptionTab from "./dashboard/PerceptionTab";
import LeagueActivityTab from "./dashboard/LeagueActivityTab";
import DocumentationTab from "./dashboard/DocumentationTab";
import DraftRecapTab from "./dashboard/DraftRecapTab";
import LiveDraftTab from "./dashboard/LiveDraftTab";
import BlueprintClassifierCard from "./dashboard/BlueprintClassifierCard";
import MockBlueprints from "./dashboard/MockBlueprints";
import RankingsTab from "./dashboard/RankingsTab";
import StrategyPlannerTab from "./dashboard/StrategyPlannerTab";
import RookieRankingsTab from "./dashboard/RookieRankingsTab";
import ProjectionsTab from "./dashboard/ProjectionsTab";
import PowerRankingsTab from "./dashboard/PowerRankingsTab";

const ROW1 = [
  { key: "overview",  label: "Overview" },
  { key: "roster",    label: "Roster" },
  { key: "projections", label: "Projections" },
  { key: "trades",    label: "Trades" },
  { key: "league",    label: "League" },
  { key: "perception",label: "Market Signals" },
  // Hidden for now — re-add to restore the tabs (render branches still live below).
  // { key: "strategy",  label: "Strategy" },
  // { key: "ai",        label: "AI" },
];

const ROW2 = [
  { key: "power",     label: "Power" },
  { key: "rankings",  label: "Rankings" },
  { key: "rookies",   label: "Rookies" },
  { key: "blueprint", label: "Blueprint" },
  { key: "mock",      label: "Mock Blueprints" },
  { key: "tinder",    label: "Trade Jury" },
  { key: "activity",  label: "Activity" },
];

function TabRow({ tabs, activeTab, setActiveTab, extraTabs = [], dimmed = false }) {
  const all = [...tabs, ...extraTabs];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
      {all.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            className="dyn-tab"
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "9px 18px",
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              border: "none",
              background: "transparent",
              color: isActive ? "#00f5a0" : dimmed ? "#475569" : "#94a3b8",
              borderBottom: isActive ? "2px solid #00f5a0" : "2px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

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

  // Show the Profile button only when there's a signed-in account (the no-login
  // username flow has no account to edit).
  const [signedIn, setSignedIn] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getAccount().then((u) => { if (!cancelled) setSignedIn(!!u); }).catch(() => {});
    const unsub = onAuthChange((u) => { if (!cancelled) setSignedIn(!!u); });
    return () => { cancelled = true; unsub(); };
  }, []);

  const hasDraft = !!(analysis.draftRecap || analysis.allDraftRecaps?.length > 0);

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
    fantasyCalcTrades,
  } = analysis;

  const hasLiveDraft = !!analysis.liveDraft;
  const liveDraftTab = hasLiveDraft
    ? [{ key: "live", label: "Live Draft" }]
    : [];
  const draftTab = hasDraft ? [{ key: "recap", label: "Draft" }] : [];

  return (
    <>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div
          className="dyn-header-top-row"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <div style={styles.logo}>Dynasty Oracle — {selectedLeague?.name}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="dyn-btn-ghost" style={styles.btnGhost} onClick={onSwitchLeague}>
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
            <a
              className="dyn-btn-ghost"
              style={{ ...styles.btnGhost, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              href="/admin/top-players"
            >
              Admin
            </a>
            {signedIn && (
              <button className="dyn-btn-ghost" style={styles.btnGhost} onClick={() => setShowProfile(true)}>
                Profile
              </button>
            )}
            <button className="dyn-btn-ghost" style={styles.btnGhost} onClick={onLogout}>
              Log out
            </button>
            {recalculating && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 10, letterSpacing: 1.5, color: "#d9deef", textTransform: "uppercase" }}>
                <span className="dyn-spinner" />
                Recalculating
              </div>
            )}
          </div>
        </div>

        <div
          className="dyn-header-bottom-row"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}
        >
          <div>
            <h1 style={styles.title}>Dynasty Dashboard</h1>
            <p style={styles.subtitle}>
              Avg age: {avgAge} · Dynasty score: {avgScore}/100 · {picks.length} picks ·{" "}
              {analysis.isSuperflex ? "Superflex" : "1QB"} · Weights A
              {analysis.scoringWeights?.age ?? 35}/P{analysis.scoringWeights?.prod ?? 30}/V
              {analysis.scoringWeights?.avail ?? 15}/T{analysis.scoringWeights?.trend ?? 10}/S
              {analysis.scoringWeights?.situ ?? 10}
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-row navigation ── */}
      <div
        className="dyn-tabs-row"
        role="tablist"
        aria-label="Dashboard sections"
        style={{ marginBottom: 32 }}
      >
        {/* Row 1 — primary */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <TabRow tabs={ROW1} activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        {/* Row 2 — secondary, slightly dimmer with more breathing room */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", paddingTop: 2 }}>
          <TabRow
            tabs={ROW2}
            extraTabs={[...liveDraftTab, ...draftTab, { key: "docs", label: "Docs" }]}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            dimmed
          />
        </div>
      </div>

      {showGradeKey && <GradeKeyModal onClose={() => setShowGradeKey(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
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
          cliffCalendar={analysis.cliffCalendar}
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
          hideDraftCapital={!!analysis.draftRecap}
        />
      )}

      {activeTab === "live" && hasLiveDraft && (
        <LiveDraftTab
          draft={analysis.liveDraft.draft}
          initialPicks={analysis.liveDraft.initialPicks}
          rosterPositions={analysis.liveDraft.rosterPositions}
          valueBySleeperId={analysis.liveDraft.valueBySleeperId}
          ppgBySleeperId={analysis.liveDraft.ppgBySleeperId}
          bestAvailablePool={analysis.liveDraft.bestAvailablePool}
          bestAvailableEnriched={analysis.liveDraft.bestAvailableEnriched}
          scoringWeights={analysis.liveDraft.scoringWeights}
          ageCurves={analysis.liveDraft.ageCurves}
          leagueId={analysis.liveDraft.leagueId}
          players={analysis.liveDraft.players}
          initialTradeTransactions={analysis.liveDraft.tradeTransactions}
          tradeReviewInputs={analysis.liveDraft.tradeReviewInputs}
          leagueTeams={analysis.leagueTeams}
          myRosterId={analysis.rosterId}
          ppr={analysis.leagueContext?.ppr ?? 1}
          leagueContext={analysis.leagueContext}
        />
      )}

      {activeTab === "recap" && hasDraft && (
        <DraftRecapTab
          draftRecap={analysis.draftRecap}
          allDraftRecaps={analysis.allDraftRecaps || []}
          myRosterId={analysis.rosterId}
          picksByYear={picksByYear}
          picks={picks}
          leagueContext={leagueContext}
          tradeMarket={tradeMarket}
          leagueTeams={analysis.leagueTeams}
          raPickValues={rosterAuditSource?.pickValues}
        />
      )}

      {activeTab === "projections" && (
        <ProjectionsTab
          leagueTeams={analysis.leagueTeams}
          myRosterId={analysis.rosterId}
          leagueId={selectedLeague?.league_id}
          rosterPositions={selectedLeague?.roster_positions}
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

      {activeTab === "tinder" && (
        <TradeTinderTab
          leagueTeams={analysis.leagueTeams}
          leagueContext={leagueContext}
          tradeMarket={tradeMarket}
          leagueId={selectedLeague?.league_id}
          fantasyCalcTrades={fantasyCalcTrades}
        />
      )}

      {activeTab === "perception" && (
        <PerceptionTab leagueId={selectedLeague?.league_id} />
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
        <StrategyPlannerTab analysis={analysis} selectedLeague={selectedLeague} />
      )}

      {activeTab === "power" && (
        <PowerRankingsTab
          leagueTeams={analysis.leagueTeams}
          myRosterId={analysis.rosterId}
          league={selectedLeague}
          isSuperflex={analysis.isSuperflex}
        />
      )}

      {activeTab === "rankings" && (
        <RankingsTab
          rosterAuditSource={analysis.rosterAuditSource}
          leagueTeams={analysis.leagueTeams}
          scoringWeights={analysis.scoringWeights}
          ageCurves={analysis.ageCurves}
        />
      )}

      {activeTab === "rookies" && <RookieRankingsTab />}

      {activeTab === "blueprint" && (
        <BlueprintClassifierCard
          analysis={analysis}
          leagueContext={analysis.leagueContext}
          leagueTeams={analysis.leagueTeams}
        />
      )}

      {activeTab === "mock" && (
        <MockBlueprints
          pool={analysis.mockDraftPool}
          leagueContext={analysis.leagueContext}
        />
      )}

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
          tradeReview={analysis.tradeReview}
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 340, padding: "48px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <h2 style={{ color: "#fff", margin: "0 0 8px", fontSize: 22 }}>{title}</h2>
      <p style={{ color: "#94a3b8", fontSize: 15, maxWidth: 420, lineHeight: 1.5 }}>{description}</p>
      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <input
          type="password"
          placeholder="Enter access code"
          value={unlockInput}
          onChange={(e) => setUnlockInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") tryUnlock(); }}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #334155", background: "#1e2230", color: "#fff", fontSize: 14, outline: "none" }}
        />
        <button
          onClick={tryUnlock}
          style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#00f5a0", color: "#141722", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
