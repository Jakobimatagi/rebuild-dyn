import { styles } from "../../styles";

export default function AdviceTab({ aiAdvice, aiLoading, aiError, onGetAIAdvice }) {
  if (!aiAdvice) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 20 }}>⚡</div>
        <div style={{ fontSize: 14, color: "#d9deef", marginBottom: 8 }}>
          Get personalized AI dynasty advice for your exact roster.
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 24 }}>
          Pulls live injury / depth-chart news. Limited to one generation per day.
        </div>
        <button
          className="dyn-btn"
          style={styles.btn}
          onClick={onGetAIAdvice}
          disabled={aiLoading}
        >
          {aiLoading ? "Analyzing your roster..." : "Generate AI Advice"}
        </button>
        {aiError && (
          <div style={{ marginTop: 16, fontSize: 12, color: "#ff6b35" }}>
            {aiError}
          </div>
        )}
      </div>
    );
  }

  const health = aiAdvice.teamHealth;
  const direction = aiAdvice.recommendedDirection;
  const gradeColor = gradeToColor(health?.grade);
  const dirColor = directionToColor(direction?.label);

  return (
    <div>
      {(health || direction) && (
        <div
          className="dyn-grid-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {health && (
            <div style={styles.card}>
              <div style={styles.sectionLabel}>🩺 Team Health</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: gradeColor }}>
                  {health.grade || "—"}
                </span>
                {health.ageProfile && (
                  <span style={styles.tag(gradeColor)}>{health.ageProfile}</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "#d9deef", lineHeight: 1.6, marginBottom: 8 }}>
                {health.summary}
              </div>
              {health.positionBalance && (
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
                  {health.positionBalance}
                </div>
              )}
            </div>
          )}
          {direction && (
            <div style={styles.card}>
              <div style={styles.sectionLabel}>🧭 Recommended Direction</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: dirColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {direction.label || "—"}
                </span>
                {direction.horizon && (
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>· {direction.horizon}</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "#d9deef", lineHeight: 1.6, marginBottom: 8 }}>
                {direction.rationale}
              </div>
              {direction.tradeoff && (
                <div style={{ fontSize: 12, color: "#ffd84d", lineHeight: 1.5 }}>
                  Tradeoff: {direction.tradeoff}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div
        className="dyn-grid-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={styles.card}>
          <div style={styles.sectionLabel}>💪 Strengths</div>
          {aiAdvice.strengths?.map((strength, index) => (
            <div
              key={index}
              style={{ fontSize: 12, color: "#d9deef", marginBottom: 8 }}
            >
              <span style={{ color: "#00f5a0" }}>▸ </span>
              {strength}
            </div>
          ))}
        </div>
        <div style={styles.card}>
          <div style={styles.sectionLabel}>⚠ Warnings</div>
          {aiAdvice.warnings?.map((warning, index) => (
            <div
              key={index}
              style={{ fontSize: 12, color: "#d9deef", marginBottom: 8 }}
            >
              <span style={{ color: "#ff6b35" }}>▸ </span>
              {warning}
            </div>
          ))}
        </div>
      </div>
      <div style={styles.card}>
        <div style={styles.sectionLabel}>🔴 Top Sells</div>
        {aiAdvice.topSells?.map((sell, index) => (
          <div key={index} style={styles.playerRow}>
            <div>
              <div style={{ fontSize: 13, color: "#e8e8f0" }}>{sell.name}</div>
              <div style={{ fontSize: 11, color: "#d1d7ea" }}>
                {sell.reason}
              </div>
            </div>
            <span style={styles.tag("#ff6b35")}>sell</span>
          </div>
        ))}
      </div>
      <div style={styles.card}>
        <div style={styles.sectionLabel}>🟢 Buy Targets</div>
        {aiAdvice.topBuys?.map((buy, index) => (
          <div key={index} style={styles.playerRow}>
            <div>
              <div style={{ fontSize: 13, color: "#e8e8f0" }}>
                {buy.position}: {buy.target}
              </div>
              <div style={{ fontSize: 11, color: "#d1d7ea" }}>{buy.why}</div>
            </div>
            <span style={styles.tag("#00f5a0")}>target</span>
          </div>
        ))}
      </div>
      <div style={styles.card}>
        <div style={styles.sectionLabel}>📅 Pick Strategy</div>
        <div style={{ fontSize: 13, color: "#d9deef", lineHeight: 1.8 }}>
          {aiAdvice.pickStrategy}
        </div>
      </div>
      <div style={styles.card}>
        <div style={styles.sectionLabel}>🎯 Win-Now Moves</div>
        {aiAdvice.winNowMoves?.map((move, index) => (
          <div
            key={index}
            style={{ fontSize: 12, color: "#d9deef", marginBottom: 8 }}
          >
            <span style={{ color: "#ffd84d" }}>{index + 1}. </span>
            {move}
          </div>
        ))}
      </div>
    </div>
  );
}

function gradeToColor(grade) {
  switch ((grade || "").toUpperCase()) {
    case "A": return "#00f5a0";
    case "B": return "#7cf07c";
    case "C": return "#ffd84d";
    case "D": return "#ff9a3c";
    case "F": return "#ff6b35";
    default: return "#d9deef";
  }
}

function directionToColor(label) {
  switch ((label || "").toLowerCase()) {
    case "contend-now": return "#00f5a0";
    case "retool": return "#ffd84d";
    case "soft-rebuild": return "#ff9a3c";
    case "full-rebuild": return "#ff6b35";
    default: return "#d9deef";
  }
}
