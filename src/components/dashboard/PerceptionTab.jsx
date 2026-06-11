import { useEffect, useState } from "react";
import { fetchPerceptionSwipes, fetchGlobalPerceptionSwipes } from "../../lib/supabase";

const MIN_APPEARANCES = 5;

function computePerception(swipes) {
  // For each player, track how often trades including them were called fair/team_a/team_b
  // assetsA = what team A sends, assetsB = what team B sends
  // "team_a" vote = team A got the better deal (they received assetsB)
  // "team_b" vote = team B got the better deal (they received assetsA)

  const players = new Map(); // id → { name, position, appearances, sentFair, sentUnfair, recvFair, recvUnfair }

  function ensurePlayer(p) {
    if (!players.has(String(p.id))) {
      players.set(String(p.id), {
        id: p.id,
        name: p.name,
        position: p.position,
        value: p.value || 0,
        sentFair: 0,
        sentUnfair: 0,
        recvFair: 0,
        recvUnfair: 0,
      });
    }
    return players.get(String(p.id));
  }

  for (const swipe of swipes) {
    const { assets_a, assets_b, user_verdict } = swipe;
    if (!assets_a || !assets_b) continue;

    const playersA = (assets_a || []).filter((a) => a.type === "player");
    const playersB = (assets_b || []).filter((a) => a.type === "player");

    // assetsA were SENT by teamA
    // user_verdict "team_a" = teamA got the better deal (their assetsB receive > they sent assetsA)
    // So if verdict is "team_b", teamA overpaid = players in assetsA were undersold
    for (const p of playersA) {
      const rec = ensurePlayer(p);
      // p was sent by teamA. Was it a good deal for teamA's trading partner (teamB)?
      if (user_verdict === "fair") { rec.sentFair++; rec.recvFair++; } // symmetric for fair
      else if (user_verdict === "team_b") rec.sentFair++;   // teamB got better = assetsA oversold = p valued correctly or more
      else if (user_verdict === "team_a") rec.sentUnfair++; // teamA got better = assetsA was cheap = p undervalued
    }

    for (const p of playersB) {
      const rec = ensurePlayer(p);
      if (user_verdict === "fair") { /* already counted above */ }
      else if (user_verdict === "team_a") rec.recvFair++;   // teamA got better by receiving p = p is worth it
      else if (user_verdict === "team_b") rec.recvUnfair++; // teamB got better = p wasn't worth receiving = p overvalued
    }
  }

  return [...players.values()]
    .map((p) => {
      const sentTotal = p.sentFair + p.sentUnfair;
      const recvTotal = p.recvFair + p.recvUnfair;
      const appearances = sentTotal + recvTotal;
      if (appearances < MIN_APPEARANCES) return null;

      const sendFairRate = sentTotal > 0 ? p.sentFair / sentTotal : 0.5;
      const recvFairRate = recvTotal > 0 ? p.recvFair / recvTotal : 0.5;

      // Signal: high sendFairRate + low recvFairRate → community fine trading them away
      //         but doesn't want to receive → overvalued
      // Low sendFairRate + high recvFairRate → community resists trading away
      //         but happy to receive → undervalued
      const signal = recvFairRate - sendFairRate; // positive = undervalued, negative = overvalued
      const strength = Math.abs(signal);

      let label = "Aligned";
      let labelColor = "#64748b";
      if (signal > 0.15) { label = "Undervalued ↑"; labelColor = "#00f5a0"; }
      else if (signal < -0.15) { label = "Overvalued ↓"; labelColor = "#e05c5c"; }

      return { ...p, appearances, sendFairRate, recvFairRate, signal, strength, label, labelColor };
    })
    .filter(Boolean)
    .sort((a, b) => b.strength - a.strength);
}

const POS_COLOR = { QB: "#a78bfa", WR: "#60a5fa", RB: "#34d399", TE: "#fbbf24" };

export default function PerceptionTab({ leagueId, global = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [posFilter, setPosFilter] = useState("ALL");

  useEffect(() => {
    const load = global
      ? fetchGlobalPerceptionSwipes()
      : fetchPerceptionSwipes(leagueId);
    load
      .then((swipes) => setData(computePerception(swipes)))
      .catch(() => setError("Could not load perception data."))
      .finally(() => setLoading(false));
  }, [leagueId, global]);

  if (loading) {
    return (
      <div style={centeredStyle}>
        <div className="dyn-spinner" style={{ width: 24, height: 24 }} />
        <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 12 }}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return <div style={{ ...centeredStyle, color: "#e05c5c", fontSize: 13 }}>{error}</div>;
  }

  const totalSwipes = data?.reduce((s, p) => s + p.appearances, 0) ?? 0;

  if (!data?.length) {
    return (
      <div style={centeredStyle}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
        <div style={{ color: "#fff", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
          Not enough data yet
        </div>
        <div style={{ color: "#64748b", fontSize: 13, maxWidth: 320 }}>
          Vote on at least {MIN_APPEARANCES} trades per player in Trade Tinder to see perception signals here.
        </div>
      </div>
    );
  }

  const positions = ["ALL", "QB", "WR", "RB", "TE"];
  const filtered =
    posFilter === "ALL" ? data : data.filter((p) => p.position === posFilter);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 5,
            textTransform: "uppercase",
            color: "#00f5a0",
            opacity: 0.6,
            marginBottom: 6,
          }}
        >
          Perception vs Engine
        </div>
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
          Based on {totalSwipes} community swipes across {data.length} players.
          Players need ≥{MIN_APPEARANCES} appearances to show a signal.
        </p>
      </div>

      {/* Position filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {positions.map((pos) => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              border: `1px solid ${pos === "ALL" ? "rgba(255,255,255,0.12)" : POS_COLOR[pos] || "rgba(255,255,255,0.12)"}`,
              background: posFilter === pos ? "rgba(255,255,255,0.07)" : "transparent",
              color: pos === "ALL" ? "#94a3b8" : POS_COLOR[pos] || "#94a3b8",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 0.5,
            }}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Table */}
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 60px 80px 80px 120px",
            padding: "8px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            fontSize: 10,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: "#334155",
          }}
        >
          <span>Player</span>
          <span style={{ textAlign: "right" }}>Apps</span>
          <span style={{ textAlign: "right" }}>Send OK%</span>
          <span style={{ textAlign: "right" }}>Recv OK%</span>
          <span style={{ textAlign: "right" }}>Signal</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: "24px 14px", color: "#64748b", fontSize: 13, textAlign: "center" }}>
            No {posFilter} players with enough data yet.
          </div>
        )}

        {filtered.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 60px 80px 80px 120px",
              padding: "10px 14px",
              borderBottom:
                i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#141722",
                  background: POS_COLOR[p.position] || "#94a3b8",
                  borderRadius: 2,
                  padding: "1px 5px",
                }}
              >
                {p.position}
              </span>
              <span style={{ fontSize: 13, color: "#e8e8f0" }}>{p.name}</span>
            </div>
            <span style={{ textAlign: "right", fontSize: 12, color: "#64748b" }}>
              {p.appearances}
            </span>
            <span style={{ textAlign: "right", fontSize: 12, color: "#e8e8f0" }}>
              {Math.round(p.sendFairRate * 100)}%
            </span>
            <span style={{ textAlign: "right", fontSize: 12, color: "#e8e8f0" }}>
              {Math.round(p.recvFairRate * 100)}%
            </span>
            <span
              style={{
                textAlign: "right",
                fontSize: 11,
                fontWeight: 600,
                color: p.labelColor,
                letterSpacing: 0.3,
              }}
            >
              {p.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const centeredStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 280,
  textAlign: "center",
};
