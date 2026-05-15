import { styles } from "../../../styles";
import { getPathsForClass, PATHS } from "../../../lib/strategyPlanner";

const RISK_COLORS = {
  Low: "#00f5a0",
  Medium: "#ffd84d",
  "Medium-High": "#ff9800",
  High: "#ff6b35",
};

function PathCard({ path, selected, selectedVariant, onSelect }) {
  const hasVariants = Array.isArray(path.variants) && path.variants.length > 0;
  const riskColor = RISK_COLORS[path.risk] || "#d1d7ea";

  const cardStyle = {
    ...styles.card,
    textAlign: "left",
    borderColor: selected ? "#00f5a0" : "rgba(255,255,255,0.15)",
    borderWidth: selected ? 2 : 1,
    background: selected ? "rgba(0,245,160,0.07)" : "rgba(255,255,255,0.05)",
    width: "100%",
    marginBottom: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const header = (
    <>
      <div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 2,
            color: "#00f5a0",
            textTransform: "uppercase",
          }}
        >
          {path.class}
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#fff",
            marginTop: 3,
          }}
        >
          {path.name}
          {path.subtitle && (
            <span
              style={{
                fontSize: 11,
                color: "#d1d7ea",
                fontWeight: 400,
                marginLeft: 8,
              }}
            >
              ({path.subtitle})
            </span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#d9deef", lineHeight: 1.4 }}>
        {path.tagline}
      </div>
    </>
  );

  if (hasVariants) {
    return (
      <div style={{ ...cardStyle, cursor: "default" }}>
        {header}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {path.variants.map((v) => {
            const active = selected && selectedVariant === v.key;
            const vRiskColor = RISK_COLORS[v.risk] || "#d1d7ea";
            return (
              <button
                key={v.key}
                onClick={() => onSelect(path.key, v.key)}
                className="dyn-btn-ghost"
                style={{
                  ...styles.btnGhost,
                  flex: "1 1 140px",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderColor: active ? "#00f5a0" : "rgba(255,255,255,0.18)",
                  background: active
                    ? "rgba(0,245,160,0.12)"
                    : "rgba(255,255,255,0.04)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: active ? "#00f5a0" : "#fff",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  {v.label}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#d9deef",
                    lineHeight: 1.3,
                  }}
                >
                  {v.tagline}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 2,
                  }}
                >
                  <span style={styles.tag(vRiskColor)}>{v.risk} risk</span>
                  <span style={{ fontSize: 9, color: "#c8cfe3" }}>
                    {v.timeToContend}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "#c8cfe3",
            marginTop: 4,
            fontStyle: "italic",
          }}
        >
          Best for: {path.bestFor}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(path.key, null)}
      className="dyn-btn-ghost"
      style={{ ...cardStyle, cursor: "pointer" }}
    >
      {header}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span style={styles.tag(riskColor)}>{path.risk} risk</span>
        <span style={{ fontSize: 10, color: "#c8cfe3", letterSpacing: 1 }}>
          {path.timeToContend}
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          color: "#c8cfe3",
          marginTop: 4,
          fontStyle: "italic",
        }}
      >
        Best for: {path.bestFor}
      </div>
    </button>
  );
}

export default function PathSelector({
  classification,
  selectedPathKey,
  selectedVariant,
  onSelectPath,
  showAllPaths,
  onToggleShowAll,
}) {
  const classPaths = getPathsForClass(classification.class);
  const allPaths = showAllPaths ? Object.values(PATHS) : classPaths;

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ ...styles.sectionLabel, marginBottom: 0 }}>
          Strategic Paths
        </div>
        <button
          className="dyn-btn-ghost"
          style={styles.btnGhost}
          onClick={onToggleShowAll}
        >
          {showAllPaths ? "Show my class only" : "Show all 9 paths"}
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {allPaths.map((path) => (
          <PathCard
            key={path.key}
            path={path}
            selected={selectedPathKey === path.key}
            selectedVariant={selectedVariant}
            onSelect={onSelectPath}
          />
        ))}
      </div>
    </div>
  );
}
