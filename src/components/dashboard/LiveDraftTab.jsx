import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { styles } from "../../styles";
import {
  fetchSleeper,
  fetchDraftPicks,
  fetchDraftTradedPicks,
} from "../../lib/sleeperApi";
import { buildLiveDraftState } from "../../lib/liveDraft";
import { fetchNflState, fetchSeasonProjectedPpg } from "../../lib/projectionsApi";
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

// Dynasty phase styling — mirrors the League tab so teams read the same way
// across the app (Contender / Retool / Rebuild).
const PHASE_META = {
  contender: { label: "Contender", color: "#00f5a0" },
  retool: { label: "Retool", color: "#ffd84d" },
  rebuild: { label: "Rebuild", color: "#ff6b35" },
};

function PhaseBadge({ phase }) {
  const meta = PHASE_META[phase];
  if (!meta) return null;
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 2,
        color: meta.color,
        background: `${meta.color}1a`,
        border: `1px solid ${meta.color}55`,
        whiteSpace: "nowrap",
      }}
      title="Dynasty phase — the team's current contention window (from the League analysis)"
    >
      {meta.label}
    </span>
  );
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

// Sleeper player headshot (team logo for DEF), with a position-tinted initials
// fallback when the image is missing or 404s. Same CDN the Admin boards use.
function PlayerHeadshot({ playerId, name, position, team, size = 28 }) {
  const [errored, setErrored] = useState(false);
  const color = posColor(position);
  const isDef = position === "DEF";
  const url = isDef
    ? team
      ? `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`
      : null
    : playerId
      ? `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`
      : null;

  if (!url || errored) {
    const initials = (name || "")
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
          border: `1px solid ${color}55`,
          color,
          fontSize: Math.round(size * 0.34),
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {initials || position || "—"}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        background: "#0d0f17",
        border: `1px solid ${color}55`,
        flexShrink: 0,
      }}
    />
  );
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
  ppr = 1,
}) {
  const [picks, setPicks] = useState(initialPicks);
  const [tradedPicks, setTradedPicks] = useState([]);
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
  // Forward weekly-projection PPG (Supabase, league scoring) for the Best
  // Available board. Falls back to the historical PPG prop when a player has no
  // projection rows (rookies, or the projections table isn't published yet).
  const [projPpg, setProjPpg] = useState(null); // Map(playerId → ppg) | null

  useEffect(() => {
    let alive = true;
    (async () => {
      const state = await fetchNflState().catch(() => null);
      const season = Number(state?.season) || new Date().getFullYear();
      const map = await fetchSeasonProjectedPpg(season, ppr).catch(() => new Map());
      if (alive) setProjPpg(map);
    })();
    return () => {
      alive = false;
    };
  }, [ppr]);

  // Projection wins where we have it; otherwise the historical PPG carries over.
  const effectivePpg = useMemo(() => {
    if (!projPpg || projPpg.size === 0) return ppgBySleeperId;
    const merged = { ...ppgBySleeperId };
    for (const [id, v] of projPpg) merged[id] = v;
    return merged;
  }, [projPpg, ppgBySleeperId]);

  // leagueTeams carries label/avatar/ownerId/rosterId/teamPhase — map to the
  // minimal shape, keeping the dynasty phase (contender/retool/rebuild) so the
  // Rosters view can label each team the way the League tab does.
  const teams = leagueTeams.map((t) => ({
    rosterId: t.rosterId,
    label: t.label,
    avatar: t.avatar || null,
    ownerId: t.ownerId,
    phase: t.teamPhase?.phase || null,
  }));

  // A fetch is allowed to be in flight only once at a time. The guard lives in a
  // ref (not state) so it never re-renders and the background poll can dedupe
  // against a manual refresh. `refreshing` is *only* toggled for manual clicks so
  // the button doesn't gray out / flip to "Refreshing…" on every 12s poll — that
  // flicker is what made it feel unclickable.
  const inFlightRef = useRef(false);
  const refresh = useCallback(
    async (isManual = false) => {
      if (!draft?.draft_id) return;
      // Background polls bail if anything is already fetching; a manual click is
      // always honored so the button feels responsive even mid-poll.
      if (inFlightRef.current && !isManual) return;
      inFlightRef.current = true;
      if (isManual) setRefreshing(true);
      try {
        const [freshDraft, freshPicks, freshTraded] = await Promise.all([
          fetchSleeper(`/draft/${draft.draft_id}`).catch(() => null),
          fetchDraftPicks(draft.draft_id).catch(() => null),
          fetchDraftTradedPicks(draft.draft_id).catch(() => null),
        ]);
        if (freshDraft) setLiveDraft(freshDraft);
        if (Array.isArray(freshPicks)) setPicks(freshPicks);
        if (Array.isArray(freshTraded)) setTradedPicks(freshTraded);

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
        inFlightRef.current = false;
        if (isManual) setRefreshing(false);
      }
    },
    [draft?.draft_id, leagueId],
  );

  // Traded picks aren't in the seeded payload — pull them once on mount so the
  // board reads correctly even when auto-refresh is off (the poll keeps them
  // fresh thereafter).
  useEffect(() => {
    let live = true;
    if (draft?.draft_id) {
      fetchDraftTradedPicks(draft.draft_id)
        .then((rows) => {
          if (live && Array.isArray(rows)) setTradedPicks(rows);
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [draft?.draft_id]);

  // Poll while auto-refresh is on and the draft isn't finished.
  const isComplete = liveDraft?.status === "complete";
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!autoRefresh || isComplete) return undefined;
    // Fire once immediately so flipping the toggle on feels instant — otherwise
    // the first poll is a full POLL_MS away and it reads as "nothing happened".
    refreshRef.current();
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
    tradedPicks,
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
    return buildTradeReview({
      ...tradeReviewInputs,
      transactions: tradeTx,
      // The in-progress draft + its picks let traded picks resolve to a seat
      // ("spot", e.g. 2026 2.05) and the team that owns it — the completed-draft
      // resolver in tradeReviewInputs can't, since this draft isn't finished.
      liveDraft,
      liveDraftPicks: picks,
    });
  }, [tradeReviewInputs, tradeTx, liveDraft, picks]);

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
            style={{ ...styles.btnGhost, minWidth: 104 }}
            onClick={() => refresh(true)}
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
              {state.onTheClock.viaTrade && (
                <span style={{ fontSize: 10, color: "#ffd84d", marginLeft: 8, letterSpacing: 0.5 }}>
                  via {state.onTheClock.fromLabel}
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
                  <span
                    key={u.pickNo}
                    title={u.viaTrade ? `Acquired via ${u.fromLabel}` : undefined}
                    style={styles.tag(
                      u.viaTrade ? "#ffd84d" : u.fromNow === 0 ? "#00f5a0" : "#4dd0ff",
                    )}
                  >
                    {pickLabel(u.round, u.slot)}
                    {u.fromNow > 0 && (
                      <span style={{ opacity: 0.7, marginLeft: 4 }}>
                        +{u.fromNow}
                      </span>
                    )}
                    {u.viaTrade && <span style={{ marginLeft: 4 }}>⇄</span>}
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
          ppgBySleeperId={effectivePpg}
          rosterPositions={rosterPositions}
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

      {view === "board" && (
        // Full-bleed the cockpit out of the app's narrow content column — a
        // draft board wants width. Capped so it stays sane on ultrawide screens.
        <div
          style={{
            width: "100vw",
            marginLeft: "calc(50% - 50vw)",
            marginRight: "calc(50% - 50vw)",
            padding: "0 24px",
            boxSizing: "border-box",
          }}
        >
        <div
          style={{
            maxWidth: 1440,
            margin: "0 auto",
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          {/* Board takes the main area and scrolls horizontally on its own. */}
          <div style={{ flex: "1 1 580px", minWidth: 0 }}>
            <LiveBoard state={state} myRosterId={myRosterId} />
          </div>
          {/* Best Available rail — sticky so it stays visible while you scan the
              board, with its own scroll for the long list. */}
          {bestAvailablePool.length > 0 && (
            <div
              style={{
                flex: "1 1 300px",
                maxWidth: 360,
                minWidth: 280,
                position: "sticky",
                top: 12,
                alignSelf: "flex-start",
              }}
            >
              <BestAvailable
                pool={bestAvailablePool}
                draftedIds={state.draftedIds}
                posFilter={posFilter}
                setPosFilter={setPosFilter}
                ppgBySleeperId={effectivePpg}
                rosterPositions={rosterPositions}
                rail
              />
            </div>
          )}
        </div>
        </div>
      )}

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

function BestAvailable({
  pool,
  draftedIds,
  posFilter,
  setPosFilter,
  ppgBySleeperId = {},
  rosterPositions = [],
  rail = false,
}) {
  const drafted = draftedIds || new Set();
  // Only surface positions the league actually rosters. K and DEF are dropped
  // (board + filter chips) when no roster slot uses them, so a draft that never
  // picks kickers/defenses isn't cluttered with them.
  const rostersK = rosterPositions.includes("K");
  const rostersDef =
    rosterPositions.includes("DEF") || rosterPositions.includes("DST");
  // Attach each player's projected PPG (0 when we have no track record, e.g.
  // rookies) so the value/PPG sliders can filter on it.
  const available = pool
    .filter((p) => !drafted.has(p.playerId))
    .filter((p) => {
      if (p.position === "K" && !rostersK) return false;
      if (p.position === "DEF" && !rostersDef) return false;
      return true;
    })
    .map((p) => ({ ...p, ppg: ppgBySleeperId[p.playerId] || 0 }));
  // As the board sidebar, cap the list so it doesn't run off the page.
  const rowLimit = rail ? 40 : BEST_AVAIL_LIMIT;

  // Sort the board by dynasty value (default) or by projected PPG.
  const [sortBy, setSortBy] = useState("value"); // "value" | "ppg"

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

  // Positional rank within the *available* pool (e.g. "WR3"), computed over the
  // full pool so it stays true even when the list is sliced or filtered. The
  // pool arrives pre-sorted by dynasty value, so running counts give the rank.
  const posRankById = new Map();
  const posSeen = {};
  for (const p of available) {
    posSeen[p.position] = (posSeen[p.position] || 0) + 1;
    posRankById.set(p.playerId, posSeen[p.position]);
  }

  const filtered = (
    showAll
      ? [...available]
      : available.filter((p) => selectedSet.has(p.position))
  )
    .sort((a, b) =>
      sortBy === "ppg"
        ? (b.ppg || 0) - (a.ppg || 0)
        : (b.value || 0) - (a.value || 0),
    )
    .slice(0, rowLimit);

  // Scale the value bars to the top player currently shown so tier drop-offs
  // read at a glance.
  const maxValue = filtered.reduce((m, p) => Math.max(m, p.value || 0), 0) || 1;

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

      {/* Sort toggle — rank the board by dynasty value or by projected PPG. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span
          style={{
            fontSize: 9.5,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            fontWeight: 700,
            color: "#7a819c",
          }}
        >
          Sort
        </span>
        {[
          { key: "value", label: "Value" },
          { key: "ppg", label: "Proj PPG" },
        ].map((s) => {
          const active = sortBy === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSortBy(s.key)}
              style={{
                padding: "3px 10px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: "pointer",
                border: "1px solid",
                background: active ? "#00f5a022" : "rgba(255,255,255,0.04)",
                color: active ? "#00f5a0" : "#7a819c",
                borderColor: active ? "#00f5a066" : "rgba(255,255,255,0.1)",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          No players available{!showAll ? ` at ${selected.join(" / ")}` : ""}.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: rail
              ? "1fr"
              : "repeat(auto-fill, minmax(264px, 1fr))",
            gap: 8,
            // In rail mode the list scrolls on its own so the board stays put.
            ...(rail
              ? { maxHeight: "calc(100vh - 240px)", overflowY: "auto", paddingRight: 4 }
              : {}),
          }}
        >
          {filtered.map((p, i) => (
            <BestAvailableRow
              key={p.playerId}
              player={p}
              rank={i + 1}
              posRank={posRankById.get(p.playerId)}
              maxValue={maxValue}
              ppg={p.ppg}
            />
          ))}
        </div>
      )}

      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 10 }}>
        Undrafted players ranked by dynasty value (RosterAudit, FantasyCalc
        fallback). Updates live as picks come off the board
        {available.length > rowLimit ? ` · showing top ${rowLimit}` : ""}.
      </div>
    </div>
  );
}

// A single Best-Available player as a compact card. Position-tinted left
// accent, a positional-rank chip (e.g. "WR3"), and a value bar scaled to the
// top player so tier cliffs are obvious at a glance. The top three overall get
// a subtly brighter card so the premium names stand out.
function BestAvailableRow({ player: p, rank, posRank, maxValue, ppg = 0 }) {
  const color = posColor(p.position);
  const isTop = rank <= 3;
  const barPct = Math.max(4, Math.round(((p.value || 0) / maxValue) * 100));
  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "18px 30px 1fr auto",
        alignItems: "center",
        gap: 9,
        padding: "6px 11px 8px",
        background: isTop ? `${color}12` : "rgba(255,255,255,0.025)",
        border: `1px solid ${isTop ? `${color}40` : "rgba(255,255,255,0.07)"}`,
        borderLeft: `2px solid ${color}`,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <span style={{ fontSize: 10, color: "#6b7390", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {rank}
      </span>
      <PlayerHeadshot
        playerId={p.playerId}
        name={p.name}
        position={p.position}
        team={p.team}
        size={30}
      />
      <span
        style={{ minWidth: 0, overflow: "hidden" }}
        title={`${p.name}${p.team ? " · " + p.team : ""}`}
      >
        <span
          style={{
            display: "block",
            fontSize: 12.5,
            color: "#e8e8f0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {p.name}
        </span>
        <span style={{ display: "block", fontSize: 9.5, whiteSpace: "nowrap" }}>
          <span style={{ color, fontWeight: 700, letterSpacing: 0.3 }}>
            {p.position}
            {posRank ? posRank : ""}
          </span>
          {p.team && <span style={{ color: "#7a819c" }}> · {p.team}</span>}
        </span>
      </span>
      <span style={{ textAlign: "right" }}>
        <span
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 700,
            color: "#d9deef",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatValue(p.value)}
        </span>
        {ppg > 0 && (
          <span
            style={{
              display: "block",
              fontSize: 9,
              color: "#7a819c",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {ppg.toFixed(1)} ppg
          </span>
        )}
      </span>
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 2,
          width: `${barPct}%`,
          background: color,
          opacity: 0.55,
        }}
      />
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
  // Two views: "dynasty" (ranked by total value) and "contender" (ranked by
  // expected PPG). Contender only makes sense once we have projection data.
  const hasPpg = (rankings.contender || []).some((t) => t.expectedPpg > 0);
  const [mode, setMode] = useState("dynasty");
  const activeMode = mode === "contender" && hasPpg ? "contender" : "dynasty";
  const rows = rankings[activeMode] || [];
  const gridCols = hasPpg
    ? "28px 32px 1fr auto 64px 56px"
    : "28px 32px 1fr auto 56px";

  return (
    <div style={{ ...styles.card }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ ...styles.sectionLabel, marginBottom: 0 }}>
          Live Power Rankings
        </div>
        {hasPpg && (
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { key: "dynasty", label: "Dynasty" },
              { key: "contender", label: "Contender" },
            ].map((opt) => {
              const on = activeMode === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setMode(opt.key)}
                  style={{
                    fontSize: 10,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    padding: "4px 10px",
                    borderRadius: 2,
                    cursor: "pointer",
                    border: `1px solid ${on ? "rgba(0,245,160,0.4)" : "rgba(255,255,255,0.1)"}`,
                    background: on ? "rgba(0,245,160,0.1)" : "transparent",
                    color: on ? "#00f5a0" : "#94a3b8",
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
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
        {rows.map((t) => (
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
        {activeMode === "contender"
          ? "Contender view ranks by expected PPG — the projected points/game of each team's current starting lineup (rookies/no-data players count as 0 until they have a track record). Grade compares that PPG to the league average (A best → F worst)."
          : "Dynasty view ranks by total roster value — the strongest accumulated build leads. Grade compares each team's total dynasty value to the league average (A best → F worst)."}
        {hasPpg && activeMode !== "contender"
          ? " Exp PPG projects the current starting lineup's points/game from the last two seasons."
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
  // Bench depth: the league's bench slots (BN) as capacity, so an empty/partial
  // bench reads as remaining depth the way unfilled starter slots do. A team can
  // over-draft past its bench count mid-draft, so never report fewer than drafted.
  const benchSlots = (rosterPositions || []).filter((s) => s === "BN").length;
  const benchTotal = Math.max(benchSlots, team.bench.length);
  const benchEmpty = Math.max(0, benchTotal - team.bench.length);

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
          {team.phase && (
            <span style={{ marginLeft: 8, verticalAlign: "middle" }}>
              <PhaseBadge phase={team.phase} />
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
              title="Live roster grade — total dynasty value vs league average"
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

      {/* Bench — drafted depth plus the league's remaining bench spots */}
      {benchTotal > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>
            Bench ({team.bench.length}/{benchTotal})
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
            {Array.from({ length: benchEmpty }).map((_, i) => (
              <span
                key={`empty-${i}`}
                style={{
                  fontSize: 10,
                  padding: "2px 7px",
                  borderRadius: 2,
                  background: "transparent",
                  border: "1px dashed rgba(255,255,255,0.12)",
                  color: "#5a6178",
                  whiteSpace: "nowrap",
                }}
                title="Open bench spot"
              >
                empty
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

// Shorten a team label for the narrow board column headers.
function abbrevTeam(label) {
  if (!label) return "—";
  const trimmed = label.trim();
  if (trimmed.length <= 11) return trimmed;
  return `${trimmed.slice(0, 10)}…`;
}

// Accent used to spotlight a team's picks when their header is clicked.
const SELECT_COLOR = "#a78bfa";

function LiveBoard({ state, myRosterId }) {
  const { board, boardOwners = [], slotCount, slotToRoster, teams, onTheClock } = state;
  const labelByRoster = new Map((teams || []).map((t) => [t.rosterId, t.label]));
  const onClockRound = onTheClock?.round ?? null;
  const onClockSlot = onTheClock?.slot ?? null;

  // Click a team's column header to spotlight every square they own — picks
  // already made plus upcoming seats (including ones acquired by trade). Click
  // again (or the same header) to clear.
  const [selectedRoster, setSelectedRoster] = useState(null);
  const toggleRoster = (rosterId) =>
    setSelectedRoster((cur) => (cur === rosterId ? null : rosterId));
  const selectedLabel =
    selectedRoster != null ? labelByRoster.get(selectedRoster) : null;

  return (
    <div style={{ ...styles.card, padding: 12, overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          // minmax(0, 1fr) lets the columns shrink to share whatever width the
          // pane has, so the board fits without horizontal scrolling. A small
          // floor only forces a scrollbar on very tight (mobile / 14+ team)
          // layouts where cells would otherwise be unreadable.
          gridTemplateColumns: `24px repeat(${slotCount}, minmax(0, 1fr))`,
          gap: 4,
          minWidth: slotCount * 56,
        }}
      >
        {/* Column headers — each draft slot's team. Click to highlight. */}
        <div />
        {Array.from({ length: slotCount }, (_, i) => {
          const rosterId = slotToRoster.get(i + 1);
          const isMe = rosterId === myRosterId;
          const isSelected = rosterId != null && rosterId === selectedRoster;
          const label = labelByRoster.get(rosterId);
          const accent = isSelected ? SELECT_COLOR : isMe ? "#00f5a0" : null;
          return (
            <button
              key={`hdr-${i}`}
              type="button"
              onClick={() => rosterId != null && toggleRoster(rosterId)}
              title={
                label
                  ? `${label} — click to ${isSelected ? "clear" : "highlight"} their picks`
                  : `Slot ${i + 1}`
              }
              style={{
                font: "inherit",
                cursor: rosterId != null ? "pointer" : "default",
                fontSize: 9,
                color: accent || "#aab1c9",
                textAlign: "center",
                letterSpacing: 0.3,
                padding: "3px 2px 5px",
                fontWeight: isSelected || isMe ? 700 : 500,
                background: isSelected ? "rgba(167,139,250,0.12)" : "transparent",
                borderRadius: 3,
                border: "none",
                borderBottom: `1px solid ${
                  isSelected
                    ? "rgba(167,139,250,0.6)"
                    : isMe
                      ? "rgba(0,245,160,0.35)"
                      : "rgba(255,255,255,0.08)"
                }`,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                width: "100%",
              }}
            >
              <span style={{ color: "#54607a", marginRight: 3 }}>{i + 1}</span>
              {abbrevTeam(label)}
            </button>
          );
        })}

        {board.map((row, rIdx) => (
          <BoardRow
            key={`row-${rIdx}`}
            round={rIdx + 1}
            row={row}
            ownerRow={boardOwners[rIdx] || []}
            myRosterId={myRosterId}
            selectedRoster={selectedRoster}
            onClockSlot={onClockRound === rIdx + 1 ? onClockSlot : null}
          />
        ))}
      </div>

      {/* Position legend + highlight hint. */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 12,
          alignItems: "center",
        }}
      >
        {["QB", "RB", "WR", "TE"].map((pos) => (
          <span key={pos} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: posColor(pos),
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 9, color: "#94a3b8", letterSpacing: 0.5 }}>{pos}</span>
          </span>
        ))}
        <span style={{ flex: 1 }} />
        {selectedRoster != null ? (
          <button
            type="button"
            onClick={() => setSelectedRoster(null)}
            style={{
              font: "inherit",
              cursor: "pointer",
              fontSize: 9,
              letterSpacing: 0.4,
              color: SELECT_COLOR,
              background: "rgba(167,139,250,0.12)",
              border: `1px solid rgba(167,139,250,0.5)`,
              borderRadius: 4,
              padding: "3px 8px",
            }}
          >
            Highlighting {abbrevTeam(selectedLabel)} · clear ✕
          </button>
        ) : (
          <span style={{ fontSize: 9, color: "#6b7390", letterSpacing: 0.4 }}>
            Tap a team header to highlight their picks
          </span>
        )}
      </div>
    </div>
  );
}

function BoardRow({ round, row, ownerRow, myRosterId, selectedRoster, onClockSlot }) {
  return (
    <>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#00f5a0",
          letterSpacing: 0.5,
          alignSelf: "center",
          textAlign: "center",
          opacity: 0.7,
        }}
      >
        R{round}
      </div>
      {row.map((cell, sIdx) => (
        <BoardCell
          key={`c-${round}-${sIdx}`}
          pick={cell}
          owner={ownerRow[sIdx] || null}
          myRosterId={myRosterId}
          selectedRoster={selectedRoster}
          onClock={onClockSlot === sIdx + 1}
        />
      ))}
    </>
  );
}

function BoardCell({ pick, owner, myRosterId, selectedRoster, onClock }) {
  // Which roster this square belongs to: the actual drafter once a pick is made,
  // otherwise the current owner of the seat (trade-aware).
  const cellRoster = pick ? pick.rosterId : owner?.rosterId ?? null;
  const selecting = selectedRoster != null;
  const isSelected = selecting && cellRoster != null && cellRoster === selectedRoster;
  const dim = selecting && !isSelected;

  if (!pick) {
    // Empty future slot — shows which team owns the pick (so a traded seat reads
    // out its new owner), plus the on-the-clock flag.
    return (
      <div
        style={{
          position: "relative",
          padding: 4,
          minHeight: 78,
          background: isSelected
            ? "rgba(167,139,250,0.12)"
            : onClock
              ? "rgba(0,245,160,0.07)"
              : "rgba(255,255,255,0.015)",
          border: isSelected
            ? `1px solid ${SELECT_COLOR}`
            : onClock
              ? "1px dashed rgba(0,245,160,0.5)"
              : "1px solid rgba(255,255,255,0.04)",
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          textAlign: "center",
          opacity: dim ? 0.28 : 1,
          transition: "opacity 120ms",
        }}
      >
        {onClock && (
          <span style={{ fontSize: 7, letterSpacing: 1, color: "#00f5a0" }}>
            ON THE CLOCK
          </span>
        )}
        {owner?.label && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: owner.isMe ? "#00f5a0" : "#9aa2bd",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {abbrevTeam(owner.label)}
          </span>
        )}
        {owner?.traded && (
          <span style={{ fontSize: 7.5, color: "#ffd84d", letterSpacing: 0.2 }}>
            ⇄ via {abbrevTeam(owner.fromLabel)}
          </span>
        )}
      </div>
    );
  }
  const isMe = pick.rosterId === myRosterId;
  const color = posColor(pick.position);
  const lastName = pick.name.split(" ").slice(-1)[0] || pick.name;
  const traded = owner?.traded;
  return (
    <div
      title={`${pick.name} · ${pick.position}${pick.team ? " " + pick.team : ""} · pick ${pick.pickNo}${
        traded ? ` · ${owner.label} via ${owner.fromLabel}` : ""
      }`}
      style={{
        position: "relative",
        padding: "7px 6px 6px",
        minHeight: 78,
        // Tint each cell by position so positional runs are visible at a glance;
        // my own picks get the signature green wash instead.
        background: isMe ? "rgba(0,245,160,0.10)" : `${color}12`,
        border: isSelected
          ? `1px solid ${SELECT_COLOR}`
          : `1px solid ${isMe ? "rgba(0,245,160,0.35)" : `${color}33`}`,
        borderLeft: `2px solid ${isSelected ? SELECT_COLOR : isMe ? "#00f5a0" : color}`,
        boxShadow: isSelected ? `0 0 0 1px ${SELECT_COLOR}55` : "none",
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 3,
        overflow: "hidden",
        opacity: dim ? 0.28 : 1,
        transition: "opacity 120ms",
      }}
    >
      {/* Pick number tucked into the top-left corner. */}
      <span
        style={{
          position: "absolute",
          top: 3,
          left: 4,
          fontSize: 7.5,
          color: "#7a819c",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pick.pickNo}
      </span>
      {/* Traded picks flag the seat they came from, top-right. */}
      {traded && (
        <span
          style={{ position: "absolute", top: 3, right: 4, fontSize: 7.5, color: "#ffd84d" }}
          title={`${owner.label} via ${owner.fromLabel}`}
        >
          ⇄
        </span>
      )}
      <PlayerHeadshot
        playerId={pick.playerId}
        name={pick.name}
        position={pick.position}
        team={pick.team}
        size={30}
      />
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "#e8e8f0",
          lineHeight: 1.15,
          textAlign: "center",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {lastName}
      </div>
      <div style={{ fontSize: 8, letterSpacing: 0.3, textAlign: "center" }}>
        <span style={{ color, fontWeight: 700 }}>{pick.position}</span>
        {pick.team && <span style={{ color: "#7a819c" }}> · {pick.team}</span>}
      </div>
    </div>
  );
}
