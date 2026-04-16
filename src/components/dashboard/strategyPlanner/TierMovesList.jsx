import { styles } from "../../../styles";
import { getColor } from "../../../lib/analysis";
import TrendBadge from "./TrendBadge";

const PHASE_COLORS = {
  contender: "#00f5a0",
  retool: "#ffd84d",
  rebuild: "#ff6b35",
};

const UP_ACCENT = "#3b82f6"; // blue — upgrade
const DOWN_ACCENT = "#f59e0b"; // amber — draft-capital return

function TierCard({ move, index, accent, label }) {
  const sender = move.send;
  const recv = move.receive?.player;
  if (!sender || !recv) return null;
  const partnerColor = PHASE_COLORS[move.partnerPhase] || "#d1d7ea";

  return (
    <div
      style={{
        ...styles.card,
        marginBottom: 12,
        borderColor: `${accent}55`,
        borderLeft: `3px solid ${accent}`,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 2,
            color: accent,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {label} #{index + 1} · {move.position} · Partner:{" "}
          <span style={{ color: partnerColor }}>
            {move.partnerTeam} ({move.partnerPhase || "?"})
          </span>
        </div>
        {move.sendValue != null && move.receiveValue != null && (
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: "#c8cfe3",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "#ff6b35", fontWeight: 700 }}>
              {move.sendValue}
            </span>
            <span style={{ color: "#8a91a8", margin: "0 4px" }}>vs</span>
            <span style={{ color: "#00f5a0", fontWeight: 700 }}>
              {move.receiveValue}
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 12,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        {/* SEND */}
        <div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 2,
              color: "#ff6b35",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            You send
          </div>
          <div style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>
            {sender.name}<TrendBadge player={sender} />
          </div>
          <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 2 }}>
            {sender.position} · {sender.age}yo · score {sender.score}
          </div>
          {move.sendPickLabels && move.sendPickLabels.length > 0 && (
            <div
              style={{
                fontSize: 10,
                color: "#ff6b35",
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              + {move.sendPickLabels.join(", ")}
            </div>
          )}
          {sender.archetype && (
            <div style={{ marginTop: 4 }}>
              <span style={styles.tag(getColor(sender.verdict))}>
                {sender.archetype}
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: 18,
            color: accent,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          →
        </div>

        {/* RECEIVE */}
        <div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 2,
              color: "#00f5a0",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            You receive
          </div>
          <div style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>
            {recv.name}<TrendBadge player={recv} />
          </div>
          <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 2 }}>
            {recv.position} · {recv.age}yo · score {recv.score}
          </div>
          {move.receivePickLabels && move.receivePickLabels.length > 0 && (
            <div
              style={{
                fontSize: 10,
                color: "#00f5a0",
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              + {move.receivePickLabels.join(", ")}
            </div>
          )}
          {recv.archetype && (
            <div style={{ marginTop: 4 }}>
              <span style={styles.tag("#00f5a0")}>{recv.archetype}</span>
            </div>
          )}
        </div>
      </div>

      {move.rationale && (
        <div
          style={{
            fontSize: 11,
            color: "#d9deef",
            lineHeight: 1.45,
            paddingTop: 8,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {move.rationale}
        </div>
      )}
    </div>
  );
}

export default function TierMovesList({ tierMoves }) {
  if (!tierMoves) return null;
  const tierUps = tierMoves.tierUps || [];
  const tierDowns = tierMoves.tierDowns || [];
  if (tierUps.length === 0 && tierDowns.length === 0) return null;

  return (
    <div>
      <div style={styles.sectionLabel}>
        ⇅ {tierMoves.title || "Tier Swap Moves"}
      </div>
      {tierMoves.subtitle && (
        <div
          style={{
            fontSize: 12,
            color: "#d9deef",
            marginBottom: 14,
            marginTop: -8,
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          {tierMoves.subtitle}
        </div>
      )}

      {tierUps.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: UP_ACCENT,
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            ↑ Tier Up — upgrade the position
          </div>
          {tierUps.map((m, i) => (
            <TierCard
              key={`up-${m.send.id}-${m.receive?.player?.id}`}
              move={m}
              index={i}
              accent={UP_ACCENT}
              label="Tier Up"
            />
          ))}
        </div>
      )}

      {tierDowns.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: DOWN_ACCENT,
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            ↓ Tier Down — cash the star, bank the pick
          </div>
          {tierDowns.map((m, i) => (
            <TierCard
              key={`down-${m.send.id}-${m.receive?.player?.id}`}
              move={m}
              index={i}
              accent={DOWN_ACCENT}
              label="Tier Down"
            />
          ))}
        </div>
      )}
    </div>
  );
}
