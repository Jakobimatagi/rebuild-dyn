import { useModalBehavior } from "../../lib/useModalBehavior";
import { formatPickValue } from "../../lib/marketValue";
import { styles } from "../../styles";

const POS_COLOR = {
  QB: "#ff6b6b",
  RB: "#00f5a0",
  WR: "#ffd84d",
  TE: "#4dd0ff",
};

const GRADE_COLOR = {
  A: "#00f5a0",
  B: "#7ee0b3",
  C: "#ffd84d",
  D: "#ff9f4d",
  F: "#ff6b6b",
};

function fmtDelta(d) {
  const v = Math.round(d);
  if (v > 0) return `+${formatPickValue(v)}`;
  if (v < 0) return `−${formatPickValue(Math.abs(v))}`;
  return "0";
}

function deltaColor(d) {
  if (d > 100) return "#00f5a0";
  if (d > 0) return "#7ee0b3";
  if (d < -100) return "#ff6b6b";
  if (d < 0) return "#ff9f4d";
  return "#94a3b8";
}

export default function TeamRecapModal({ team, totalTeams, onClose }) {
  const modalRef = useModalBehavior(onClose);
  if (!team) return null;

  const sorted = [...team.picks].sort((a, b) => a.pickNo - b.pickNo);
  const best = [...team.picks].sort((a, b) => b.delta - a.delta)[0];
  const worst = [...team.picks].sort((a, b) => a.delta - b.delta)[0];
  const avgDelta = team.picks.length
    ? team.totalDelta / team.picks.length
    : 0;

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
        aria-label={`Draft recap for ${team.label}`}
        style={{
          background: "#0d0d16",
          border: "1px solid rgba(0,245,160,0.18)",
          borderRadius: 6,
          padding: "24px 28px 28px",
          maxWidth: 720,
          width: "100%",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close team recap"
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            background: "transparent",
            border: "none",
            color: "#d1d7ea",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          ✕
        </button>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 16,
            marginBottom: 6,
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: GRADE_COLOR[team.grade] || "#d9deef",
              lineHeight: 1,
            }}
          >
            {team.grade}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#e8e8f0" }}>
              {team.label}
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1 }}>
              RANK #{team.rank} OF {totalTeams} · {team.picks.length} PICK
              {team.picks.length !== 1 ? "S" : ""}
            </div>
          </div>
        </div>

        {/* Summary stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 8,
            marginTop: 16,
            marginBottom: 18,
          }}
        >
          <Stat
            label="Net gain/loss"
            value={fmtDelta(team.totalDelta)}
            color={deltaColor(team.totalDelta)}
          />
          <Stat
            label="Avg / pick"
            value={fmtDelta(avgDelta)}
            color={deltaColor(avgDelta)}
          />
          <Stat
            label="Player value"
            value={formatPickValue(Math.round(team.totalPlayerValue))}
            color="#d9deef"
          />
          <Stat
            label="Slot value"
            value={formatPickValue(Math.round(team.totalSlotValue))}
            color="#d9deef"
          />
        </div>

        {/* Best / worst tag-line */}
        {best && worst && best !== worst && (
          <div
            style={{
              fontSize: 11,
              color: "#d9deef",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "8px 12px",
              borderRadius: 4,
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            <div>
              <span style={{ color: "#94a3b8" }}>Best pick:</span>{" "}
              <strong style={{ color: "#e8e8f0" }}>{best.playerName}</strong>{" "}
              at {best.round}.{String(best.slot).padStart(2, "0")}
              <span
                style={{
                  marginLeft: 6,
                  color: deltaColor(best.delta),
                  fontWeight: 600,
                }}
              >
                {fmtDelta(best.delta)}
              </span>
            </div>
            <div>
              <span style={{ color: "#94a3b8" }}>Worst pick:</span>{" "}
              <strong style={{ color: "#e8e8f0" }}>{worst.playerName}</strong>{" "}
              at {worst.round}.{String(worst.slot).padStart(2, "0")}
              <span
                style={{
                  marginLeft: 6,
                  color: deltaColor(worst.delta),
                  fontWeight: 600,
                }}
              >
                {fmtDelta(worst.delta)}
              </span>
            </div>
          </div>
        )}

        {/* Pick-by-pick breakdown */}
        <div style={{ ...styles.sectionLabel, marginBottom: 8 }}>
          Pick Breakdown
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "44px 1fr 70px 70px 80px",
            gap: 4,
            fontSize: 9,
            color: "#94a3b8",
            letterSpacing: 1,
            padding: "4px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>PICK</div>
          <div>PLAYER</div>
          <div style={{ textAlign: "right" }}>VALUE</div>
          <div style={{ textAlign: "right" }}>SLOT</div>
          <div style={{ textAlign: "right" }}>GAIN/LOSS</div>
        </div>
        {sorted.map((p) => {
          const posColor = POS_COLOR[p.position] || "#d9deef";
          return (
            <div
              key={p.pickNo}
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 70px 70px 80px",
                gap: 4,
                padding: "8px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                alignItems: "center",
                fontSize: 12,
              }}
            >
              <div style={{ color: "#94a3b8", fontSize: 10 }}>
                {p.round}.{String(p.slot).padStart(2, "0")}
              </div>
              <div>
                <span
                  style={{
                    color: posColor,
                    fontWeight: 600,
                    marginRight: 6,
                    fontSize: 10,
                  }}
                >
                  {p.position}
                </span>
                <span style={{ color: "#e8e8f0" }}>{p.playerName}</span>
                {p.team && (
                  <span
                    style={{
                      color: "#94a3b8",
                      marginLeft: 6,
                      fontSize: 10,
                    }}
                  >
                    {p.team}
                  </span>
                )}
              </div>
              <div
                style={{
                  textAlign: "right",
                  color: "#d9deef",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatPickValue(Math.round(p.playerValue))}
              </div>
              <div
                style={{
                  textAlign: "right",
                  color: "#94a3b8",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatPickValue(Math.round(p.slotValue))}
              </div>
              <div
                style={{
                  textAlign: "right",
                  color: deltaColor(p.delta),
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtDelta(p.delta)}
              </div>
            </div>
          );
        })}

        <div
          style={{
            fontSize: 9,
            color: "#94a3b8",
            marginTop: 14,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "#d9deef" }}>How to read:</strong> player
          value is a 60/40 blend of FantasyCalc and RosterAudit dynasty
          values. Slot value is the calibrated worth of the pick used.
          Delta = player value − slot value. Positive = value gained,
          negative = reach.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        padding: "8px 10px",
        borderRadius: 3,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 8,
          color: "#94a3b8",
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
