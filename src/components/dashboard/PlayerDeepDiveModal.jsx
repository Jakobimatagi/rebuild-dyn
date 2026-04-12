import { useEffect } from "react";
import { ARCHETYPE_DESC, ARCHETYPE_META } from "../../constants";
import { getColor, getVerdict } from "../../lib/analysis";
import { styles } from "../../styles";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIVIDER = (
  <div
    style={{
      height: 1,
      background: "rgba(255,255,255,0.07)",
      margin: "20px 0",
    }}
  />
);

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: 3.5,
        color: "#00f5a0",
        textTransform: "uppercase",
        marginBottom: 14,
        opacity: 0.8,
      }}
    >
      {children}
    </div>
  );
}

function MiniBar({ value, color, height = 5 }) {
  return (
    <div
      style={{
        height,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 2,
        overflow: "hidden",
        flexGrow: 1,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.max(2, value)}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component-level explanations
// ---------------------------------------------------------------------------

function ageExplanation(score, pos, age) {
  const PEAKS = { QB: 27, RB: 24, WR: 26, TE: 27 };
  const DECLINES = { QB: 33, RB: 27, WR: 30, TE: 31 };
  const CLIFFS = { QB: 37, RB: 30, WR: 33, TE: 34 };
  const peak = PEAKS[pos] || 26;
  const decline = DECLINES[pos] || 30;
  const cliff = CLIFFS[pos] || 33;

  if (age <= peak) return `Age ${age} — ${peak - age} year${peak - age !== 1 ? "s" : ""} from ${pos} peak (age ${peak}). Full dynasty runway ahead.`;
  if (age <= decline) return `Age ${age} — ${age - peak} year${age - peak !== 1 ? "s" : ""} past ${pos} peak. Gradual production decline expected.`;
  if (age <= cliff) return `Age ${age} — approaching positional cliff (age ${cliff}). Steep decline risk in the near term.`;
  return `Age ${age} — past the ${pos} cliff age (${cliff}). Significant decline priced in.`;
}

function prodExplanation(score, currentPctile, peakPctile, pos, ppg, gp24, lastSeasonYear) {
  const pctile = currentPctile ?? 0;
  const peak = peakPctile ?? 0;
  const yr = lastSeasonYear ?? 2024;

  if (!gp24 || !ppg) return "Insufficient games played to generate a reliable production score. Draft capital used as proxy.";
  const lines = [`${ppg} PPR pts/game in ${yr} (${pctile}th pctile among active ${pos}s).`];
  if (peak > pctile + 20) lines.push(`Peak rank was ${peak}th — current production below career best.`);
  else if (pctile >= 80) lines.push("Top-tier positional producer.");
  else if (pctile >= 60) lines.push("Above-average contributor at the position.");
  else if (pctile >= 40) lines.push("Average production for the position.");
  else lines.push("Below-average production relative to the position.");
  return lines.join(" ");
}

function availExplanation(score, gp24, injuryStatus) {
  const games = gp24 ?? 0;
  const pct = Math.round((games / 17) * 100);
  let base = `Played ${games}/17 games (${pct}% availability).`;
  if (injuryStatus) {
    const penalties = { IR: 20, Out: 10, Doubtful: 5, Questionable: 2, PUP: 15 };
    const pen = penalties[injuryStatus] || 0;
    base += ` Current status: ${injuryStatus} — ${pen}-point penalty applied.`;
  }
  if (games >= 15) base += " Excellent health record.";
  else if (games >= 12) base += " Minor availability concern.";
  else if (games >= 8) base += " Moderate injury history.";
  else base += " Significant durability concern.";
  return base;
}

function trendExplanation(score, ppg, pctileLast, pctilePrev) {
  if (!pctileLast && !pctilePrev) return "Insufficient multi-year data to calculate trend. Single season baseline used.";
  if (!pctilePrev) return `First season with meaningful stats. Score calibrated against a cross-position baseline of 10 PPR pts/game. ${score >= 60 ? "Positive early signal." : "Below baseline production so far."}`;
  const delta = (pctileLast ?? 0) - (pctilePrev ?? 0);
  const dir = delta > 0 ? "improved" : "declined";
  const mag = Math.abs(delta);
  return `Percentile rank ${dir} by ${mag} points year-over-year (${pctilePrev ?? "—"}th → ${pctileLast ?? "—"}th pctile). ${Math.abs(delta) >= 15 ? "Significant movement." : Math.abs(delta) >= 8 ? "Moderate movement." : "Stable production."}`;
}

function situExplanation(score, depthOrder, team) {
  if (!team || team === "FA") return "Free agent — no guaranteed role. Opportunity highly uncertain.";
  if (depthOrder === 1) return "Depth chart starter. Full opportunity priced in (+90 situation score).";
  if (depthOrder === 2) return "Listed as depth chart #2. Partial opportunity, role dependent on starter health.";
  return "Listed as #3 or lower on depth chart. Minimal expected opportunity this season.";
}

// ---------------------------------------------------------------------------
// Score math table
// ---------------------------------------------------------------------------

function ScoreMathTable({ components, internalScore, score, fantasyCalcNormalized, scoringWeights }) {
  const w = scoringWeights || { age: 35, prod: 30, avail: 15, trend: 10, situ: 10 };
  const total = w.age + w.prod + w.avail + w.trend + w.situ;
  const pct = (k) => w[k] / total;

  const rows = [
    { key: "age",   label: "Age",          color: "#7b8cff", value: components.age  },
    { key: "prod",  label: "Production",   color: "#00f5a0", value: components.prod },
    { key: "avail", label: "Availability", color: "#ffd84d", value: components.avail },
    { key: "trend", label: "Trend",        color: "#ff6b35", value: components.trend },
    { key: "situ",  label: "Situation",    color: "#c084fc", value: components.situ },
  ];

  const rawInternal = rows.reduce((sum, r) => sum + r.value * pct(r.key), 0);

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Component", "Raw Score", "Weight", "Points"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: h === "Component" ? "left" : "right",
                  fontSize: 9,
                  color: "#808898",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  paddingBottom: 8,
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  fontWeight: 400,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, color, value }) => {
            const weight = pct(key);
            const pts = value * weight;
            return (
              <tr key={key}>
                <td style={{ padding: "7px 0 7px", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#e0e5f7" }}>{label}</span>
                  </div>
                </td>
                <td style={{ textAlign: "right", verticalAlign: "middle", padding: "7px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                    <MiniBar value={value} color={color} />
                    <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 26, textAlign: "right" }}>
                      {value}
                    </span>
                  </div>
                </td>
                <td style={{ textAlign: "right", fontSize: 11, color: "#808898", padding: "7px 0 7px 16px", verticalAlign: "middle" }}>
                  {Math.round(weight * 100)}%
                </td>
                <td style={{ textAlign: "right", fontSize: 12, color: "#d1d7ea", padding: "7px 0 7px 16px", verticalAlign: "middle", fontWeight: 600 }}>
                  {pts.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10, fontSize: 11, color: "#808898" }}>
              Internal Score
            </td>
            <td style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10, textAlign: "right", fontSize: 14, fontWeight: 700, color: "#d1d7ea" }}>
              {rawInternal.toFixed(1)}
            </td>
          </tr>
          {fantasyCalcNormalized != null && (
            <tr>
              <td colSpan={3} style={{ paddingTop: 4, fontSize: 11, color: "#808898" }}>
                FantasyCalc Market Score
              </td>
              <td style={{ paddingTop: 4, textAlign: "right", fontSize: 14, fontWeight: 700, color: "#d1d7ea" }}>
                {Math.round(fantasyCalcNormalized)}
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={3} style={{ paddingTop: 6, fontSize: 11, color: "#a0a8c0" }}>
              Blended Dynasty Score
            </td>
            <td style={{ paddingTop: 6, textAlign: "right", fontSize: 18, fontWeight: 700, color: getColor(getVerdict(score)) }}>
              {score}
            </td>
          </tr>
        </tfoot>
      </table>

      {fantasyCalcNormalized != null && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 4,
            fontSize: 10,
            color: "#808898",
            lineHeight: 1.5,
          }}
        >
          The final score blends internal analysis with FantasyCalc crowd consensus.
          Newer/less-proven players weight market data more heavily; veterans with a
          clear track record trust internal analysis more.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prediction section
// ---------------------------------------------------------------------------

function PredictionSection({ prediction }) {
  if (!prediction) return null;
  const { projections, trajectory, dynastyOutlook, breakoutProb, bustRisk, comps, keyInsights } = prediction;

  return (
    <>
      {DIVIDER}
      <SectionLabel>Dynasty Prediction Model</SectionLabel>

      {/* Outlook + trajectory row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span
          style={{
            fontSize: 11,
            color: dynastyOutlook.color,
            background: `${dynastyOutlook.color}18`,
            border: `1px solid ${dynastyOutlook.color}44`,
            borderRadius: 3,
            padding: "4px 10px",
            fontWeight: 600,
          }}
        >
          {dynastyOutlook.label}
        </span>
        <span
          style={{
            fontSize: 11,
            color: trajectory.color,
            background: `${trajectory.color}18`,
            border: `1px solid ${trajectory.color}44`,
            borderRadius: 3,
            padding: "4px 10px",
          }}
        >
          {trajectory.icon} {trajectory.label}
        </span>
      </div>

      {/* 3-year projections */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "#808898", marginBottom: 8 }}>3-Year Score Projections</div>
        <div style={{ display: "flex", gap: 8 }}>
          {projections.map((proj) => {
            const c = getColor(getVerdict(proj.score));
            return (
              <div
                key={proj.yearsAhead}
                style={{
                  flex: 1,
                  textAlign: "center",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${c}44`,
                  borderRadius: 5,
                  padding: "10px 8px",
                }}
              >
                <div style={{ fontSize: 9, color: "#606878", marginBottom: 4 }}>+{proj.yearsAhead} year</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c, lineHeight: 1 }}>{proj.score}</div>
                <div style={{ fontSize: 9, color: "#606878", marginTop: 4 }}>age {proj.age}</div>
                <div
                  style={{
                    ...styles.tag(c),
                    fontSize: 8,
                    marginTop: 6,
                    display: "inline-block",
                  }}
                >
                  {getVerdict(proj.score)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Breakout + bust probability */}
      {(breakoutProb > 0 || bustRisk > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {breakoutProb > 0 && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(0,245,160,0.05)",
                border: "1px solid rgba(0,245,160,0.15)",
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 9, color: "#00f5a088", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
                Breakout Prob.
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#00f5a0" }}>{breakoutProb}%</div>
              <div style={{ fontSize: 10, color: "#808898", marginTop: 3, lineHeight: 1.4 }}>
                Chance of ≥15 percentile rank jump in next 2 seasons
              </div>
            </div>
          )}
          {bustRisk > 0 && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(255,107,53,0.05)",
                border: "1px solid rgba(255,107,53,0.15)",
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 9, color: "#ff6b3588", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
                Cliff / Bust Risk
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#ff6b35" }}>{bustRisk}%</div>
              <div style={{ fontSize: 10, color: "#808898", marginTop: 3, lineHeight: 1.4 }}>
                Chance of ≥20 percentile rank drop in next 2 seasons
              </div>
            </div>
          )}
        </div>
      )}

      {/* Key insights */}
      {keyInsights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#808898", marginBottom: 8 }}>Model Insights</div>
          {keyInsights.map((insight, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: "#c0c8e0",
                padding: "5px 0",
                borderBottom: i < keyInsights.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                lineHeight: 1.5,
              }}
            >
              · {insight}
            </div>
          ))}
        </div>
      )}

      {/* Historical comps */}
      {comps.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "#808898", marginBottom: 8 }}>
            Historical Comparable Players
            <span style={{ color: "#606878", marginLeft: 6 }}>
              (similar age, position, production tier &amp; draft capital)
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 6,
            }}
          >
            {comps.slice(0, 5).map((comp, i) => {
              const delta = comp.future1 !== undefined ? comp.future1 - comp.ppgPctile : null;
              const deltaCol = delta === null ? "#808898" : delta >= 10 ? "#00f5a0" : delta <= -10 ? "#ff6b35" : "#ffd84d";
              return (
                <div
                  key={i}
                  style={{
                    padding: "8px 10px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontSize: 11, color: "#d1d7ea", fontWeight: 600, marginBottom: 3 }}>
                    {comp.name}
                  </div>
                  <div style={{ fontSize: 10, color: "#606878" }}>
                    {comp.year} · age {comp.age} · {comp.ppgPctile}th pctile
                  </div>
                  {delta !== null && (
                    <div style={{ fontSize: 10, color: deltaCol, marginTop: 3 }}>
                      Year +1: {delta > 0 ? "+" : ""}{delta} pctile pts
                    </div>
                  )}
                  <div style={{ fontSize: 9, color: "#404858", marginTop: 2 }}>
                    {comp.similarity}% match
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 9, color: "#505868", marginTop: 8, lineHeight: 1.5 }}>
            Comps pulled from Sleeper historical data (2014–2024). Match scored on
            position, age proximity, production percentile, and draft capital tier.
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export default function PlayerDeepDiveModal({ player, scoringWeights, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!player) return null;

  const {
    name, position, team, age, yearsExp,
    draftRound, draftSlot, draftTier, draftYear,
    injuryStatus,
    score, internalScore, fantasyCalcNormalized,
    components,
    verdict,
    archetype,
    tags,
    confidence,
    ppg, gp24, lastSeasonYear,
    peakPctile, currentPctile, pctileLast, pctilePrev, pctileOlder,
    marketValue, fantasyCalcValue, fantasyCalcRank, fantasyCalcTrend,
    prediction,
  } = player;

  const verdictColor = getColor(verdict);
  const archetypeColor = ARCHETYPE_META[archetype]?.color || "#888";

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-label="Player deep dive"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.82)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "40px 16px 60px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0d0d16",
          border: "1px solid rgba(0,245,160,0.18)",
          borderRadius: 6,
          padding: "28px 32px 36px",
          maxWidth: 660,
          width: "100%",
          position: "relative",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close player deep dive"
          style={{
            position: "absolute",
            top: 16,
            right: 18,
            background: "transparent",
            border: "none",
            color: "#d1d7ea",
            fontSize: 18,
            cursor: "pointer",
            lineHeight: 1,
            padding: 4,
          }}
        >
          ✕
        </button>

        {/* ── Player header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: `${verdictColor}18`,
              border: `2px solid ${verdictColor}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              color: verdictColor,
              flexShrink: 0,
            }}
          >
            {score}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>
              {name}
            </div>
            <div style={{ fontSize: 11, color: "#d1d7ea", marginTop: 3 }}>
              {position} · {team} · {age}yo · {yearsExp}yr exp
              {injuryStatus && (
                <span style={{ color: "#ff6b35", marginLeft: 8 }}>{injuryStatus}</span>
              )}
            </div>
            {draftTier && (
              <div style={{ fontSize: 10, color: "#ffd84d", marginTop: 2 }}>
                {draftYear} Draft · {draftTier}
                {draftSlot ? ` (pick ${draftSlot})` : ""}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <span style={styles.tag(verdictColor)}>{verdict}</span>
              <span style={{ ...styles.tag(archetypeColor), fontSize: 8 }}>{archetype}</span>
              {tags?.map((tag) => (
                <span key={tag} style={{ ...styles.tag("#a0a8c0"), fontSize: 8 }}>{tag}</span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: "#606878", marginBottom: 2 }}>CONFIDENCE</div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: confidence >= 70 ? "#00f5a0" : confidence >= 45 ? "#ffd84d" : "#ff6b35",
              }}
            >
              {confidence}%
            </div>
          </div>
        </div>

        {DIVIDER}

        {/* ── Score math ── */}
        <SectionLabel>Score Calculation</SectionLabel>
        <ScoreMathTable
          components={components}
          internalScore={internalScore}
          score={score}
          fantasyCalcNormalized={fantasyCalcNormalized}
          scoringWeights={scoringWeights}
        />

        {DIVIDER}

        {/* ── Component explanations ── */}
        <SectionLabel>What Each Score Means</SectionLabel>

        {[
          {
            label: "Age",
            color: "#7b8cff",
            value: components.age,
            explanation: ageExplanation(components.age, position, age),
          },
          {
            label: "Production",
            color: "#00f5a0",
            value: components.prod,
            explanation: prodExplanation(components.prod, currentPctile, peakPctile, position, ppg, gp24, lastSeasonYear),
          },
          {
            label: "Availability",
            color: "#ffd84d",
            value: components.avail,
            explanation: availExplanation(components.avail, gp24, injuryStatus),
          },
          {
            label: "Trend",
            color: "#ff6b35",
            value: components.trend,
            explanation: trendExplanation(components.trend, ppg, pctileLast, pctilePrev),
          },
          {
            label: "Situation",
            color: "#c084fc",
            value: components.situ,
            explanation: situExplanation(components.situ, player.depthOrder, team),
          },
        ].map(({ label, color, value, explanation }) => (
          <div
            key={label}
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderLeft: `3px solid ${color}`,
              borderRadius: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
              <div style={{ flex: 1 }}>
                <MiniBar value={value} color={color} height={4} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 24, textAlign: "right" }}>
                {value}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#a0a8c0", lineHeight: 1.5 }}>
              {explanation}
            </div>
          </div>
        ))}

        {DIVIDER}

        {/* ── Production history ── */}
        <SectionLabel>Production History</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {[
            { label: `${lastSeasonYear ?? "2024"}`, value: pctileLast, ppg },
            { label: `${(lastSeasonYear ?? 2024) - 1}`, value: pctilePrev },
            { label: `${(lastSeasonYear ?? 2024) - 2}`, value: pctileOlder },
            { label: "Career Peak", value: peakPctile, isPeak: true },
          ].map(({ label, value, ppg: pg, isPeak }) => (
            <div
              key={label}
              style={{
                textAlign: "center",
                padding: "8px 10px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 9, color: "#606878", marginBottom: 4 }}>{label}</div>
              {value != null ? (
                <>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: isPeak ? "#c084fc" : value >= 75 ? "#00f5a0" : value >= 50 ? "#ffd84d" : "#ff6b35",
                    }}
                  >
                    {value}
                    <span style={{ fontSize: 10, fontWeight: 400, color: "#606878" }}>th</span>
                  </div>
                  <div style={{ fontSize: 9, color: "#505868", marginTop: 2 }}>pctile rank</div>
                  {pg && <div style={{ fontSize: 10, color: "#808898", marginTop: 2 }}>{pg} ppg</div>}
                </>
              ) : (
                <div style={{ fontSize: 14, color: "#404858" }}>—</div>
              )}
            </div>
          ))}
        </div>

        {DIVIDER}

        {/* ── Archetype explanation ── */}
        <SectionLabel>Archetype</SectionLabel>
        <div
          style={{
            padding: "12px 16px",
            background: `${archetypeColor}0d`,
            border: `1px solid ${archetypeColor}30`,
            borderRadius: 4,
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ ...styles.tag(archetypeColor), fontSize: 9 }}>{archetype}</span>
          </div>
          <div style={{ fontSize: 11, color: "#c0c8e0", lineHeight: 1.6 }}>
            {ARCHETYPE_DESC[archetype] || "No description available."}
          </div>
        </div>

        {/* Confidence breakdown */}
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: 10, color: "#808898", marginBottom: 6 }}>
            Grade Confidence: <span style={{ color: confidence >= 70 ? "#00f5a0" : confidence >= 45 ? "#ffd84d" : "#ff6b35", fontWeight: 700 }}>{confidence}%</span>
          </div>
          <div style={{ fontSize: 10, color: "#606878", lineHeight: 1.5 }}>
            Based on: games played ({gp24 ?? 0}/17 = {Math.round(((gp24 ?? 0) / 17) * 50)}pts) ·
            experience ({Math.min(5, yearsExp ?? 0)}/5yr = {Math.round((Math.min(5, yearsExp ?? 0) / 5) * 30)}pts) ·
            trend stability ({components.trend ?? 50}/100 = {Math.round(((components.trend ?? 50) / 100) * 20)}pts).
            More games and seasons increase confidence.
          </div>
        </div>

        {/* ── Prediction ── */}
        {prediction && <PredictionSection prediction={prediction} />}

        {/* ── Market value ── */}
        {(marketValue != null || fantasyCalcValue != null) && (
          <>
            {DIVIDER}
            <SectionLabel>Trade Value</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Dynasty Score", value: score, suffix: "/100", color: verdictColor },
                { label: "Market Value", value: marketValue != null ? Math.round(marketValue) : null, suffix: "", color: "#d1d7ea" },
                { label: "FC Value", value: fantasyCalcValue != null ? `$${Math.round(fantasyCalcValue)}` : null, suffix: "", color: "#c084fc" },
              ].map(({ label, value, suffix, color }) => (
                <div
                  key={label}
                  style={{
                    textAlign: "center",
                    padding: "10px 8px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontSize: 9, color: "#606878", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>
                    {value != null ? `${value}${suffix}` : "—"}
                  </div>
                </div>
              ))}
            </div>
            {fantasyCalcRank != null && (
              <div style={{ fontSize: 10, color: "#606878", marginTop: 8 }}>
                FantasyCalc rank: #{fantasyCalcRank}
                {fantasyCalcTrend != null && (
                  <span style={{ color: fantasyCalcTrend > 0 ? "#00f5a0" : "#ff6b35", marginLeft: 8 }}>
                    {fantasyCalcTrend > 0 ? "▲" : "▼"} {Math.abs(Math.round(fantasyCalcTrend))} trend
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 28,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 9,
            color: "#404858",
            lineHeight: 1.5,
          }}
        >
          Data sources: Sleeper API (stats 2014–2024, player metadata) · FantasyCalc (market consensus).
          Predictions built from empirical age curves and historical comp matching across 11 NFL seasons.
        </div>
      </div>
    </div>
  );
}
