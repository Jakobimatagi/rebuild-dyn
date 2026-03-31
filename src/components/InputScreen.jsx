import { styles } from "../styles";

export default function InputScreen({
  username,
  setUsername,
  onSubmit,
  loading,
  error,
}) {
  return (
    <>
      <div style={styles.header}>
        <div style={styles.logo}>Dynasty OS</div>
        <h1 style={styles.title}>Dynasty Advisor</h1>
        <p style={styles.subtitle}>
          Connect your Sleeper roster. Get AI-powered Dynastyguidance.
        </p>
      </div>
      <div style={{ maxWidth: 480 }}>
        <div style={styles.sectionLabel}>Your Sleeper Username</div>
        <input
          style={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="e.g. kobidynasty"
        />
        {error && (
          <div
            style={{
              color: "#ff6b35",
              fontSize: 12,
              marginTop: 8,
              letterSpacing: 1,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <button
            className="dyn-btn"
            style={styles.btn}
            onClick={onSubmit}
            disabled={loading || !username}
          >
            {loading ? "Loading..." : "Connect →"}
          </button>
        </div>
        <div
          style={{
            marginTop: 32,
            padding: 20,
            background: "rgba(0,245,160,0.03)",
            border: "1px solid rgba(0,245,160,0.1)",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 3,
              color: "#00f5a0",
              marginBottom: 12,
            }}
          >
            WHAT YOU'LL GET
          </div>
          {[
            "Composite dynasty score — age, production, health, trend",
            "Sell-high & buy-low player targets",
            "Pick capital strategy",
            "AI-powered Dynastytimeline",
            "Positional grade breakdown",
          ].map((item) => (
            <div
              key={item}
              style={{
                fontSize: 12,
                color: "#d9deef",
                marginBottom: 8,
                display: "flex",
                gap: 8,
              }}
            >
              <span style={{ color: "#00f5a0" }}>▸</span> {item}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
