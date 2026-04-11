import { useState } from "react";
import { styles } from "../../styles";
import { scoreToGrade } from "../../lib/activityEngine";

function ScoreBar({ score, color }) {
  return (
    <div
      style={{
        height: 4,
        background: "rgba(255,255,255,0.08)",
        borderRadius: 2,
        overflow: "hidden",
        margin: "8px 0",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${score}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

function GradeBadge({ grade, color, size = "md" }) {
  const fontSize = size === "lg" ? 48 : size === "sm" ? 14 : 20;
  const padding = size === "lg" ? "12px 28px" : size === "sm" ? "3px 9px" : "6px 14px";
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        background: `${color}14`,
        border: `1px solid ${color}35`,
        borderRadius: 4,
        padding,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize, fontWeight: 800, color, lineHeight: 1 }}>{grade}</span>
    </div>
  );
}

function ComponentCard({ component }) {
  const grade = scoreToGrade(component.score);
  return (
    <div
      style={{
        ...styles.card,
        borderColor: `${grade.color}28`,
        padding: "14px 16px",
        marginBottom: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 2,
              color: "#9ca3b8",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {component.label}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: grade.color,
              lineHeight: 1,
            }}
          >
            {component.score}
          </div>
          <ScoreBar score={component.score} color={grade.color} />
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <GradeBadge grade={grade.grade} color={grade.color} size="sm" />
          <div style={{ fontSize: 9, color: "#6b7390", marginTop: 4 }}>
            {Math.round(component.weight * 100)}% weight
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#00f5a0", opacity: 0.8, marginTop: 2 }}>
        {component.statLine}
      </div>
      <div style={{ fontSize: 11, color: "#6b7390", marginTop: 4, lineHeight: 1.4 }}>
        {component.description}
      </div>
    </div>
  );
}

const TYPE_ICON = { trade: "\u2194", waiver: "\u23F3", free_agent: "+" };

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "trade", label: "Trades", color: "#c084fc" },
  { key: "fa", label: "FA / Waivers", color: "#64b5f6" },
];

function TransactionFeed({ transactions, feedYears }) {
  const [yearFilter, setYearFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = transactions.filter((t) => {
    if (yearFilter !== "all" && t.year !== yearFilter) return false;
    if (typeFilter === "trade" && t.type !== "trade") return false;
    if (typeFilter === "fa" && t.type === "trade") return false;
    return true;
  });

  return (
    <div style={{ marginTop: 10 }}>
      {/* Filter rows */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        {/* Year pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 9, letterSpacing: 1.5, color: "#4a5068", textTransform: "uppercase", marginRight: 2 }}>Year</span>
          <button
            onClick={() => setYearFilter("all")}
            style={pillActive("all", yearFilter)}
          >
            All
          </button>
          {feedYears.map((yr) => (
            <button key={yr} onClick={() => setYearFilter(yr)} style={pillActive(yr, yearFilter)}>
              {yr}
            </button>
          ))}
        </div>

        {/* Type pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 9, letterSpacing: 1.5, color: "#4a5068", textTransform: "uppercase", marginRight: 2 }}>Type</span>
          {TYPE_FILTERS.map((tf) => {
            const active = typeFilter === tf.key;
            const accent = tf.color || "#00f5a0";
            return (
              <button
                key={tf.key}
                onClick={() => setTypeFilter(tf.key)}
                style={{
                  ...pillStyle,
                  background: active ? `${accent}20` : "rgba(255,255,255,0.06)",
                  color: active ? accent : "#7a819c",
                  borderColor: active ? `${accent}50` : "rgba(255,255,255,0.1)",
                }}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable feed */}
      <div
        style={{
          maxHeight: 360,
          overflowY: "auto",
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {filtered.length === 0 && (
          <div style={{ padding: "20px 14px", fontSize: 12, color: "#4a5068", textAlign: "center" }}>
            No {typeFilter === "trade" ? "trades" : typeFilter === "fa" ? "FA/waiver moves" : "transactions"}
            {yearFilter !== "all" ? ` in ${yearFilter}` : ""}.
          </div>
        )}
        {filtered.map((tx, i) => (
          <div
            key={tx.id + "-" + i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 14px",
              borderBottom:
                i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
            }}
          >
            {/* Type badge */}
            <div
              style={{
                minWidth: 48,
                textAlign: "center",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 7px",
                  borderRadius: 2,
                  fontSize: 9,
                  letterSpacing: 1,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  background: `${tx.color}1a`,
                  color: tx.color,
                  border: `1px solid ${tx.color}40`,
                }}
              >
                {TYPE_ICON[tx.type] || ""} {tx.typeLabel}
              </span>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {tx.type === "trade" && !tx.isMultiTeam ? (
                /* Standard 2-team trade: compact view */
                <div>
                  <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.5 }}>
                    <span style={{ color: "#ff6b35" }}>Sent</span>{" "}
                    {tx.sent.join(", ") || "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.5 }}>
                    <span style={{ color: "#00f5a0" }}>Got</span>{" "}
                    {tx.received.join(", ") || "—"}
                  </div>
                  {tx.partner && (
                    <div style={{ fontSize: 10, color: "#4a5068", marginTop: 2 }}>
                      with {tx.partner}
                    </div>
                  )}
                </div>
              ) : tx.type === "trade" && tx.isMultiTeam ? (
                /* Multi-team trade: per-partner leg breakdown */
                <div>
                  {tx.legs.map((leg) => (
                    <div
                      key={leg.partnerId}
                      style={{
                        padding: "5px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#c084fc",
                          letterSpacing: 0.5,
                          marginBottom: 3,
                        }}
                      >
                        {leg.partnerLabel}
                      </div>
                      {leg.sent.length > 0 && (
                        <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.5 }}>
                          <span style={{ color: "#ff6b35" }}>{"\u2192"}</span>{" "}
                          {leg.sent.join(", ")}
                        </div>
                      )}
                      {leg.received.length > 0 && (
                        <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.5 }}>
                          <span style={{ color: "#00f5a0" }}>{"\u2190"}</span>{" "}
                          {leg.received.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* FA / Waiver */
                <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.5 }}>
                  {tx.received.length > 0 && (
                    <span>
                      <span style={{ color: "#00f5a0" }}>+</span> {tx.received.join(", ")}
                    </span>
                  )}
                  {tx.received.length > 0 && tx.sent.length > 0 && " · "}
                  {tx.sent.length > 0 && (
                    <span>
                      <span style={{ color: "#ff6b35" }}>-</span> {tx.sent.join(", ")}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Date + week */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: "#6b7390" }}>{tx.date}</div>
              {tx.week > 0 && (
                <div style={{ fontSize: 9, color: "#4a5068", marginTop: 1 }}>
                  Wk {tx.week}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const pillStyle = {
  padding: "4px 10px",
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 1,
  border: "1px solid",
  cursor: "pointer",
  textTransform: "uppercase",
};

function pillActive(value, current) {
  const active = value === current;
  return {
    ...pillStyle,
    background: active ? "rgba(0,245,160,0.15)" : "rgba(255,255,255,0.06)",
    color: active ? "#00f5a0" : "#7a819c",
    borderColor: active ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.1)",
  };
}

export default function LeagueActivityTab({ leagueActivity, myTeamLabel }) {
  const [expandedTeam, setExpandedTeam] = useState(null);

  if (!leagueActivity) {
    return (
      <div style={{ color: "#6b7390", fontSize: 13, padding: "24px 0" }}>
        No activity data available.
      </div>
    );
  }

  const { overallScore, overallGrade, components, stats, teams, summaryText } = leagueActivity;

  const componentList = [
    components.tradeVelocity,
    components.rosterMgmt,
    components.tradeBreadth,
    components.dynastyEngagement,
    components.consistency,
  ];

  return (
    <div>
      {/* Hero: League Grade */}
      <div
        style={{
          ...styles.card,
          borderColor: `${overallGrade.color}35`,
          padding: "24px 28px",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          gap: 28,
          flexWrap: "wrap",
        }}
      >
        <GradeBadge grade={overallGrade.grade} color={overallGrade.color} size="lg" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={styles.sectionLabel}>League Activity Health</div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span
              style={{ fontSize: 32, fontWeight: 700, color: overallGrade.color }}
            >
              {overallScore}
            </span>
            <span style={{ fontSize: 14, color: "#6b7390" }}>/ 100</span>
            <span
              style={{
                ...styles.tag(overallGrade.color),
                fontSize: 10,
                marginLeft: 4,
              }}
            >
              {overallGrade.label}
            </span>
          </div>
          <p
            style={{
              fontSize: 13,
              color: "#c3c9dd",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {summaryText}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 20,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>
              {stats.totalTrades}
            </div>
            <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
              total trades
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>
              {stats.tradesPerTeamPerSeason}
            </div>
            <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
              trades/team/yr
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>
              {stats.activeTraderCount}/{stats.numTeams}
            </div>
            <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
              teams trading
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>
              {stats.effectiveSeasons}
            </div>
            <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
              seasons of data
            </div>
          </div>
        </div>
      </div>

      {/* Component Breakdown */}
      <div style={styles.sectionLabel}>Activity Breakdown</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          gap: 10,
          marginBottom: 32,
        }}
      >
        {componentList.map((c) => (
          <ComponentCard key={c.label} component={c} />
        ))}
      </div>

      {/* Per-Team Table */}
      <div style={styles.sectionLabel}>Team Activity — {teams.length} Teams</div>
      {teams.map((team, i) => {
        const isMe = team.label === myTeamLabel;
        const isExpanded = expandedTeam === team.rosterId;
        return (
          <div
            key={team.rosterId}
            style={{
              ...styles.card,
              borderColor: isMe ? "rgba(0,245,160,0.35)" : "rgba(255,255,255,0.1)",
              padding: "12px 18px",
              marginBottom: 8,
            }}
          >
            <button
              onClick={() => setExpandedTeam(isExpanded ? null : team.rosterId)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                textAlign: "left",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                {/* Rank */}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isMe ? "#00f5a0" : "#4a5068",
                    minWidth: 22,
                    flexShrink: 0,
                  }}
                >
                  #{i + 1}
                </span>

                {/* Grade badge */}
                <GradeBadge
                  grade={team.grade.grade}
                  color={team.grade.color}
                  size="sm"
                />

                {/* Team name */}
                <div style={{ flex: 1, minWidth: 120 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isMe ? "#00f5a0" : "#e8e8f0",
                    }}
                  >
                    {team.label}
                  </span>
                  {isMe && (
                    <span
                      style={{
                        fontSize: 9,
                        letterSpacing: 1.5,
                        color: "#00f5a0",
                        marginLeft: 8,
                        opacity: 0.7,
                      }}
                    >
                      YOU
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div
                  style={{
                    display: "flex",
                    gap: 20,
                    fontSize: 11,
                    color: "#7a819c",
                    flexShrink: 0,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{team.tradeCount} trades</span>
                  {team.faAdds > 0 && <span>{team.faAdds} adds</span>}
                  <span>{team.uniquePartners} partner{team.uniquePartners !== 1 ? "s" : ""}</span>
                  <span>{team.futurePickTrades} pick trades</span>
                </div>

                {/* Score + expand arrow */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{ textAlign: "right", minWidth: 46 }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: team.grade.color,
                        lineHeight: 1,
                      }}
                    >
                      {team.teamActivityScore}
                    </div>
                    <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
                      activity
                    </div>
                  </div>
                  <span style={{ fontSize: 14, color: "#4a5068" }}>
                    {isExpanded ? "\u25B2" : "\u25BC"}
                  </span>
                </div>
              </div>

              {/* Mini score bar */}
              <ScoreBar score={team.teamActivityScore} color={team.grade.color} />
            </button>

            {/* Expanded transaction feed */}
            {isExpanded && (
              <TransactionFeed
                transactions={team.transactions}
                feedYears={team.feedYears}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
