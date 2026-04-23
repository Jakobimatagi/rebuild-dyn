import { ARCHETYPE_DESC, ARCHETYPE_META } from "../../constants";
import { getColor, getVerdict } from "../../lib/analysis";
import { AGE_CURVES_FALLBACK } from "../../lib/scoringEngine";
import { useModalBehavior } from "../../lib/useModalBehavior";
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

function situExplanation(score, depthOrder, team, position) {
  if (!team || team === "FA") return "Free agent — no guaranteed role. Opportunity highly uncertain.";
  if (depthOrder === 1) return "Depth chart starter. Full opportunity priced in (+90 situation score).";
  if (depthOrder === 2) {
    if (position === "WR") return "WR2 — still a core route-runner in 2-WR sets. Strong target share expected.";
    if (position === "RB") return "RB2 — meaningful carries in committee or change-of-pace role, but clear step down from the lead back.";
    if (position === "TE") return "TE2 — rarely on the field in most offensive schemes. Very limited opportunity.";
    if (position === "QB") return "QB2 — backup with near-zero on-field value outside of superflex formats.";
  }
  if (depthOrder === 3) {
    if (position === "WR") return "WR3 — rotational role in 3-WR sets. Opportunity is matchup-dependent.";
    if (position === "RB") return "RB3 — limited to special teams or emergency carries. Minimal fantasy value.";
    return "Listed as #3 or lower. Minimal expected opportunity this season.";
  }
  return "Listed as #4 or deeper on depth chart. Negligible expected opportunity.";
}

// ---------------------------------------------------------------------------
// Age curve chart
// ---------------------------------------------------------------------------

function AgeCurveChart({ pos, currentAge, ageCurves }) {
  const curve = (ageCurves && ageCurves[pos]) || AGE_CURVES_FALLBACK[pos] || AGE_CURVES_FALLBACK.WR;
  const { peak, decline, cliff } = curve;

  const W = 480, H = 80;
  const PAD = { l: 28, r: 12, t: 8, b: 20 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const ageMin = 19, ageMax = 42;
  const ageRange = ageMax - ageMin;

  const xOf = (age) => PAD.l + ((age - ageMin) / ageRange) * innerW;
  const yOf = (score) => PAD.t + (1 - score / 100) * innerH;

  // Build polyline points using the same math as ageComponent
  const riseFrom = curve.riseFrom ?? peak - 5;
  const riseStart = curve.riseStart ?? 65;
  const scoreAt = (age) => {
    if (age < peak) {
      if (age <= riseFrom) return riseStart;
      const t = (age - riseFrom) / (peak - riseFrom);
      return Math.round(riseStart + t * (95 - riseStart));
    }
    if (age === peak) return 95;
    if (age <= decline) return Math.max(30, 95 - ((age - peak) / (decline - peak)) * 65);
    if (age <= cliff) return Math.max(10, 30 - ((age - decline) / (cliff - decline)) * 20);
    return 12;
  };

  const ages = Array.from({ length: ageRange + 1 }, (_, i) => ageMin + i);
  const points = ages.map((a) => `${xOf(a).toFixed(1)},${yOf(scoreAt(a)).toFixed(1)}`).join(" ");

  const clampedAge = Math.max(ageMin, Math.min(ageMax, currentAge));
  const markerX = xOf(clampedAge);
  const markerY = yOf(scoreAt(clampedAge));

  const zoneLabels = [
    { label: "Peak", age: peak, color: "#00f5a0" },
    { label: "Decline", age: decline, color: "#ffd84d" },
    { label: "Cliff", age: cliff, color: "#ff6b35" },
  ];

  return (
    <div style={{ margin: "8px 0 0" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
        aria-label={`Age production curve for ${pos}, current age ${currentAge}`}
      >
        {/* Zone fills */}
        <rect x={PAD.l} y={PAD.t} width={xOf(peak) - PAD.l} height={innerH} fill="rgba(0,245,160,0.06)" />
        <rect x={xOf(peak)} y={PAD.t} width={xOf(decline) - xOf(peak)} height={innerH} fill="rgba(255,212,77,0.06)" />
        <rect x={xOf(decline)} y={PAD.t} width={xOf(cliff) - xOf(decline)} height={innerH} fill="rgba(255,107,53,0.06)" />
        <rect x={xOf(cliff)} y={PAD.t} width={xOf(ageMax) - xOf(cliff)} height={innerH} fill="rgba(255,107,53,0.03)" />

        {/* Threshold dashes */}
        {zoneLabels.map(({ age, color }) => (
          <line
            key={age}
            x1={xOf(age)} y1={PAD.t}
            x2={xOf(age)} y2={PAD.t + innerH}
            stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.5}
          />
        ))}

        {/* Curve */}
        <polyline points={points} fill="none" stroke="#7b8cff" strokeWidth={2} strokeLinejoin="round" />

        {/* Current age marker */}
        <line x1={markerX} y1={PAD.t} x2={markerX} y2={PAD.t + innerH} stroke="#fff" strokeWidth={1.5} opacity={0.7} />
        <circle cx={markerX} cy={markerY} r={3.5} fill="#fff" />

        {/* Y-axis label */}
        <text x={PAD.l - 4} y={PAD.t + 1} fill="#505868" fontSize={7} textAnchor="end" dominantBaseline="hanging">100</text>
        <text x={PAD.l - 4} y={PAD.t + innerH} fill="#505868" fontSize={7} textAnchor="end" dominantBaseline="auto">0</text>

        {/* X-axis age ticks */}
        {[20, 24, 28, 32, 36, 40].map((a) => (
          <text key={a} x={xOf(a)} y={PAD.t + innerH + 11} fill="#505868" fontSize={7} textAnchor="middle">{a}</text>
        ))}

        {/* Zone labels */}
        {zoneLabels.map(({ label, age, color }, i) => {
          const nextAge = zoneLabels[i + 1]?.age ?? ageMax;
          const midX = xOf((age + nextAge) / 2);
          return (
            <text key={label} x={midX} y={PAD.t + innerH + 11} fill={color} fontSize={7} textAnchor="middle" opacity={0.7}>
              {label}
            </text>
          );
        })}

        {/* "Age N" label on marker */}
        <text
          x={markerX}
          y={PAD.t - 2}
          fill="#fff"
          fontSize={7.5}
          textAnchor={clampedAge > 36 ? "end" : clampedAge < 23 ? "start" : "middle"}
          fontWeight="700"
        >
          Age {currentAge}
        </text>
      </svg>
    </div>
  );
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
      {comps.length > 0 && (() => {
        const ceilingComps = comps.filter((c) => c.outcomeBucket === "ceiling");
        const floorComps = comps.filter((c) => c.outcomeBucket === "floor");
        const typicalComps = comps.filter(
          (c) => !c.outcomeBucket || c.outcomeBucket === "typical",
        );

        const renderCard = (comp, i) => {
          const delta = comp.future1 !== undefined ? comp.future1 - comp.ppgPctile : null;
          const deltaCol = delta === null
            ? "#808898"
            : delta >= 10 ? "#00f5a0"
            : delta <= -10 ? "#ff6b35"
            : "#ffd84d";
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
        };

        const sectionHeader = (label, sublabel, color) => (
          <div style={{ fontSize: 10, color, marginBottom: 6, letterSpacing: 0.5 }}>
            {label}
            <span style={{ color: "#606878", marginLeft: 6, letterSpacing: 0, fontWeight: 400 }}>
              {sublabel}
            </span>
          </div>
        );

        const gridStyle = {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 6,
        };

        const hasBuckets = ceilingComps.length > 0 || floorComps.length > 0;

        return (
          <div>
            <div style={{ fontSize: 10, color: "#808898", marginBottom: 10 }}>
              Historical Comparable Players
              <span style={{ color: "#606878", marginLeft: 6 }}>
                (best-case and worst-case outcomes among similar profiles)
              </span>
            </div>

            {hasBuckets ? (
              <>
                {ceilingComps.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    {sectionHeader("CEILING CASE", "— best Y+1 outcomes", "#00f5a0")}
                    <div style={gridStyle}>{ceilingComps.map(renderCard)}</div>
                  </div>
                )}
                {floorComps.length > 0 && (
                  <div>
                    {sectionHeader("FLOOR CASE", "— worst Y+1 outcomes", "#ff6b35")}
                    <div style={gridStyle}>{floorComps.map(renderCard)}</div>
                  </div>
                )}
              </>
            ) : (
              <div style={gridStyle}>{typicalComps.slice(0, 5).map(renderCard)}</div>
            )}

            <div style={{ fontSize: 9, color: "#505868", marginTop: 8, lineHeight: 1.5 }}>
              Comps pulled from Sleeper historical data (2009–2024). Filtered to same
              position, close age, similar production tier &amp; draft capital — then
              split by what actually happened the following season.
            </div>
          </div>
        );
      })()}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export default function PlayerDeepDiveModal({ player, scoringWeights, ageCurves, onClose }) {
  const modalRef = useModalBehavior(onClose);

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
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Deep dive for ${name}`}
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
            extra: <AgeCurveChart pos={position} currentAge={age} ageCurves={ageCurves} />,
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
            explanation: situExplanation(components.situ, player.depthOrder, team, player.position),
          },
        ].map(({ label, color, value, explanation, extra }) => (
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
            {extra}
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
          Data sources: Sleeper API (stats 2009–2024, player metadata) · FantasyCalc (market consensus).
          Predictions built from empirical age curves and historical comp matching across 16 NFL seasons.
        </div>
      </div>
    </div>
  );
}
