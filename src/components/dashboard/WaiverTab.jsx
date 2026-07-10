import { useEffect, useMemo, useState } from "react";
import { styles } from "../../styles";
import {
  fetchNflState,
  fetchProjections,
  fetchSeasonProjectedPpg,
} from "../../lib/projectionsApi";
import { fetchSeasonWeeklyScores } from "../../lib/weeklyScoringApi";
import {
  fetchSleeper,
  fetchTrendingPlayers,
  safeLocalStorageWrite,
} from "../../lib/sleeperApi";
import { buildPlayerStreaks } from "../../lib/hotStreaks";
import {
  scoreWaiverCandidates,
  buildBoardDeltas,
} from "../../lib/waiverEngine";

const ACCENT = "#00f5a0";
const MUTED = "#94a3b8";
const POS_COLOR = { QB: "#f87171", RB: "#34d399", WR: "#60a5fa", TE: "#fbbf24", K: "#c084fc", DEF: "#94a3b8" };
const VERDICT_STYLE = {
  "priority-add": { color: "#052e1c", bg: ACCENT, label: "Priority Add" },
  "strong-add": { color: "#0b1220", bg: "#60a5fa", label: "Strong Add" },
  speculative: { color: "#0b1220", bg: "#fbbf24", label: "Speculative" },
  watch: { color: "#cbd5e1", bg: "#334155", label: "Watch" },
};
const FLAG_STYLE = {
  "opportunity-shock": { label: "SHOCK", color: "#f87171" },
  "trending-riser": { label: "RISING", color: ACCENT },
  "being-dropped": { label: "DROPPED", color: "#fb923c" },
  "injury-risk": { label: "INJ", color: "#f87171" },
  "fills-need": { label: "NEED", color: "#60a5fa" },
  "stash-only": { label: "STASH", color: "#c084fc" },
};
const SIGNAL_LABELS = {
  dynasty: "Dynasty value",
  projection: "Point projection",
  form: "Recent form",
  trending: "Add velocity",
  availability: "Availability",
};

// Board snapshot for the Risers/Fallers strip lives in localStorage — a new
// snapshot is taken when the saved one is >24h old or from a previous week,
// so deltas read "since your last check", not "since this render".
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const snapshotKey = (leagueId) => `dyn_waiver_board_${leagueId}`;

const fmt = (n, d = 1) => (n == null || isNaN(n) ? "—" : Number(n).toFixed(d));

function PosTag({ pos }) {
  return <span style={styles.tag(POS_COLOR[pos] || MUTED)}>{pos}</span>;
}

function VerdictChip({ verdict }) {
  const v = VERDICT_STYLE[verdict] || VERDICT_STYLE.watch;
  return (
    <span style={{ background: v.bg, color: v.color, borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {v.label}
    </span>
  );
}

function FlagChips({ flags }) {
  if (!flags?.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {flags.map((f) => {
        const s = FLAG_STYLE[f];
        if (!s) return null;
        return (
          <span key={f} style={{ border: `1px solid ${s.color}66`, color: s.color, borderRadius: 3, padding: "1px 5px", fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>
            {s.label}
          </span>
        );
      })}
    </span>
  );
}

function ScoreBar({ score }) {
  const hue = score >= 65 ? ACCENT : score >= 45 ? "#fbbf24" : "#64748b";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: 110 }}>
      <span style={{ flex: 1, height: 5, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${score}%`, background: hue, borderRadius: 3 }} />
      </span>
      <span style={{ width: 34, textAlign: "right", color: hue, fontWeight: 800, fontSize: 13 }}>{Math.round(score)}</span>
    </span>
  );
}

/** Per-signal breakdown behind one candidate's score — the "why" panel. */
function WhyPanel({ r }) {
  const b = r.breakdown;
  return (
    <div style={{ background: "#0b1220", border: `1px solid ${MUTED}33`, borderRadius: 8, padding: "12px 16px", margin: "0 0 8px 24px" }}>
      {Object.keys(SIGNAL_LABELS).map((k) => {
        const val = b[k];
        const w = b.weightsUsed[k];
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0", fontSize: 12 }}>
            <span style={{ width: 120, color: MUTED }}>{SIGNAL_LABELS[k]}</span>
            <span style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
              {val != null && (
                <span style={{ display: "block", height: "100%", width: `${val}%`, background: val >= 60 ? ACCENT : val >= 40 ? "#fbbf24" : "#64748b" }} />
              )}
            </span>
            <span style={{ width: 34, textAlign: "right", color: val != null ? "#e2e8f0" : MUTED }}>
              {val != null ? Math.round(val) : "—"}
            </span>
            <span style={{ width: 56, textAlign: "right", color: MUTED, fontSize: 10 }}>
              {w != null ? `× ${(w * 100).toFixed(0)}%` : "unused"}
            </span>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${MUTED}22`, fontSize: 12 }}>
        <span style={{ color: MUTED }}>
          {b.needMult > 1 ? `Roster need boost ×${b.needMult}` : b.needMult < 1 ? `Surplus position ×${b.needMult}` : "No roster-fit adjustment"}
          {r.dynastyTier ? ` · ${r.dynastyTier}` : ""}
          {r.momentum != null ? ` · momentum ${r.momentum > 0 ? "+" : ""}${r.momentum}` : ""}
          {r.trendCount > 0 ? ` · ${r.trendCount.toLocaleString()} adds/48h` : ""}
        </span>
        <span style={{ color: ACCENT, fontWeight: 700 }}>
          {r.advice.faabLabel || VERDICT_STYLE[r.advice.verdict]?.label}
        </span>
      </div>
    </div>
  );
}

function SortHeader({ label, title, k, width, sortKey, sortDir, onSort }) {
  const active = sortKey === k;
  return (
    <span
      onClick={() => onSort(k)}
      title={title || `Sort by ${label}`}
      style={{
        width,
        textAlign: "right",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        color: active ? ACCENT : MUTED,
      }}
    >
      {label}
      {active ? (sortDir === "desc" ? " ▾" : " ▴") : ""}
    </span>
  );
}

function NeedCard({ r, deltas }) {
  const d = deltas?.get(r.playerId);
  return (
    <div style={{ ...styles.card, flex: "1 1 240px", padding: "14px 16px", margin: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <PosTag pos={r.position} />
          <span style={{ color: "#e2e8f0", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.name}
          </span>
          <span style={{ color: MUTED, fontSize: 11, flexShrink: 0 }}>{r.team || "FA"}</span>
        </span>
        <span style={{ flexShrink: 0 }}>
          <VerdictChip verdict={r.advice.verdict} />
        </span>
      </div>
      <ScoreBar score={r.waiverScore} />
      <div style={{ marginTop: 8, fontSize: 11, color: MUTED, display: "flex", justifyContent: "space-between" }}>
        <span>
          {r.rosPpg != null ? `${fmt(r.rosPpg)} proj PPG` : "no projection"}
          {d?.isNew ? " · new to board" : d?.rankDelta ? ` · ${d.rankDelta > 0 ? "▲" : "▼"}${Math.abs(d.rankDelta)} since last check` : ""}
        </span>
        {r.advice.faabLabel && <span style={{ color: ACCENT }}>{r.advice.faabLabel}</span>}
      </div>
    </div>
  );
}

export default function WaiverTab({
  waiver,
  needs = [],
  surplusPositions = [],
  leagueContext,
  leagueId,
  faabBudget = 0,
}) {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState(null);
  const [posFilter, setPosFilter] = useState("ALL");
  const [hideStash, setHideStash] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [limit, setLimit] = useState(50);
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Fetch all live signals once on mount. Everything degrades to empty on
  // failure — the engine renormalizes weights over whatever arrived.
  useEffect(() => {
    let alive = true;
    (async () => {
      const state = await fetchNflState().catch(() => null);
      const season = Number(state?.season) || null;
      const week = Number(state?.week) || 0;
      const [rosPpg, weekProj, weekly, adds, drops, freshRosters] = await Promise.all([
        season ? fetchSeasonProjectedPpg(season, leagueContext?.ppr ?? 1) : new Map(),
        season && week > 0 ? fetchProjections(season, week) : null,
        season && week > 1
          ? fetchSeasonWeeklyScores(season, week - 1).catch(() => [])
          : [],
        fetchTrendingPlayers("add", 48, 200),
        fetchTrendingPlayers("drop", 48, 200),
        leagueId ? fetchSleeper(`/league/${leagueId}/rosters`).catch(() => null) : null,
      ]);
      if (!alive) return;
      setSignals({ season, week, rosPpg, weekProj, weekly, adds, drops, freshRosters });
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [leagueId, leagueContext?.ppr]);

  const board = useMemo(() => {
    if (!signals || !waiver) return null;
    const { week, rosPpg, weekProj, weekly, adds, drops, freshRosters } = signals;

    // Freshest rostered set wins: someone may have claimed a player since the
    // analysis build. Fall back to the build-time set if the poll failed.
    const rostered = freshRosters
      ? new Set(freshRosters.flatMap((r) => r.players || []))
      : new Set(waiver.rosteredIds || []);

    const candidates = Object.values(waiver.enriched || {}).filter(
      (p) => !rostered.has(String(p.id)),
    ).map((p) => ({ ...p, playerId: String(p.id) }));
    const inPool = new Set(candidates.map((c) => c.playerId));

    const trendingAddsById = new Map(
      (adds || []).map((t) => [String(t.player_id), Number(t.count) || 0]),
    );
    const trendingDropsById = new Map(
      (drops || []).map((t) => [String(t.player_id), Number(t.count) || 0]),
    );

    // Trending players outside the value-ranked pool (deep stashes suddenly
    // relevant — e.g. a backup elevated by a starter injury). They score with
    // a neutral dynasty baseline but surface via the trending signal. Position
    // gate mirrors the pool's league rules (analysis.waiver.allowedPositions)
    // so e.g. trending kickers stay off the board in no-K leagues.
    const allowedPositions = new Set(
      waiver.allowedPositions || ["QB", "RB", "WR", "TE"],
    );
    const liteCandidates = [];
    for (const [id] of trendingAddsById) {
      if (rostered.has(id) || inPool.has(id)) continue;
      const p = waiver.players?.[id];
      if (!p || p.active === false) continue;
      const position = (p.fantasy_positions?.[0] || p.position || "").toUpperCase();
      if (!allowedPositions.has(position)) continue;
      liteCandidates.push({
        playerId: id,
        name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        position,
        team: p.team || null,
        age: p.age ?? null,
        injuryStatus: p.injury_status || null,
      });
    }

    const streaksById = new Map(
      buildPlayerStreaks(weekly || []).map((s) => [String(s.player_id), s]),
    );

    const results = scoreWaiverCandidates({
      candidates,
      liteCandidates,
      streaksById,
      rosProjPpgById: rosPpg || new Map(),
      weekProjById: weekProj?.byPlayerId || new Map(),
      trendingAddsById,
      trendingDropsById,
      needs,
      surplusPositions,
      week,
      faabBudget,
    });

    // Rank deltas vs the last saved board, then roll the snapshot forward when
    // it's stale (so a same-day re-open doesn't wipe the comparison point).
    const boardRows = results.map((r, i) => ({
      playerId: r.playerId,
      rank: i + 1,
      waiverScore: r.waiverScore,
    }));
    let deltas = new Map();
    if (leagueId) {
      let prev = null;
      try {
        prev = JSON.parse(localStorage.getItem(snapshotKey(leagueId)));
      } catch {
        // ignore unreadable snapshot
      }
      if (prev?.board?.length) deltas = buildBoardDeltas(boardRows, prev.board);
      const stale =
        !prev ||
        Date.now() - (prev.savedAt || 0) > SNAPSHOT_MAX_AGE_MS ||
        prev.week !== week;
      if (stale) {
        safeLocalStorageWrite(
          snapshotKey(leagueId),
          JSON.stringify({ savedAt: Date.now(), week, board: boardRows.slice(0, 150) }),
        );
      }
    }

    const rankById = new Map(boardRows.map((row) => [row.playerId, row.rank]));
    return { results, deltas, rankById };
  }, [signals, waiver, needs, surplusPositions, faabBudget, leagueId]);

  const positions = useMemo(() => {
    const set = new Set((board?.results || []).map((r) => r.position));
    return ["ALL", ...["QB", "RB", "WR", "TE", "K", "DEF"].filter((p) => set.has(p))];
  }, [board]);

  const SORT_GETTERS = {
    score: (r) => r.waiverScore,
    wk: (r) => r.weekProj,
    ppg: (r) => r.rosPpg,
    adds: (r) => (r.trendCount > 0 ? r.trendCount : null),
  };

  const visible = useMemo(() => {
    if (!board) return [];
    const q = search.trim().toLowerCase();
    const rows = board.results.filter(
      (r) =>
        (posFilter === "ALL" || r.position === posFilter) &&
        (!hideStash || !r.flags.includes("stash-only")) &&
        (!q || r.name.toLowerCase().includes(q)),
    );
    // Sort by the active column; rows without a value always sink to the
    // bottom so "sort by adds" doesn't surface a wall of dashes.
    const get = SORT_GETTERS[sortKey] || SORT_GETTERS.score;
    const dir = sortDir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return b.waiverScore - a.waiverScore;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir || b.waiverScore - a.waiverScore;
    });
  }, [board, posFilter, hideStash, search, sortKey, sortDir]);

  const needPicks = useMemo(
    () => (board?.results || []).filter((r) => r.flags.includes("fills-need")).slice(0, 3),
    [board],
  );

  const movers = useMemo(() => {
    if (!board) return { risers: [], fallers: [] };
    const withDelta = board.results
      .slice(0, 60)
      .map((r) => ({ r, d: board.deltas.get(r.playerId) }))
      .filter(({ d }) => d && !d.isNew && d.rankDelta !== 0);
    return {
      risers: withDelta.filter(({ d }) => d.rankDelta > 0).sort((a, b) => b.d.rankDelta - a.d.rankDelta).slice(0, 5),
      fallers: withDelta.filter(({ d }) => d.rankDelta < 0).sort((a, b) => a.d.rankDelta - b.d.rankDelta).slice(0, 5),
    };
  }, [board]);

  if (loading || !board) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 220, color: MUTED, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" }}>
        <span className="dyn-spinner" /> Scanning the wire
      </div>
    );
  }

  const { week } = signals;
  const offseason = week <= 0;
  const projectionsUnavailable = !offseason && signals.weekProj?.unavailable && signals.rosPpg?.size === 0;

  return (
    <div>
      {/* ── Header strip ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...styles.sectionLabel, margin: 0 }}>Waiver Wire</span>
          <span style={{ color: MUTED, fontSize: 11 }}>
            {offseason
              ? "Offseason — board runs on dynasty value + add velocity"
              : `Week ${week} · ${signals.season}`}
          </span>
        </div>
        <span style={{ color: MUTED, fontSize: 11 }}>
          {faabBudget > 0 ? `FAAB budget $${faabBudget}` : "Waiver-priority league"}
          {" · "}{board.results.length} free agents scored
        </span>
      </div>

      {projectionsUnavailable && (
        <div style={{ color: "#fbbf24", fontSize: 12, marginBottom: 12 }}>
          Weekly projections unavailable — scores lean on dynasty value, trending, and availability.
        </div>
      )}

      {/* ── Fills your needs ── */}
      {needPicks.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ ...styles.sectionLabel, marginBottom: 10 }}>
            Fills your needs ({needs.join(" · ")})
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {needPicks.map((r) => (
              <NeedCard key={r.playerId} r={r} deltas={board.deltas} />
            ))}
          </div>
        </div>
      )}

      {/* ── Risers / fallers since last check ── */}
      {(movers.risers.length > 0 || movers.fallers.length > 0) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <span style={{ color: MUTED, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>Since last check</span>
          {movers.risers.map(({ r, d }) => (
            <span key={r.playerId} style={{ border: `1px solid ${ACCENT}44`, color: ACCENT, borderRadius: 12, padding: "3px 10px", fontSize: 11 }}>
              ▲{d.rankDelta} {r.name}
            </span>
          ))}
          {movers.fallers.map(({ r, d }) => (
            <span key={r.playerId} style={{ border: "1px solid #f8717144", color: "#f87171", borderRadius: 12, padding: "3px 10px", fontSize: 11 }}>
              ▼{Math.abs(d.rankDelta)} {r.name}
            </span>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {positions.map((p) => (
          <button
            key={p}
            onClick={() => setPosFilter(p)}
            style={{
              padding: "5px 12px", borderRadius: 14, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
              border: `1px solid ${posFilter === p ? ACCENT : "#334155"}`,
              background: posFilter === p ? `${ACCENT}18` : "transparent",
              color: posFilter === p ? ACCENT : MUTED,
            }}
          >
            {p}
          </button>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: MUTED, fontSize: 11, cursor: "pointer", marginLeft: 4 }}>
          <input type="checkbox" checked={hideStash} onChange={(e) => setHideStash(e.target.checked)} />
          Hide stash-only
        </label>
        <input
          placeholder="Search player"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0", fontSize: 12, outline: "none", width: 160 }}
        />
      </div>

      {/* ── Ranked board ── */}
      <div style={styles.card}>
        <div style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: MUTED, borderBottom: `1px solid ${MUTED}22` }}>
          <span style={{ width: 24 }}>#</span>
          <span style={{ flex: 1 }}>Player</span>
          <SortHeader label="Score" k="score" width={110} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
          {!offseason && (
            <SortHeader label="Wk" title="Sort by this-week projection" k="wk" width={58} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
          )}
          <SortHeader label="PPG" title="Sort by projected PPG" k="ppg" width={58} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
          <SortHeader label="Adds" title="Sort by Sleeper adds in the last 48h" k="adds" width={64} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
          <span style={{ width: 96, textAlign: "right" }}>Verdict</span>
        </div>
        {visible.slice(0, limit).map((r) => {
          const rank = board.rankById.get(r.playerId);
          const d = board.deltas.get(r.playerId);
          const isOpen = openId === r.playerId;
          return (
            <div key={r.playerId}>
              <div
                style={{ ...styles.playerRow, gap: 12, cursor: "pointer" }}
                onClick={() => setOpenId(isOpen ? null : r.playerId)}
                title="Tap to see how this score is built"
              >
                <span style={{ width: 24, color: MUTED, fontSize: 12 }}>{rank}</span>
                <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <PosTag pos={r.position} />
                  <span style={{ color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ color: MUTED, fontSize: 11 }}>{r.team || "FA"}</span>
                  {d?.isNew && <span style={{ color: ACCENT, fontSize: 9, fontWeight: 700 }}>NEW</span>}
                  {d && !d.isNew && d.rankDelta !== 0 && (
                    <span style={{ color: d.rankDelta > 0 ? ACCENT : "#f87171", fontSize: 10 }}>
                      {d.rankDelta > 0 ? "▲" : "▼"}{Math.abs(d.rankDelta)}
                    </span>
                  )}
                  <FlagChips flags={r.flags} />
                  <span style={{ color: ACCENT, fontSize: 11, opacity: 0.6 }}>{isOpen ? "▾" : "▸"}</span>
                </span>
                <ScoreBar score={r.waiverScore} />
                {!offseason && (
                  <span style={{ width: 58, textAlign: "right", color: "#cbd5e1", fontSize: 12 }}>{fmt(r.weekProj)}</span>
                )}
                <span style={{ width: 58, textAlign: "right", color: "#cbd5e1", fontSize: 12 }}>{fmt(r.rosPpg)}</span>
                <span style={{ width: 64, textAlign: "right", color: r.trendCount > 0 ? ACCENT : MUTED, fontSize: 12 }}>
                  {r.trendCount > 0 ? `▲${r.trendCount.toLocaleString()}` : "—"}
                </span>
                <span style={{ width: 96, textAlign: "right" }}>
                  <VerdictChip verdict={r.advice.verdict} />
                </span>
              </div>
              {isOpen && <WhyPanel r={r} />}
            </div>
          );
        })}
        {visible.length === 0 && (
          <div style={{ color: MUTED, textAlign: "center", padding: "24px 0", fontSize: 12 }}>
            No free agents match this filter.
          </div>
        )}
        {visible.length > limit && (
          <div style={{ textAlign: "center", paddingTop: 12 }}>
            <button className="dyn-btn-ghost" style={styles.btnGhost} onClick={() => setLimit((l) => l + 50)}>
              Show more ({visible.length - limit} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
