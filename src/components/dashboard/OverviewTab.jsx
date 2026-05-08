import { POSITION_PRIORITY } from "../../constants";
import { getColor, rankLabel } from "../../lib/analysis";
import { styles } from "../../styles";

export default function OverviewTab({
  byPos,
  sells,
  weakRooms,
  proportions,
  aiAdvice,
  teamPhase,
  posRanks,
  onOpenGradeKey,
  leagueTeams,
  myNeeds,
  mySurplus,
  myRosterId,
  cliffCalendar,
}) {
  // Merge backend weakRooms with any bottom-third ranked rooms from posRanks
  const displayWeakRooms = (() => {
    const set = new Set(weakRooms);
    if (posRanks) {
      for (const pos of POSITION_PRIORITY) {
        const r = posRanks[pos];
        if (r && r.rank > (r.of * 2) / 3) set.add(pos);
      }
    }
    return POSITION_PRIORITY.filter((pos) => set.has(pos));
  })();

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
          Position Room Rankings
        </div>
        <button
          onClick={onOpenGradeKey}
          title="Grade key"
          aria-label="Open grade key"
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
          const r = posRanks?.[pos];
          const color = r?.color || "#4a5068";
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
                borderColor: `${color}33`,
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
                  fontSize: 42,
                  fontWeight: 700,
                  color,
                  lineHeight: 1,
                }}
              >
                {r ? rankLabel(r.rank) : "—"}
              </div>
              <div style={{ fontSize: 10, color: "#d1d7ea", marginTop: 8 }}>
                {r ? `of ${r.of} teams` : "no players"}
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
          {sells.some(
            (s) => s.convictionTier === "high" || s.convictionTier === "speculative",
          ) && <ConvictionLegend />}
          {(() => {
            const sorted = [...sells].sort((a, b) => {
              const order = { high: 0, standard: 1, speculative: 2 };
              const ta = order[a.convictionTier] ?? 1;
              const tb = order[b.convictionTier] ?? 1;
              if (ta !== tb) return ta - tb;
              return a.score - b.score;
            });
            return sorted.slice(0, 4).map((p) => (
              <div key={p.id} style={styles.playerRow}>
                <div>
                  <div style={{ fontSize: 13, color: "#e8e8f0" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#fff" }}>
                    {p.team} · {p.age}yo{p.ppg ? ` · ${p.ppg}ppg` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ConvictionChip tier={p.convictionTier} confidence={p.confidence} />
                  <span style={styles.tag(getColor(p.verdict))}>{p.verdict}</span>
                </div>
              </div>
            ));
          })()}
          {sells.length === 0 && (
            <div style={{ fontSize: 12, color: "#d1d7ea" }}>
              No obvious sells.
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.sectionLabel}>🟢 Weak Rooms to Address</div>
          {displayWeakRooms.length === 0 ? (
            <div style={{ fontSize: 12, color: "#d1d7ea" }}>
              All rooms reasonably stocked.
            </div>
          ) : (
            [...displayWeakRooms]
              .sort((a, b) => {
                const ra = posRanks?.[a]?.rank ?? 0;
                const rb = posRanks?.[b]?.rank ?? 0;
                return rb - ra;
              })
              .map((pos) => {
                const r = posRanks?.[pos];
                const color = r?.color || "#ff6b35";
                const subtitle = !r
                  ? "No rank data — add depth"
                  : r.rank > (r.of * 2) / 3
                    ? `Ranked ${r.rank} of ${r.of} — critical gap`
                    : r.rank > r.of / 3
                      ? `Ranked ${r.rank} of ${r.of} — below average`
                      : `Ranked ${r.rank} of ${r.of} — no buy-worthy players`;
                return (
                  <div key={pos} style={styles.playerRow}>
                    <div>
                      <div style={{ fontSize: 13, color: "#e8e8f0" }}>
                        Need {pos} depth
                      </div>
                      <div style={{ fontSize: 11, color: "#d1d7ea" }}>
                        {subtitle}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                      <span style={styles.tag(color)}>
                        {r ? `${r.rank} / ${r.of}` : "PRIORITY"}
                      </span>
                      {r?.quality != null && (
                        <span style={{ fontSize: 9, color: "#c8cfe3" }}>
                          quality {r.quality}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
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

      {leagueTeams && myNeeds && mySurplus && (() => {
        // Earliest picks that could sweeten deals (rounds 1-2 only)
        const myTeam = leagueTeams.find((t) => t.rosterId === myRosterId);
        const myEarlyPicks = (myTeam?.picks || []).filter((p) => p.round <= 2).slice(0, 3);

        const partners = leagueTeams
          .filter((t) => t.rosterId !== myRosterId)
          .map((team) => {
            // Positions where we need help AND they have surplus
            const theyCanHelp = myNeeds.filter((pos) =>
              (team.surplusPositions || []).includes(pos),
            );
            // Positions where they need help AND we have surplus
            const weCanHelp = (team.needs || []).filter((pos) =>
              mySurplus.includes(pos),
            );
            if (!theyCanHelp.length && !weCanHelp.length) return null;

            // Needle-moving players only (score >= 55) — skip depth filler
            const assetsTheyOffer = theyCanHelp.flatMap((pos) =>
              (team.targetablePlayers || [])
                .filter((p) => p.position === pos && p.score >= 55)
                .slice(0, 2),
            );
            const assetsWeSend = weCanHelp.flatMap((pos) =>
              (byPos[pos] || [])
                .filter((p) => p.score >= 55 && (p.verdict !== "buy" || p.score < 78))
                .slice(1, 3),
            );

            // Their early picks that could come our way
            const theirEarlyPicks = (team.picks || []).filter((p) => p.round <= 2).slice(0, 2);

            const fitScore =
              theyCanHelp.length * 3 +
              weCanHelp.length * 3 +
              Math.min(assetsTheyOffer.length, 3) * 2 +
              Math.min(assetsWeSend.length, 3) +
              (assetsTheyOffer.some((p) => p.score >= 70) ? 3 : 0);

            return {
              team,
              theyCanHelp,
              weCanHelp,
              assetsTheyOffer,
              assetsWeSend,
              theirEarlyPicks,
              fitScore,
            };
          })
          .filter(Boolean)
          .sort((a, b) => b.fitScore - a.fitScore)
          .slice(0, 5);

        if (!partners.length) return null;

        const phaseColor = (phase) =>
          phase === "contender" ? "#00f5a0" : phase === "retool" ? "#ffd84d" : "#ff6b35";

        const pickColor = (round) =>
          round === 1 ? "#00f5a0" : "#ffd84d";

        return (
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={styles.sectionLabel}>🤝 Trade Conversation Starters</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>
              Teams whose needs and surplus overlap with yours — best fits for balanced deals.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {partners.map(({ team, theyCanHelp, weCanHelp, assetsTheyOffer, assetsWeSend, theirEarlyPicks }) => (
                <div
                  key={team.rosterId}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 8,
                    padding: "12px 14px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0" }}>
                      {team.label}
                    </div>
                    {team.teamPhase && (
                      <span style={{
                        fontSize: 9,
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        color: phaseColor(team.teamPhase.phase),
                        fontWeight: 700,
                      }}>
                        {team.teamPhase.phase}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {theyCanHelp.length > 0 && (
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 10, color: "#00f5a0", letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" }}>
                          They can help you at
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                          {theyCanHelp.map((pos) => (
                            <span key={pos} style={{ ...styles.tag("#00f5a0"), fontSize: 10 }}>{pos}</span>
                          ))}
                        </div>
                        {assetsTheyOffer.slice(0, 3).map((p) => (
                          <div key={p.id} style={{ fontSize: 11, color: "#d9deef", marginBottom: 2 }}>
                            <span style={{ color: "#c8cfe3" }}>▸ </span>
                            {p.name} <span style={{ color: "#94a3b8" }}>({p.position}, {p.score})</span>
                          </div>
                        ))}
                        {theirEarlyPicks.length > 0 && (
                          <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {theirEarlyPicks.map((pk) => (
                              <span key={pk.label} style={{ ...styles.tag(pickColor(pk.round)), fontSize: 9 }}>
                                {pk.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {weCanHelp.length > 0 && (
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 10, color: "#ffd84d", letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" }}>
                          You can help them at
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                          {weCanHelp.map((pos) => (
                            <span key={pos} style={{ ...styles.tag("#ffd84d"), fontSize: 10 }}>{pos}</span>
                          ))}
                        </div>
                        {assetsWeSend.slice(0, 3).map((p) => (
                          <div key={p.id} style={{ fontSize: 11, color: "#d9deef", marginBottom: 2 }}>
                            <span style={{ color: "#c8cfe3" }}>▸ </span>
                            {p.name} <span style={{ color: "#94a3b8" }}>({p.position}, {p.score})</span>
                          </div>
                        ))}
                        {myEarlyPicks.length > 0 && (
                          <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {myEarlyPicks.map((pk) => (
                              <span key={pk.label} style={{ ...styles.tag(pickColor(pk.round)), fontSize: 9 }}>
                                {pk.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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

      {cliffCalendar && <CliffCalendar calendar={cliffCalendar} />}

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

// ---------------------------------------------------------------------------
// Conviction chip — qualifies a verdict by confidence tier so rookies
// don't get equal weight with vets in Sell/Buy/Trade-Block lists.
// ---------------------------------------------------------------------------

export function ConvictionChip({ tier, confidence }) {
  if (!tier || tier === "standard") return null;
  const meta =
    tier === "high"
      ? {
          label: "PROVEN",
          color: "#00f5a0",
          tooltip: `Verdict backed by a real sample (${confidence ?? "?"}% confidence). Trust it — act with normal aggression.`,
        }
      : {
          label: "UNPROVEN",
          color: "#c084fc",
          tooltip: `Small sample / rookie / injury return (${confidence ?? "?"}% confidence). Verdict is mostly extrapolation — don't pay top dollar on a buy or fire-sale on a sell.`,
        };
  return (
    <span
      title={meta.tooltip}
      style={{
        fontSize: 8,
        letterSpacing: 1.2,
        fontWeight: 700,
        color: meta.color,
        background: `${meta.color}18`,
        border: `1px solid ${meta.color}44`,
        padding: "2px 5px",
        borderRadius: 2,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

// Compact one-line caption shown under section headers that contain
// ConvictionChip rows so the user doesn't have to hover or guess what
// the colored tags mean.
export function ConvictionLegend() {
  return (
    <div style={{ fontSize: 10, color: "#8a91a8", marginTop: -4, marginBottom: 8, lineHeight: 1.4 }}>
      <span style={{ color: "#00f5a0", fontWeight: 700, letterSpacing: 0.6 }}>PROVEN</span>
      <span> = real production sample · </span>
      <span style={{ color: "#c084fc", fontWeight: 700, letterSpacing: 0.6 }}>UNPROVEN</span>
      <span> = small sample (rookie, injury return); treat with caution.</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cliff Calendar — per-team 3-year window timeline
// ---------------------------------------------------------------------------

const VERDICT_TONE = {
  good: { color: "#00f5a0", bg: "rgba(0,245,160,0.08)", border: "rgba(0,245,160,0.3)" },
  warn: { color: "#ffd84d", bg: "rgba(255,216,77,0.08)", border: "rgba(255,216,77,0.3)" },
  bad: { color: "#ff6b35", bg: "rgba(255,107,53,0.08)", border: "rgba(255,107,53,0.3)" },
  neutral: { color: "#a8aec7", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)" },
};

function scoreColor(score) {
  if (score >= 75) return "#00f5a0";
  if (score >= 65) return "#7ed56f";
  if (score >= 50) return "#ffd84d";
  if (score >= 35) return "#ff9f43";
  return "#ff6b35";
}

function CliffCalendar({ calendar }) {
  const { seasons, windowVerdict } = calendar;
  const tone = VERDICT_TONE[windowVerdict?.tone] || VERDICT_TONE.neutral;

  return (
    <div style={{ ...styles.card, marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={styles.sectionLabel}>📅 Roster Cliff Calendar</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            Projected starting lineup shape — now through {seasons[3].year}.
          </div>
        </div>
        {windowVerdict && (
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              background: tone.bg,
              border: `1px solid ${tone.border}`,
              maxWidth: 320,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: tone.color,
                fontWeight: 700,
              }}
            >
              {windowVerdict.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 11, color: "#d9deef", marginTop: 2 }}>
              {windowVerdict.note}
            </div>
          </div>
        )}
      </div>

      <div
        className="dyn-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
        }}
      >
        {seasons.map((s) => (
          <CliffSeasonColumn key={s.yearsAhead} season={s} />
        ))}
      </div>
    </div>
  );
}

function CliffSeasonColumn({ season }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 6,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, letterSpacing: 1 }}>
          {season.label}
        </div>
        <div style={{ fontSize: 10, color: "#8a91a8" }}>{season.year}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        <CliffStat
          label="Starter PPG"
          value={season.starterPPG > 0 ? season.starterPPG.toFixed(1) : "—"}
        />
        <CliffStat
          label="Avg starter score"
          value={season.avgScore || "—"}
          color={scoreColor(season.avgScore)}
        />
        <CliffStat
          label="≥ Foundational"
          value={season.foundational}
          color={season.foundational >= 3 ? "#00f5a0" : season.foundational >= 1 ? "#ffd84d" : "#ff6b35"}
          hint={season.cornerstones ? `(${season.cornerstones} Cornerstone)` : null}
        />
      </div>

      {season.departing?.length > 0 && (
        <div style={{ marginBottom: season.emerging?.length ? 8 : 0 }}>
          <div style={{ fontSize: 9, color: "#ff6b35", letterSpacing: 1.5, marginBottom: 3 }}>
            DEPARTING
          </div>
          {season.departing.slice(0, 3).map((d) => {
            const catTone =
              d.category === "retired"
                ? "#ff2d55"
                : d.category === "lineup"
                  ? "#c084fc"
                  : "#ff9f43";
            const catLabel =
              d.category === "retired"
                ? "RET"
                : d.category === "lineup"
                  ? "LU"
                  : "PROD";
            const tip =
              d.ppgDrop != null
                ? `${d.currentPpg ?? "?"} → ${d.projectedPpg ?? "?"} PPG · score ${d.currentScore} → ${d.projectedScore}`
                : `score ${d.currentScore} → ${d.projectedScore}`;
            return (
              <div
                key={d.id}
                style={{
                  fontSize: 10,
                  color: "#d9deef",
                  lineHeight: 1.4,
                  marginBottom: 3,
                }}
                title={tip}
              >
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: catTone,
                    background: `${catTone}18`,
                    border: `1px solid ${catTone}44`,
                    borderRadius: 2,
                    padding: "1px 4px",
                    marginRight: 5,
                    letterSpacing: 1,
                  }}
                >
                  {catLabel}
                </span>
                {d.name}{" "}
                <span style={{ color: "#8a91a8", fontSize: 9 }}>{d.reason}</span>
              </div>
            );
          })}
        </div>
      )}

      {season.emerging?.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: "#00f5a0", letterSpacing: 1.5, marginBottom: 3 }}>
            EMERGING
          </div>
          {season.emerging.slice(0, 3).map((e) => (
            <div
              key={e.id}
              style={{
                fontSize: 10,
                color: "#d9deef",
                lineHeight: 1.4,
                marginBottom: 2,
              }}
              title={`${e.currentScore} → ${e.projectedScore}`}
            >
              <span style={{ color: "#00f5a0" }}>+</span> {e.name}{" "}
              <span style={{ color: "#8a91a8", fontSize: 9 }}>+{e.gain} pts</span>
            </div>
          ))}
        </div>
      )}

      {season.yearsAhead === 0 && season.topStarters?.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: "#c8cfe3", letterSpacing: 1.5, marginBottom: 3 }}>
            TOP STARTERS
          </div>
          {season.topStarters.slice(0, 4).map((p) => (
            <div
              key={p.id}
              style={{
                fontSize: 10,
                color: "#d9deef",
                lineHeight: 1.4,
                marginBottom: 2,
              }}
            >
              {p.name}{" "}
              <span
                style={{
                  fontSize: 9,
                  color: scoreColor(p.projectedScore),
                  fontWeight: 700,
                }}
              >
                {p.projectedScore}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CliffStat({ label, value, color, hint }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontSize: 10, color: "#8a91a8" }}>{label}</span>
      <span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: color || "#e8e8f0",
          }}
        >
          {value}
        </span>
        {hint && (
          <span style={{ fontSize: 9, color: "#8a91a8", marginLeft: 4 }}>{hint}</span>
        )}
      </span>
    </div>
  );
}
