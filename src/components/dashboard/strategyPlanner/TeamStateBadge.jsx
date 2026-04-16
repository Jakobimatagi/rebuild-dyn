import { useState } from "react";
import { styles } from "../../../styles";
import { PLANNER_CLASSES } from "../../../lib/strategyPlanner";

const CLASS_COLORS = {
  contender: "#00f5a0",
  retooler: "#ffd84d",
  rebuilder: "#ff6b35",
};

const CLASS_LABELS = {
  contender: "Contender",
  retooler: "Retooler",
  rebuilder: "Rebuilder",
};

export default function TeamStateBadge({
  classification,
  onOverrideClass,
}) {
  const [expanded, setExpanded] = useState(false);
  if (!classification) return null;

  const color = CLASS_COLORS[classification.class] || "#d1d7ea";
  const derived = classification.derivedClass;

  return (
    <div
      style={{
        ...styles.card,
        borderColor: `${color}4d`,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 auto", minWidth: 200 }}>
          <div style={styles.sectionLabel}>Team State</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {CLASS_LABELS[classification.class] || classification.class}
          </div>
          {classification.userOverride && (
            <div style={{ fontSize: 10, color: "#d1d7ea", marginTop: 4 }}>
              Auto-classified as {CLASS_LABELS[derived]} — you overrode.
            </div>
          )}
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color }}>
            {classification.confidence}
          </div>
          <div style={{ fontSize: 10, color: "#d1d7ea", letterSpacing: 2 }}>
            / 100
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            className="dyn-btn-ghost"
            style={styles.btnGhost}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide reasoning" : "Why?"}
          </button>
          <select
            aria-label="Override team classification"
            value={classification.class}
            onChange={(e) => onOverrideClass(e.target.value)}
            style={{
              background: "rgba(0,0,0,0.3)",
              color: "#e8e8f0",
              border: "1px solid rgba(255,255,255,0.18)",
              padding: "6px 10px",
              fontSize: 10,
              letterSpacing: 1,
              textTransform: "uppercase",
              borderRadius: 3,
            }}
          >
            {PLANNER_CLASSES.map((c) => (
              <option key={c} value={c}>
                {CLASS_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          {classification.reasoning.length === 0 ? (
            <div style={{ fontSize: 11, color: "#d1d7ea" }}>
              No reasoning signals available.
            </div>
          ) : (
            classification.reasoning.map((signal, i) => (
              <div
                key={`${signal}-${i}`}
                style={{ fontSize: 11, color: "#d9deef", marginBottom: 4 }}
              >
                <span style={{ color: "#c8cfe3" }}>▸ </span>
                {signal}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
