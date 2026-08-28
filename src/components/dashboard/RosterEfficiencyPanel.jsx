import { useMemo } from "react";
import { computeRosterEfficiency } from "../../lib/rosterEfficiency";
import { styles } from "../../styles";

// ---------------------------------------------------------------------------
// Roster Efficiency — visual grader for Buying Power vs. Expected Value.
// Plots every league team on a buying-power (x) vs expected-value (y)
// percentile map. The diagonal is the "efficient frontier": on it, on-field
// output matches the assets that produce it. Above = converting buying power
// into wins; below = buying power sitting idle. The viewer's team is graded
// A–F on that gap and given a plain-language diagnosis.
// ---------------------------------------------------------------------------

// Scatter geometry (SVG user units). Square plot with room for axis labels.
const PAD_L = 34;
const PAD_B = 30;
const PAD_T = 14;
const PAD_R = 14;
const PLOT = 200;
const W = PAD_L + PLOT + PAD_R;
const H = PAD_T + PLOT + PAD_B;

const x = (pct) => PAD_L + (pct / 100) * PLOT;
const y = (pct) => PAD_T + (1 - pct / 100) * PLOT;

function QuadrantMap({ rows, me }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: 340, display: "block", margin: "0 auto" }}
      role="img"
      aria-label="Roster efficiency map: buying power versus expected value"
    >
      {/* Quadrant tints */}
      {/* top-left: low BP, high EV → over-extended */}
      <rect x={x(0)} y={y(100)} width={PLOT / 2} height={PLOT / 2} fill="#ff9d4d" opacity="0.06" />
      {/* top-right: high BP, high EV → loaded */}
      <rect x={x(50)} y={y(100)} width={PLOT / 2} height={PLOT / 2} fill="#00f5a0" opacity="0.07" />
      {/* bottom-left: low BP, low EV → rebuilding */}
      <rect x={x(0)} y={y(50)} width={PLOT / 2} height={PLOT / 2} fill="#94a3b8" opacity="0.05" />
      {/* bottom-right: high BP, low EV → under-leveraged */}
      <rect x={x(50)} y={y(50)} width={PLOT / 2} height={PLOT / 2} fill="#7b8cff" opacity="0.07" />

      {/* Efficient frontier (diagonal) */}
      <line
        x1={x(0)}
        y1={y(0)}
        x2={x(100)}
        y2={y(100)}
        stroke="#00f5a0"
        strokeWidth="1"
        strokeDasharray="4 3"
        opacity="0.5"
      />
      {/* Midlines */}
      <line x1={x(50)} y1={y(0)} x2={x(50)} y2={y(100)} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      <line x1={x(0)} y1={y(50)} x2={x(100)} y2={y(50)} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      {/* Plot border */}
      <rect x={x(0)} y={y(100)} width={PLOT} height={PLOT} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />

      {/* Quadrant labels */}
      <text x={x(3)} y={y(96)} fontSize="7" fill="#ff9d4d" opacity="0.85" letterSpacing="0.5">MAXED OUT</text>
      <text x={x(97)} y={y(96)} fontSize="7" fill="#00f5a0" opacity="0.85" letterSpacing="0.5" textAnchor="end">LOADED</text>
      <text x={x(3)} y={y(3)} fontSize="7" fill="#94a3b8" opacity="0.85" letterSpacing="0.5">REBUILDING</text>
      <text x={x(97)} y={y(3)} fontSize="7" fill="#7b8cff" opacity="0.85" letterSpacing="0.5" textAnchor="end">HOARDING</text>

      {/* League dots */}
      {rows.map((r) => {
        const isMe = me && r.rosterId === me.rosterId;
        if (isMe) return null;
        return (
          <circle key={r.rosterId} cx={x(r.bpPct)} cy={y(r.evPct)} r="3" fill="#5b6270" opacity="0.75" />
        );
      })}

      {/* My team — ringed + labelled */}
      {me && (
        <g>
          <circle cx={x(me.bpPct)} cy={y(me.evPct)} r="8" fill="none" stroke={me.gradeColor} strokeWidth="1.5" opacity="0.5" />
          <circle cx={x(me.bpPct)} cy={y(me.evPct)} r="4.5" fill={me.gradeColor} />
          <text
            x={x(me.bpPct)}
            y={y(me.evPct) - 11}
            fontSize="8"
            fill="#fff"
            textAnchor="middle"
            fontWeight="600"
          >
            YOU
          </text>
        </g>
      )}

      {/* Axis labels */}
      <text x={PAD_L + PLOT / 2} y={H - 6} fontSize="8" fill="#808898" textAnchor="middle" letterSpacing="1">
        BUYING POWER →
      </text>
      <text
        x={-(PAD_T + PLOT / 2)}
        y={11}
        fontSize="8"
        fill="#808898"
        textAnchor="middle"
        letterSpacing="1"
        transform="rotate(-90)"
      >
        EXPECTED VALUE →
      </text>
    </svg>
  );
}

function StatTile({ label, value, sub, color = "#e8e8f0" }) {
  return (
    <div
      style={{
        padding: "9px 11px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 4,
      }}
    >
      <div style={{ fontSize: 8, color: "#808898", letterSpacing: 1.2, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, color, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function RosterEfficiencyPanel({
  leagueTeams,
  leagueContext,
  tradeMarket,
  myRosterId,
}) {
  const model = useMemo(
    () => computeRosterEfficiency(leagueTeams, leagueContext, tradeMarket, myRosterId),
    [leagueTeams, leagueContext, tradeMarket, myRosterId],
  );

  const me = model?.me;
  if (!model || !me) return null;

  const idxSign = me.efficiencyIndex >= 0 ? "+" : "";
  const idxColor = me.efficiencyIndex >= 8 ? "#00f5a0" : me.efficiencyIndex <= -8 ? "#ff6b35" : "#ffd84d";
  const ord = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div style={{ ...styles.card, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div style={{ ...styles.sectionLabel, marginBottom: 0 }}>Roster Efficiency · Buying Power vs. Expected Value</div>
        <span style={styles.tag(me.color)}>{me.archetype}</span>
      </div>
      <div style={{ fontSize: 10, color: "#808898", marginBottom: 14 }}>
        How well your buying power (market value of all assets) is allocated toward expected value (projected starter PPG), graded against your league.
      </div>

      <div
        className="dyn-grid-2"
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 340px) 1fr", gap: 20, alignItems: "start" }}
      >
        <QuadrantMap rows={model.rows} me={me} />

        <div>
          {/* Grade + diagnosis */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 8,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${me.gradeColor}14`,
                border: `1.5px solid ${me.gradeColor}66`,
              }}
            >
              <span style={{ fontSize: 32, fontWeight: 800, color: me.gradeColor, lineHeight: 1 }}>{me.grade}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#fff", fontWeight: 600, marginBottom: 3 }}>{me.headline}</div>
              <div style={{ fontSize: 10, color: "#808898", letterSpacing: 0.5 }}>
                Efficiency grade · allocation of buying power → expected value
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#c8cfe3", lineHeight: 1.6, marginBottom: 14 }}>{me.note}</div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <StatTile
              label="BUYING POWER"
              value={Math.round(me.buyingPower)}
              sub={`${ord(me.bpRank)} of ${me.numTeams}`}
              color="#ffd84d"
            />
            <StatTile
              label="STARTER PPG"
              value={me.expectedValue.toFixed ? me.expectedValue.toFixed(1) : me.expectedValue}
              sub={`${ord(me.evRank)} of ${me.numTeams}`}
              color="#00f5a0"
            />
            <StatTile
              label="EFFICIENCY"
              value={`${idxSign}${me.efficiencyIndex}`}
              sub="EV rank − BP rank"
              color={idxColor}
            />
          </div>

          <div style={{ fontSize: 9, color: "#606878", marginTop: 10, lineHeight: 1.5 }}>
            Above the dashed line, your lineup output outranks your assets — efficient. Below it, buying power isn't
            reaching the field. Dots are the other teams in your league.
          </div>
        </div>
      </div>
    </div>
  );
}
