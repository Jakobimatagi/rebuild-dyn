import { styles } from "../../styles";

export default function AdviceTab({ aiAdvice, aiLoading, onGetAIAdvice }) {
  if (!aiAdvice) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 20 }}>⚡</div>
        <div style={{ fontSize: 14, color: "#d9deef", marginBottom: 24 }}>
          Get personalized AI Dynastyadvice for your exact roster.
        </div>
        <button
          className="dyn-btn"
          style={styles.btn}
          onClick={onGetAIAdvice}
          disabled={aiLoading}
        >
          {aiLoading ? "Analyzing your roster..." : "Generate AI Advice"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
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
