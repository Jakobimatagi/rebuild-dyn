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
          AI-powered dynasty fantasy football analysis for Sleeper leagues.
        </p>
      </div>

      <div style={{ maxWidth: 480, marginBottom: 56 }}>
        <div style={styles.sectionLabel}>Your Sleeper Username</div>
        <input
          style={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="e.g. UserName"
        />
        {error && (
          <div style={{ color: "#ff6b35", fontSize: 12, marginTop: 8, letterSpacing: 1 }}>
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
      </div>

      {/* Features */}
      <div style={dividerStyle} />
      <div style={sectionHeadStyle}>WHAT YOU GET</div>
      <div style={gridStyle}>
        {features.map((f) => (
          <div key={f.title} style={cardStyle}>
            <div style={cardTitleStyle}>{f.title}</div>
            <p style={cardBodyStyle}>{f.body}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ ...dividerStyle, marginTop: 48 }} />
      <div style={sectionHeadStyle}>HOW IT WORKS</div>
      <div style={{ maxWidth: 640, marginBottom: 48 }}>
        {steps.map((s, i) => (
          <div key={s.title} style={stepStyle}>
            <div style={stepNumStyle}>{i + 1}</div>
            <div>
              <div style={cardTitleStyle}>{s.title}</div>
              <p style={cardBodyStyle}>{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div style={dividerStyle} />
      <div style={sectionHeadStyle}>FAQ</div>
      <div style={{ maxWidth: 640, marginBottom: 48 }}>
        {faq.map((f) => (
          <div key={f.q} style={{ marginBottom: 24 }}>
            <div style={{ ...cardTitleStyle, marginBottom: 6 }}>{f.q}</div>
            <p style={cardBodyStyle}>{f.a}</p>
          </div>
        ))}
      </div>

      {/* About */}
      <div style={dividerStyle} />
      <div style={sectionHeadStyle}>ABOUT</div>
      <p style={{ ...cardBodyStyle, maxWidth: 640, marginBottom: 48, lineHeight: 1.8 }}>
        Dynasty Advisor is a free tool built for dynasty fantasy football managers
        on the Sleeper platform. Dynasty leagues differ from redraft leagues in that
        players stay on your roster year after year, making long-term roster
        construction and age management critical. Dynasty Advisor helps you
        understand your roster's strengths and weaknesses, identify trade
        opportunities, and plan your path to competing for a championship.
      </p>
    </>
  );
}

const features = [
  {
    title: "Composite Dynasty Score",
    body: "Every player on your roster is scored 0–100 based on age, recent production, injury history, and dynasty trend. Instantly see which players are assets and which are liabilities.",
  },
  {
    title: "Positional Grade Breakdown",
    body: "See letter grades (A–F) for each position room — quarterback, running back, wide receiver, tight end. Understand where your roster is elite and where it needs work.",
  },
  {
    title: "Sell-High & Buy-Low Targets",
    body: "The algorithm flags players who are likely overvalued based on age curve and recent stats — ideal sell candidates — and spots undervalued players to target in trades.",
  },
  {
    title: "Pick Capital Strategy",
    body: "Your draft pick inventory is analyzed across all future years. See where you're pick-rich or pick-poor and get recommendations on whether to buy or sell picks.",
  },
  {
    title: "AI-Powered Advice",
    body: "Get a personalized written breakdown from an AI advisor: rebuild score, top trade targets, win-now moves, timeline to contend, and specific warnings about your roster.",
  },
  {
    title: "Trade Value Integration",
    body: "Player values are pulled live from FantasyCalc, the most widely used dynasty trade value chart, so all analysis reflects current market prices.",
  },
];

const steps = [
  {
    title: "Enter your Sleeper username",
    body: "Type in the username you use on the Sleeper app. Sleeper is a free fantasy football platform and no password is required — all data is read from Sleeper's public API.",
  },
  {
    title: "Select your dynasty league",
    body: "Dynasty Advisor automatically detects your dynasty leagues. Pick the one you want to analyze. You can switch between leagues at any time.",
  },
  {
    title: "Review your roster analysis",
    body: "Within seconds you'll see a full breakdown of your roster: player scores, positional grades, pick inventory, trade targets, and an overall dynasty health rating.",
  },
  {
    title: "Get AI advice",
    body: "Hit the AI Advice tab to get a plain-English analysis of your team — what to do now, what to watch out for, and a realistic timeline to contend.",
  },
];

const faq = [
  {
    q: "Is Dynasty Advisor free?",
    a: "Yes, completely free. There is no account required beyond your existing Sleeper username.",
  },
  {
    q: "Does it work for all Sleeper dynasty leagues?",
    a: "It works for any dynasty or keeper league on Sleeper, including 1QB and Superflex formats. PPR, half-PPR, and standard scoring are all supported.",
  },
  {
    q: "How often is the data updated?",
    a: "Player stats and trade values are fetched fresh each time you load your roster. Historical stats are cached to keep load times fast.",
  },
  {
    q: "Does Dynasty Advisor store my data?",
    a: "No. Your Sleeper username is saved in your browser's local storage so you don't have to retype it. All roster and player data is fetched directly from Sleeper's API and never sent to our servers.",
  },
  {
    q: "What is a dynasty fantasy football league?",
    a: "In a dynasty league, you keep your entire roster from year to year, including rookie draft picks. Unlike redraft leagues, dynasty rewards long-term roster building, age management, and trade savvy — making tools like Dynasty Advisor especially valuable.",
  },
];

const dividerStyle = {
  borderBottom: "1px solid rgba(0,245,160,0.1)",
  marginBottom: 24,
};

const sectionHeadStyle = {
  fontSize: 10,
  letterSpacing: 3,
  color: "#00f5a0",
  marginBottom: 20,
  opacity: 0.7,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 16,
  marginBottom: 48,
};

const cardStyle = {
  padding: 20,
  background: "rgba(0,245,160,0.03)",
  border: "1px solid rgba(0,245,160,0.1)",
  borderRadius: 4,
};

const cardTitleStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.5,
  color: "#e8e8f0",
  textTransform: "uppercase",
  marginBottom: 8,
};

const cardBodyStyle = {
  fontSize: 12,
  color: "#9aa0b8",
  lineHeight: 1.7,
  margin: 0,
};

const stepStyle = {
  display: "flex",
  gap: 20,
  marginBottom: 24,
  alignItems: "flex-start",
};

const stepNumStyle = {
  flexShrink: 0,
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "1px solid rgba(0,245,160,0.3)",
  color: "#00f5a0",
  fontSize: 11,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
