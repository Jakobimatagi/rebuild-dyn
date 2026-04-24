import { styles } from "../../../styles";
import { getColor } from "../../../lib/analysis";
import TrendBadge from "./TrendBadge";
import MarketCompsBlock from "./MarketCompsBlock";

const PHASE_COLORS = {
  contender: "#00f5a0",
  retool: "#ffd84d",
  rebuild: "#ff6b35",
};

const ACCENT = "#d946ef"; // purple — distinct from marquee's red

function MoveCard({ move, index }) {
  const anchor = move.send;
  const target = move.receive?.player;
  const receivePicks = move.receivePickLabels || [];
  // Liquidate mode may have picks-only return (target = null). Still render.
  if (!anchor) return null;
  if (!target && receivePicks.length === 0) return null;
  const partnerColor = PHASE_COLORS[move.partnerPhase] || "#d1d7ea";

  return (
    <div
      style={{
        ...styles.card,
        marginBottom: 14,
        borderColor: "rgba(217,70,239,0.4)",
        borderLeft: `3px solid ${ACCENT}`,
        padding: "16px 18px",
        background: "rgba(217,70,239,0.03)",
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
            color: ACCENT,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          Bombshell #{index + 1} · Partner:{" "}
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
        {/* SEND — anchor + picks */}
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
            {anchor.name}<TrendBadge player={anchor} />
          </div>
          <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 2 }}>
            {anchor.position} · {anchor.age}yo · score {anchor.score}
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
          {anchor.archetype && (
            <div style={{ marginTop: 4 }}>
              <span style={styles.tag(getColor(anchor.verdict))}>
                {anchor.archetype}
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: 20,
            color: ACCENT,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          →
        </div>

        {/* RECEIVE — premium target and/or pick haul */}
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
          {target ? (
            <>
              <div style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>
                {target.name}<TrendBadge player={target} />
              </div>
              <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 2 }}>
                {target.position} · {target.age}yo · score {target.score}
              </div>
              {target.archetype && (
                <div style={{ marginTop: 4 }}>
                  <span style={styles.tag("#00f5a0")}>{target.archetype}</span>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>
              Pick haul
            </div>
          )}
          {receivePicks.length > 0 && (
            <div
              style={{
                fontSize: 10,
                color: "#00f5a0",
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              + {receivePicks.join(", ")}
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
        label={`Recent market comps — ${anchor.name}`}
      />
    </div>
  );
}

export default function BombshellMovesList({ bombshellMoves }) {
  if (!bombshellMoves || !bombshellMoves.enabled) return null;
  const moves = bombshellMoves.moves || [];
  if (moves.length === 0) return null;

  const title = bombshellMoves.title || "Bombshell Moves";
  const subtitle = bombshellMoves.subtitle;

  return (
    <div>
      <div
        style={{
          ...styles.sectionLabel,
          color: ACCENT,
        }}
      >
        ★ {title}
      </div>
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
      {moves.map((m, i) => (
        <MoveCard
          key={`${m.send.id}-${m.receive?.player?.id || "pickhaul"}-${i}`}
          move={m}
          index={i}
        />
      ))}
    </div>
  );
}
