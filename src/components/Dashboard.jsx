import { POSITION_PRIORITY } from "../constants";
import { styles } from "../styles";
import GradeKeyModal from "./dashboard/GradeKeyModal";
import LeagueTab from "./dashboard/LeagueTab";
import OverviewTab from "./dashboard/OverviewTab";
import PicksTab from "./dashboard/PicksTab";
import RosterTab from "./dashboard/RosterTab";
import ScoreWeightsModal from "./dashboard/ScoreWeightsModal";
import TradeTab from "./dashboard/TradeTab";

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
  onGetAIAdvice,
  aiLoading,
  showScoreWeights,
  setShowScoreWeights,
  onConfirmScoreWeights,
  recalculating,
}) {
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
            <h1 style={styles.title}>DynastyDashboard</h1>
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
          {/* {!aiAdvice && (
            <button
              className="dyn-btn"
              style={styles.btn}
              onClick={onGetAIAdvice}
              disabled={aiLoading}
            >
              {aiLoading ? "Analyzing..." : "⚡ AI Analysis"}
            </button>
          )} */}
        </div>
      </div>

      <div
        className="dyn-tabs-row"
        style={{
          display: "flex",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          marginBottom: 32,
        }}
      >
        {["overview", "roster", "picks", "trades", "league"].map((tab) => (
          <button
            key={tab}
            className="dyn-tab"
            style={styles.tab(activeTab === tab)}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
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
        />
      )}

      {activeTab === "league" && (
        <LeagueTab
          leagueTeams={analysis.leagueTeams}
          myTeamLabel={analysis.myTeamLabel}
        />
      )}
    </>
  );
}
