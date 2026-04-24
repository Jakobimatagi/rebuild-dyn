import { styles } from "../../../styles";
import { getColor } from "../../../lib/analysis";
import TrendBadge from "./TrendBadge";
import MarketCompsBlock from "./MarketCompsBlock";

const ACCENT = "#06b6d4"; // cyan — distinct from bombshell purple and marquee red

const PHASE_COLORS = {
  contender: "#00f5a0",
  retool: "#ffd84d",
  rebuild: "#ff6b35",
};

const MODE_LABELS = {
  consolidation: "Consolidation Haul",
  liquidation: "Liquidation Haul",
};

function PlayerChip({ player }) {
  if (!player) return null;
  return (
    <div style={{ marginBottom: 4 }}>
      <span style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>
        {player.name}<TrendBadge player={player} />
      </span>
      <span style={{ fontSize: 10, color: "#c8cfe3", marginLeft: 6 }}>
        {player.position} · {player.age}yo · score {player.score}
      </span>
      {player.archetype && (
        <span
          style={{
            ...styles.tag(getColor(player.verdict)),
            marginLeft: 6,
            fontSize: 9,
          }}
        >
          {player.archetype}
        </span>
      )}
    </div>
  );
}

function HaulCard({ move, index }) {
  const sendPlayers = move.sendPlayers || [];
  const target = move.receive?.player;
  const receivePlayers = move.receive?.players || (target ? [target] : []);
  const receivePicks = move.receivePickLabels || [];
  const isConsolidation = move.mode === "consolidation";
  const modeLabel = MODE_LABELS[move.mode] || "Haul Trade";

  if (sendPlayers.length === 0) return null;

  const partnerColor = PHASE_COLORS[move.partnerPhase] || "#d1d7ea";

  return (
    <div
      style={{
        ...styles.card,
        marginBottom: 14,
        borderColor: "rgba(6,182,212,0.4)",
        borderLeft: `3px solid ${ACCENT}`,
        padding: "16px 18px",
        background: "rgba(6,182,212,0.03)",
      }}
    >
      {/* Header */}
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
          {modeLabel} #{index + 1} · Partner:{" "}
          <span style={{ color: partnerColor }}>
            {move.partnerTeam} ({move.partnerPhase || "?"})
          </span>
        </div>
        {move.sendFcValue != null && move.receiveFcValue != null && (
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: "#c8cfe3",
              whiteSpace: "nowrap",
            }}
          >
            FC:{" "}
            <span style={{ color: "#ff6b35", fontWeight: 700 }}>
              ${move.sendFcValue.toLocaleString()}
            </span>
            <span style={{ color: "#8a91a8", margin: "0 4px" }}>→</span>
            <span style={{ color: "#00f5a0", fontWeight: 700 }}>
              ${move.receiveFcValue.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Trade grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 12,
          alignItems: "start",
          marginBottom: 10,
        }}
      >
        {/* SEND SIDE */}
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
            You send {isConsolidation ? `(${sendPlayers.length} players)` : ""}
          </div>
          {sendPlayers.map((p) => (
            <PlayerChip key={p.id} player={p} />
          ))}
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
        </div>

        <div
          style={{
            fontSize: 20,
            color: ACCENT,
            fontWeight: 700,
            textAlign: "center",
            paddingTop: 16,
          }}
        >
          →
        </div>

        {/* RECEIVE SIDE */}
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
          {receivePlayers.map((p) => (
            <PlayerChip key={p.id} player={p} />
          ))}
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

      {/* Ratio badge */}
      {move.valueRatio != null && (
        <div
          style={{
            fontSize: 10,
            color: "#c8cfe3",
            marginBottom: 6,
          }}
        >
          Parity ratio:{" "}
          <span
            style={{
              fontWeight: 700,
              color: move.valueRatio >= 0.95 && move.valueRatio <= 1.05
                ? "#00f5a0"
                : "#ffd84d",
            }}
          >
            {move.valueRatio}
          </span>
        </div>
      )}

      {/* Rationale */}
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
        label={`Recent market comps — ${sendPlayers[0]?.name || "sell piece"}`}
      />
    </div>
  );
}

export default function HaulTradesList({ haulTrades }) {
  if (!haulTrades || !haulTrades.enabled) return null;
  const moves = haulTrades.moves || [];
  if (moves.length === 0) return null;

  const title = haulTrades.title || "Haul Trades";
  const subtitle = haulTrades.subtitle;

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
      {haulTrades.consolidationCount > 0 && haulTrades.liquidationCount > 0 && (
        <div
          style={{
            fontSize: 10,
            color: "#8a91a8",
            marginBottom: 10,
          }}
        >
          {haulTrades.consolidationCount} consolidation ·{" "}
          {haulTrades.liquidationCount} liquidation haul
          {haulTrades.liquidationCount > 1 ? "s" : ""}
        </div>
      )}
      {moves.map((m, i) => (
        <HaulCard
          key={`haul-${m.mode}-${i}`}
          move={m}
          index={i}
        />
      ))}
    </div>
  );
}
