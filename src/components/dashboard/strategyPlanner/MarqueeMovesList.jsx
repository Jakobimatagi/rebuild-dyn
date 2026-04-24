import { styles } from "../../../styles";
import { getColor } from "../../../lib/analysis";
import TrendBadge from "./TrendBadge";
import MarketCompsBlock from "./MarketCompsBlock";

const PHASE_COLORS = {
  contender: "#00f5a0",
  retool: "#ffd84d",
  rebuild: "#ff6b35",
};

function MoveCard({ move, index }) {
  const send = move.send;
  const recv = move.receive?.player;
  if (!send || !recv) return null;
  const partnerColor = PHASE_COLORS[move.partnerPhase] || "#d1d7ea";

  return (
    <div
      style={{
        ...styles.card,
        marginBottom: 14,
        borderColor: "rgba(255,45,85,0.35)",
        borderLeft: "3px solid #ff2d55",
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 2,
            color: "#ff2d55",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          Move #{index + 1} · Partner:{" "}
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
            Value:{" "}
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
          marginBottom: 10,
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
          <div style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>
            {send.name}<TrendBadge player={send} />
          </div>
          <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 2 }}>
            {send.position} · {send.age}yo · score {send.score}
          </div>
          {send.archetype && (
            <div style={{ marginTop: 4 }}>
              <span style={styles.tag(getColor(send.verdict))}>
                {send.archetype}
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: 20,
            color: "#00f5a0",
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
          <div style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>
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
            paddingTop: 10,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {move.rationale}
        </div>
      )}

      <MarketCompsBlock
        comps={move.sendMarketComps}
        label={`Recent market comps — ${send.name}`}
      />
    </div>
  );
}

export default function MarqueeMovesList({ marqueeMoves }) {
  if (!marqueeMoves) return null;
  const title = marqueeMoves.title || "Marquee Moves";
  const subtitle = marqueeMoves.subtitle;
  const moves = marqueeMoves.moves || [];

  return (
    <div>
      <div style={styles.sectionLabel}>3 — {title}</div>
      {subtitle && (
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
          {subtitle}
        </div>
      )}
      {moves.length === 0 ? (
        <div
          style={{
            ...styles.card,
            fontSize: 12,
            color: "#d1d7ea",
          }}
        >
          No marquee moves match this path's criteria in the current league —
          either your roster has no fitting sell candidates or no partner team
          has the right return profile.
        </div>
      ) : (
        moves.map((m, i) => (
          <MoveCard
            key={`${m.send.id}-${m.receive?.player?.id}`}
            move={m}
            index={i}
          />
        ))
      )}
    </div>
  );
}
