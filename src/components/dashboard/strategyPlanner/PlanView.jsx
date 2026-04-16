import { styles } from "../../../styles";
import RosterTriageGrid from "./RosterTriageGrid";
import TradeTargetList from "./TradeTargetList";
import MarqueeMovesList from "./MarqueeMovesList";
import BombshellMovesList from "./BombshellMovesList";
import HaulTradesList from "./HaulTradesList";
import TierMovesList from "./TierMovesList";
import RookieStrategyTimeline from "./RookieStrategyTimeline";
import RoadmapTimeline from "./RoadmapTimeline";
import RiskFlagList from "./RiskFlagList";

function formatTimestamp(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

export default function PlanView({
  plan,
  saved,
  onSave,
  onRegenerate,
  onClear,
}) {
  if (!plan) return null;

  return (
    <div>
      <div
        style={{
          ...styles.card,
          borderColor: "rgba(0,245,160,0.35)",
          background: "rgba(0,245,160,0.04)",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ flex: "1 1 auto", minWidth: 200 }}>
            <div style={styles.sectionLabel}>Active Plan</div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              {plan.pathName}
              {plan.pathSubtitle && (
                <span
                  style={{
                    fontSize: 12,
                    color: "#d1d7ea",
                    fontWeight: 400,
                    marginLeft: 8,
                  }}
                >
                  ({plan.pathSubtitle})
                </span>
              )}
            </div>
            <div
              style={{ fontSize: 12, color: "#d9deef", marginTop: 4 }}
            >
              {plan.pathTagline}
            </div>
            <div
              style={{ fontSize: 10, color: "#c8cfe3", marginTop: 6 }}
            >
              Generated: {formatTimestamp(plan.generatedAt)}
              {saved && (
                <span style={{ color: "#00f5a0", marginLeft: 8 }}>· saved</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              className="dyn-btn-ghost"
              style={styles.btnGhost}
              onClick={onSave}
            >
              {saved ? "Resave" : "Save Plan"}
            </button>
            <button
              className="dyn-btn-ghost"
              style={styles.btnGhost}
              onClick={onRegenerate}
            >
              Regenerate
            </button>
            <button
              className="dyn-btn-ghost"
              style={styles.btnGhost}
              onClick={onClear}
            >
              Clear
            </button>
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "#d9deef",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "#00f5a0" }}>Mechanic:</strong>{" "}
          {plan.pathMechanic}
        </div>
      </div>

      <RosterTriageGrid triage={plan.sections.triage} />
      <TradeTargetList tradeTargets={plan.sections.tradeTargets} />
      <MarqueeMovesList marqueeMoves={plan.sections.marqueeMoves} />
      <BombshellMovesList bombshellMoves={plan.sections.bombshellMoves} />
      <HaulTradesList haulTrades={plan.sections.haulTrades} />
      <TierMovesList tierMoves={plan.sections.tierMoves} />
      <RookieStrategyTimeline rookieStrategy={plan.sections.rookieStrategy} />
      <RoadmapTimeline roadmap={plan.sections.roadmap} />
      <RiskFlagList risks={plan.sections.risks} />

      {plan.rosterAuditSource?.enabled && (
        <div
          style={{
            fontSize: 10,
            color: "#8a91a8",
            textAlign: "center",
            marginTop: 20,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          Dynasty values blended with{" "}
          <a
            href={plan.rosterAuditSource.url || "https://rosteraudit.com"}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#06b6d4", textDecoration: "none" }}
          >
            {plan.rosterAuditSource.attribution || "RosterAudit"}
          </a>
          {" "}({plan.rosterAuditSource.totalPlayers || 0} players, {Object.keys(plan.rosterAuditSource.pickValues || {}).length} pick values)
        </div>
      )}
    </div>
  );
}
