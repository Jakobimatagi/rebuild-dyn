import { useState } from "react";
import { POSITION_PRIORITY } from "../../constants";
import { getColor, getRoomGrade } from "../../lib/analysis";
import { styles } from "../../styles";

const VERDICT_COLOR = {
  buy: "#00f5a0",
  hold: "#ffd84d",
  sell: "#ff6b35",
  cut: "#ff2d55",
};

function PositionGrades({ byPos }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {POSITION_PRIORITY.map((pos) => {
        const grade = getRoomGrade(byPos[pos] || []);
        return (
          <div
            key={pos}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: `${grade.color}12`,
              border: `1px solid ${grade.color}30`,
              borderRadius: 4,
              padding: "6px 12px",
              minWidth: 44,
            }}
          >
            <span style={{ fontSize: 9, letterSpacing: 2, color: "#9ca3b8", textTransform: "uppercase" }}>
              {pos}
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: grade.color, lineHeight: 1.3 }}>
              {grade.grade}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TeamRoster({ byPos }) {
  return (
    <div style={{ marginTop: 16 }}>
      {POSITION_PRIORITY.map((pos) => {
        const players = (byPos[pos] || []).slice(0, 5);
        if (!players.length) return null;
        return (
          <div key={pos} style={{ marginBottom: 14 }}>
            <div style={{ ...styles.sectionLabel, marginBottom: 8 }}>{pos}</div>
            {players.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: VERDICT_COLOR[p.verdict] || "#555",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, color: "#e8e8f0" }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: "#6b7390" }}>
                    {p.age}yo
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#7a819c",
                      letterSpacing: 0.5,
                    }}
                  >
                    {p.archetype}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: getColor(p.verdict),
                      minWidth: 24,
                      textAlign: "right",
                    }}
                  >
                    {p.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function LeagueTab({ leagueTeams, myTeamLabel }) {
  const [expandedTeam, setExpandedTeam] = useState(null);

  const sorted = [...leagueTeams].sort((a, b) => b.avgScore - a.avgScore);

  return (
    <div>
      <div style={styles.sectionLabel}>League Teams — {leagueTeams.length} Rosters</div>
      {sorted.map((team, i) => {
        const isMe = team.label === myTeamLabel;
        const isExpanded = expandedTeam === team.rosterId;
        const rank = i + 1;

        return (
          <div
            key={team.rosterId}
            style={{
              ...styles.card,
              borderColor: isMe
                ? "rgba(0,245,160,0.35)"
                : "rgba(255,255,255,0.1)",
              padding: "14px 18px",
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
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: isMe ? "#00f5a0" : "#4a5068",
                      fontWeight: 700,
                      minWidth: 20,
                    }}
                  >
                    #{rank}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isMe ? "#00f5a0" : "#e8e8f0",
                    }}
                  >
                    {team.label}
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
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <PositionGrades byPos={team.byPos} />
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#e8e8f0",
                        lineHeight: 1,
                      }}
                    >
                      {team.avgScore}
                    </div>
                    <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
                      avg score
                    </div>
                  </div>
                  <span style={{ fontSize: 14, color: "#4a5068" }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginTop: 8,
                  fontSize: 11,
                  color: "#6b7390",
                }}
              >
                <span>Avg age: {team.avgAge}</span>
                <span>{team.picks?.length ?? 0} picks</span>
                <span>
                  {team.enriched?.filter((p) => p.verdict === "buy").length ?? 0} buys
                </span>
              </div>
            </button>

            {isExpanded && <TeamRoster byPos={team.byPos} />}
          </div>
        );
      })}
    </div>
  );
}
