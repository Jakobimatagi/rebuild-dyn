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
  REDRAFT_WAIVER_WEIGHTS,
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
  "young-upside": { label: "YOUNG", color: "#34d399" },
  "stash-only": { label: "STASH", color: "#c084fc" },
};
const SIGNAL_LABELS = {
  dynasty: "Dynasty value",
  projection: "Point projection",
  upside: "Youth upside",
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

// Absolute projected-PPG floors for the "instant production" column — the
// "genuinely startable / flex-worthy" bar by position. Deliberately absolute so
// a backup can't back into the column by topping a weak FA-pool percentile (the
// original bug: a 2-PPG backup QB was the top FA QB by percentile and got
// labeled "production"). A barren wire yields an empty column on purpose —
// that's the honest answer, not a list of the least-bad scrubs.
const PROD_FLOOR = { QB: 12, RB: 7, WR: 7, TE: 5, K: 6, DEF: 5 };

const projPpgOf = (r) => r.rosPpg ?? r.weekProj ?? null;
const isStartable = (r) => {
  const ppg = projPpgOf(r);
  return ppg != null && ppg >= (PROD_FLOOR[r.position] ?? 8);
};

// The one bucket a player belongs to on the wire (priority young > instant >
// shock > stash), shared by the typed columns and the need-card archetype tag
// so a player reads as one archetype everywhere. null = replacement depth.
function classifyBucket(r) {
  const up = r.breakdown.upside ?? 0;
  if (r.age != null && r.age <= 24 && up >= 38) return "young";
  if (isStartable(r)) return "instant";
  if (r.flags.includes("opportunity-shock") || r.flags.includes("trending-riser")) return "shock";
  if (r.flags.includes("stash-only")) return "stash";
  return null;
}

const ARCHETYPE = {
  young: { label: "Young upside", color: "#34d399" },
  instant: { label: "Instant production", color: "#60a5fa" },
  shock: { label: "Opportunity", color: "#f87171" },
  stash: { label: "Deep stash", color: "#c084fc" },
};

// Typed columns for the wire overview. `meta` renders the one metric that
// matters for that player type under each name.
const WIRE_COLUMNS = [
  {
    key: "young",
    label: "Young upside",
    color: "#34d399",
    desc: "Ascending stashes — grab before the points arrive",
    meta: (r) => `age ${r.age ?? "—"} · upside ${Math.round(r.breakdown.upside ?? 0)}${r.dynastyTier ? ` · ${r.dynastyTier}` : ""}`,
  },
  {
    key: "instant",
    label: "Instant production",
    color: "#60a5fa",
    desc: "Plug-and-play points now",
    meta: (r) => `${fmt(projPpgOf(r))} proj PPG · age ${r.age ?? "—"}`,
  },
  {
    key: "shock",
    label: "Opportunity shocks",
    color: "#f87171",
    desc: "Role / injury spikes trending across the platform",
    meta: (r) => `${(r.trendCount || 0).toLocaleString()} adds/48h${r.unprojected ? " · no proj yet" : ` · ${fmt(projPpgOf(r))} PPG`}`,
  },
  {
    key: "stash",
    label: "Deep stashes",
    color: "#c084fc",
    desc: "High long-term value, not scoring yet",
    meta: (r) => `dyn ${Math.round(r.breakdown.dynasty ?? 0)}${r.dynastyTier ? ` · ${r.dynastyTier}` : ""}`,
  },
];

// NFL depth-chart role from the Sleeper slot + age. Slot = "RB2"; kind reads
// the archetype the way a manager would: a backup QB is a handcuff, a backup RB
// is upside if young / a handcuff if not, a rotational WR/TE is upside if young
// / a rotation piece otherwise. Starters (slot 1) are just "starter".
function depthRole(r) {
  const order = r.depthOrder;
  if (order == null || !r.position) return null;
  const slot = `${r.position}${order}`;
  const young = r.age != null && r.age <= 24;
  let kind = null;
  if (order <= 1) kind = "starter";
  else if (r.position === "QB") kind = "handcuff";
  else if (r.position === "RB") kind = young ? "upside" : "handcuff";
  else if (r.position === "WR" || r.position === "TE") kind = young ? "upside" : "rotation";
  else kind = "depth";
  return { slot, kind };
}

const ROLE_COLOR = { starter: "#00f5a0", handcuff: "#fbbf24", upside: "#34d399", rotation: "#60a5fa", depth: "#94a3b8" };

function RoleTag({ r, compact = false }) {
  const role = depthRole(r);
  if (!role) return null;
  const c = ROLE_COLOR[role.kind] || MUTED;
  return (
    <span
      title={`NFL depth chart: ${role.slot} (${role.kind})`}
      style={{ border: `1px solid ${c}55`, color: c, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap", flexShrink: 0 }}
    >
      {compact ? role.slot : `${role.slot} · ${role.kind}`}
    </span>
  );
}

function MiniRow({ r, meta, color, delta }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${MUTED}14` }}>
      <PosTag pos={r.position} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
          <span style={{ color: MUTED, fontSize: 10, flexShrink: 0 }}>{r.team || "FA"}</span>
          {delta?.isNew && <span style={{ color, fontSize: 9, flexShrink: 0 }}>NEW</span>}
          {!delta?.isNew && delta?.rankDelta ? (
            <span style={{ color: delta.rankDelta > 0 ? ACCENT : "#f87171", fontSize: 9, flexShrink: 0 }}>
              {delta.rankDelta > 0 ? "▲" : "▼"}{Math.abs(delta.rankDelta)}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <RoleTag r={r} />
          <span style={{ color: MUTED, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta(r)}</span>
        </div>
      </div>
      <span style={{ color, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{Math.round(r.waiverScore)}</span>
    </div>
  );
}

function WireColumn({ col, players, deltas, limit = 8 }) {
  return (
    <div style={{ ...styles.card, flex: "1 1 220px", minWidth: 220, padding: "12px 14px", margin: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: col.color, display: "inline-block" }} />
        <span style={{ color: col.color, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>{col.label}</span>
        <span style={{ color: MUTED, fontSize: 11, marginLeft: "auto" }}>{players.length}</span>
      </div>
      <div style={{ color: MUTED, fontSize: 10.5, margin: "4px 0 6px" }}>{col.desc}</div>
      {players.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 11, fontStyle: "italic", padding: "8px 0" }}>None on the wire right now.</div>
      ) : (
        players.slice(0, limit).map((r) => (
          <MiniRow key={r.playerId} r={r} meta={col.meta} color={col.color} delta={deltas?.get(r.playerId)} />
        ))
      )}
    </div>
  );
}

function NeedCard({ r, deltas, sub, accent }) {
  const d = deltas?.get(r.playerId);
  const arch = ARCHETYPE[classifyBucket(r)];
  const projText = r.unprojected
    ? "no projection yet"
    : `${fmt(projPpgOf(r))} proj PPG`;
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
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <RoleTag r={r} compact />
        {arch && (
          <span style={{ border: `1px solid ${arch.color}66`, color: arch.color, borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700, letterSpacing: 0.3 }}>
            {arch.label}
          </span>
        )}
      </div>
      <ScoreBar score={r.waiverScore} />
      <div style={{ marginTop: 8, fontSize: 11, color: MUTED, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>
          {sub ?? projText}
          {d?.isNew ? " · new to board" : d?.rankDelta ? ` · ${d.rankDelta > 0 ? "▲" : "▼"}${Math.abs(d.rankDelta)} since last check` : ""}
        </span>
        {r.advice.faabLabel && <span style={{ color: r.unprojected ? "#fbbf24" : accent || ACCENT, textAlign: "right" }}>{r.advice.faabLabel}</span>}
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
      // Redraft drops the long-term dynasty signal; the engine renormalizes the
      // remaining present-season signals over the missing weight.
      ...(leagueContext?.isRedraft ? { weights: REDRAFT_WAIVER_WEIGHTS } : {}),
    });

    // Stamp each row with its NFL depth-chart slot (Sleeper depth_chart_order,
    // 1 = starter) so cards can show the roster role — a QB2 is a handcuff, a
    // young RB3 is upside, a WR2 is playing now. Raw players map is the single
    // source of truth; null = Sleeper hasn't reported a slot.
    for (const r of results) {
      const order = waiver.players?.[r.playerId]?.depth_chart_order;
      r.depthOrder = order != null ? Number(order) : null;
    }

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

  // The wire, split into typed columns so it's not one best-on-top ranking.
  // Each free agent lands in exactly ONE column by priority (young > instant >
  // shock > stash). Players already shown in "Fills your needs" are excluded so
  // they don't repeat — the need card carries their archetype instead. Leftover
  // replacement-level depth stays in the full table below.
  const columns = useMemo(() => {
    const b = { young: [], instant: [], shock: [], stash: [] };
    const needIds = new Set(needPicks.map((r) => r.playerId));
    for (const r of board?.results || []) {
      if (needIds.has(r.playerId)) continue;
      const k = classifyBucket(r);
      if (k) b[k].push(r);
    }
    b.young.sort((x, y) => (y.breakdown.upside ?? 0) - (x.breakdown.upside ?? 0) || y.waiverScore - x.waiverScore);
    b.instant.sort((x, y) => (projPpgOf(y) ?? 0) - (projPpgOf(x) ?? 0) || y.waiverScore - x.waiverScore);
    b.shock.sort((x, y) => (y.trendCount || 0) - (x.trendCount || 0) || y.waiverScore - x.waiverScore);
    b.stash.sort((x, y) => (y.breakdown.dynasty ?? 0) - (x.breakdown.dynasty ?? 0) || y.waiverScore - x.waiverScore);
    return b;
  }, [board, needPicks]);

  // Top-line triage — the state-of-the-wire read a GM wants before the detail.
  const wireVerdict = useMemo(() => {
    if (!board) return null;
    const startable = (board.results || []).filter(isStartable);
    startable.sort((a, b) => (projPpgOf(b) ?? 0) - (projPpgOf(a) ?? 0));
    if (startable.length) {
      const t = startable[0];
      return { tone: "good", text: `${startable.length} startable ${startable.length > 1 ? "adds" : "add"} on the wire — top: ${t.name} (${t.position}, ${fmt(projPpgOf(t))} proj PPG).` };
    }
    const hotShock = [...(board.results || [])]
      .filter((r) => r.trendCount > 0)
      .sort((a, b) => b.trendCount - a.trendCount)[0];
    if (hotShock && hotShock.trendCount >= 3000) {
      return { tone: "warn", text: `Thin wire — no clear starters. Hottest add is ${hotShock.name} (${hotShock.trendCount.toLocaleString()} adds/48h) on a role change; bid your read, not the hype.` };
    }
    const top = (board.results || [])[0];
    return top
      ? { tone: "warn", text: `Thin wire — nothing startable. Best speculative dart: ${top.name} (${top.position}, score ${top.waiverScore}).` }
      : { tone: "warn", text: "No free agents to evaluate." };
  }, [board]);

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

      {/* ── State of the wire: one-line triage before the detail ── */}
      {wireVerdict && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 14px",
            borderRadius: 8, fontSize: 13,
            background: wireVerdict.tone === "good" ? `${ACCENT}12` : "#fbbf2412",
            border: `1px solid ${wireVerdict.tone === "good" ? ACCENT : "#fbbf24"}33`,
            color: "#e2e8f0",
          }}
        >
          <span style={{ fontSize: 14 }}>{wireVerdict.tone === "good" ? "✅" : "⚠️"}</span>
          <span>{wireVerdict.text}</span>
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

      {/* ── Typed columns: the wire by player type ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch", marginBottom: 18 }}>
        {WIRE_COLUMNS.map((col) => (
          <WireColumn key={col.key} col={col} players={columns[col.key]} deltas={board.deltas} />
        ))}
      </div>

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
                  <RoleTag r={r} compact />
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
                  <span style={{ width: 58, textAlign: "right", color: "#cbd5e1", fontSize: 12 }}>{r.weekProj ? fmt(r.weekProj) : "—"}</span>
                )}
                <span style={{ width: 58, textAlign: "right", color: "#cbd5e1", fontSize: 12 }}>{r.rosPpg ? fmt(r.rosPpg) : "—"}</span>
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
