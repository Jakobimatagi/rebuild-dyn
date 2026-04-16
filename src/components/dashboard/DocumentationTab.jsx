import { useState } from "react";
import { styles } from "../../styles";

const SECTIONS = [
  {
    id: "dynasty-score",
    title: "Dynasty Score",
    content: [
      {
        type: "paragraph",
        text: "Every player receives a composite dynasty score from 0 to 100, built from five weighted components. All components are scored 0–100 and weights are normalized so they always sum to 100%.",
      },
      {
        type: "table",
        headers: ["Component", "Default Weight", "What It Measures"],
        rows: [
          ["Age", "35%", "Where the player sits on their position's age curve"],
          ["Production", "30%", "PPG percentile rank, blended with draft capital"],
          ["Availability", "15%", "Games played out of 17, with injury status penalties"],
          ["Trend", "10%", "Year-over-year PPG improvement or regression"],
          ["Situation", "10%", "Depth chart position (starter, backup, free agent)"],
        ],
      },
      {
        type: "formula",
        text: "Dynasty Score = Age × w_age + Production × w_prod + Availability × w_avail + Trend × w_trend + Situation × w_situ",
      },
    ],
  },
  {
    id: "age",
    title: "Age Component",
    content: [
      {
        type: "paragraph",
        text: "Each position has a defined career arc with three key thresholds. When historical data is available (8+ player-seasons per age bucket), the system builds real age curves from median PPG values across 11 seasons of data. The fallback thresholds below are used when data is insufficient.",
      },
      {
        type: "table",
        headers: ["Position", "Peak Age", "Decline Age", "Cliff Age"],
        rows: [
          ["QB", "27", "33", "38"],
          ["RB", "24", "27", "30"],
          ["WR", "26", "30", "33"],
          ["TE", "27", "31", "34"],
        ],
      },
      {
        type: "list",
        items: [
          "At or before peak: 95 points",
          "Between peak and decline: Slides from 95 down to 30, linearly",
          "Between decline and cliff: Slides from 30 down to 10, linearly",
          "Past cliff: 12 points",
        ],
      },
    ],
  },
  {
    id: "production",
    title: "Production Component",
    content: [
      {
        type: "paragraph",
        text: "Production blends two signals — how a player actually performs (percentile rank) and their draft pedigree (draft capital). Draft capital influence decays over time as real production data accumulates.",
      },
      {
        type: "formula",
        text: "Production = Percentile × (1 − DC_weight) + Draft_Capital_Score × DC_weight",
      },
      {
        type: "table",
        headers: ["Years of Experience", "Draft Capital Weight"],
        rows: [
          ["Rookie (0)", "60%"],
          ["1 year", "45%"],
          ["2 years", "30%"],
          ["3+ years", "15%"],
        ],
      },
      {
        type: "table",
        headers: ["Draft Round", "Slot", "Score"],
        rows: [
          ["Round 1", "Picks 1–10", "95"],
          ["Round 1", "Picks 11–20", "85"],
          ["Round 1", "Picks 21+", "78"],
          ["Round 2", "Any", "62"],
          ["Round 3", "Any", "45"],
          ["Round 4", "Any", "32"],
          ["Round 5+", "Any", "18"],
        ],
      },
      {
        type: "paragraph",
        text: "Production percentiles are PAR-adjusted above replacement level. The bonus (up to +8) rewards players who meaningfully outperform the last starter at their position. Replacement level is calculated per position per season based on league roster configuration.",
      },
    ],
  },
  {
    id: "availability",
    title: "Availability Component",
    content: [
      {
        type: "formula",
        text: "Availability = max(0, min(100, (Games_Played / 17) × 100 − Injury_Penalty))",
      },
      {
        type: "table",
        headers: ["Injury Status", "Penalty"],
        rows: [
          ["IR", "−20"],
          ["PUP", "−15"],
          ["Out", "−10"],
          ["Doubtful", "−5"],
          ["Questionable", "−2"],
          ["Healthy", "0"],
        ],
      },
    ],
  },
  {
    id: "trend",
    title: "Trend Component",
    content: [
      {
        type: "paragraph",
        text: "Measures whether a player is improving or declining year-over-year.",
      },
      {
        type: "list",
        items: [
          "Multi-year players (4+ games): Trend = clamp(60 + ((PPG_current − PPG_prior) / PPG_prior) × 100, 0, 100)",
          "Rookies / single-season: Trend = clamp(60 + ((PPG_current − 10) / 10) × 100, 0, 100) — compares against a 10 PPG baseline",
          "Insufficient data (< 4 games): Defaults to 50",
        ],
      },
    ],
  },
  {
    id: "situation",
    title: "Situation Component",
    content: [
      {
        type: "table",
        headers: ["Depth Chart Position", "Score"],
        rows: [
          ["Starter (#1)", "90"],
          ["Backup (#2)", "55"],
          ["Free agent / no team", "20"],
          ["Other", "30"],
        ],
      },
    ],
  },
  {
    id: "market-blending",
    title: "Market-Weighted Score Blending",
    content: [
      {
        type: "paragraph",
        text: "The final player score is a weighted blend of the internal dynasty score with two external market sources: FantasyCalc (crowd-sourced consensus) and RosterAudit (expert consensus). Community and expert consensus carries the majority of the weight — the internal model catches what the market is slow on rather than being the primary authority.",
      },
      {
        type: "table",
        headers: ["Sources Available", "Internal", "FantasyCalc", "RosterAudit"],
        rows: [
          ["FC + RA (most players)", "20%", "55%", "25%"],
          ["FC only", "25%", "75%", "—"],
          ["RA only", "40%", "—", "60%"],
          ["Neither", "100%", "—", "—"],
        ],
      },
      {
        type: "formula",
        text: "Final Score = Internal × 0.20 + FC_Normalized × 0.55 + RA_Normalized × 0.25",
      },
      {
        type: "paragraph",
        text: "Both FC and RA are normalized to a 0–100 scale using the same formula:",
      },
      {
        type: "table",
        headers: ["Signal", "Weight", "Source"],
        rows: [
          ["Rank Score", "55%", "Overall dynasty rank (inverted)"],
          ["Value Percentile", "45%", "Where the raw value sits among all"],
          ["Trend Adjustment", "±12%", "30-day value trend (±1000 = ±12%)"],
        ],
      },
      {
        type: "paragraph",
        text: "FC is weighted higher than RA because its trade-based crowd data reflects a larger, more liquid market. For trade-engine dollar values, Dynasty Market Value = FC × 0.60 + RA × 0.40.",
      },
    ],
  },
  {
    id: "verdicts",
    title: "Verdicts & Grades",
    content: [
      {
        type: "table",
        headers: ["Score Range", "Verdict", "Color"],
        rows: [
          ["≥ 72", "Buy", "Green"],
          ["≥ 52", "Hold", "Yellow"],
          ["≥ 35", "Sell", "Orange"],
          ["< 35", "Cut", "Red"],
        ],
      },
      {
        type: "table",
        headers: ["Criteria", "Grade", "Label"],
        rows: [
          ["≥ 50% buy verdicts AND avg ≥ 70", "A", "Elite Core"],
          ["≥ 30% buy verdicts AND avg ≥ 58", "B", "Good Shape"],
          ["Average score ≥ 45", "C", "Mixed Bag"],
          ["Otherwise", "D", "Needs Work"],
          ["No players", "F", "Empty"],
        ],
      },
      {
        type: "formula",
        text: "Confidence = clamp(GP/17 × 0.5 + YearsExp/5 × 0.3 + Trend/100 × 0.2, 0, 1) × 100",
      },
    ],
  },
  {
    id: "archetypes",
    title: "Player Archetypes",
    content: [
      {
        type: "paragraph",
        text: "Every player is classified into one of 11 tiers based on their age, production, draft pedigree, and role.",
      },
      {
        type: "table",
        headers: ["Archetype", "Description"],
        rows: [
          ["Cornerstone", "Proven elite + starter + not old"],
          ["Foundational", "Young/prime + starter + high production OR elite draft pick with role"],
          ["Mainstay", "Young/prime + moderately productive"],
          ["Upside Shot", "Young + has a role + hasn't broken out yet"],
          ["Short Term League Winner", "Old but proven elite"],
          ["Productive Vet", "Vet/old + solid production + has a role"],
          ["Short Term Production", "Currently productive but old or declining"],
          ["Serviceable", "Moderately productive + score ≥ 38"],
          ["JAG – Developmental", "Young or high draft capital but unproven"],
          ["JAG – Insurance", "Low score but has some depth value (score ≥ 28)"],
          ["Replaceable", "Default / waiver wire level"],
        ],
      },
      {
        type: "list",
        label: "Diagnostic Tags",
        items: [
          "Undervalued / Overvalued: Internal vs blended score gap ≥ 12",
          "Ascending / Declining: Trend score ≥ 60 or ≤ 40",
          "Fragile Role: Situation score < 55",
          "Injury Risk: Availability score < 60",
          "Volatile Profile: Peak percentile − current percentile ≥ 35",
          "Elite Ceiling: Peak percentile ≥ 90",
          "Untapped Upside: Young + high draft capital + hasn't produced yet",
          "Capped Ceiling: Peak < 75th percentile after 4+ years of experience",
        ],
      },
    ],
  },
  {
    id: "market-value",
    title: "Market Value (Trade Currency)",
    content: [
      {
        type: "paragraph",
        text: "Market value is the dynasty score adjusted for trade context — what a player is actually worth in a deal. Minimum value is 10.",
      },
      {
        type: "formula",
        text: "Market Value = Base Score + Position Premium + Youth Premium + Draft Capital Bonus + Archetype Bonus + Production Bonus − Penalties",
      },
      {
        type: "table",
        headers: ["Archetype", "Bonus"],
        rows: [
          ["Cornerstone", "+18"],
          ["Foundational", "+13"],
          ["Upside Shot", "+10"],
          ["Mainstay", "+8"],
          ["Short Term League Winner", "+6"],
          ["Productive Vet", "+4"],
          ["Short Term Production", "+3"],
          ["Serviceable", "0"],
          ["JAG – Developmental", "+2"],
          ["JAG – Insurance", "−6"],
          ["Replaceable", "−14"],
        ],
      },
      {
        type: "paragraph",
        text: "Archetype bonuses are applied at 70% of the listed value. Additional premiums come from league format (Superflex QB +24, TE premium +10, etc.), youth (20–26 age range up to +10), and draft capital (round 1 picks 1–12 get +8).",
      },
    ],
  },
  {
    id: "projections",
    title: "3-Year Projections",
    content: [
      {
        type: "paragraph",
        text: "For each of the next 3 seasons, the system projects a future dynasty score using age curves, trend decay, regression to the mean, and comparable player outcomes.",
      },
      {
        type: "formula",
        text: "Projected(n) = Score × AgeFactor(n) × TrendCarry(n) × (1 − Regression(n)) + 50 × Regression(n) + CompAdj",
      },
      {
        type: "list",
        items: [
          "Age Factor: Ratio of historical median PPG at future age vs current age",
          "Trend Carry: Decays at 70% per year — hot streaks fade over time",
          "Regression: Increases 5% per year toward a score of 50",
          "Comp Adjustment: ±5 points based on 5 most similar historical player-seasons",
        ],
      },
      {
        type: "formula",
        text: "Similarity = 100 − AgeDiff × 15 − PctileDiff × 0.5 − DraftDiff × 8",
      },
    ],
  },
  {
    id: "breakout-bust",
    title: "Breakout & Bust Probabilities",
    content: [
      {
        type: "paragraph",
        text: "Breakout probability measures the chance of a ≥15 percentile point jump within 2 seasons. Base rate is 22%, adjusted by trend, draft capital, age window, and role. Capped at 92%.",
      },
      {
        type: "table",
        headers: ["Adjustment", "Effect"],
        rows: [
          ["Strong trend (> 65)", "+12%"],
          ["Moderate trend (55–65)", "+6%"],
          ["Weak trend (< 40)", "−8%"],
          ["Round 1 pick", "+10%"],
          ["Round 2 pick", "+5%"],
          ["Round 4+ or undrafted", "−5%"],
          ["In breakout age window", "+5%"],
          ["Outside breakout window", "−5%"],
          ["Already elite (> 75th pctile)", "−12%"],
          ["Poor role (situation < 50)", "−8%"],
        ],
      },
      {
        type: "paragraph",
        text: "Bust/cliff risk measures the chance of a ≥20 percentile point drop within 2 seasons. Base risk depends on distance to cliff age (78% if past cliff → 10% if 4+ years away). Adjusted by trend, health, and position. Capped at 95%.",
      },
      {
        type: "table",
        headers: ["Distance to Cliff", "Base Risk"],
        rows: [
          ["Already past cliff", "78%"],
          ["1 year away", "58%"],
          ["2 years away", "38%"],
          ["3 years away", "20%"],
          ["4+ years away", "10%"],
        ],
      },
    ],
  },
  {
    id: "trajectory",
    title: "Trajectory & Outlook Labels",
    content: [
      {
        type: "table",
        headers: ["Condition", "Trajectory Label"],
        rows: [
          ["Breakout probability > 42%", "Breakout Candidate"],
          ["Bust risk > 55%", "Cliff Risk"],
          ["Year 1 change ≥ +8", "Rising"],
          ["Year 1 change ≥ +3", "Trending Up"],
          ["Year 1 change ≤ −10 or bust > 40%", "Declining"],
          ["Year 1 change ≤ −5", "Fading"],
          ["Year 3 − Year 0 ≥ +6", "Late Bloomer"],
          ["Otherwise", "Stable"],
        ],
      },
      {
        type: "table",
        headers: ["Condition", "Dynasty Outlook"],
        rows: [
          ["Score ≥ 65 + at/before peak + avg proj ≥ 60", "Franchise Cornerstone"],
          ["Score ≥ 70 + before decline + avg proj ≥ 62", "Dynasty Asset"],
          ["Breakout > 42% + round 1–2", "Breakout Candidate"],
          ["Breakout > 32%", "Upside Play"],
          ["Bust > 58%", "Sell Now"],
          ["Bust > 38%", "Trade Window Closing"],
          ["Score ≥ 55 + avg proj ≥ 50", "Reliable Contributor"],
          ["Score ≥ 55 + avg proj < 46", "Sell High"],
          ["Young + score < 45", "Developmental"],
          ["Otherwise", "Depth Piece"],
        ],
      },
    ],
  },
  {
    id: "trade-engine",
    title: "Trade Engine",
    content: [
      {
        type: "formula",
        text: "Side Value = Σ(player market values) + Σ(pick values)",
      },
      {
        type: "table",
        headers: ["Receiving Asset Type", "Rebuilder", "Retooler", "Contender"],
        rows: [
          ["Draft picks", "+8 each", "+4 each", "0"],
          ["Young players (≤ 23)", "+5 each", "+2 each", "0"],
          ["Aging veterans", "−5 each", "−2 each", "+5 each"],
          ["Cornerstones", "+4", "+2", "+4"],
        ],
      },
      {
        type: "table",
        headers: ["Value Gap", "Fairness Rating"],
        rows: [
          ["≤ 5", "Fair"],
          ["≤ 12", "Slight Edge"],
          ["≤ 20", "Uneven"],
          ["> 20", "Lopsided"],
        ],
      },
      {
        type: "table",
        headers: ["Target Class", "Min Assets", "Anchor Req.", "Pick-Only", "Max Overpay", "Underpay Tol."],
        rows: [
          ["Premium QB (SF, ≥88, young)", "2", "Yes", "No", "+6", "0"],
          ["Young Premium WR (≤24, ≥82)", "2", "Yes", "No", "+8", "+1"],
          ["Premium TE (TE prem, ≥78)", "2", "Yes", "No", "+8", "+2"],
          ["Elite Asset (≥86)", "2", "Yes", "No", "+10", "+2"],
          ["Core Asset (≥72)", "1", "No", "Yes", "+10", "+2"],
          ["Starter Asset (<72)", "1", "No", "Yes", "+8", "+3"],
        ],
      },
    ],
  },
  {
    id: "team-phase",
    title: "Team Phase Classification",
    content: [
      {
        type: "paragraph",
        text: "Your team is classified as Contender, Retool, or Rebuild using a composite competitive score (0–100) built from 7 factors.",
      },
      {
        type: "table",
        headers: ["Factor", "Weight", "What It Measures"],
        rows: [
          ["Starter PPG percentile", "25%", "Projected weekly output vs league"],
          ["Points For percentile", "20%", "Actual season scoring vs league"],
          ["Win percentage", "10%", "Current record"],
          ["Dynasty score percentile", "15%", "Average roster score vs league"],
          ["Elite player count", "10%", "Cornerstone/Foundational count"],
          ["Roster completeness", "10%", "Penalty for weak position rooms"],
          ["Age window bonus", "10%", "Bonus if core is in prime (24–28)"],
        ],
      },
      {
        type: "table",
        headers: ["Composite Score", "Phase"],
        rows: [
          ["≥ 60", "Contender"],
          ["40–59", "Retool"],
          ["< 40", "Rebuild"],
        ],
      },
      {
        type: "list",
        label: "Safety Overrides",
        items: [
          "Starter PPG below 25th percentile → can't be Contender (forced to Retool)",
          "Starter PPG in top 3 → can't be Rebuild (bumped to Retool)",
        ],
      },
    ],
  },
  {
    id: "league-activity",
    title: "League Activity Score",
    content: [
      {
        type: "paragraph",
        text: "Measures how active and engaged your dynasty league is on a 0–100 scale.",
      },
      {
        type: "table",
        headers: ["Component", "Weight", "Elite Benchmark"],
        rows: [
          ["Trade Velocity", "30%", "6 trades per team per season"],
          ["Roster Management", "25%", "15 FA/waiver adds per team/season"],
          ["Trade Breadth", "20%", "90%+ of teams participate"],
          ["Dynasty Engagement", "15%", "50% of trades include future picks"],
          ["Consistency", "10%", "Trades spread evenly across weeks"],
        ],
      },
      {
        type: "table",
        headers: ["Per-Team Component", "Weight"],
        rows: [
          ["Trade activity", "40%"],
          ["FA activity", "25%"],
          ["Future pick trade rate", "20%"],
          ["Partner diversity", "15%"],
        ],
      },
      {
        type: "paragraph",
        text: "Trade activity blends absolute rate (vs 6/season benchmark) and relative rate (vs league average), 50/50. Consistency uses the Herfindahl-Hirschman Index (HHI) — evenly spread trades score high, concentrated bursts score low.",
      },
    ],
  },
];

const sidebarStyle = {
  position: "sticky",
  top: 24,
  minWidth: 180,
  maxWidth: 200,
  flexShrink: 0,
  paddingRight: 16,
  borderRight: "1px solid rgba(255,255,255,0.08)",
  maxHeight: "calc(100vh - 200px)",
  overflowY: "auto",
};

const sidebarLinkStyle = (active) => ({
  display: "block",
  padding: "6px 10px",
  fontSize: 11,
  color: active ? "#00f5a0" : "#9ba3c2",
  textDecoration: "none",
  borderLeft: active ? "2px solid #00f5a0" : "2px solid transparent",
  background: active ? "rgba(0,245,160,0.06)" : "transparent",
  borderRadius: "0 3px 3px 0",
  marginBottom: 2,
  cursor: "pointer",
  transition: "color 0.15s, background 0.15s",
  lineHeight: 1.5,
});

const contentAreaStyle = {
  flex: 1,
  minWidth: 0,
  paddingLeft: 24,
};

const sectionStyle = {
  marginBottom: 36,
  scrollMarginTop: 24,
};

const sectionTitleStyle = {
  fontSize: 16,
  fontWeight: 700,
  color: "#fff",
  marginBottom: 14,
  letterSpacing: 0.3,
  lineHeight: 1.3,
};

const paragraphStyle = {
  fontSize: 13,
  color: "#c8cde0",
  lineHeight: 1.7,
  marginBottom: 12,
};

const formulaStyle = {
  background: "rgba(0,245,160,0.06)",
  border: "1px solid rgba(0,245,160,0.15)",
  padding: "10px 14px",
  borderRadius: 4,
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  fontSize: 12,
  color: "#00f5a0",
  marginBottom: 12,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginBottom: 12,
  fontSize: 12,
};

const thStyle = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid rgba(0,245,160,0.18)",
  color: "#00f5a0",
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  fontWeight: 600,
};

const tdStyle = {
  padding: "7px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  color: "#d0d5e8",
};

const listStyle = {
  margin: "0 0 12px 0",
  paddingLeft: 18,
};

const listItemStyle = {
  fontSize: 12,
  color: "#c8cde0",
  lineHeight: 1.7,
  marginBottom: 3,
};

function RenderBlock({ block }) {
  if (block.type === "paragraph") {
    return <p style={paragraphStyle}>{block.text}</p>;
  }
  if (block.type === "formula") {
    return <div style={formulaStyle}>{block.text}</div>;
  }
  if (block.type === "table") {
    return (
      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {block.headers.map((h, i) => (
                <th key={i} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={tdStyle}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "list") {
    return (
      <div>
        {block.label && (
          <div style={{ ...paragraphStyle, fontWeight: 600, color: "#e8e8f0", marginBottom: 4 }}>{block.label}</div>
        )}
        <ul style={listStyle}>
          {block.items.map((item, i) => (
            <li key={i} style={listItemStyle}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}

export default function DocumentationTab() {
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  const activeData = SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0];

  return (
    <div>
      <div style={{ ...styles.sectionLabel, marginBottom: 6 }}>
        How It Works
      </div>
      <p style={{ ...paragraphStyle, marginBottom: 24 }}>
        A complete breakdown of every calculation, formula, and threshold used to build dynasty scores, market values, projections, and trade suggestions.
      </p>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
        {/* Sidebar nav */}
        <nav style={sidebarStyle}>
          {SECTIONS.map((s) => (
            <div
              key={s.id}
              style={sidebarLinkStyle(activeSection === s.id)}
              onClick={() => setActiveSection(s.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") setActiveSection(s.id); }}
            >
              {s.title}
            </div>
          ))}
        </nav>

        {/* Main content */}
        <div style={contentAreaStyle}>
          <h3 style={sectionTitleStyle}>{activeData.title}</h3>
          {activeData.content.map((block, i) => (
            <RenderBlock key={i} block={block} />
          ))}
        </div>
      </div>
    </div>
  );
}
