import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { styles } from "../../styles";
import { fetchSleeper, fetchDraftPicks } from "../../lib/sleeperApi";
import { buildLiveDraftState } from "../../lib/liveDraft";
import { parseTrades, mergeTransactions } from "../../lib/draftTrades";
import { buildTradeReview } from "../../lib/tradeReview";
import { FeedTradeBody } from "./tradeReportCard";

const POS_COLOR = {
  QB: "#ff6b6b",
  RB: "#00f5a0",
  WR: "#ffd84d",
  TE: "#4dd0ff",
  K: "#94a3b8",
  DEF: "#94a3b8",
};

const GRADE_COLOR = {
  A: "#00f5a0",
  B: "#7ee0b3",
  C: "#ffd84d",
  D: "#ff9f4d",
  F: "#ff6b6b",
};

const POLL_MS = 12000;

function posColor(pos) {
  return POS_COLOR[pos] || "#d9deef";
}

function gradeColor(grade) {
  return GRADE_COLOR[grade] || "#d9deef";
}

function formatValue(v) {
  if (v == null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

function ordinal(n) {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function pickLabel(round, slot) {
  return `${round}.${String(slot).padStart(2, "0")}`;
}

export default function LiveDraftTab({
  draft,
  initialPicks = [],
  rosterPositions = [],
  leagueTeams = [],
  myRosterId,
  valueBySleeperId = {},
  ppgBySleeperId = {},
  bestAvailablePool = [],
  leagueId,
  players = {},
  initialTradeTransactions = [],
  tradeReviewInputs = null,
}) {
  const [picks, setPicks] = useState(initialPicks);
  const [liveDraft, setLiveDraft] = useState(draft);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [view, setView] = useState(
    Object.keys(valueBySleeperId).length > 0 ? "power" : "team",
  ); // "power" | "best" | "team" | "trades" | "board"
  // Multi-select position filter for Best Available. Empty array = "ALL".
  // Selecting RB + WR shows the best players across *either* room.
  const [posFilter, setPosFilter] = useState([]);
  const [tradeTx, setTradeTx] = useState(initialTradeTransactions);

  // leagueTeams carries label/avatar/ownerId/rosterId — map to the minimal shape.
  const teams = leagueTeams.map((t) => ({
    rosterId: t.rosterId,
    label: t.label,
    avatar: t.avatar || null,
    ownerId: t.ownerId,
  }));

  const refresh = useCallback(async () => {
    if (!draft?.draft_id) return;
    setRefreshing(true);
    try {
      const [freshDraft, freshPicks] = await Promise.all([
        fetchSleeper(`/draft/${draft.draft_id}`).catch(() => null),
        fetchDraftPicks(draft.draft_id).catch(() => null),
      ]);
      if (freshDraft) setLiveDraft(freshDraft);
      if (Array.isArray(freshPicks)) setPicks(freshPicks);

      // Best-effort live trade capture. Offseason/startup-draft trades land in
      // the early transaction "weeks", so poll a small window and merge into the
      // seeded history (deduped by id). Wrong-week guesses just no-op.
      if (leagueId) {
        const weekResults = await Promise.all(
          [0, 1, 2].map((wk) =>
            fetchSleeper(`/league/${leagueId}/transactions/${wk}`).catch(() => []),
          ),
        );
        const fresh = weekResults
          .flat()
          .filter((t) => t?.type === "trade" && t?.status !== "failed");
        if (fresh.length > 0) {
          setTradeTx((prev) => mergeTransactions(prev, fresh));
        }
      }
      setLastUpdated(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, [draft?.draft_id, leagueId]);

  // Poll while auto-refresh is on and the draft isn't finished.
  const isComplete = liveDraft?.status === "complete";
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!autoRefresh || isComplete) return undefined;
    const id = setInterval(() => refreshRef.current(), POLL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, isComplete]);

  const state = buildLiveDraftState({
    draft: liveDraft,
    picks,
    teams,
    rosterPositions,
    myRosterId,
    valueBySleeperId,
    ppgBySleeperId,
  });

  if (!state) {
    return (
      <div style={{ ...styles.card, color: "#d1d7ea", fontSize: 13 }}>
        No active draft found for this league.
      </div>
    );
  }

  const myTeam = state.teams.find((t) => t.isMe);

  const teamLabelById = new Map(leagueTeams.map((t) => [t.rosterId, t.label]));
  const trades = parseTrades(tradeTx, { players, teamLabelById, myRosterId });

  // Grade each trade with the exact engine the Activity-tab Trade Report Card
  // uses, rebuilt over the live transaction feed so trades made *during* the
  // draft get a card too. Keyed by transaction id to attach to each trade above.
  const tradeReview = useMemo(() => {
    if (!tradeReviewInputs) return null;
    return buildTradeReview({ ...tradeReviewInputs, transactions: tradeTx });
  }, [tradeReviewInputs, tradeTx]);

  const statusColor = state.complete
    ? "#94a3b8"
    : state.started
      ? "#00f5a0"
      : "#ffd84d";
  const statusText = state.complete
    ? "Complete"
    : state.started
      ? "Live"
      : "Not started";

  return (
    <div>
      {/* ── Header / controls ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={styles.sectionLabel}>
              {state.season} Draft Tracker
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                ...styles.tag(statusColor),
              }}
            >
              {!state.complete && state.started && (
                <span
                  className="dyn-live-dot"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: statusColor,
                    display: "inline-block",
                  }}
                />
              )}
              {statusText}
            </span>
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1, marginTop: 4 }}>
            {state.name ? `${state.name} · ` : ""}
            {state.madeCount}
            {state.totalPicks ? ` / ${state.totalPicks}` : ""} picks made ·{" "}
            {state.type} · {state.totalRounds} rounds
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label
            style={{
              fontSize: 10,
              color: "#94a3b8",
              letterSpacing: 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button
            type="button"
            className="dyn-btn-ghost"
            style={styles.btnGhost}
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── On the clock ── */}
      {state.onTheClock && (
        <div
          style={{
            ...styles.card,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            borderColor: state.onTheClock.isMe
              ? "rgba(0,245,160,0.4)"
              : "rgba(255,255,255,0.15)",
            background: state.onTheClock.isMe
              ? "rgba(0,245,160,0.08)"
              : styles.card.background,
          }}
        >
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase" }}>
              On the clock · Pick {state.onTheClock.pickNo} ·{" "}
              {pickLabel(state.onTheClock.round, state.onTheClock.slot)}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: state.onTheClock.isMe ? "#00f5a0" : "#e8e8f0",
                marginTop: 2,
              }}
            >
              {state.onTheClock.label}
              {state.onTheClock.isMe && (
                <span style={{ fontSize: 10, color: "#00f5a0", marginLeft: 8, letterSpacing: 1 }}>
                  YOU'RE UP
                </span>
              )}
            </div>
          </div>
          {state.myUpcoming.length > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase" }}>
                Your next picks
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
                {state.myUpcoming.map((u) => (
                  <span key={u.pickNo} style={styles.tag(u.fromNow === 0 ? "#00f5a0" : "#4dd0ff")}>
                    {pickLabel(u.round, u.slot)}
                    {u.fromNow > 0 && (
                      <span style={{ opacity: 0.7, marginLeft: 4 }}>
                        +{u.fromNow}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── View toggle ── */}
      <div style={{ display: "flex", gap: 6, margin: "8px 0 16px" }}>
        {[
          ...(state.powerRankings ? [{ key: "power", label: "Power Rankings" }] : []),
          ...(bestAvailablePool.length > 0
            ? [{ key: "best", label: "Best Available" }]
            : []),
          { key: "team", label: "Rosters" },
          {
            key: "trades",
            label: trades.length > 0 ? `Trades (${trades.length})` : "Trades",
          },
          { key: "board", label: "Board" },
        ].map((v) => {
          const active = view === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              style={{
                padding: "4px 12px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 1,
                cursor: "pointer",
                border: "1px solid",
                background: active ? "rgba(0,245,160,0.15)" : "rgba(255,255,255,0.06)",
                color: active ? "#00f5a0" : "#7a819c",
                borderColor: active ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.1)",
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {view === "power" && state.powerRankings && (
        <PowerRankings rankings={state.powerRankings} />
      )}

      {view === "best" && (
        <BestAvailable
          pool={bestAvailablePool}
          draftedIds={state.draftedIds}
          posFilter={posFilter}
          setPosFilter={setPosFilter}
        />
      )}

      {view === "team" && (
        <>
          {myTeam && (
            <RosterCard team={myTeam} rosterPositions={rosterPositions} highlight />
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {state.teams
              .filter((t) => !t.isMe)
              .map((t) => (
                <RosterCard key={t.rosterId} team={t} rosterPositions={rosterPositions} compact />
              ))}
          </div>
        </>
      )}

      {view === "trades" && (
        <TradesView
          trades={trades}
          tradeReview={tradeReview}
          myRosterId={myRosterId}
        />
      )}

      {view === "board" && <LiveBoard state={state} myRosterId={myRosterId} />}

      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 12 }}>
        Updated {new Date(lastUpdated).toLocaleTimeString()}
        {autoRefresh && !state.complete && " · auto-refreshing every 12s"}
      </div>
    </div>
  );
}

function TradeAsset({ asset }) {
  const isPlayer = asset.kind === "player";
  const color = isPlayer ? posColor(asset.position) : "#c084fc";
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 2,
        background: `${color}14`,
        border: `1px solid ${color}33`,
        color: "#e8e8f0",
        whiteSpace: "nowrap",
      }}
    >
      {isPlayer && asset.position && (
        <span style={{ color, fontWeight: 700, marginRight: 5 }}>
          {asset.position}
        </span>
      )}
      {asset.label}
    </span>
  );
}

// Plain who-got-what layout — the fallback when a trade has no value card
// (e.g. an all-pick deal with no market coverage). Identical to the original
// TradesView row.
function PlainTradeTeams({ teams }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {teams.map((team) => (
        <div
          key={team.rosterId}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(110px, 160px) 1fr",
            gap: 12,
            alignItems: "start",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: team.isMe ? 700 : 600,
              color: team.isMe ? "#00f5a0" : "#d9deef",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {team.label}
            {team.isMe && (
              <span style={{ fontSize: 9, color: "#00f5a0", marginLeft: 6, letterSpacing: 1 }}>
                YOU
              </span>
            )}
            <span style={{ fontSize: 9, color: "#7a819c", display: "block", letterSpacing: 1 }}>
              GETS
            </span>
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {team.received.length > 0 ? (
              team.received.map((asset, i) => (
                <TradeAsset key={`${team.rosterId}-${i}`} asset={asset} />
              ))
            ) : (
              <span style={{ fontSize: 11, color: "#54607a", fontStyle: "italic" }}>
                —
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TradesView({ trades, tradeReview, myRosterId }) {
  if (!trades || trades.length === 0) {
    return (
      <div style={{ ...styles.card, color: "#d1d7ea", fontSize: 13 }}>
        No trades in this league yet. New trades made during the draft will show
        up here automatically.
      </div>
    );
  }

  const cardsById = tradeReview?.byId || {};
  const earliestDate = tradeReview?.snapshotCoverage?.earliestDate || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {trades.map((trade) => {
        const card = cardsById[trade.id];
        return (
          <div key={trade.id} style={{ ...styles.card, marginBottom: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <span style={styles.tag(trade.isMultiTeam ? "#ffd84d" : "#c084fc")}>
                {trade.isMultiTeam ? `${trade.teams.length}-Team Trade` : "Trade"}
              </span>
              {trade.created > 0 && (
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  {new Date(trade.created).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Same Trade Report Card the Activity tab shows — winner, per-asset
                values, picks resolved to the player drafted, value source. Falls
                back to the plain haul list when no card could be built. */}
            {card ? (
              <FeedTradeBody card={card} rosterId={myRosterId} earliestDate={earliestDate} />
            ) : (
              <PlainTradeTeams teams={trade.teams} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const BEST_AVAIL_LIMIT = 75;

function BestAvailable({ pool, draftedIds, posFilter, setPosFilter }) {
  const drafted = draftedIds || new Set();
  const available = pool.filter((p) => !drafted.has(p.playerId));

  // Position filter chips, in a sensible order, only for positions present.
  const presentPositions = [];
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"]) {
    if (available.some((p) => p.position === pos)) presentPositions.push(pos);
  }

  // Multi-select: posFilter is an array of chosen positions (empty = ALL).
  // Only keep selections that are still present in the pool, then union-filter.
  const selected = (Array.isArray(posFilter) ? posFilter : []).filter((p) =>
    presentPositions.includes(p),
  );
  const selectedSet = new Set(selected);
  const showAll = selectedSet.size === 0;

  const togglePos = (pos) => {
    setPosFilter((prev) => {
      const cur = Array.isArray(prev) ? prev : [];
      return cur.includes(pos) ? cur.filter((p) => p !== pos) : [...cur, pos];
    });
  };

  const filtered = (
    showAll
      ? available
      : available.filter((p) => selectedSet.has(p.position))
  ).slice(0, BEST_AVAIL_LIMIT);

  return (
    <div style={{ ...styles.card }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div style={{ ...styles.sectionLabel, marginBottom: 0 }}>
          Best Available
        </div>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>
          {available.length} available
        </span>
      </div>

      {/* Position filter — multi-select. Tap multiple (e.g. RB + WR) to see the
          best across either room; "ALL" clears the selection. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {["ALL", ...presentPositions].map((f) => {
          const isAll = f === "ALL";
          const active = isAll ? showAll : selectedSet.has(f);
          const color = isAll ? "#00f5a0" : posColor(f);
          return (
            <button
              key={f}
              type="button"
              onClick={() => (isAll ? setPosFilter([]) : togglePos(f))}
              style={{
                padding: "3px 10px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: "pointer",
                border: "1px solid",
                background: active ? `${color}22` : "rgba(255,255,255,0.04)",
                color: active ? color : "#7a819c",
                borderColor: active ? `${color}66` : "rgba(255,255,255,0.1)",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          No players available{!showAll ? ` at ${selected.join(" / ")}` : ""}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {filtered.map((p, i) => (
            <div
              key={p.playerId}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr auto",
                gap: 10,
                alignItems: "center",
                padding: "6px 0",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <span style={{ fontSize: 10, color: "#94a3b8", textAlign: "right" }}>
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "#e8e8f0",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{ color: posColor(p.position), fontWeight: 700, marginRight: 6 }}
                >
                  {p.position}
                </span>
                {p.name}
                {p.team && (
                  <span style={{ color: "#94a3b8", marginLeft: 6, fontSize: 9 }}>
                    {p.team}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#d9deef" }}>
                {formatValue(p.value)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 10 }}>
        Undrafted players ranked by dynasty value (RosterAudit, FantasyCalc
        fallback). Updates live as picks come off the board
        {available.length > BEST_AVAIL_LIMIT
          ? ` · showing top ${BEST_AVAIL_LIMIT}`
          : ""}
        .
      </div>
    </div>
  );
}

function PosGradeStrip({ grades }) {
  if (!grades || grades.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {grades.map((g) => (
        <span
          key={g.pos}
          title={`${g.pos}: ${g.count} drafted · ${formatValue(g.value)} value`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 9,
            padding: "1px 6px",
            borderRadius: 2,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "#94a3b8", letterSpacing: 0.5, fontWeight: 600 }}>
            {g.pos}
          </span>
          <span style={{ color: gradeColor(g.grade), fontWeight: 700 }}>
            {g.grade || "—"}
          </span>
        </span>
      ))}
    </div>
  );
}

function PowerRankings({ rankings }) {
  const hasPpg = rankings.some((t) => t.expectedPpg > 0);
  const gridCols = hasPpg
    ? "28px 32px 1fr auto 64px 56px"
    : "28px 32px 1fr auto 56px";

  return (
    <div style={{ ...styles.card }}>
      <div style={{ ...styles.sectionLabel, marginBottom: 12 }}>
        Live Power Rankings
      </div>

      {/* Column headers for the numeric columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          gap: 12,
          padding: "0 10px 6px",
          fontSize: 8,
          letterSpacing: 1,
          color: "#7a819c",
          textTransform: "uppercase",
        }}
      >
        <span />
        <span style={{ textAlign: "center" }}>Grade</span>
        <span>Team</span>
        <span>Picks</span>
        {hasPpg && <span style={{ textAlign: "right" }}>Exp PPG</span>}
        <span style={{ textAlign: "right" }}>Value</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rankings.map((t) => (
          <div
            key={t.rosterId}
            style={{
              padding: "8px 10px",
              background: t.isMe ? "rgba(0,245,160,0.06)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${t.isMe ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 2,
              display: "flex",
              flexDirection: "column",
              gap: 7,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 12,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 11, color: "#94a3b8" }}>#{t.rank}</span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: gradeColor(t.grade),
                  textAlign: "center",
                }}
              >
                {t.grade || "—"}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: t.isMe ? "#00f5a0" : "#e8e8f0",
                  fontWeight: t.isMe ? 600 : 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
                {t.isMe && (
                  <span style={{ fontSize: 9, color: "#00f5a0", marginLeft: 6, letterSpacing: 1 }}>
                    YOU
                  </span>
                )}
              </span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>
                {t.totalDrafted} pick{t.totalDrafted !== 1 ? "s" : ""}
              </span>
              {hasPpg && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#4dd0ff",
                    textAlign: "right",
                  }}
                >
                  {t.expectedPpg > 0 ? t.expectedPpg.toFixed(1) : "—"}
                </span>
              )}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#d9deef",
                  textAlign: "right",
                }}
              >
                {formatValue(t.totalValue)}
              </span>
            </div>
            <PosGradeStrip grades={t.positionGrades} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 10 }}>
        Ranked by roster grade — each team's value-per-pick versus the league
        average (A best → F worst) — so it rewards drafting efficiently
        regardless of pick count. Value is total dynasty value drafted.
        {hasPpg
          ? " Exp PPG projects the current starting lineup's points/game from the last two seasons (rookies/no-data players count as 0 until they have a track record)."
          : ""}{" "}
        Per-position grades below each team compare that room to the league
        average — D/F flags a weak spot.
      </div>
    </div>
  );
}

function RosterCard({ team, rosterPositions, highlight = false, compact = false }) {
  const filled = team.starters.filter((s) => s.player).length;
  const starterTotal = team.starters.length;

  return (
    <div
      style={{
        ...styles.card,
        marginBottom: compact ? 0 : 16,
        borderColor: highlight ? "rgba(0,245,160,0.4)" : "rgba(255,255,255,0.12)",
        background: highlight ? "rgba(0,245,160,0.05)" : styles.card.background,
        padding: compact ? "14px 16px" : "18px 22px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: compact ? 12 : 14,
            fontWeight: 700,
            color: highlight ? "#00f5a0" : "#e8e8f0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {team.label}
          {highlight && (
            <span style={{ fontSize: 9, color: "#00f5a0", marginLeft: 8, letterSpacing: 1 }}>
              YOU
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {team.grade && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: gradeColor(team.grade),
              }}
              title="Live roster grade — value-per-pick vs league average"
            >
              {team.grade}
            </span>
          )}
          <span style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap" }}>
            {team.totalDrafted} picks
          </span>
        </div>
      </div>

      {/* Per-position grades — quick read on weak spots */}
      {team.positionGrades && (
        <div style={{ marginBottom: 12 }}>
          <PosGradeStrip grades={team.positionGrades} />
        </div>
      )}

      {/* Starter slots */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {team.starters.map((slot) => (
          <SlotRow key={slot.key} slot={slot} compact={compact} />
        ))}
      </div>

      {/* Bench */}
      {team.bench.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>
            Bench ({team.bench.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {team.bench.map((p) => (
              <span
                key={p.pickNo}
                style={{
                  fontSize: 10,
                  padding: "2px 7px",
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#d9deef",
                  whiteSpace: "nowrap",
                }}
                title={`${p.name} · ${p.position}${p.team ? " " + p.team : ""}`}
              >
                <span style={{ color: posColor(p.position), fontWeight: 700, marginRight: 4 }}>
                  {p.position}
                </span>
                {p.name.split(" ").slice(-1)[0]}
              </span>
            ))}
          </div>
        </div>
      )}

      {!compact && (
        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 10 }}>
          Starting lineup {filled}/{starterTotal} filled
        </div>
      )}
    </div>
  );
}

function SlotRow({ slot, compact }) {
  const p = slot.player;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr",
        alignItems: "center",
        gap: 8,
        padding: compact ? "3px 0" : "4px 0",
      }}
    >
      <span
        style={{
          fontSize: 9,
          letterSpacing: 1,
          color: "#7a819c",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {slot.label}
      </span>
      {p ? (
        <span
          style={{
            fontSize: compact ? 11 : 12,
            color: "#e8e8f0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={`${p.name} · ${p.position}${p.team ? " " + p.team : ""} · pick ${p.pickNo}`}
        >
          <span style={{ color: posColor(p.position), fontWeight: 700, marginRight: 6 }}>
            {p.position}
          </span>
          {p.name}
          {p.team && <span style={{ color: "#94a3b8", marginLeft: 5, fontSize: 9 }}>{p.team}</span>}
        </span>
      ) : (
        <span
          style={{
            fontSize: compact ? 11 : 12,
            color: "#54607a",
            fontStyle: "italic",
          }}
        >
          — open —
        </span>
      )}
    </div>
  );
}

function LiveBoard({ state, myRosterId }) {
  const { board, slotCount, slotToRoster } = state;
  return (
    <div style={{ ...styles.card, padding: 12, overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `28px repeat(${slotCount}, minmax(78px, 1fr))`,
          gap: 3,
          minWidth: slotCount * 80,
        }}
      >
        <div />
        {Array.from({ length: slotCount }, (_, i) => {
          const rosterId = slotToRoster.get(i + 1);
          const isMe = rosterId === myRosterId;
          return (
            <div
              key={`hdr-${i}`}
              style={{
                fontSize: 8,
                color: isMe ? "#00f5a0" : "#94a3b8",
                textAlign: "center",
                letterSpacing: 0.5,
                padding: "2px 0",
                fontWeight: isMe ? 700 : 400,
              }}
            >
              {i + 1}
            </div>
          );
        })}

        {board.map((row, rIdx) => (
          <BoardRow key={`row-${rIdx}`} round={rIdx + 1} row={row} myRosterId={myRosterId} />
        ))}
      </div>
    </div>
  );
}

function BoardRow({ round, row, myRosterId }) {
  return (
    <>
      <div
        style={{
          fontSize: 10,
          color: "#00f5a0",
          letterSpacing: 1,
          alignSelf: "center",
          textAlign: "center",
        }}
      >
        R{round}
      </div>
      {row.map((cell, sIdx) => (
        <BoardCell key={`c-${round}-${sIdx}`} pick={cell} myRosterId={myRosterId} />
      ))}
    </>
  );
}

function BoardCell({ pick, myRosterId }) {
  if (!pick) {
    return (
      <div
        style={{
          padding: 4,
          minHeight: 48,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 2,
        }}
      />
    );
  }
  const isMe = pick.rosterId === myRosterId;
  const lastName = pick.name.split(" ").slice(-1)[0] || pick.name;
  return (
    <div
      title={`${pick.name} · ${pick.position}${pick.team ? " " + pick.team : ""} · pick ${pick.pickNo}`}
      style={{
        padding: 4,
        minHeight: 48,
        background: isMe ? "rgba(0,245,160,0.08)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isMe ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 8, color: "#94a3b8" }}>{pick.pickNo}</div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#e8e8f0",
          lineHeight: 1.15,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {lastName}
      </div>
      <div style={{ fontSize: 8, color: posColor(pick.position), fontWeight: 600 }}>
        {pick.position}
        {pick.team && <span style={{ color: "#94a3b8", marginLeft: 4 }}>{pick.team}</span>}
      </div>
    </div>
  );
}
