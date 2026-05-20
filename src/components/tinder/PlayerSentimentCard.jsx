import { useRef, useState } from "react";

const POS_COLOR = {
  QB: "#a78bfa",
  WR: "#60a5fa",
  RB: "#34d399",
  TE: "#fbbf24",
};

const VERDICTS = [
  { key: "buy",    label: "Buy",    color: "#00f5a0", icon: "↑" },
  { key: "ignore", label: "Hold",   color: "#94a3b8", icon: "—" },
  { key: "sell",   label: "Sell",   color: "#e05c5c", icon: "↓" },
];

// Left drag → sell, right drag → buy, no threshold for ignore (buttons only)
const DRAG_SELL_COLOR = (amount) => `rgba(224,92,92,${Math.min(0.35, amount / 300)})`;
const DRAG_BUY_COLOR  = (amount) => `rgba(0,245,160,${Math.min(0.35, amount / 300)})`;

export default function PlayerSentimentCard({ card, onVote, stackDepth = 0 }) {
  const cardRef = useRef(null);
  const startX = useRef(null);
  const [dragX, setDragX] = useState(0);
  const [hovered, setHovered] = useState(null);

  const { player } = card;
  const posColor = POS_COLOR[player.position] || "#94a3b8";
  const rotation = (dragX / 300) * 10;

  const tintColor =
    dragX < -20 ? DRAG_SELL_COLOR(Math.abs(dragX))
    : dragX > 20 ? DRAG_BUY_COLOR(dragX)
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
    if (dx < -80) onVote("sell");
    else if (dx > 80) onVote("buy");
  }

  const ageLabel = player.age ? `Age ${player.age}` : null;

  // Age-based sell signal hint
  let ageTone = null;
  if (player.age) {
    if (player.age >= 31) ageTone = { text: "Sell window?", color: "#e05c5c" };
    else if (player.age <= 23 && player.value >= 70) ageTone = { text: "Buy window", color: "#00f5a0" };
    else if (player.age >= 27 && player.age <= 30) ageTone = { text: "Peak years", color: "#f5a623" };
  }

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
          border: `1px solid ${posColor}33`,
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          position: "relative",
          overflow: "hidden",
          minHeight: 260,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* Drag tint */}
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

        {/* COMMUNITY PULSE badge */}
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            fontSize: 9,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#64748b",
            border: "1px solid #334155",
            borderRadius: 3,
            padding: "2px 6px",
            fontWeight: 600,
          }}
        >
          Community Pulse
        </div>

        {/* Player info */}
        <div style={{ textAlign: "center", paddingTop: 8 }}>
          {/* Position badge */}
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#141722",
                background: posColor,
                borderRadius: 4,
                padding: "3px 10px",
                letterSpacing: 1,
              }}
            >
              {player.position}
            </span>
          </div>

          {/* Name */}
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#fff",
              marginBottom: 6,
              lineHeight: 1.15,
            }}
          >
            {player.name}
          </div>

          {/* Age + value row */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 16,
              fontSize: 12,
              color: "#64748b",
              marginBottom: 8,
            }}
          >
            {ageLabel && <span>{ageLabel}</span>}
            {player.value > 0 && (
              <span>
                Value{" "}
                <strong style={{ color: "#e8e8f0" }}>{player.value}</strong>
              </span>
            )}
          </div>

          {/* Age-tone hint */}
          {ageTone && (
            <div
              style={{
                fontSize: 11,
                color: ageTone.color,
                letterSpacing: 0.5,
                marginBottom: 4,
                opacity: 0.8,
              }}
            >
              {ageTone.text}
            </div>
          )}
        </div>

        {/* Question prompt */}
        <div
          style={{
            textAlign: "center",
            fontSize: 13,
            color: "#94a3b8",
            fontStyle: "italic",
            marginBottom: 16,
          }}
        >
          Are you buying, selling, or holding?
        </div>

        {/* Buttons */}
        {stackDepth === 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            {VERDICTS.map((v) => (
              <button
                key={v.key}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onVote(v.key)}
                onMouseEnter={() => setHovered(v.key)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 6,
                  border: `1px solid ${v.color}`,
                  background: hovered === v.key ? `${v.color}22` : "transparent",
                  color: v.color,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background 0.15s",
                  letterSpacing: 0.5,
                }}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
