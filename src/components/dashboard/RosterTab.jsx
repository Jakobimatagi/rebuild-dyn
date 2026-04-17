import { useState } from "react";
import { ARCHETYPE_META, POSITION_PRIORITY } from "../../constants";
import { getColor, getVerdict } from "../../lib/analysis";
import { styles } from "../../styles";
import { estimatePickValue, pickSlotLabel } from "../../lib/marketValue";
import PlayerDeepDiveModal from "./PlayerDeepDiveModal";
import ScoreBar from "./ScoreBar";

// Phase → RA slot key
const PHASE_TO_SLOT = { rebuild: "early", retool: "mid", contender: "late" };

function getPickValue(pick, ownerPhase, raPickValues, leagueContext, tradeMarket) {
  if (raPickValues && pick?.round) {
    if (pick.slot != null) {
      const exactKey = `${pick.season}-${pick.round}-${pick.slot}`;
      const exactVal = raPickValues[exactKey];
      if (exactVal != null) return { value: exactVal, source: "ra" };
    }
    const slot = PHASE_TO_SLOT[ownerPhase] || "mid";
    const key = `${pick.season}-${pick.round}-${slot}`;
    const raVal = raPickValues[key];
    if (raVal != null) return { value: raVal, source: "ra" };
  }
  if (leagueContext) {
    return { value: estimatePickValue(pick, leagueContext, tradeMarket), source: "est" };
  }
  return null;
}

function formatValue(val) {
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return String(val);
}

export default function RosterTab({
  byPos,
  collapsedRooms,
  expandedBars,
  onToggleRoom,
  onToggleBars,
  scoringWeights,
  picksByYear,
  picks,
  leagueContext,
  tradeMarket,
  leagueTeams,
  myRosterId,
  raPickValues,
}) {
  const [deepDivePlayer, setDeepDivePlayer] = useState(null);

  return (
    <div>
      {deepDivePlayer && (
        <PlayerDeepDiveModal
          player={deepDivePlayer}
          scoringWeights={scoringWeights}
          onClose={() => setDeepDivePlayer(null)}
        />
      )}

      {POSITION_PRIORITY.map((pos) => {
        const isRoomCollapsed = !!collapsedRooms[pos];
        return (
          <div key={pos} style={{ marginBottom: 32 }}>
            <button
              onClick={() => onToggleRoom(pos)}
              className="dyn-room-toggle"
              aria-expanded={!isRoomCollapsed}
              aria-label={`${isRoomCollapsed ? "Expand" : "Collapse"} ${pos} room`}
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
                          {p.prediction?.trajectory && (
                            <span
                              style={{
                                fontSize: 9,
                                color: p.prediction.trajectory.color,
                                background: `${p.prediction.trajectory.color}18`,
                                border: `1px solid ${p.prediction.trajectory.color}44`,
                                borderRadius: 3,
                                padding: "2px 6px",
                                letterSpacing: 0.3,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {p.prediction.trajectory.icon}{" "}
                              {p.prediction.trajectory.label}
                            </span>
                          )}
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
                            onClick={() => setDeepDivePlayer(p)}
                            title="Deep dive — full grade breakdown"
                            aria-label={`Deep dive for ${p.name}`}
                            className="dyn-expand-btn"
                            style={{
                              background: "rgba(0,245,160,0.07)",
                              border: "1px solid rgba(0,245,160,0.25)",
                              borderRadius: 2,
                              color: "#00f5a0",
                              fontSize: 9,
                              padding: "3px 8px",
                              letterSpacing: 1,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Deep Dive
                          </button>
                          <button
                            onClick={() => onToggleBars(p.id)}
                            title={
                              barsOpen ? "Hide breakdown" : "Show breakdown"
                            }
                            aria-expanded={barsOpen}
                            aria-label={`${barsOpen ? "Hide" : "Show"} score breakdown for ${p.name}`}
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
                        <div style={{ marginTop: 14 }}>
                          {/* Score component bars */}
                          <div
                            style={{
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

                          {/* Predictive model section */}
                          {p.prediction && (
                            <div
                              style={{
                                marginTop: 14,
                                paddingTop: 12,
                                borderTop: "1px solid rgba(255,255,255,0.07)",
                              }}
                            >
                              {/* Dynasty outlook + probabilities */}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  marginBottom: 10,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 9,
                                    color: "#a0a8c0",
                                    letterSpacing: 1,
                                    textTransform: "uppercase",
                                    marginRight: 4,
                                  }}
                                >
                                  Dynasty Outlook
                                </span>
                                <span
                                  style={{
                                    fontSize: 9,
                                    color: p.prediction.dynastyOutlook.color,
                                    background: `${p.prediction.dynastyOutlook.color}18`,
                                    border: `1px solid ${p.prediction.dynastyOutlook.color}44`,
                                    borderRadius: 3,
                                    padding: "2px 7px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {p.prediction.dynastyOutlook.label}
                                </span>
                                {p.prediction.breakoutProb > 15 && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      color: "#00f5a0",
                                      background: "#00f5a018",
                                      border: "1px solid #00f5a044",
                                      borderRadius: 3,
                                      padding: "2px 6px",
                                    }}
                                  >
                                    ⚡ {p.prediction.breakoutProb}% breakout
                                  </span>
                                )}
                                {p.prediction.bustRisk > 20 && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      color: "#ff6b35",
                                      background: "#ff6b3518",
                                      border: "1px solid #ff6b3544",
                                      borderRadius: 3,
                                      padding: "2px 6px",
                                    }}
                                  >
                                    ⚠ {p.prediction.bustRisk}% cliff risk
                                  </span>
                                )}
                              </div>

                              {/* 3-year score projection */}
                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  marginBottom: 10,
                                  alignItems: "flex-end",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 9,
                                    color: "#a0a8c0",
                                    letterSpacing: 1,
                                    textTransform: "uppercase",
                                    marginRight: 4,
                                    alignSelf: "center",
                                  }}
                                >
                                  3-Yr Projection
                                </span>
                                {p.prediction.projections.map((proj) => {
                                  const projCol = getColor(
                                    getVerdict(proj.score),
                                  );
                                  return (
                                    <div
                                      key={proj.yearsAhead}
                                      style={{
                                        textAlign: "center",
                                        background: "rgba(255,255,255,0.04)",
                                        border: `1px solid ${projCol}44`,
                                        borderRadius: 4,
                                        padding: "4px 8px",
                                        minWidth: 46,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: 8,
                                          color: "#808898",
                                          marginBottom: 2,
                                        }}
                                      >
                                        +{proj.yearsAhead}yr
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 14,
                                          fontWeight: 700,
                                          color: projCol,
                                          lineHeight: 1,
                                        }}
                                      >
                                        {proj.score}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 8,
                                          color: "#606878",
                                          marginTop: 2,
                                        }}
                                      >
                                        age {proj.age}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Key insights */}
                              {p.prediction.keyInsights.length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                  {p.prediction.keyInsights.map(
                                    (insight, i) => (
                                      <div
                                        key={i}
                                        style={{
                                          fontSize: 10,
                                          color: "#b0b8d0",
                                          marginBottom: 3,
                                          paddingLeft: 2,
                                        }}
                                      >
                                        · {insight}
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}

                              {/* Historical comps */}
                              {p.prediction.comps.length > 0 && (
                                <div>
                                  <div
                                    style={{
                                      fontSize: 9,
                                      color: "#a0a8c0",
                                      letterSpacing: 1,
                                      textTransform: "uppercase",
                                      marginBottom: 5,
                                    }}
                                  >
                                    Historical Comps
                                  </div>
                                  {p.prediction.comps.slice(0, 3).map(
                                    (comp, i) => {
                                      const delta1 =
                                        comp.future1 !== undefined
                                          ? comp.future1 - comp.ppgPctile
                                          : null;
                                      return (
                                        <div
                                          key={i}
                                          style={{
                                            fontSize: 10,
                                            color: "#808898",
                                            marginBottom: 3,
                                            display: "flex",
                                            gap: 6,
                                            alignItems: "center",
                                          }}
                                        >
                                          <span style={{ color: "#c8cfe3" }}>
                                            {comp.name}
                                          </span>
                                          <span>
                                            ({comp.year}, age {comp.age},{" "}
                                            {comp.ppgPctile}th pctile)
                                          </span>
                                          {delta1 !== null && (
                                            <span
                                              style={{
                                                color:
                                                  delta1 >= 10
                                                    ? "#00f5a0"
                                                    : delta1 <= -10
                                                      ? "#ff6b35"
                                                      : "#ffd84d",
                                              }}
                                            >
                                              Y+1:{" "}
                                              {delta1 > 0 ? "+" : ""}
                                              {delta1}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ))}
          </div>
        );
      })}

      {/* Draft Capital Section */}
      {picks && picks.length > 0 && (() => {
        const currentYear = String(new Date().getFullYear());
        const phaseByRosterId = new Map(
          (leagueTeams || []).map((t) => [t.rosterId, t.teamPhase?.phase || "retool"]),
        );
        const myPhase = phaseByRosterId.get(myRosterId) || "retool";
        const hasRA = raPickValues && Object.keys(raPickValues).length > 0;

        return (
          <div style={{ marginTop: 40 }}>
            <div style={styles.sectionLabel}>Draft Capital</div>
            {Object.keys(picksByYear || {})
              .sort()
              .map((year) => (
                <div key={year} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: "#00f5a0", letterSpacing: 2, marginBottom: 8 }}>
                    {year}
                  </div>
                  {year > currentYear && (
                    <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 6, fontStyle: "italic" }}>
                      Draft order predicted from team strength
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {picksByYear[year].map((pick, index) => {
                      const label = pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `${pick.round}th`;
                      const color = pick.round === 1 ? "#00f5a0" : pick.round === 2 ? "#ffd84d" : "#d9deef";
                      const ownerPhase = pick.isOwn ? myPhase : phaseByRosterId.get(pick.originalRosterId) || "retool";
                      const posLabel = pickSlotLabel(pick.round, ownerPhase);
                      const pickVal = getPickValue(pick, ownerPhase, raPickValues, leagueContext, tradeMarket);

                      return (
                        <div
                          key={index}
                          style={{
                            padding: "8px 16px",
                            background: `${color}11`,
                            border: `1px solid ${color}44`,
                            borderRadius: 2,
                            fontSize: 12,
                            color,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span>
                            {pick.slotLabel ? (
                              <span style={{ fontWeight: 600 }}>{pick.slotLabel}</span>
                            ) : (
                              <>
                                {posLabel && (
                                  <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, opacity: 0.8, marginRight: 4 }}>
                                    {posLabel}
                                  </span>
                                )}
                                {label} Rd
                              </>
                            )}
                            {!pick.isOwn && (
                              <span style={{ color: "#d1d7ea", marginLeft: 6, fontSize: 10 }}>
                                via {pick.fromTeam || "trade"}
                              </span>
                            )}
                          </span>
                          {pickVal != null && (
                            <span
                              style={{
                                fontSize: 9,
                                color: pickVal.source === "ra" ? "#00f5a0" : "#94a3b8",
                                borderLeft: "1px solid rgba(255,255,255,0.1)",
                                paddingLeft: 8,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {pickVal.source === "ra" ? "" : "~"}{formatValue(pickVal.value)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

            {/* Capital Summary */}
            {(leagueContext || hasRA) && (
              <div style={{ ...styles.card, marginTop: 8 }}>
                <div style={styles.sectionLabel}>Capital Summary</div>
                {hasRA && (
                  <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 10 }}>
                    Values from <span style={{ color: "#00f5a0" }}>RosterAudit</span> dynasty market data
                  </div>
                )}
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {Object.keys(picksByYear || {})
                    .sort()
                    .map((year) => {
                      const yearPicks = picksByYear[year];
                      const total = yearPicks.reduce((sum, pk) => {
                        const op = pk.isOwn ? myPhase : phaseByRosterId.get(pk.originalRosterId) || "retool";
                        const pv = getPickValue({ ...pk, season: year }, op, raPickValues, leagueContext, tradeMarket);
                        return sum + (pv?.value || 0);
                      }, 0);
                      return (
                        <div
                          key={year}
                          style={{
                            textAlign: "center",
                            padding: "8px 16px",
                            background: "rgba(255,255,255,0.03)",
                            borderRadius: 4,
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1, marginBottom: 4 }}>{year}</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#e8e8f0" }}>
                            {hasRA ? "" : "~"}{formatValue(total)}
                          </div>
                          <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 2 }}>
                            {yearPicks.length} pick{yearPicks.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
