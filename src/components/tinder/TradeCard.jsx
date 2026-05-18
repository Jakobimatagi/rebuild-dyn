import { useRef, useState } from "react";

const PHASE_COLOR = {
  contender: "#00f5a0",
  retool: "#f5a623",
  rebuild: "#e05c5c",
  unknown: "#94a3b8",
};

const PHASE_LABEL = {
  contender: "Contender",
  retool: "Retool",
  rebuild: "Rebuild",
  unknown: "—",
};

const POS_COLOR = {
  QB: "#a78bfa",
  WR: "#60a5fa",
  RB: "#34d399",
  TE: "#fbbf24",
};

function PhaseChip({ phase }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: PHASE_COLOR[phase] || "#94a3b8",
        border: `1px solid ${PHASE_COLOR[phase] || "#94a3b8"}`,
        borderRadius: 3,
        padding: "1px 6px",
        fontWeight: 600,
      }}
    >
      {PHASE_LABEL[phase] || phase}
    </span>
  );
}

function AssetRow({ asset }) {
  const isPlayer = asset.type === "player";
  const pos = asset.position;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 0",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {isPlayer && pos && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#141722",
            background: POS_COLOR[pos] || "#94a3b8",
            borderRadius: 2,
            padding: "1px 5px",
            minWidth: 24,
            textAlign: "center",
          }}
        >
          {pos}
        </span>
      )}
      {!isPlayer && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#141722",
            background: "#f5a623",
            borderRadius: 2,
            padding: "1px 5px",
            minWidth: 24,
            textAlign: "center",
          }}
        >
          PK
        </span>
      )}
      <span style={{ fontSize: 13, color: "#e8e8f0", flex: 1 }}>
        {isPlayer ? asset.name : asset.label || `${asset.season} Round ${asset.round}`}
      </span>
      <span style={{ fontSize: 11, color: "#64748b" }}>
        {asset.value ? Math.round(asset.value) : ""}
      </span>
    </div>
  );
}

function TeamBlock({ team, assets, totalValue, side }) {
  const isAnonymous = team.phase === null;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            marginBottom: 3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {team.label}
        </div>
        {!isAnonymous && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PhaseChip phase={team.phase} />
            <span style={{ fontSize: 11, color: "#64748b" }}>
              {team.wins}–{team.losses}
            </span>
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "#64748b",
          marginBottom: 4,
        }}
      >
        {side === "A" ? "Sends" : "Sends"}
      </div>
      <div>
        {assets.map((a, i) => (
          <AssetRow key={i} asset={a} />
        ))}
      </div>
      {totalValue != null && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "#94a3b8",
            textAlign: side === "A" ? "left" : "right",
          }}
        >
          Value: <strong style={{ color: "#e8e8f0" }}>{Math.round(totalValue)}</strong>
        </div>
      )}
    </div>
  );
}

const VERDICT_OPTIONS = [
  { key: "team_a", label: "Team A wins", color: "#e05c5c", short: "←" },
  { key: "fair", label: "Fair trade", color: "#00f5a0", short: "✓" },
  { key: "team_b", label: "Team B wins", color: "#60a5fa", short: "→" },
];

const GRADE_COLOR = {
  "A+": "#00f5a0", A: "#00f5a0", "A-": "#34d399",
  "B+": "#60a5fa", B: "#60a5fa", "B-": "#93c5fd",
  "C+": "#fbbf24", C: "#fbbf24", "C-": "#f59e0b",
  "D+": "#e05c5c", D: "#e05c5c", "D-": "#dc2626",
  F: "#dc2626",
};

export default function TradeCard({ card, onVote, stackDepth = 0 }) {
  const cardRef = useRef(null);
  const startX = useRef(null);
  const [dragX, setDragX] = useState(0);
  const [hoveredVerdict, setHoveredVerdict] = useState(null);

  const rotation = (dragX / 300) * 12;
  const opacity = Math.max(0, 1 - Math.abs(dragX) / 260);

  // Drag tint: red = left (team_a), blue = right (team_b)
  const tintColor =
    dragX < -20 ? `rgba(224,92,92,${Math.min(0.35, Math.abs(dragX) / 300)})`
    : dragX > 20 ? `rgba(96,165,250,${Math.min(0.35, dragX / 300)})`
    : "transparent";

  function handlePointerDown(e) {
    startX.current = e.clientX;
    cardRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (startX.current == null) return;
    setDragX(e.clientX - startX.current);
  }

  function handlePointerUp() {
    if (startX.current == null) return;
    const dx = dragX;
    startX.current = null;
    setDragX(0);
    if (dx < -80) onVote("team_a");
    else if (dx > 80) onVote("team_b");
  }

  const engineColor =
    card.fairnessLabel === "Fair"
      ? "#00f5a0"
      : card.engineVerdict === "team_a"
      ? "#e05c5c"
      : "#60a5fa";

  return (
    <div
      style={{
        position: "absolute",
        width: "100%",
        top: stackDepth * 6,
        left: 0,
        zIndex: 10 - stackDepth,
        transform: `translateX(${dragX}px) rotate(${rotation}deg) scale(${stackDepth === 0 ? 1 : 0.97 - stackDepth * 0.02})`,
        transition: dragX === 0 ? "transform 0.25s ease" : "none",
        cursor: stackDepth === 0 ? "grab" : "default",
        userSelect: "none",
        touchAction: "none",
      }}
      ref={cardRef}
      onPointerDown={stackDepth === 0 ? handlePointerDown : undefined}
      onPointerMove={stackDepth === 0 ? handlePointerMove : undefined}
      onPointerUp={stackDepth === 0 ? handlePointerUp : undefined}
      onPointerCancel={stackDepth === 0 ? handlePointerUp : undefined}
    >
      <div
        style={{
          background: "#1a1f30",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Drag tint overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: tintColor,
            borderRadius: 12,
            pointerEvents: "none",
            transition: "background 0.1s",
          }}
        />

        {/* Top-right chips: FC badge + fairness */}
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            display: "flex",
            gap: 5,
            alignItems: "center",
          }}
        >
          {card.source === "fc" && (
            <span
              style={{
                fontSize: 9,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: "#f5a623",
                border: "1px solid #f5a623",
                borderRadius: 3,
                padding: "2px 5px",
                fontWeight: 700,
              }}
            >
              FC Trade
            </span>
          )}
          {card.fcGrade && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: GRADE_COLOR[card.fcGrade] || "#94a3b8",
                border: `1px solid ${GRADE_COLOR[card.fcGrade] || "#94a3b8"}`,
                borderRadius: 3,
                padding: "2px 5px",
              }}
            >
              {card.fcGrade}
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              letterSpacing: 0.5,
              color: engineColor,
              border: `1px solid ${engineColor}`,
              borderRadius: 3,
              padding: "2px 6px",
              opacity: 0.7,
            }}
          >
            {card.fairnessLabel}
          </span>
        </div>

        {/* Two-column trade layout */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <TeamBlock
            team={card.teamA}
            assets={card.assetsA}
            totalValue={card.valueA}
            side="A"
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: 36,
              color: "#334155",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            ⇄
          </div>
          <TeamBlock
            team={card.teamB}
            assets={card.assetsB}
            totalValue={card.valueB}
            side="B"
          />
        </div>

        {/* Vote buttons */}
        {stackDepth === 0 && (
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 20,
              justifyContent: "center",
            }}
          >
            {VERDICT_OPTIONS.map((v) => (
              <button
                key={v.key}
                onClick={() => onVote(v.key)}
                onMouseEnter={() => setHoveredVerdict(v.key)}
                onMouseLeave={() => setHoveredVerdict(null)}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 6,
                  border: `1px solid ${v.color}`,
                  background:
                    hoveredVerdict === v.key
                      ? `${v.color}22`
                      : "transparent",
                  color: v.color,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.15s",
                  letterSpacing: 0.3,
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
