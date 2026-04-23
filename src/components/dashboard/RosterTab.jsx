import { useState } from "react";
import { ARCHETYPE_META, POSITION_PRIORITY } from "../../constants";
import { getColor, getVerdict } from "../../lib/analysis";
import { styles } from "../../styles";
import { pickSlotLabel, getPickValue, formatPickValue, PHASE_TO_SLOT } from "../../lib/marketValue";
import PlayerDeepDiveModal from "./PlayerDeepDiveModal";
import ScoreBar from "./ScoreBar";

const POS_RUBRIC = {
  QB: [
    { range: "8–10", desc: "Two locked-in starters with elite production and ceiling — the Superflex cheat code" },
    { range: "5–7", desc: "One elite anchor + a bridge vet, or two solid mid-tier starters" },
    { range: "1–4", desc: "No insulated starter — streaming and praying every week" },
  ],
  RB: [
    { range: "8–10", desc: "High-volume hammer(s) with locked-in carries + a pass-catcher keeping the floor stable" },
    { range: "5–7", desc: "Solid contributors but aging, rotational, or no pass-catching role to protect the floor" },
    { range: "1–4", desc: "No insulated assets — handcuffs and dart throws" },
  ],
  WR: [
    { range: "8–10", desc: "Multiple high-volume targets (age 23–27) with real production plus reliable depth" },
    { range: "5–7", desc: "Solid secondary pieces without a commanding alpha driving targets" },
    { range: "1–4", desc: "Low-target role players and depth fillers — no one tilting coverage" },
  ],
  TE: [
    { range: "8–10", desc: "Top-end producer with red-zone presence — a true positional advantage every week" },
    { range: "5–7", desc: "Reliable TE averaging around 10–12 ppg — not bleeding points, not winning weeks" },
    { range: "1–4", desc: "Minimal weekly production — praying for a touchdown to matter" },
  ],
};

function gradeColor(grade) {
  if (grade >= 8) return "#00f5a0";
  if (grade >= 5) return "#ffd84d";
  return "#ff6b35";
}

function gradeTierLabel(grade) {
  if (grade >= 8) return "Cheat code";
  if (grade >= 5) return "Playable";
  return "Hole";
}

function fmt1(n) { return n != null ? n.toFixed(1) : null; }

function getGradeSignals(players, pos, isSuperflex) {
  if (!players.length) return [{ text: "No players rostered — priority add", positive: false }];
  const signals = [];
  const anchor = players[0];
  const anchor2 = players[1];

  if (pos === "QB") {
    const situ1 = anchor.components?.situ ?? 0;
    const cur1 = anchor.currentPctile ?? 0;
    const rushYd = anchor.rushYdPg;
    if (situ1 >= 85 && cur1 >= 60) {
      const rushNote = rushYd >= 30 ? ` · adds ${fmt1(rushYd)} rush yd/g floor` : "";
      signals.push({ text: `${anchor.name} is a locked-in starter with elite production${rushNote}`, positive: true });
    } else if (situ1 < 60) {
      signals.push({ text: `${anchor.name}'s role security is shaky — job insecurity dragging the grade`, positive: false });
    } else {
      const rushNote = rushYd >= 30 ? ` — rushing upside (${fmt1(rushYd)} yd/g) raises his floor` : "";
      signals.push({ text: `${anchor.name} is a solid but not elite QB1${rushNote}`, positive: null });
    }
    if (isSuperflex) {
      if (anchor2) {
        const situ2 = anchor2.components?.situ ?? 0;
        const cur2 = anchor2.currentPctile ?? 0;
        if (situ2 >= 70 && cur2 >= 50) {
          signals.push({ text: `${anchor2.name} is a real QB2 — Superflex ceiling intact`, positive: true });
        } else {
          signals.push({ text: `${anchor2.name} is a bridge/streaming option — QB2 slot is a weekly liability`, positive: false });
        }
      } else {
        signals.push({ text: "No QB2 rostered — Superflex ceiling capped every week", positive: false });
      }
    }
  } else if (pos === "RB") {
    const situ1 = anchor.components?.situ ?? 0;
    const carries = anchor.rushAttPg;
    const tgts = anchor.targetsPg;
    if (situ1 >= 75 && carries >= 15) {
      signals.push({ text: `${anchor.name} is a true bell-cow — ${fmt1(carries)} carries/g with locked-in role`, positive: true });
    } else if (situ1 >= 75) {
      signals.push({ text: `${anchor.name} has the role secured${carries != null ? ` (${fmt1(carries)} att/g)` : ""}`, positive: true });
    } else if (situ1 < 55) {
      signals.push({ text: `${anchor.name} is in a committee — no workhorse at RB1${carries != null ? ` (${fmt1(carries)} att/g)` : ""}`, positive: false });
    } else {
      signals.push({ text: `${anchor.name} is a solid RB1 but carries some role risk`, positive: null });
    }
    // Pass-catching floor
    const bestCatcher = players.find(p => (p.targetsPg ?? 0) >= 4);
    if (bestCatcher) {
      signals.push({ text: `${bestCatcher.name} adds a pass-catching floor — ${fmt1(bestCatcher.targetsPg)} tgt/g keeps the room stable on bad run-game weeks`, positive: true });
    } else if (anchor2) {
      const situ2 = anchor2.components?.situ ?? 0;
      if (situ2 < 55) {
        signals.push({ text: `${anchor2.name} is rotational — handoff the moment they break down`, positive: false });
      }
    } else {
      signals.push({ text: "Thin behind RB1 — one injury collapses your floor", positive: false });
    }
  } else if (pos === "WR") {
    const alpha = players.find(p => p.age >= 23 && p.age <= 27 && (p.currentPctile ?? 0) >= 55);
    if (alpha) {
      const tgtNote = alpha.targetsPg >= 8 ? ` · ${fmt1(alpha.targetsPg)} tgt/g confirms the target share` : alpha.targetsPg != null ? ` · ${fmt1(alpha.targetsPg)} tgt/g` : "";
      signals.push({ text: `${alpha.name} (age ${alpha.age}) is in the prime window${tgtNote}`, positive: true });
    } else {
      signals.push({ text: "No ascending alpha (age 23–27) with real production — long-term ceiling limited", positive: false });
    }
    const highVol = players.find(p => p !== alpha && (p.targetsPg ?? 0) >= 7);
    if (highVol) {
      signals.push({ text: `${highVol.name} is a legit WR2 commanding volume — ${fmt1(highVol.targetsPg)} tgt/g`, positive: true });
    }
    const lowTgtVets = players.filter((p, i) => i >= 2 && (p.yearsExp ?? 0) >= 5 && (p.targetsPg ?? 0) < 4);
    if (lowTgtVets.length >= 2) {
      signals.push({ text: "Depth past WR2 is low-target filler — not real flex options", positive: false });
    }
  } else if (pos === "TE") {
    const cur = anchor.currentPctile ?? 0;
    const peak = anchor.peakPctile ?? 0;
    const rz = anchor.rzTargets;
    const tgts = anchor.targetsPg;
    if (cur >= 70 && peak >= 70) {
      const rzNote = rz >= 8 ? ` · ${rz} red zone targets last season` : "";
      signals.push({ text: `${anchor.name} is a true difference-maker — elite production and ceiling${rzNote}`, positive: true });
    } else if (cur < 40) {
      signals.push({ text: `${anchor.name} is providing minimal production — praying for touchdowns each week`, positive: false });
    } else {
      const rzNote = rz >= 8 ? ` · ${rz} red zone targets gives him TD upside` : rz != null && rz < 4 ? " · low red zone volume limits his ceiling" : "";
      signals.push({ text: `${anchor.name} is a mid-tier TE — reliable but not a positional edge${rzNote}`, positive: null });
    }
    if (!anchor2 || (anchor2.currentPctile ?? 0) < 30) {
      signals.push({ text: "No real TE2 — an injury to your starter is a season-altering problem", positive: false });
    }
  }

  return signals.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Flex Room
// ---------------------------------------------------------------------------

const FLEX_RUBRIC = [
  { range: "8–10", desc: "Multiple plug-and-play options — you never stress the flex spot" },
  { range: "5–7", desc: "One reliable flex starter; the rest are matchup-dependent streamers" },
  { range: "1–4", desc: "Weekly guessing game — your best option is someone else's taxi squad" },
];

function computeFlexGrade(flexPlayers, flexCount) {
  if (!flexPlayers.length) return 1;
  const slots = Math.max(flexCount || 1, 1);
  const starters = flexPlayers.slice(0, slots);
  const avg = starters.reduce((s, p) => s + p.score, 0) / starters.length;
  return Math.max(1, Math.min(10, Math.round((avg - 38) / 5 + 1)));
}

function getFlexSignals(flexPlayers, flexCount) {
  if (!flexPlayers.length) return [{ text: "No viable flex options — every positional room needs upgrades", positive: false }];
  const signals = [];
  const slots = Math.max(flexCount || 1, 1);
  const reliables = flexPlayers.filter(p => p.score >= 58);
  const top = flexPlayers[0];

  if (reliables.length >= slots) {
    signals.push({ text: `${reliables.length} players at or above a reliable weekly starter threshold — real weekly options, not hope`, positive: true });
  } else if (reliables.length === 0) {
    signals.push({ text: `${top.name} is your best flex option at a score of ${top.score} — below a reliable starter floor`, positive: false });
  } else {
    signals.push({ text: `${reliables.length} of your ${slots} flex slot${slots > 1 ? "s" : ""} filled by a reliable option — rest are matchup plays`, positive: null });
  }

  const youngUpside = flexPlayers.find(p => p.age <= 25 && p.score >= 52);
  if (youngUpside) {
    signals.push({ text: `${youngUpside.name} (age ${youngUpside.age}) is a young flex piece with ascending upside`, positive: true });
  }

  const vets = flexPlayers.filter(p => (p.yearsExp ?? 0) >= 6 && p.score < 50);
  if (vets.length >= 2) {
    signals.push({ text: `${vets.length} aging vets with declining value clogging your flex depth — trade or cut candidates`, positive: false });
  }

  return signals.slice(0, 3);
}

function FlexRoom({ byPos, leagueContext, setDeepDivePlayer }) {
  const starterCounts = leagueContext?.starterCounts || { RB: 2, WR: 3, TE: 1 };
  const flexCount = leagueContext?.flexCount || 1;

  const flexPlayers = [
    ...((byPos.RB || []).slice(starterCounts.RB ?? 2)),
    ...((byPos.WR || []).slice(starterCounts.WR ?? 3)),
    ...((byPos.TE || []).slice(starterCounts.TE ?? 1)),
  ].sort((a, b) => b.score - a.score);

  const grade = computeFlexGrade(flexPlayers, flexCount);
  const color = gradeColor(grade);
  const activeRow = FLEX_RUBRIC.find(({ range }) =>
    (range.startsWith("8") && grade >= 8) ||
    (range.startsWith("5") && grade >= 5 && grade <= 7) ||
    (range.startsWith("1") && grade <= 4)
  );
  const signals = getFlexSignals(flexPlayers, flexCount);

  return (
    <div style={{ marginBottom: 32 }}>
      <div className="dyn-room-label" style={{ ...styles.sectionLabel, marginBottom: 12 }}>
        FLEX Room
      </div>

      {flexPlayers.length === 0 ? (
        <div style={{ ...styles.card, borderColor: "rgba(255,45,85,0.3)" }}>
          <span style={{ color: "#ff2d55", fontSize: 12 }}>⚠ No flex depth — all positions are thin past their starter slots</span>
        </div>
      ) : (
        flexPlayers.slice(0, 8).map((p) => {
          const col = getColor(p.verdict);
          return (
            <div
              key={p.id}
              className="dyn-card-player"
              style={{ ...styles.card, padding: "12px 16px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: `${col}18`, border: `2px solid ${col}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: col, fontWeight: 700, flexShrink: 0,
                  }}>
                    {p.score}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#e8e8f0", fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#d1d7ea", marginTop: 2 }}>
                      {p.position} · {p.team} · {p.age}yo
                      {p.ppg && <span> · <span style={{ color: "#e0e5f7" }}>{p.ppg} ppg ({p.gp24}g)</span></span>}
                      {p.injuryStatus && <span style={{ color: "#ff6b35", marginLeft: 6 }}>{p.injuryStatus}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: "#94a3b8", letterSpacing: 1 }}>
                    {p.position === "RB" ? `RB${(byPos.RB || []).indexOf(p) + 1}` :
                     p.position === "WR" ? `WR${(byPos.WR || []).indexOf(p) + 1}` :
                     `TE${(byPos.TE || []).indexOf(p) + 1}`}
                  </span>
                  <span style={styles.tag(col)}>{p.verdict}</span>
                  <button
                    onClick={() => setDeepDivePlayer(p)}
                    title="Deep dive"
                    aria-label={`Deep dive for ${p.name}`}
                    className="dyn-expand-btn"
                    style={{
                      background: "rgba(0,245,160,0.07)",
                      border: "1px solid rgba(0,245,160,0.25)",
                      borderRadius: 2, color: "#00f5a0",
                      fontSize: 9, padding: "3px 8px",
                      letterSpacing: 1, cursor: "pointer",
                    }}
                  >
                    Deep Dive
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Flex Room Report */}
      <div style={{ marginTop: 10, borderRadius: 6, background: `${color}0a`, border: `1px solid ${color}30`, padding: "12px 16px" }}>
        <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Room Report</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{grade}</span>
            <span style={{ fontSize: 12, color: "#d1d7ea", fontWeight: 500 }}>/10</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 0.5 }}>{gradeTierLabel(grade)}</span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>· {flexCount} flex slot{flexCount > 1 ? "s" : ""}</span>
            </div>
            {activeRow && <span style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>{activeRow.desc}</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {FLEX_RUBRIC.map(({ range }) => {
              const tc = range.startsWith("8") ? "#00f5a0" : range.startsWith("5") ? "#ffd84d" : "#ff6b35";
              const isActive = activeRow?.range === range;
              return <div key={range} style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? tc : `${tc}30`, border: `1px solid ${tc}${isActive ? "cc" : "44"}` }} />;
            })}
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {signals.map(({ text, positive }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontSize: 10, flexShrink: 0, marginTop: 1, color: positive === true ? "#00f5a0" : positive === false ? "#ff6b35" : "#ffd84d" }}>
                {positive === true ? "▲" : positive === false ? "▼" : "◆"}
              </span>
              <span style={{ fontSize: 11, color: "#c8cfe3", lineHeight: 1.4 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PositionGradeStrip({ pos, posRanks, isSuperflex, players }) {
  const r = posRanks?.[pos];
  const grade = r?.grade ?? null;
  if (grade == null) return null;
  const color = gradeColor(grade);
  const rubric = POS_RUBRIC[pos] || [];
  const activeRow = rubric.find(({ range }) =>
    (range.startsWith("8") && grade >= 8) ||
    (range.startsWith("5") && grade >= 5 && grade <= 7) ||
    (range.startsWith("1") && grade <= 4)
  );
  const signals = getGradeSignals(players || [], pos, isSuperflex);

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 6,
        background: `${color}0a`,
        border: `1px solid ${color}30`,
        padding: "12px 16px",
      }}
    >
      <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
        Room Report
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: signals.length ? 10 : 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{grade}</span>
          <span style={{ fontSize: 12, color: "#d1d7ea", fontWeight: 500 }}>/10</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 0.5 }}>
              {gradeTierLabel(grade)}
            </span>
            {isSuperflex && pos === "QB" && (
              <span style={{ fontSize: 9, color: "#94a3b8", letterSpacing: 1 }}>SUPERFLEX</span>
            )}
            {r?.rank != null && (
              <span style={{ fontSize: 10, color: "#94a3b8" }}>· {r.rank}/{r.of} in league</span>
            )}
          </div>
          {activeRow && (
            <span style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>{activeRow.desc}</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
          {rubric.map(({ range }) => {
            const tc = range.startsWith("8") ? "#00f5a0" : range.startsWith("5") ? "#ffd84d" : "#ff6b35";
            const isActive = activeRow?.range === range;
            return (
              <div
                key={range}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: isActive ? tc : `${tc}30`,
                  border: `1px solid ${tc}${isActive ? "cc" : "44"}`,
                }}
              />
            );
          })}
        </div>
      </div>

      {signals.length > 0 && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {signals.map(({ text, positive }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{
                fontSize: 10,
                flexShrink: 0,
                marginTop: 1,
                color: positive === true ? "#00f5a0" : positive === false ? "#ff6b35" : "#ffd84d",
              }}>
                {positive === true ? "▲" : positive === false ? "▼" : "◆"}
              </span>
              <span style={{ fontSize: 11, color: "#c8cfe3", lineHeight: 1.4 }}>{text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


export default function RosterTab({
  byPos,
  collapsedRooms,
  expandedBars,
  onToggleRoom,
  onToggleBars,
  scoringWeights,
  ageCurves,
  picksByYear,
  picks,
  leagueContext,
  tradeMarket,
  leagueTeams,
  myRosterId,
  raPickValues,
  posRanks,
  isSuperflex,
}) {
  const [deepDivePlayer, setDeepDivePlayer] = useState(null);

  return (
    <div>
      {deepDivePlayer && (
        <PlayerDeepDiveModal
          player={deepDivePlayer}
          scoringWeights={scoringWeights}
          ageCurves={ageCurves}
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

            {!isRoomCollapsed && (
              <>
                {byPos[pos].length === 0 ? (
                  <div
                    style={{ ...styles.card, borderColor: "rgba(255,45,85,0.3)" }}
                  >
                    <span style={{ color: "#ff2d55", fontSize: 12 }}>
                      ⚠ Empty — priority fill via draft or trade
                    </span>
                  </div>
                ) : byPos[pos].map((p) => {
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
                })}
              <PositionGradeStrip pos={pos} posRanks={posRanks} isSuperflex={isSuperflex} players={byPos[pos]} />
            </>
          )}
          </div>
        );
      })}

      <FlexRoom byPos={byPos} leagueContext={leagueContext} setDeepDivePlayer={setDeepDivePlayer} />

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
                              {pickVal.source === "ra" ? "" : "~"}{formatPickValue(pickVal.value)}
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
                            {hasRA ? "" : "~"}{formatPickValue(total)}
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
