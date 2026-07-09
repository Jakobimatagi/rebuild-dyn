import { Suspense, lazy, useEffect, useState } from "react";
import { styles } from "../styles";
import { fetchRosterAuditValues } from "../lib/rosterAuditApi";
import { fetchFantasyCalcTrades } from "../lib/fantasyCalcApi";

// Lazy like Dashboard's tabs — ExploreScreen is eagerly imported by App, so
// static tab imports here would drag the tab chunks into the entry bundle.
const RankingsTab       = lazy(() => import("./dashboard/RankingsTab"));
const RookieRankingsTab = lazy(() => import("./dashboard/RookieRankingsTab"));
const PerceptionTab     = lazy(() => import("./dashboard/PerceptionTab"));
const TradeTinderTab    = lazy(() => import("./dashboard/TradeTinderTab"));

// Community votes from the no-login Trade Jury are bucketed under this league id
// so they stay out of any real league's perception data while still feeding the
// global Market Signals view.
const EXPLORE_LEAGUE_ID = "explore";

const TABS = [
  { key: "rankings", label: "Dynasty Rankings" },
  { key: "rookies", label: "Rookie Rankings" },
  { key: "jury", label: "Trade Jury" },
  { key: "signals", label: "Market Signals" },
];

// Synthetic leagues so the global RosterAudit endpoint can scale values without
// a connected league. Only roster_positions (SF detection) and total_rosters
// are read — see getRaFormat in rosterAuditApi.js.
const SYNTHETIC_LEAGUE = {
  sf: { roster_positions: ["QB", "RB", "WR", "TE", "SUPER_FLEX"], total_rosters: 12 },
  "1qb": { roster_positions: ["QB", "RB", "WR", "TE"], total_rosters: 12 },
};

export default function ExploreScreen({ onConnect }) {
  const [activeTab, setActiveTab] = useState("rankings");
  const [format, setFormat] = useState("sf");
  const [rankings, setRankings] = useState(null);
  const [raLoading, setRaLoading] = useState(false);
  const [raError, setRaError] = useState("");
  const [fcTrades, setFcTrades] = useState(null);

  // Only the Rankings tab needs RosterAudit; fetch lazily the first time it's
  // viewed (or when the format toggle changes).
  useEffect(() => {
    if (activeTab !== "rankings") return;
    let cancelled = false;
    setRaLoading(true);
    setRaError("");
    fetchRosterAuditValues(SYNTHETIC_LEAGUE[format])
      .then((vals) => {
        if (!cancelled) setRankings(vals);
      })
      .catch((e) => {
        if (!cancelled) setRaError(e.message || "Failed to load rankings.");
      })
      .finally(() => {
        if (!cancelled) setRaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, format]);

  // Trade Jury serves real FantasyCalc community trades — global, not tied to
  // any league. Fetch lazily when the tab is first opened.
  useEffect(() => {
    if (activeTab !== "jury" || fcTrades) return;
    let cancelled = false;
    fetchFantasyCalcTrades(SYNTHETIC_LEAGUE.sf)
      .then((trades) => {
        if (!cancelled) setFcTrades(trades || []);
      })
      .catch(() => {
        if (!cancelled) setFcTrades([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, fcTrades]);

  const rosterAuditSource = {
    enabled: Array.isArray(rankings) && rankings.length > 0,
    totalPlayers: rankings?.length || 0,
    rankings: rankings || [],
    attribution: "RosterAudit",
    url: "https://rosteraudit.com/",
  };

  return (
    <>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div
          className="dyn-header-top-row"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}
        >
          <div style={styles.logo}>Dynasty Oracle — Explore</div>
          <button className="dyn-btn" style={styles.btn} onClick={onConnect}>
            Connect Your League →
          </button>
        </div>
        <div style={{ marginTop: 4 }}>
          <h1 style={styles.title}>Browse the data — no login</h1>
          <p style={styles.subtitle}>
            Dynasty player values, rookie rankings, and community market signals.
            Connect your Sleeper or Fleaflicker league for a full roster
            analysis tailored to your team.
          </p>
        </div>
      </div>

      {/* ── Tab nav ── */}
      <div
        className="dyn-tabs-row"
        role="tablist"
        aria-label="Explore sections"
        style={{ marginBottom: 28, borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                className="dyn-tab"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "9px 18px",
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  border: "none",
                  background: "transparent",
                  color: isActive ? "#00f5a0" : "#94a3b8",
                  borderBottom: isActive ? "2px solid #00f5a0" : "2px solid transparent",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "color 0.15s",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <Suspense
        fallback={
          <div style={{ ...styles.card, textAlign: "center", padding: 40, color: "#8a91a8" }}>
            Loading…
          </div>
        }
      >
      {activeTab === "rankings" && (
        <div>
          {/* Format toggle — RosterAudit values scale by Superflex vs 1QB */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {["sf", "1qb"].map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                style={{
                  padding: "5px 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                  border: "1px solid",
                  borderColor: format === f ? "#06b6d4" : "rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  background: format === f ? "rgba(6,182,212,0.15)" : "transparent",
                  color: format === f ? "#06b6d4" : "#c8cfe3",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {f === "sf" ? "Superflex" : "1QB"}
              </button>
            ))}
          </div>

          {raLoading && (
            <div style={{ ...styles.card, textAlign: "center", padding: 40, color: "#8a91a8" }}>
              Loading dynasty rankings…
            </div>
          )}
          {!raLoading && raError && (
            <div style={{ ...styles.card, textAlign: "center", padding: 40, color: "#e05c5c" }}>
              {raError}
            </div>
          )}
          {!raLoading && !raError && <RankingsTab rosterAuditSource={rosterAuditSource} />}
        </div>
      )}

      {activeTab === "rookies" && <RookieRankingsTab />}

      {activeTab === "jury" && (
        fcTrades === null ? (
          <div style={{ ...styles.card, textAlign: "center", padding: 40, color: "#8a91a8" }}>
            Loading community trades…
          </div>
        ) : (
          <TradeTinderTab
            global
            leagueId={EXPLORE_LEAGUE_ID}
            fantasyCalcTrades={fcTrades}
          />
        )
      )}

      {activeTab === "signals" && <PerceptionTab global />}
      </Suspense>
    </>
  );
}
