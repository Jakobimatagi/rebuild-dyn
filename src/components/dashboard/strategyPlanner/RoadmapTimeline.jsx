import { styles } from "../../../styles";

export default function RoadmapTimeline({ roadmap }) {
  if (!roadmap || !roadmap.stages) return null;
  return (
    <div>
      <div style={styles.sectionLabel}>5 — Year-by-Year Roadmap</div>
      <div style={{ position: "relative", marginBottom: 24 }}>
        {roadmap.stages.map((stage, i) => (
          <div
            key={stage.label}
            style={{
              ...styles.card,
              position: "relative",
              marginBottom: 12,
              paddingLeft: 24,
              borderLeft: "3px solid #00f5a0",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: -10,
                top: 18,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#00f5a0",
                color: "#050508",
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                marginBottom: 4,
              }}
            >
              {stage.label}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#e8e8f0",
                marginBottom: 10,
              }}
            >
              {stage.objective}
            </div>

            {stage.moves && stage.moves.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: "#d1d7ea",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Roster moves
                </div>
                {stage.moves.map((m, idx) => (
                  <div
                    key={`${m}-${idx}`}
                    style={{
                      fontSize: 11,
                      color: "#e8e8f0",
                      marginBottom: 3,
                    }}
                  >
                    ▸ {m}
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginTop: 8,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: "#d1d7ea",
                    textTransform: "uppercase",
                    marginBottom: 3,
                  }}
                >
                  Lineup Philosophy
                </div>
                <div style={{ fontSize: 11, color: "#d9deef" }}>
                  {stage.lineupPhilosophy}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: "#d1d7ea",
                    textTransform: "uppercase",
                    marginBottom: 3,
                  }}
                >
                  Expected
                </div>
                <div style={{ fontSize: 11, color: "#00f5a0" }}>
                  {stage.winLoss}
                </div>
              </div>
            </div>

            {stage.decisionGates && stage.decisionGates.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: "#ffd84d",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Decision Gates
                </div>
                {stage.decisionGates.map((g, idx) => (
                  <div
                    key={`${g}-${idx}`}
                    style={{
                      fontSize: 11,
                      color: "#d9deef",
                      marginBottom: 3,
                      fontStyle: "italic",
                    }}
                  >
                    • {g}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
