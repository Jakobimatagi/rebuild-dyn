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

const STALENESS_BANNERS = {
  aging: {
    color: "#ffd84d",
    bg: "rgba(255,216,77,0.07)",
    border: "rgba(255,216,77,0.4)",
  },
  stale: {
    color: "#ff9800",
    bg: "rgba(255,152,0,0.08)",
    border: "rgba(255,152,0,0.45)",
  },
  missing: {
    color: "#ff6b35",
    bg: "rgba(255,107,53,0.09)",
    border: "rgba(255,107,53,0.5)",
  },
};

function StalenessBanner({ staleness, onRegenerate }) {
  if (!staleness || staleness.severity === "fresh") return null;
  const tone = STALENESS_BANNERS[staleness.severity];
  if (!tone) return null;

  let headline;
  let detail = null;
  if (staleness.severity === "missing") {
    const names = staleness.missingPlayers.map((p) => p.name).join(", ");
    const n = staleness.missingPlayers.length;
    headline = `${n} player${n === 1 ? "" : "s"} on this plan ${n === 1 ? "is" : "are"} no longer on your roster.`;
    detail = names;
  } else if (staleness.severity === "stale") {
    headline = `Plan is ${staleness.daysOld} days old — values and rosters have likely shifted.`;
  } else {
    headline = `Plan is ${staleness.daysOld} days old.`;
  }

  return (
    <div
      style={{
        padding: "10px 14px",
        marginBottom: 16,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 4,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 auto", minWidth: 200 }}>
        <div style={{ fontSize: 12, color: tone.color, fontWeight: 600 }}>
          {headline}
        </div>
        {detail && (
          <div style={{ fontSize: 11, color: "#d9deef", marginTop: 3 }}>
            {detail}
          </div>
        )}
      </div>
      <button
        className="dyn-btn-ghost"
        style={{ ...styles.btnGhost, borderColor: tone.border, color: tone.color }}
        onClick={onRegenerate}
      >
        Regenerate
      </button>
    </div>
  );
}

export default function PlanView({
  plan,
  saved,
  staleness,
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

      <StalenessBanner staleness={staleness} onRegenerate={onRegenerate} />

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
