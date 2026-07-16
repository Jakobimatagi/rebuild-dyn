import { useRef, useState } from "react";
import { captureShareImage, tiktokFilename } from "../../lib/shareImage.js";
import TikTokFrame from "../TikTokFrame.jsx";
import { useModalBehavior } from "../../lib/useModalBehavior.js";
import { TIERS, TIER_COLORS } from "../../lib/tierBoard.js";

const POS_COLOR = {
  QB: "#ff6b6b",
  RB: "#00f5a0",
  WR: "#ffd84d",
  TE: "#4dd0ff",
};

// Headshot for the export card. Deliberately no crossOrigin attribute —
// html-to-image fetches the portrait itself and inlines it into the PNG
// (same approach as the AdminHotStreaks share card).
function ShareAvatar({ player, size }) {
  const [errored, setErrored] = useState(false);
  const color = POS_COLOR[player.position] || "#d9deef";
  const url = `https://sleepercdn.com/content/nfl/players/${player.id}.jpg`;

  if (errored) {
    const initials = (player.name || "")
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: `${color}22`,
          border: `2px solid ${color}66`,
          color,
          fontSize: Math.round(size * 0.32),
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {initials || player.position}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={player.name}
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        background: "#0d0f17",
        border: `2px solid ${color}66`,
      }}
    />
  );
}

// The 1080px-wide board that actually gets captured.
function ShareCard({ innerRef, board, scope, title, playerById }) {
  const date = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const nonEmpty = TIERS.filter((t) => board[t].length > 0);

  return (
    <div
      ref={innerRef}
      style={{
        width: 1080,
        background: "#020617",
        color: "#e2e8f0",
        padding: 40,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* Branded header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 6, color: "#00f5a0", textTransform: "uppercase" }}>
            Dynasty Oracle
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#f8fafc", lineHeight: 1.1, marginTop: 6 }}>
            {title}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "#64748b" }}>
            {scope === "ALL" ? "All positions" : `${scope} only`}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginTop: 4 }}>{date}</div>
        </div>
      </div>

      {/* Tier rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {nonEmpty.map((tier) => {
          const players = board[tier].map((id) => playerById.get(id)).filter(Boolean);
          const dense = players.length > 8;
          const avatar = dense ? 56 : 72;
          return (
            <div
              key={tier}
              style={{
                display: "flex",
                alignItems: "stretch",
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  width: 110,
                  minHeight: 118,
                  background: TIER_COLORS[tier],
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 56, fontWeight: 900, color: "#0f172a" }}>{tier}</span>
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexWrap: "wrap",
                  alignContent: "flex-start",
                  gap: 10,
                  padding: 14,
                  background: "rgba(15,23,42,0.7)",
                }}
              >
                {players.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 5,
                      width: avatar + 22,
                    }}
                  >
                    <ShareAvatar player={p} size={avatar} />
                    <div
                      style={{
                        fontSize: dense ? 10 : 12,
                        fontWeight: 700,
                        color: "#e2e8f0",
                        textAlign: "center",
                        lineHeight: 1.15,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      style={{
                        fontSize: dense ? 8 : 9,
                        fontWeight: 800,
                        letterSpacing: 1,
                        color: POS_COLOR[p.position] || "#94a3b8",
                      }}
                    >
                      {p.position}
                      {p.team ? ` · ${p.team}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Source tag / watermark */}
      <div
        style={{
          borderTop: "2px solid rgba(0,245,160,0.4)",
          paddingTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: "#00f5a0", textTransform: "uppercase" }}>
          ⚡ Made with Dynasty Oracle
        </span>
        <span style={{ fontSize: 12, color: "#475569" }}>Build your own tiers on Dynasty Oracle</span>
      </div>
    </div>
  );
}

export default function TierShareModal({ board, scope, title, playerById, onClose }) {
  const modalRef = useModalBehavior(onClose);
  const cardRef = useRef(null);
  const [tiktok, setTiktok] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    const node = cardRef.current;
    if (!node) return;
    setDownloading(true);
    setError("");
    try {
      const dataUrl = await captureShareImage(node, { tiktok, skipFonts: true });
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const link = document.createElement("a");
      link.download = tiktokFilename(`tiers-${scope.toLowerCase()}-${stamp}.png`, tiktok);
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to generate tier image:", err);
      setError("Image generation failed — try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(2,6,23,0.88)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tier-share-title"
        style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div
          style={{
            background: "#0f172a",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            padding: "10px 20px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#00f5a0", fontWeight: 800 }}>
            Share
          </span>
          <span id="tier-share-title" style={{ fontSize: 13, color: "#e2e8f0" }}>
            {title}
          </span>
          {error && <span style={{ fontSize: 11, color: "#ff6b6b" }}>{error}</span>}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setTiktok((v) => !v)}
              title="Export as a 1080×1920 vertical image sized for TikTok / Reels / Shorts"
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                border: `1px solid ${tiktok ? "rgba(232,121,249,0.7)" : "rgba(255,255,255,0.15)"}`,
                background: tiktok ? "rgba(232,121,249,0.18)" : "rgba(15,23,42,0.6)",
                color: tiktok ? "#f0abfc" : "#94a3b8",
                cursor: "pointer",
              }}
            >
              📱 TikTok 9:16 {tiktok ? "on" : "off"}
            </button>
            <button
              onClick={download}
              disabled={downloading}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                border: "1px solid rgba(0,245,160,0.6)",
                background: "rgba(0,245,160,0.14)",
                color: "#00f5a0",
                cursor: downloading ? "default" : "pointer",
                opacity: downloading ? 0.6 : 1,
              }}
            >
              {downloading ? "Generating…" : "Download PNG"}
            </button>
            <button
              onClick={onClose}
              aria-label="Close share view"
              style={{
                border: "none",
                background: "transparent",
                color: "#94a3b8",
                fontSize: 18,
                lineHeight: 1,
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Preview (the same node gets captured) */}
        <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <TikTokFrame enabled={tiktok}>
            <ShareCard
              innerRef={cardRef}
              board={board}
              scope={scope}
              title={title}
              playerById={playerById}
            />
          </TikTokFrame>
        </div>
      </div>
    </div>
  );
}
