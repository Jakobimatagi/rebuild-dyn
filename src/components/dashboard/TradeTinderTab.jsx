import { useCallback, useEffect, useRef, useState } from "react";
import { buildTinderQueue, buildFCTinderCards } from "../../lib/tradeEngine";
import {
  getSwipedHashes,
  recordSwipe,
} from "../../lib/supabase";
import TradeCard from "../tinder/TradeCard";

const SWIPE_LABELS = {
  team_a: "Team A wins",
  fair: "Fair trade",
  team_b: "Team B wins",
};

export default function TradeTinderTab({
  leagueTeams,
  leagueContext,
  tradeMarket,
  leagueId,
  fantasyCalcTrades,
}) {
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastVote, setLastVote] = useState(null);
  const [voteCount, setVoteCount] = useState(0);
  const [error, setError] = useState(null);
  const animating = useRef(false);

  // fresh=true skips the swiped filter and uses a new random seed so the
  // "Generate New Cards" button always produces a different deck.
  const loadQueue = useCallback((fresh = false) => {
    if (!leagueTeams?.length || !leagueContext || !tradeMarket) return;
    setLoading(true);
    setError(null);
    setVoteCount(0);
    setLastVote(null);
    try {
      // Always filter out seen cards — use a new seed on fresh so shuffle differs.
      // Only wipe the swiped cache when truly everything has been seen.
      let swiped = getSwipedHashes(leagueId);
      const seed = fresh ? Date.now() : undefined;

      // FC community trades are the primary source — grab as many as available
      let fcCards = buildFCTinderCards(
        fantasyCalcTrades,
        leagueTeams,
        leagueContext,
        tradeMarket,
        { swipedHashes: swiped, maxCards: 40 },
      );

      // Synthetic cards fill remaining slots up to 25 total
      let syntheticNeeded = Math.max(0, 25 - fcCards.length);
      let fcHashes = new Set([...swiped, ...fcCards.map((c) => c.tradeHash)]);
      let syntheticCards = syntheticNeeded > 0
        ? buildTinderQueue(leagueTeams, leagueContext, tradeMarket, {
            swipedHashes: fcHashes,
            maxCards: syntheticNeeded,
            seed,
          })
        : [];

      // Everything has been seen — wipe the local cache and regenerate from scratch
      if (fcCards.length === 0 && syntheticCards.length === 0 && swiped.size > 0) {
        localStorage.removeItem(`tinder_swiped_${leagueId}`);
        swiped = new Set();
        fcCards = buildFCTinderCards(
          fantasyCalcTrades, leagueTeams, leagueContext, tradeMarket,
          { swipedHashes: swiped, maxCards: 40 },
        );
        syntheticNeeded = Math.max(0, 25 - fcCards.length);
        fcHashes = new Set(fcCards.map((c) => c.tradeHash));
        syntheticCards = syntheticNeeded > 0
          ? buildTinderQueue(leagueTeams, leagueContext, tradeMarket, {
              swipedHashes: fcHashes, maxCards: syntheticNeeded, seed: Date.now(),
            })
          : [];
      }

      // Interleave: 2 FC, 1 synthetic, repeat (synthetic fills gaps when FC is sparse)
      const mixed = [];
      let fi = 0, si = 0;
      while (fi < fcCards.length || si < syntheticCards.length) {
        if (fi < fcCards.length) mixed.push(fcCards[fi++]);
        if (fi < fcCards.length) mixed.push(fcCards[fi++]);
        if (si < syntheticCards.length) mixed.push(syntheticCards[si++]);
      }

      setQueue(mixed);
      setIndex(0);
    } catch (e) {
      setError("Could not generate trades. Try switching leagues and back.");
    } finally {
      setLoading(false);
    }
  }, [leagueTeams, leagueContext, tradeMarket, leagueId, fantasyCalcTrades]);

  useEffect(() => {
    loadQueue(false);
  }, [loadQueue]);

  // Keyboard shortcuts: ← = team_a, Space/Enter = fair, → = team_b
  useEffect(() => {
    function onKey(e) {
      if (animating.current) return;
      if (e.key === "ArrowLeft") handleVote("team_a");
      if (e.key === "ArrowRight") handleVote("team_b");
      if (e.key === " " || e.key === "Enter") handleVote("fair");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function handleVote(verdict) {
    if (animating.current) return;
    const card = queue[index];
    if (!card) return;

    animating.current = true;
    setLastVote({ verdict, teamALabel: card.teamA.label, teamBLabel: card.teamB.label });
    setVoteCount((c) => c + 1);
    setIndex((i) => i + 1);

    try {
      await recordSwipe({
        leagueId,
        tradeHash: card.tradeHash,
        teamAId: card.teamA.rosterId,
        teamBId: card.teamB.rosterId,
        assetsA: card.assetsA,
        assetsB: card.assetsB,
        engineVerdict: card.engineVerdict,
        engineNet: card.engineNet,
        userVerdict: verdict,
      });
    } catch {
      // Swipe still advances locally even if DB write fails
    } finally {
      animating.current = false;
    }
  }

  const card = queue[index];
  const nextCard = queue[index + 1];
  const isDone = !loading && index >= queue.length;

  if (loading) {
    return (
      <div style={centeredStyle}>
        <div className="dyn-spinner" style={{ width: 28, height: 28 }} />
        <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 16 }}>
          Generating trade cards…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={centeredStyle}>
        <div style={{ color: "#e05c5c", fontSize: 14 }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24, textAlign: "center" }}>
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
          Trade Tinder
        </div>
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
          Is this trade fair? Swipe or use ← Space → to vote.
        </p>
      </div>

      {/* Progress */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 11, color: "#64748b" }}>
          {Math.min(index, queue.length)} / {queue.length}
        </span>
        {voteCount > 0 && lastVote && (
          <span
            style={{
              fontSize: 11,
              color:
                lastVote.verdict === "fair"
                  ? "#00f5a0"
                  : lastVote.verdict === "team_a"
                  ? "#e05c5c"
                  : "#60a5fa",
            }}
          >
            ✓ {SWIPE_LABELS[lastVote.verdict]}
          </span>
        )}
        <span style={{ fontSize: 11, color: "#64748b" }}>
          {voteCount} voted
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 2,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 2,
          marginBottom: 20,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${queue.length ? (index / queue.length) * 100 : 0}%`,
            background: "#00f5a0",
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {/* Card stack */}
      {isDone ? (
        <DoneState voteCount={voteCount} onRefresh={() => loadQueue(true)} />
      ) : (
        <div style={{ position: "relative", height: 380 }}>
          {nextCard && <TradeCard card={nextCard} onVote={() => {}} stackDepth={1} />}
          {card && <TradeCard card={card} onVote={handleVote} stackDepth={0} />}
        </div>
      )}

      {/* Keyboard hint */}
      {!isDone && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            marginTop: 16,
          }}
        >
          {[
            { key: "←", label: "Team A wins", color: "#e05c5c" },
            { key: "Space", label: "Fair", color: "#00f5a0" },
            { key: "→", label: "Team B wins", color: "#60a5fa" },
          ].map((k) => (
            <span
              key={k.key}
              style={{ fontSize: 10, color: "#334155", letterSpacing: 0.5 }}
            >
              <kbd
                style={{
                  background: "#1a1f30",
                  border: "1px solid #334155",
                  borderRadius: 3,
                  padding: "1px 5px",
                  color: k.color,
                  fontFamily: "monospace",
                  fontSize: 10,
                  marginRight: 4,
                }}
              >
                {k.key}
              </kbd>
              {k.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DoneState({ voteCount, onRefresh }) {
  return (
    <div style={{ ...centeredStyle, minHeight: 320 }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>🃏</div>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
        You've seen everything
      </div>
      <div style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
        {voteCount} trade{voteCount !== 1 ? "s" : ""} voted on this session
      </div>
      <button
        onClick={onRefresh}
        style={{
          padding: "10px 24px",
          borderRadius: 6,
          border: "1px solid #00f5a0",
          background: "transparent",
          color: "#00f5a0",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          letterSpacing: 0.5,
        }}
      >
        Generate New Cards
      </button>
    </div>
  );
}

const centeredStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 300,
  textAlign: "center",
};
