import { useState } from "react";
import { POSITION_PRIORITY } from "../../constants";
import { getColor, rankLabel } from "../../lib/analysis";
import { styles } from "../../styles";

const VERDICT_COLOR = {
  buy: "#00f5a0",
  hold: "#ffd84d",
  sell: "#ff6b35",
  cut: "#ff2d55",
};

function PositionGrades({ posRanks }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {POSITION_PRIORITY.map((pos) => {
        const r = posRanks?.[pos];
        const color = r?.color || "#4a5068";
        return (
          <div
            key={pos}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: `${color}12`,
              border: `1px solid ${color}30`,
              borderRadius: 4,
              padding: "6px 12px",
              minWidth: 44,
            }}
          >
            <span style={{ fontSize: 9, letterSpacing: 2, color: "#9ca3b8", textTransform: "uppercase" }}>
              {pos}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1.3 }}>
              {r ? rankLabel(r.rank) : "—"}
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

function TeamPicks({ picks, numTeams }) {
  if (!picks || picks.length === 0) return null;
  const currentYear = String(new Date().getFullYear());
  const byYear = {};
  for (const pick of picks) {
    const yr = pick.season || "?";
    (byYear[yr] = byYear[yr] || []).push(pick);
  }
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ ...styles.sectionLabel, marginBottom: 8 }}>Draft Capital</div>
      {Object.keys(byYear).sort().map((year) => (
        <div key={year} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "#00f5a0", letterSpacing: 2, marginBottom: 6 }}>{year}</div>
          {year > currentYear && (
            <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 4, fontStyle: "italic" }}>
              Projected
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {byYear[year].map((pick, i) => {
              const label = pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `${pick.round}th`;
              const color = pick.round === 1 ? "#00f5a0" : pick.round === 2 ? "#ffd84d" : "#d9deef";
              return (
                <div
                  key={i}
                  style={{
                    padding: "4px 10px",
                    background: `${color}11`,
                    border: `1px solid ${color}44`,
                    borderRadius: 2,
                    fontSize: 11,
                    color,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {pick.slotLabel ? (
                    <span style={{ fontWeight: 600 }}>{pick.slotLabel}</span>
                  ) : (
                    <span>{label} Rd</span>
                  )}
                  {!pick.isOwn && (
                    <span style={{ color: "#d1d7ea", fontSize: 9 }}>
                      via {pick.fromTeam || "trade"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LeagueTab({ leagueTeams, myTeamLabel, isSuperflex }) {
  const [expandedTeam, setExpandedTeam] = useState(null);

  const sorted = [...leagueTeams].sort(
    (a, b) => (b.teamPhase?.score || 0) - (a.teamPhase?.score || 0),
  );

  const phaseColor = (phase) =>
    phase === "contender"
      ? "#00f5a0"
      : phase === "retool"
        ? "#ffd84d"
        : "#ff6b35";

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
                  <PositionGrades posRanks={team.posRanks} />
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
                  gap: 12,
                  marginTop: 8,
                  fontSize: 11,
                  color: "#6b7390",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {team.teamPhase && (
                  <span
                    style={{
                      ...styles.tag(phaseColor(team.teamPhase.phase)),
                      fontSize: 8,
                      padding: "2px 7px",
                    }}
                  >
                    {team.teamPhase.phase}
                  </span>
                )}
                {(team.wins > 0 || team.losses > 0) && (
                  <span>{team.wins}-{team.losses}{team.ties ? `-${team.ties}` : ""}</span>
                )}
                {team.pointsFor > 0 && (
                  <span>PF: {team.pointsFor.toFixed(1)}</span>
                )}
                {team.teamPhase?.starterPPG > 0 && (
                  <span>Starter PPG: {team.teamPhase.starterPPG}</span>
                )}
                <span>Avg age: {team.avgAge}</span>
                <span>{team.picks?.length ?? 0} picks</span>
              </div>
            </button>

            {isExpanded && (
              <>
                <TeamRoster byPos={team.byPos} />
                <TeamPicks picks={team.picks} numTeams={leagueTeams.length} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
