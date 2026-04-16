import { styles } from "../../../styles";

export default function RookieStrategyTimeline({ rookieStrategy }) {
  if (!rookieStrategy || !rookieStrategy.years) return null;
  return (
    <div>
      <div style={styles.sectionLabel}>4 — Rookie Pick Strategy</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {rookieStrategy.years.map((year) => (
          <div
            key={year.year}
            style={{
              ...styles.card,
              marginBottom: 0,
              borderColor: "rgba(0,245,160,0.25)",
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#00f5a0",
                letterSpacing: 1,
              }}
            >
              {year.year}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#c8cfe3",
                letterSpacing: 1,
                marginTop: 2,
                marginBottom: 10,
              }}
            >
              Currently own: {year.inventory}
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
              Target
            </div>
            <div
              style={{ fontSize: 12, color: "#e8e8f0", marginBottom: 10 }}
            >
              {year.targetPicks}
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
              Behavior
            </div>
            <div
              style={{ fontSize: 12, color: "#e8e8f0", marginBottom: 10 }}
            >
              {year.behavior}
            </div>
            {year.positions && year.positions.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: "#d1d7ea",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Position priority
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginBottom: 10,
                  }}
                >
                  {year.positions.map((p) => (
                    <span key={p} style={styles.tag("#00f5a0")}>
                      {p}
                    </span>
                  ))}
                </div>
              </>
            )}
            {year.note && (
              <div
                style={{
                  fontSize: 10,
                  color: "#d9deef",
                  fontStyle: "italic",
                  lineHeight: 1.4,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  paddingTop: 8,
                  marginTop: 4,
                }}
              >
                {year.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
