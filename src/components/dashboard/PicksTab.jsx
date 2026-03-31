import { styles } from "../../styles";

export default function PicksTab({ picksByYear, picks }) {
  return (
    <div>
      <div style={styles.sectionLabel}>Draft Capital by Year</div>
      {Object.keys(picksByYear)
        .sort()
        .map((year) => (
          <div key={year} style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 12,
                color: "#00f5a0",
                letterSpacing: 2,
                marginBottom: 10,
              }}
            >
              {year}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {picksByYear[year].map((pick, index) => {
                const label =
                  pick.round === 1
                    ? "1st"
                    : pick.round === 2
                      ? "2nd"
                      : pick.round === 3
                        ? "3rd"
                        : `${pick.round}th`;
                const color =
                  pick.round === 1
                    ? "#00f5a0"
                    : pick.round === 2
                      ? "#ffd84d"
                      : "#d9deef";
                return (
                  <div
                    key={index}
                    style={{
                      padding: "8px 16px",
                      background: `${color}11`,
                      border: `1px solid ${color}44`,
                      borderRadius: 2,
                      fontSize: 12,
                      color,
                    }}
                  >
                    {label} Rd
                    {!pick.isOwn && (
                      <span
                        style={{
                          color: "#d1d7ea",
                          marginLeft: 6,
                          fontSize: 10,
                        }}
                      >
                        via {pick.fromTeam || "trade"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {picks.length === 0 && (
        <div style={{ ...styles.card, color: "#d1d7ea", fontSize: 13 }}>
          No future picks found.
        </div>
      )}

      <div
        style={{
          ...styles.card,
          marginTop: 24,
          borderColor: "rgba(255,211,77,0.2)",
        }}
      >
        <div style={styles.sectionLabel}>Pick Strategy Guide</div>
        <div style={{ fontSize: 12, color: "#d9deef", lineHeight: 1.8 }}>
          <div>
            ▸ <span style={{ color: "#00f5a0" }}>1st round picks</span> —
            franchise-altering. Never sell cheap.
          </div>
          <div>
            ▸ <span style={{ color: "#ffd84d" }}>2nd round picks</span> — strong
            currency. Use to fill positional holes.
          </div>
          <div>
            ▸ <span style={{ color: "#d9deef" }}>3rd+ picks</span> — sweeteners.
            Stack or combine for upgrades.
          </div>
        </div>
      </div>
    </div>
  );
}
