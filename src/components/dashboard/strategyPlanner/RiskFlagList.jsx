import { styles } from "../../../styles";

const SEVERITY_COLORS = {
  high: "#ff2d55",
  medium: "#ff6b35",
  low: "#ffd84d",
};

export default function RiskFlagList({ risks }) {
  return (
    <div>
      <div style={styles.sectionLabel}>6 — Risk Flags & Pivot Triggers</div>
      {(!risks || risks.length === 0) && (
        <div
          style={{
            ...styles.card,
            fontSize: 12,
            color: "#d9deef",
          }}
        >
          No active risk flags — path is well-aligned with the current roster.
        </div>
      )}
      {risks &&
        risks.map((flag) => {
          const color = SEVERITY_COLORS[flag.severity] || "#d1d7ea";
          return (
            <div
              key={flag.id}
              style={{
                ...styles.card,
                borderColor: `${color}4d`,
                borderLeft: `3px solid ${color}`,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: "#fff",
                    fontWeight: 600,
                    flex: 1,
                    lineHeight: 1.4,
                  }}
                >
                  {flag.risk}
                </div>
                <span style={styles.tag(color)}>{flag.severity}</span>
              </div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: "#d1d7ea",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Pivot Trigger
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#d9deef",
                  fontStyle: "italic",
                  lineHeight: 1.4,
                }}
              >
                {flag.pivotTrigger}
              </div>
            </div>
          );
        })}
    </div>
  );
}
