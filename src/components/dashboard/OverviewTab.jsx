import { POSITION_PRIORITY } from "../../constants";
import { getColor, getRoomGrade } from "../../lib/analysis";
import { styles } from "../../styles";

export default function OverviewTab({
  byPos,
  sells,
  weakRooms,
  proportions,
  aiAdvice,
  teamPhase,
  onOpenGradeKey,
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div style={{ ...styles.sectionLabel, marginBottom: 0 }}>
          Position Room Grades
        </div>
        <button
          onClick={onOpenGradeKey}
          title="Grade key"
          className="dyn-grade-help"
          style={{
            width: 17,
            height: 17,
            borderRadius: "50%",
            background: "transparent",
            border: "1px solid rgba(0,245,160,0.28)",
            color: "#00f5a0",
            fontSize: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          ?
        </button>
      </div>

      <div
        className="dyn-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {POSITION_PRIORITY.map((pos) => {
          const grade = getRoomGrade(byPos[pos]);
          const players = byPos[pos];
          const roomAvg = players.length
            ? Math.round(
                players.reduce((s, p) => s + p.score, 0) / players.length,
              )
            : 0;
          return (
            <div
              key={pos}
              style={{
                ...styles.card,
                borderColor: `${grade.color}33`,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 3,
                  color: "#d1d7ea",
                  marginBottom: 8,
                }}
              >
                {pos}
              </div>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 700,
                  color: grade.color,
                  lineHeight: 1,
                }}
              >
                {grade.grade}
              </div>
              <div style={{ fontSize: 10, color: "#d1d7ea", marginTop: 8 }}>
                {grade.label}
              </div>
              <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 4 }}>
                {players.length} players · avg {roomAvg}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="dyn-grid-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div style={styles.card}>
          <div style={styles.sectionLabel}>🔴 Sell Now</div>
          {sells.slice(0, 4).map((p) => (
            <div key={p.id} style={styles.playerRow}>
              <div>
                <div style={{ fontSize: 13, color: "#e8e8f0" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "#fff" }}>
                  {p.team} · {p.age}yo{p.ppg ? ` · ${p.ppg}ppg` : ""}
                </div>
              </div>
              <span style={styles.tag(getColor(p.verdict))}>{p.verdict}</span>
            </div>
          ))}
          {sells.length === 0 && (
            <div style={{ fontSize: 12, color: "#d1d7ea" }}>
              No obvious sells.
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.sectionLabel}>🟢 Weak Rooms to Address</div>
          {weakRooms.length === 0 ? (
            <div style={{ fontSize: 12, color: "#d1d7ea" }}>
              All rooms reasonably stocked.
            </div>
          ) : (
            weakRooms.map((pos) => (
              <div key={pos} style={styles.playerRow}>
                <div>
                  <div style={{ fontSize: 13, color: "#e8e8f0" }}>
                    Need {pos} depth
                  </div>
                  <div style={{ fontSize: 11, color: "#d1d7ea" }}>
                    Target age 22-24 via trade or draft
                  </div>
                </div>
                <span style={styles.tag("#ff6b35")}>PRIORITY</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={styles.sectionLabel}>Roster Value Balance</div>
        <div
          className="dyn-grid-4"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}
        >
          {POSITION_PRIORITY.map((pos) => {
            const p = proportions[pos];
            const over = p.delta > 5;
            const under = p.delta < -5;
            const barColor = over ? "#ffd84d" : under ? "#ff6b35" : "#00f5a0";
            return (
              <div key={pos}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: 2,
                      color: "#d1d7ea",
                      textTransform: "uppercase",
                    }}
                  >
                    {pos}
                  </span>
                  <span
                    style={{ fontSize: 10, color: barColor, fontWeight: 700 }}
                  >
                    {p.actual}%
                    <span
                      style={{
                        color: "#c8cfe3",
                        fontWeight: 400,
                        marginLeft: 4,
                      }}
                    >
                      / {p.ideal}%
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 2,
                    position: "relative",
                    marginBottom: 3,
                  }}
                >
                  <div
                    style={{
                      height: 4,
                      width: `${Math.min(p.actual, 50) * 2}%`,
                      background: barColor,
                      borderRadius: 2,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: -2,
                      left: `${Math.min(p.ideal, 50) * 2}%`,
                      width: 1,
                      height: 8,
                      background: "rgba(255,255,255,0.25)",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: over ? "#ffd84d" : under ? "#ff6b35" : "#c8cfe3",
                    letterSpacing: 1,
                  }}
                >
                  {over
                    ? `+${p.delta}% over`
                    : under
                      ? `${p.delta}% under`
                      : "on target"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {teamPhase && (
        <div
          style={{
            ...styles.card,
            borderColor:
              teamPhase.phase === "contender"
                ? "rgba(0,245,160,0.3)"
                : teamPhase.phase === "retool"
                  ? "rgba(255,216,77,0.3)"
                  : "rgba(255,107,53,0.3)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div>
              <div style={styles.sectionLabel}>Team Phase</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color:
                    teamPhase.phase === "contender"
                      ? "#00f5a0"
                      : teamPhase.phase === "retool"
                        ? "#ffd84d"
                        : "#ff6b35",
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                {teamPhase.phase}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color:
                    teamPhase.phase === "contender"
                      ? "#00f5a0"
                      : teamPhase.phase === "retool"
                        ? "#ffd84d"
                        : "#ff6b35",
                }}
              >
                {teamPhase.score}
              </div>
              <div style={{ fontSize: 10, color: "#d1d7ea", letterSpacing: 2 }}>
                / 100
              </div>
            </div>
          </div>
          {teamPhase.signals.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {teamPhase.signals.map((signal) => (
                <div
                  key={signal}
                  style={{ fontSize: 11, color: "#d9deef", marginBottom: 4 }}
                >
                  <span style={{ color: "#c8cfe3" }}>▸ </span>
                  {signal}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {aiAdvice && (
        <div
          style={{
            ...styles.card,
            borderColor: "rgba(0,245,160,0.3)",
            background: "rgba(0,245,160,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={styles.sectionLabel}>⚡ AI Verdict</div>
              <div style={{ fontSize: 14, color: "#e8e8f0" }}>
                {aiAdvice.overallVerdict}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, fontWeight: 700, color: "#00f5a0" }}>
                {aiAdvice.rebuildScore}
              </div>
              <div style={{ fontSize: 10, color: "#d1d7ea", letterSpacing: 2 }}>
                / 10
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#d9deef" }}>
            Timeline to contend:{" "}
            <span style={{ color: "#00f5a0" }}>
              {aiAdvice.timelineToContend}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
