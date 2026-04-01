import { ARCHETYPE_META, POSITION_PRIORITY } from "../../constants";
import { getColor } from "../../lib/analysis";
import { styles } from "../../styles";
import ScoreBar from "./ScoreBar";

export default function RosterTab({
  byPos,
  collapsedRooms,
  expandedBars,
  onToggleRoom,
  onToggleBars,
}) {
  return (
    <div>
      {POSITION_PRIORITY.map((pos) => {
        const isRoomCollapsed = !!collapsedRooms[pos];
        return (
          <div key={pos} style={{ marginBottom: 32 }}>
            <button
              onClick={() => onToggleRoom(pos)}
              className="dyn-room-toggle"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                border: "none",
                padding: 0,
                marginBottom: 12,
              }}
            >
              <div
                className="dyn-room-label"
                style={{ ...styles.sectionLabel, marginBottom: 0 }}
              >
                {pos} Room
              </div>
              <span
                style={{
                  fontSize: 9,
                  color: "#c8cfe3",
                  display: "inline-block",
                  transform: isRoomCollapsed
                    ? "rotate(-90deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              >
                ▾
              </span>
            </button>

            {!isRoomCollapsed &&
              (byPos[pos].length === 0 ? (
                <div
                  style={{ ...styles.card, borderColor: "rgba(255,45,85,0.3)" }}
                >
                  <span style={{ color: "#ff2d55", fontSize: 12 }}>
                    ⚠ Empty — priority fill via draft or trade
                  </span>
                </div>
              ) : (
                byPos[pos].map((p) => {
                  const col = getColor(p.verdict);
                  const barsOpen = !!expandedBars[p.id];
                  return (
                    <div
                      key={p.id}
                      className="dyn-card-player"
                      style={{ ...styles.card, padding: "16px 20px" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                          }}
                        >
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: "50%",
                              background: `${col}18`,
                              border: `2px solid ${col}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              color: col,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {p.score}
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: 14,
                                color: "#e8e8f0",
                                fontWeight: 600,
                              }}
                            >
                              {p.name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#d1d7ea",
                                marginTop: 2,
                              }}
                            >
                              {p.team} · {p.age}yo · {p.yearsExp}yr exp
                              {p.ppg && (
                                <span>
                                  {" "}
                                  ·{" "}
                                  <span style={{ color: "#e0e5f7" }}>
                                    {p.ppg} ppg ({p.gp24}g)
                                  </span>
                                </span>
                              )}
                              {p.injuryStatus && (
                                <span
                                  style={{ color: "#ff6b35", marginLeft: 6 }}
                                >
                                  {p.injuryStatus}
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "#c8cfe3",
                                marginTop: 3,
                              }}
                            >
                              Peak:{" "}
                              <span style={{ color: "#c084fc" }}>
                                {p.peakPctile != null
                                  ? `${p.peakPctile}th`
                                  : "—"}
                              </span>
                              {p.pctileOlder != null && (
                                <span>
                                  {" "}
                                  ·{" "}
                                  <span style={{ color: "#d1d7ea" }}>
                                    '{String(p.lastSeasonYear - 2).slice(2)}: {p.pctileOlder}th
                                  </span>
                                </span>
                              )}
                              {p.pctilePrev != null && (
                                <span>
                                  {" "}
                                  ·{" "}
                                  <span style={{ color: "#d1d7ea" }}>
                                    '{String(p.lastSeasonYear - 1).slice(2)}: {p.pctilePrev}th
                                  </span>
                                </span>
                              )}
                              {p.pctileLast != null && (
                                <span>
                                  {" "}
                                  ·{" "}
                                  <span style={{ color: "#e0e5f7" }}>
                                    '{String(p.lastSeasonYear).slice(2)}: {p.pctileLast}th
                                  </span>
                                </span>
                              )}
                              {p.draftTier && (
                                <span>
                                  {" "}
                                  ·{" "}
                                  <span style={{ color: "#ffd84d" }}>
                                    {p.draftYear} {p.draftTier}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                            justifyContent: "flex-end",
                          }}
                        >
                          <span
                            style={{
                              ...styles.tag(
                                ARCHETYPE_META[p.archetype]?.color || "#888",
                              ),
                              fontSize: 9,
                            }}
                          >
                            {p.archetype}
                          </span>
                          <span style={styles.tag(col)}>{p.verdict}</span>
                          <button
                            onClick={() => onToggleBars(p.id)}
                            title={
                              barsOpen ? "Hide breakdown" : "Show breakdown"
                            }
                            className="dyn-expand-btn"
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 2,
                              color: "#d1d7ea",
                              fontSize: 9,
                              padding: "3px 7px",
                              letterSpacing: 1,
                            }}
                          >
                            {barsOpen ? "▴" : "▾"}
                          </button>
                        </div>
                      </div>

                      {barsOpen && (
                        <div
                          style={{
                            marginTop: 14,
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: "4px 20px",
                          }}
                        >
                          <ScoreBar
                            label="Age"
                            value={p.components.age}
                            color="#7b8cff"
                          />
                          <ScoreBar
                            label="Production"
                            value={p.components.prod}
                            color="#00f5a0"
                          />
                          <ScoreBar
                            label="Avail"
                            value={p.components.avail}
                            color="#ffd84d"
                          />
                          <ScoreBar
                            label="Trend"
                            value={p.components.trend}
                            color="#ff6b35"
                          />
                          <ScoreBar
                            label="Situation"
                            value={p.components.situ}
                            color="#c084fc"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              ))}
          </div>
        );
      })}
    </div>
  );
}
