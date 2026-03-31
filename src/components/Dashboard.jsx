import { POSITION_PRIORITY } from "../constants";
import { styles } from "../styles";
import GradeKeyModal from "./dashboard/GradeKeyModal";
import OverviewTab from "./dashboard/OverviewTab";
import PicksTab from "./dashboard/PicksTab";
import RosterTab from "./dashboard/RosterTab";

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
  onGetAIAdvice,
  aiLoading,
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
          <button
            className="dyn-btn-ghost"
            style={styles.btnGhost}
            onClick={onSwitchLeague}
          >
            Switch League
          </button>
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
              picks · {analysis.isSuperflex ? "Superflex" : "1QB"}
            </p>
          </div>
          {!aiAdvice && (
            <button
              className="dyn-btn"
              style={styles.btn}
              onClick={onGetAIAdvice}
              disabled={aiLoading}
            >
              {aiLoading ? "Analyzing..." : "⚡ AI Analysis"}
            </button>
          )}
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
        {["overview", "roster", "picks"].map((tab) => (
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
        />
      )}

      {activeTab === "picks" && (
        <PicksTab picksByYear={picksByYear} picks={picks} />
      )}
    </>
  );
}
