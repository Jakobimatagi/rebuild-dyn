import { useRef, useState } from "react";
import { captureShareImage, tiktokFilename } from "../../lib/shareImage.js";
import TikTokFrame from "../TikTokFrame.jsx";
import { useModalBehavior } from "../../lib/useModalBehavior";
import { getColor, getVerdict } from "../../lib/analysis";
import { ARCHETYPE_META } from "../../constants";
import { styles } from "../../styles";
import {
  SectionLabel,
  MiniBar,
  DynastyValueHeadline,
  buildTrajectoryChart,
  PlayerTrajectoryChart,
} from "./PlayerDeepDiveModal";

// Admin-only share exporter for the player deep dive. Condenses the full
// modal into a single 1080px card (deep-dive dark aesthetic) and downloads
// it as a PNG via the shared captureShareImage helper — same pipeline as the
// rookie / OC admin share cards, including the TikTok 9:16 frame toggle.
// This file is lazy-loaded from PlayerDeepDiveModal so html-to-image stays
// out of the regular tab chunks.

const COMPONENT_META = [
  { key: "age", label: "Age", color: "#7b8cff" },
  { key: "prod", label: "Production", color: "#00f5a0" },
  { key: "avail", label: "Availability", color: "#ffd84d" },
  { key: "trend", label: "Trend", color: "#ff6b35" },
  { key: "situ", label: "Situation", color: "#c084fc" },
];

function slugify(name) {
  return String(name || "player").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function DeepDiveShareModal({ player, onClose }) {
  const modalRef = useModalBehavior(onClose);
  const cardRef = useRef(null);
  const [tiktok, setTiktok] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    if (!cardRef.current) return;
    setDownloading(true);
    setError("");
    try {
      const dataUrl = await captureShareImage(cardRef.current, { tiktok });
      const link = document.createElement("a");
      link.download = tiktokFilename(`deepdive-${slugify(player.name)}.png`, tiktok);
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to generate deep dive image:", err);
      setError("Image generation failed — try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] bg-slate-950/90 backdrop-blur-sm flex flex-col"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="w-full h-full flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`Share card for ${player.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 border-b border-white/10 px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Share</span>
          <span className="text-sm text-slate-200">Deep dive card · {player.name}</span>
          <div className="ml-auto flex items-center gap-2">
            {error && <span className="text-[10px] text-rose-300">{error}</span>}
            <button
              onClick={() => setTiktok((v) => !v)}
              title="Export as a 1080×1920 vertical card sized for TikTok / Reels / Shorts"
              className={`text-xs font-semibold px-3 py-1.5 rounded border ${
                tiktok
                  ? "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-100"
                  : "border-white/15 bg-slate-900/40 text-slate-300 hover:text-slate-100"
              }`}
            >
              📱 TikTok 9:16 {tiktok ? "on" : "off"}
            </button>
            <button
              onClick={download}
              disabled={downloading}
              className="text-xs font-semibold px-3 py-1.5 rounded border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40"
            >
              {downloading ? "Generating…" : "Download PNG"}
            </button>
            <button
              onClick={onClose}
              aria-label="Close share card"
              className="text-slate-400 hover:text-slate-100 text-lg leading-none px-2"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 flex justify-center">
          <div className="self-start">
            <TikTokFrame enabled={tiktok}>
              <DeepDiveShareCard innerRef={cardRef} player={player} />
            </TikTokFrame>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeepDiveShareCard({ innerRef, player }) {
  const {
    name, position, team, age, yearsExp,
    draftTier, draftSlot, draftYear,
    injuryStatus,
    score,
    components,
    verdict,
    archetype,
    tags,
    confidence,
    ppg, lastSeasonYear,
    peakPctile, pctileLast, pctilePrev, pctileOlder,
    marketValue, fantasyCalcValue, fantasyCalcRank,
    prediction,
    dynastyValue,
  } = player;

  const verdictColor = getColor(verdict);
  const archetypeColor = ARCHETYPE_META[archetype]?.color || "#888";
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const chart = prediction
    ? buildTrajectoryChart(prediction, { pctileOlder, pctilePrev, pctileLast, score, lastSeasonYear, age })
    : null;

  // Compact driver chips under the chart, mirroring PredictionSection.
  const drivers = [];
  if (prediction?.trajectory) drivers.push({ label: `${prediction.trajectory.icon} ${prediction.trajectory.label}`, color: prediction.trajectory.color });
  if (prediction?.breakoutProb > 0) drivers.push({ label: `Breakout ${prediction.breakoutProb}%`, color: "#00f5a0" });
  if (prediction?.bustRisk > 0) drivers.push({ label: `Bust ${prediction.bustRisk}%`, color: "#ff6b35" });

  const historyTiles = [
    { label: `${lastSeasonYear ?? "2024"}`, value: pctileLast, ppg },
    { label: `${(lastSeasonYear ?? 2024) - 1}`, value: pctilePrev },
    { label: `${(lastSeasonYear ?? 2024) - 2}`, value: pctileOlder },
    { label: "Career Peak", value: peakPctile, isPeak: true },
  ];

  const insights = (prediction?.keyInsights || []).slice(0, 2);

  return (
    <div
      ref={innerRef}
      style={{
        width: 1080,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        background: "#0d0d16",
        border: "1px solid rgba(0,245,160,0.18)",
        color: "#d1d7ea",
        padding: "36px 40px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: "50%",
            background: `${verdictColor}18`,
            border: `3px solid ${verdictColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            fontWeight: 700,
            color: verdictColor,
            flexShrink: 0,
          }}
        >
          {score}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#fff", letterSpacing: -0.5, lineHeight: 1.1 }}>
            {name}
          </div>
          <div style={{ fontSize: 15, color: "#d1d7ea", marginTop: 5 }}>
            {position} · {team} · {age}yo · {yearsExp}yr exp
            {injuryStatus && <span style={{ color: "#ff6b35", marginLeft: 10 }}>{injuryStatus}</span>}
          </div>
          {draftTier && (
            <div style={{ fontSize: 13, color: "#ffd84d", marginTop: 3 }}>
              {draftYear} Draft · {draftTier}
              {draftSlot ? ` (pick ${draftSlot})` : ""}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span style={{ ...styles.tag(verdictColor), fontSize: 12 }}>{verdict}</span>
            <span style={{ ...styles.tag(archetypeColor), fontSize: 11 }}>{archetype}</span>
            {tags?.slice(0, 3).map((tag) => (
              <span key={tag} style={{ ...styles.tag("#a0a8c0"), fontSize: 11 }}>{tag}</span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: "#00f5a0" }}>
            DYNASTY ORACLE
          </div>
          <div style={{ fontSize: 10, color: "#606878", marginTop: 4 }}>As of {date}</div>
          <div style={{ fontSize: 10, color: "#606878", marginTop: 12 }}>CONFIDENCE</div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: confidence >= 70 ? "#00f5a0" : confidence >= 45 ? "#ffd84d" : "#ff6b35",
            }}
          >
            {confidence}%
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

      {/* ── Body: two columns ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 24 }}>
        {/* Left: score components, production history, trade value */}
        <div>
          <SectionLabel>Score Breakdown</SectionLabel>
          {COMPONENT_META.map(({ key, label, color }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color, width: 88, flexShrink: 0 }}>{label}</span>
              <MiniBar value={components?.[key] ?? 0} color={color} height={7} />
              <span style={{ fontSize: 14, fontWeight: 700, color, width: 30, textAlign: "right", flexShrink: 0 }}>
                {components?.[key] ?? "—"}
              </span>
            </div>
          ))}

          <div style={{ marginTop: 20 }}>
            <SectionLabel>Production History</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {historyTiles.map(({ label, value, ppg: pg, isPeak }) => (
                <div
                  key={label}
                  style={{
                    textAlign: "center",
                    padding: "10px 6px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontSize: 10, color: "#606878", marginBottom: 4 }}>{label}</div>
                  {value != null ? (
                    <>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 700,
                          color: isPeak ? "#c084fc" : value >= 75 ? "#00f5a0" : value >= 50 ? "#ffd84d" : "#ff6b35",
                        }}
                      >
                        {value}
                        <span style={{ fontSize: 11, fontWeight: 400, color: "#606878" }}>th</span>
                      </div>
                      {pg && <div style={{ fontSize: 10, color: "#808898", marginTop: 2 }}>{pg} ppg</div>}
                    </>
                  ) : (
                    <div style={{ fontSize: 16, color: "#404858" }}>—</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {(marketValue != null || fantasyCalcValue != null) && (
            <div style={{ marginTop: 20 }}>
              <SectionLabel>Trade Value</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { label: "Dynasty Score", value: `${score}/100`, color: verdictColor },
                  { label: "Market Value", value: marketValue != null ? Math.round(marketValue) : "—", color: "#d1d7ea" },
                  {
                    label: fantasyCalcRank != null ? `FC Value · #${fantasyCalcRank}` : "FC Value",
                    value: fantasyCalcValue != null ? `$${Math.round(fantasyCalcValue)}` : "—",
                    color: "#c084fc",
                  },
                ].map(({ label, value, color }) => (
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
                    <div style={{ fontSize: 10, color: "#606878", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: fused dynasty value + trajectory */}
        <div>
          {dynastyValue && (
            <>
              <SectionLabel>Fused Dynasty Value</SectionLabel>
              <DynastyValueHeadline dynastyValue={dynastyValue} />
            </>
          )}

          {chart && chart.points.length >= 2 && (
            <div
              style={{
                padding: "12px 14px 8px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: "#808898", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Career Trajectory
                </div>
                <div style={{ fontSize: 10, color: "#5a6478" }}>shaded = ceiling / floor</div>
              </div>
              <PlayerTrajectoryChart chart={chart} />
              {drivers.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 4px" }}>
                  {drivers.map((d, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: d.color,
                        background: `${d.color}14`,
                        border: `1px solid ${d.color}33`,
                        borderRadius: 3,
                        padding: "2px 8px",
                      }}
                    >
                      {d.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {insights.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {insights.map((insight, i) => (
                <div key={i} style={{ fontSize: 12, color: "#c0c8e0", lineHeight: 1.5, padding: "3px 0" }}>
                  · {insight}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          paddingTop: 14,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "#404858",
        }}
      >
        <span>Sleeper (stats + metadata) · FantasyCalc (market) · empirical age curves + historical comps</span>
        <span style={{ color: "#00f5a066", fontWeight: 700, letterSpacing: 1 }}>DYNASTY ORACLE</span>
      </div>
    </div>
  );
}
