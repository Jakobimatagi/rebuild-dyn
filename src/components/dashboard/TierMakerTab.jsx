import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { fetchPlayersDb } from "../../lib/sleeperApi.js";
import {
  TIERS,
  SCOPES,
  TIER_COLORS,
  emptyBoard,
  findTier,
  boardCount,
  moveCard,
  removeCard,
  clearTier,
  loadBoards,
  saveBoards,
} from "../../lib/tierBoard.js";
import {
  getAccount,
  onAuthChange,
  fetchTierRankings,
  upsertTierRanking,
} from "../../lib/supabase.js";
import TierShareModal from "./TierShareModal.jsx";
import { useIsMobile } from "../../lib/useIsMobile.js";

const POS_COLOR = {
  QB: "#ff6b6b",
  RB: "#00f5a0",
  WR: "#ffd84d",
  TE: "#4dd0ff",
};

const POOL_POSITIONS = ["QB", "RB", "WR", "TE"];
const POOL_PAGE = 24;
const POOL_CAP_ALL = 200;
const POOL_CAP_POS = 100;

function posColor(pos) {
  return POS_COLOR[pos] || "#d9deef";
}

// Sleeper CDN headshot (same source as the Admin boards), with a
// position-tinted initials fallback for players without a portrait.
function PlayerAvatar({ playerId, name, position, size = 44 }) {
  const [errored, setErrored] = useState(false);
  const color = posColor(position);
  const url = playerId
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
      draggable={false}
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        background: "#0d0f17",
        border: `1px solid ${color}55`,
        flexShrink: 0,
        pointerEvents: "none",
      }}
    />
  );
}

// The face card itself — shared by pool, tier rows, and the drag overlay.
// touchAction stays "manipulation" (not "none") so a touch that starts on a
// card can still scroll the page/pool; the TouchSensor's hold delay is what
// separates a scroll from a drag.
function CardFace({ player, dragging = false, compact = false }) {
  const width = compact ? 64 : 74;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        width,
        padding: "8px 4px 6px",
        borderRadius: 10,
        background: dragging ? "#101726" : "#0b1120",
        border: `1px solid ${dragging ? posColor(player.position) : "rgba(255,255,255,0.08)"}`,
        cursor: "grab",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "manipulation",
        flexShrink: 0,
      }}
    >
      <PlayerAvatar playerId={player.id} name={player.name} position={player.position} size={compact ? 36 : 44} />
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: "#e2e8f0",
          textAlign: "center",
          lineHeight: 1.15,
          maxWidth: width - 6,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {player.name}
      </div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: posColor(player.position) }}>
        {player.position} {player.team ? `· ${player.team}` : ""}
      </div>
    </div>
  );
}

// Tap-to-assign popover: appears over a tapped card so touch users (or anyone
// who prefers clicking) can place players without dragging.
function AssignMenu({ placedTier, onAssign, onRemove, onClose }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        marginTop: 4,
        display: "flex",
        gap: 3,
        padding: 5,
        borderRadius: 8,
        background: "#0f172a",
        border: "1px solid rgba(255,255,255,0.15)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {TIERS.map((tier) => (
        <button
          key={tier}
          onClick={() => { onAssign(tier); onClose(); }}
          disabled={tier === placedTier}
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            border: "none",
            background: tier === placedTier ? "#1e293b" : TIER_COLORS[tier],
            color: tier === placedTier ? "#475569" : "#0f172a",
            fontWeight: 800,
            fontSize: 12,
            cursor: tier === placedTier ? "default" : "pointer",
          }}
        >
          {tier}
        </button>
      ))}
      {placedTier && (
        <button
          onClick={() => { onRemove(); onClose(); }}
          title="Send back to the pool"
          style={{
            height: 26,
            padding: "0 7px",
            borderRadius: 6,
            border: "1px solid rgba(255,107,107,0.5)",
            background: "rgba(255,107,107,0.12)",
            color: "#ff6b6b",
            fontWeight: 700,
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

// Fixed-position tier picker for touch screens. The desktop AssignMenu is a
// tiny popover anchored to the tapped card; on a phone that's both hard to hit
// and easy to clip, so this renders as a bar pinned above the pool dock with
// finger-sized buttons instead.
function MobileAssignBar({ player, placedTier, onAssign, onRemove, onClose }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {player.name}
        </span>
        <span style={{ fontSize: 10, color: "#64748b" }}>
          {placedTier ? `in tier ${placedTier} — move to:` : "place in tier:"}
        </span>
        <button
          onClick={onClose}
          aria-label="Cancel"
          style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#94a3b8", fontSize: 16, lineHeight: 1, padding: "4px 6px", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
      {TIERS.map((tier) => (
        <button
          key={tier}
          onClick={() => { onAssign(tier); onClose(); }}
          disabled={tier === placedTier}
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            border: "none",
            background: tier === placedTier ? "#1e293b" : TIER_COLORS[tier],
            color: tier === placedTier ? "#475569" : "#0f172a",
            fontWeight: 800,
            fontSize: 15,
            cursor: tier === placedTier ? "default" : "pointer",
          }}
        >
          {tier}
        </button>
      ))}
      {placedTier && (
        <button
          onClick={() => { onRemove(); onClose(); }}
          style={{
            height: 40,
            padding: "0 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,107,107,0.5)",
            background: "rgba(255,107,107,0.12)",
            color: "#ff6b6b",
            fontWeight: 700,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          ✕ Pool
        </button>
      )}
    </div>
  );
}

// A draggable/sortable face card. dnd-kit's useSortable covers both the tier
// rows (reorder) and the pool (drag out) since every card lives in some
// SortableContext. Placed cards get an ✕ badge that sends them back to the
// pool without dragging. inlineAssign=false suppresses the anchored popover so
// the mobile layout can show its fixed MobileAssignBar instead.
function SortableCard({ player, placedTier, assignOpen, onToggleAssign, onAssign, onRemove, compact = false, inlineAssign = true }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: player.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onToggleAssign(player.id); }}
      style={{
        position: "relative",
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <CardFace player={player} compact={compact} />
      {placedTier && !isDragging && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(player.id); }}
          title="Send back to the pool"
          style={{
            position: "absolute",
            top: -5,
            right: -5,
            zIndex: 5,
            width: compact ? 20 : 16,
            height: compact ? 20 : 16,
            borderRadius: "50%",
            border: "1px solid rgba(255,107,107,0.6)",
            background: "#1a0f14",
            color: "#ff6b6b",
            fontSize: compact ? 11 : 9,
            fontWeight: 700,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ✕
        </button>
      )}
      {assignOpen && inlineAssign && (
        <AssignMenu
          placedTier={placedTier}
          onAssign={(tier) => onAssign(player.id, tier)}
          onRemove={() => onRemove(player.id)}
          onClose={() => onToggleAssign(null)}
        />
      )}
    </div>
  );
}

// One S–E row: colored tier block on the left, droppable card shelf on the
// right.
function TierRow({ tier, players, onClear, renderCard, compact = false }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tier-${tier}` });
  const color = TIER_COLORS[tier];
  const minHeight = compact ? 82 : 96;
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div
        style={{
          width: compact ? 42 : 54,
          minHeight,
          background: color,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: compact ? 20 : 26, fontWeight: 900, color: "#0f172a" }}>{tier}</span>
        {players.length > 0 && (
          <button
            onClick={onClear}
            title={`Clear tier ${tier}`}
            style={{
              border: "none",
              background: "rgba(15,23,42,0.25)",
              color: "#0f172a",
              borderRadius: 4,
              fontSize: 8,
              fontWeight: 700,
              padding: "2px 5px",
              cursor: "pointer",
              letterSpacing: 0.5,
            }}
          >
            CLEAR
          </button>
        )}
      </div>
      <SortableContext items={players.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div
          ref={setNodeRef}
          style={{
            flex: 1,
            // Without an explicit minWidth the shelf's auto minimum is its
            // single-line width, so long rows clip instead of wrapping.
            minWidth: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: compact ? 6 : 8,
            minHeight,
            background: isOver ? `${color}14` : "rgba(2,6,23,0.6)",
            transition: "background 0.15s",
          }}
        >
          {players.map(renderCard)}
          {players.length === 0 && (
            <span style={{ alignSelf: "center", fontSize: 10, color: "#334155", letterSpacing: 1, textTransform: "uppercase", paddingLeft: 6 }}>
              Drag players here
            </span>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export default function TierMakerTab({ rosterAuditSource }) {
  const [playersDb, setPlayersDb] = useState(null);
  const [loadError, setLoadError] = useState("");

  // Boards for every scope live together so switching scope never resets
  // anything. Hydrate synchronously from localStorage.
  const [{ boards, titles }, setDoc] = useState(() => {
    const { boards, titles } = loadBoards();
    return { boards, titles };
  });
  const [scope, setScope] = useState("ALL");
  const [search, setSearch] = useState("");
  const [poolPos, setPoolPos] = useState("ALL"); // pool-only filter in ALL scope
  const [visible, setVisible] = useState(POOL_PAGE);
  const [activeId, setActiveId] = useState(null);
  const [assignId, setAssignId] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showShare, setShowShare] = useState(false);

  // Mobile: the pool becomes a fixed bottom dock (collapsible) and card taps
  // open a fixed assign bar instead of the anchored popover.
  const isMobile = useIsMobile();
  const [poolOpen, setPoolOpen] = useState(true);

  // Cloud sync
  const [account, setAccount] = useState(null);
  const [cloudStatus, setCloudStatus] = useState(""); // "", saving, saved, error
  const remoteMergedFor = useRef(null);

  const board = boards[scope] || emptyBoard();
  const title = titles[scope] || "";

  useEffect(() => {
    let cancelled = false;
    fetchPlayersDb()
      .then((db) => { if (!cancelled) setPlayersDb(db); })
      .catch((err) => { if (!cancelled) setLoadError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    getAccount().then(setAccount).catch(() => {});
    return onAuthChange(setAccount);
  }, []);

  // Pull saved boards once per signed-in user. A remote board wins over the
  // local draft when the remote row is newer than the last local write.
  useEffect(() => {
    if (!account?.id || remoteMergedFor.current === account.id) return;
    remoteMergedFor.current = account.id;
    fetchTierRankings(account.id)
      .then((rows) => {
        if (!rows.length) return;
        const { updatedAt: localUpdatedAt } = loadBoards();
        setDoc((prev) => {
          const nextBoards = { ...prev.boards };
          const nextTitles = { ...prev.titles };
          for (const row of rows) {
            if (!SCOPES.includes(row.position_scope)) continue;
            const remoteNewer =
              new Date(row.updated_at).getTime() > localUpdatedAt ||
              boardCount(nextBoards[row.position_scope]) === 0;
            if (remoteNewer) {
              nextBoards[row.position_scope] = {
                ...emptyBoard(),
                ...Object.fromEntries(
                  TIERS.map((t) => [t, (row.tiers?.[t] || []).map(String)]),
                ),
              };
              if (row.title) nextTitles[row.position_scope] = row.title;
            }
          }
          return { boards: nextBoards, titles: nextTitles };
        });
      })
      .catch((err) => console.warn("Tier boards: cloud load failed", err));
  }, [account]);

  // Debounced local autosave on every mutation.
  useEffect(() => {
    const t = setTimeout(() => saveBoards(boards, titles), 500);
    return () => clearTimeout(t);
  }, [boards, titles]);

  const setBoard = (updater) => {
    setDoc((prev) => {
      const current = prev.boards[scope] || emptyBoard();
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next === current) return prev;
      return { ...prev, boards: { ...prev.boards, [scope]: next } };
    });
    setCloudStatus("");
  };

  // ── Player pool ────────────────────────────────────────────────────────────
  // RosterAudit overall rank per sleeper id — the pool's primary sort order.
  const raRankById = useMemo(() => {
    const map = new Map();
    for (const row of rosterAuditSource?.rankings || []) {
      const sid = String(row.sleeper_id || "");
      const rank = Number(row.rank_overall);
      if (sid && rank > 0 && !map.has(sid)) map.set(sid, rank);
    }
    return map;
  }, [rosterAuditSource]);

  const allPlayers = useMemo(() => {
    if (!playersDb) return [];
    const list = [];
    for (const [id, p] of Object.entries(playersDb)) {
      if (!p?.active || !POOL_POSITIONS.includes(p.position)) continue;
      list.push({
        id: String(id),
        name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        position: p.position,
        team: p.team || "",
        raRank: raRankById.get(String(id)) ?? null,
        rank: Number(p.search_rank) || 9999999,
      });
    }
    // RosterAudit-ranked players first in RA order; everyone else after,
    // ordered by Sleeper search rank.
    list.sort(
      (a, b) =>
        (a.raRank ?? Infinity) - (b.raRank ?? Infinity) || a.rank - b.rank,
    );
    return list;
  }, [playersDb, raRankById]);

  const playerById = useMemo(() => {
    const map = new Map();
    for (const p of allPlayers) map.set(p.id, p);
    return map;
  }, [allPlayers]);

  const placedIds = useMemo(() => {
    const set = new Set();
    for (const tier of TIERS) for (const id of board[tier]) set.add(id);
    return set;
  }, [board]);

  const pool = useMemo(() => {
    const scopePos = scope === "ALL" ? null : scope;
    const q = search.trim().toLowerCase();
    const out = [];
    const cap = q
      ? 60
      : scope === "ALL" ? POOL_CAP_ALL : POOL_CAP_POS;
    for (const p of allPlayers) {
      if (scopePos && p.position !== scopePos) continue;
      if (!scopePos && poolPos !== "ALL" && p.position !== poolPos) continue;
      if (placedIds.has(p.id)) continue;
      if (q && !p.name.toLowerCase().includes(q)) continue;
      out.push(p);
      if (out.length >= cap) break;
    }
    return out;
  }, [allPlayers, scope, poolPos, search, placedIds]);

  const poolVisible = pool.slice(0, visible);

  useEffect(() => { setVisible(POOL_PAGE); }, [scope, poolPos, search]);

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  // Drop where the pointer actually is. closestCorners kept resolving to the
  // top (S) row because the tall pool sidebar skews corner distances; pointer
  // containment has no such bias. rectIntersection covers the touch case
  // where the pointer can sit outside the dragged card's rect.
  const collisionDetection = (args) => {
    const withPointer = pointerWithin(args);
    return withPointer.length ? withPointer : rectIntersection(args);
  };

  // Resolve what container a droppable/sortable id belongs to.
  const containerOf = (id) => {
    if (id == null) return null;
    const key = String(id);
    if (key === "pool") return "pool";
    if (key.startsWith("tier-")) return key.slice(5);
    const tier = findTier(board, key);
    return tier || "pool";
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const id = String(active.id);
    const target = containerOf(over.id);
    if (!target) return;
    if (target === "pool") {
      setBoard((b) => removeCard(b, id));
      return;
    }
    // Dropping onto a card: insert at that card's index; onto the row: append.
    const overId = String(over.id);
    let index;
    if (!overId.startsWith("tier-") && overId !== id) {
      const row = board[target] || [];
      const at = row.indexOf(overId);
      if (at >= 0) index = at;
    }
    setBoard((b) => moveCard(b, id, target, index));
  };

  const assignPlayer = (id, tier) => setBoard((b) => moveCard(b, id, tier));
  const removePlayer = (id) => setBoard((b) => removeCard(b, id));
  const toggleAssign = (id) => setAssignId((cur) => (cur === id ? null : id));

  const resetBoard = () => {
    setBoard(emptyBoard());
    setConfirmReset(false);
  };

  // ── Cloud save ─────────────────────────────────────────────────────────────
  const saveToCloud = async () => {
    if (!account?.id) return;
    setCloudStatus("saving");
    try {
      await upsertTierRanking({
        userId: account.id,
        positionScope: scope,
        title: title || null,
        tiers: board,
      });
      setCloudStatus("saved");
    } catch (err) {
      console.warn("Tier boards: cloud save failed", err);
      setCloudStatus("error");
    }
  };

  const activePlayer = activeId ? playerById.get(activeId) : null;
  const assignPlayerCard = assignId ? playerById.get(assignId) : null;
  const placedCount = boardCount(board);

  const renderCard = (player) => (
    <SortableCard
      key={player.id}
      player={player}
      placedTier={findTier(board, player.id)}
      assignOpen={assignId === player.id}
      onToggleAssign={toggleAssign}
      onAssign={assignPlayer}
      onRemove={removePlayer}
      compact={isMobile}
      inlineAssign={!isMobile}
    />
  );

  // Pool droppable (dragging a placed card here removes it).
  const { setNodeRef: setPoolRef, isOver: poolOver } = useDroppable({ id: "pool" });

  if (loadError) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#ff6b6b", fontSize: 13 }}>
        Couldn't load the Sleeper player database: {loadError}
      </div>
    );
  }

  if (!playersDb) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 220, color: "#94a3b8", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" }}>
        <span className="dyn-spinner" /> Loading players
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        // Leave room under the tier rows for the fixed pool dock.
        paddingBottom: isMobile ? (poolOpen ? 250 : 90) : 0,
      }}
      onClick={() => assignId && setAssignId(null)}
    >
      {/* Header / controls */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#00f5a0", fontWeight: 700 }}>
            Tier Maker
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            Drag player cards into tiers — or tap a card to place it. Download the board to share.
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap" }}>
          {SCOPES.map((s) => {
            const active = scope === s;
            const count = boardCount(boards[s] || emptyBoard());
            return (
              <button
                key={s}
                onClick={() => { setScope(s); setAssignId(null); }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1,
                  border: `1px solid ${active ? "rgba(0,245,160,0.6)" : "rgba(255,255,255,0.1)"}`,
                  background: active ? "rgba(0,245,160,0.12)" : "rgba(15,23,42,0.6)",
                  color: active ? "#00f5a0" : "#94a3b8",
                  cursor: "pointer",
                }}
              >
                {s === "ALL" ? "All Players" : `${s} Rankings`}
                {count > 0 ? ` · ${count}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* Title + save/share row */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <input
          value={title}
          onChange={(e) => {
            const v = e.target.value;
            setDoc((prev) => ({ ...prev, titles: { ...prev.titles, [scope]: v } }));
            setCloudStatus("");
          }}
          placeholder={scope === "ALL" ? "My Dynasty Tiers" : `My ${scope} Rankings`}
          maxLength={60}
          style={{
            flex: "1 1 220px",
            maxWidth: 340,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(2,6,23,0.7)",
            color: "#e2e8f0",
            // 16px on touch screens so iOS doesn't auto-zoom into the field.
            fontSize: isMobile ? 16 : 13,
            outline: "none",
          }}
        />
        {account ? (
          <button
            onClick={saveToCloud}
            disabled={cloudStatus === "saving"}
            className="dyn-btn-ghost"
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              border: "1px solid rgba(0,245,160,0.5)",
              background: "rgba(0,245,160,0.1)",
              color: "#00f5a0",
              cursor: "pointer",
            }}
          >
            {cloudStatus === "saving" ? "Saving…" : "Save board"}
          </button>
        ) : (
          <span style={{ fontSize: 10, color: "#64748b" }}>
            Autosaved to this browser — sign in to sync across devices
          </span>
        )}
        {cloudStatus === "saved" && <span style={{ fontSize: 10, color: "#00f5a0" }}>Saved ✓</span>}
        {cloudStatus === "error" && <span style={{ fontSize: 10, color: "#ff6b6b" }}>Save failed — try again</span>}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {confirmReset ? (
            <>
              <span style={{ fontSize: 10, color: "#ff9f4d", alignSelf: "center" }}>Clear the whole {scope} board?</span>
              <button
                onClick={resetBoard}
                style={{ padding: "8px 12px", borderRadius: 8, fontSize: 10, fontWeight: 700, border: "1px solid rgba(255,107,107,0.6)", background: "rgba(255,107,107,0.15)", color: "#ff6b6b", cursor: "pointer" }}
              >
                Yes, reset
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                style={{ padding: "8px 12px", borderRadius: 8, fontSize: 10, fontWeight: 700, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#94a3b8", cursor: "pointer" }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              disabled={placedCount === 0}
              style={{ padding: "8px 12px", borderRadius: 8, fontSize: 10, fontWeight: 700, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: placedCount ? "#94a3b8" : "#334155", cursor: placedCount ? "pointer" : "default" }}
            >
              Reset board
            </button>
          )}
          <button
            onClick={() => setShowShare(true)}
            disabled={placedCount === 0}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              border: "1px solid rgba(77,208,255,0.6)",
              background: placedCount ? "rgba(77,208,255,0.12)" : "rgba(15,23,42,0.6)",
              color: placedCount ? "#4dd0ff" : "#334155",
              cursor: placedCount ? "pointer" : "default",
            }}
          >
            📤 Download image
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={({ active }) => { setActiveId(String(active.id)); setAssignId(null); }}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        {/* Desktop: tier rows on the left, the draggable player pool as a
            sticky sidebar on the right so cards stay within reach of every
            tier. Mobile: full-width tier rows with the pool as a fixed bottom
            dock — a horizontally scrolling card strip that's always in thumb
            reach, collapsible to get it out of the way. */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
          {/* Tier rows */}
          <div style={{ flex: "3 1 460px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {TIERS.map((tier) => (
              <TierRow
                key={tier}
                tier={tier}
                players={board[tier].map((id) => playerById.get(id)).filter(Boolean)}
                onClear={() => setBoard((b) => clearTier(b, tier))}
                renderCard={renderCard}
                compact={isMobile}
              />
            ))}
          </div>

          {/* Pool: sticky sidebar (desktop) / fixed bottom dock (mobile) */}
          <div
            style={
              isMobile
                ? {
                    position: "fixed",
                    left: 8,
                    right: 8,
                    bottom: 8,
                    zIndex: 40,
                    display: "flex",
                    flexDirection: "column",
                    maxHeight: "55vh",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(4,8,22,0.97)",
                    boxShadow: "0 -10px 34px rgba(0,0,0,0.55)",
                    paddingBottom: "env(safe-area-inset-bottom)",
                  }
                : {
                    flex: "1 1 260px",
                    minWidth: 250,
                    maxWidth: 380,
                    position: "sticky",
                    top: 10,
                    alignSelf: "flex-start",
                    maxHeight: "calc(100vh - 20px)",
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(2,6,23,0.6)",
                  }
            }
          >
            {isMobile && assignPlayerCard && (
              <MobileAssignBar
                player={assignPlayerCard}
                placedTier={findTier(board, assignPlayerCard.id)}
                onAssign={(tier) => assignPlayer(assignPlayerCard.id, tier)}
                onRemove={() => removePlayer(assignPlayerCard.id)}
                onClose={() => setAssignId(null)}
              />
            )}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
                Player pool
              </span>
              {isMobile && (
                <button
                  onClick={() => setPoolOpen((v) => !v)}
                  aria-label={poolOpen ? "Collapse player pool" : "Expand player pool"}
                  style={{
                    order: 10,
                    marginLeft: "auto",
                    padding: "4px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(15,23,42,0.8)",
                    color: "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  {poolOpen ? "▾" : "▴"}
                </button>
              )}
              {(!isMobile || poolOpen) && scope !== "ALL" && (
                <span
                  title={`This board only ranks ${scope}s — switch to All Players for every position`}
                  style={{
                    padding: "3px 9px",
                    borderRadius: 6,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1,
                    border: `1px solid ${posColor(scope)}55`,
                    background: `${posColor(scope)}14`,
                    color: posColor(scope),
                  }}
                >
                  🔒 {scope} only
                </span>
              )}
              {(!isMobile || poolOpen) && scope === "ALL" && (
                <div style={{ display: "flex", gap: 4 }}>
                  {["ALL", ...POOL_POSITIONS].map((pos) => {
                    const active = poolPos === pos;
                    const color = pos === "ALL" ? "#94a3b8" : posColor(pos);
                    return (
                      <button
                        key={pos}
                        onClick={() => setPoolPos(pos)}
                        style={{
                          padding: isMobile ? "6px 11px" : "3px 9px",
                          borderRadius: 6,
                          fontSize: isMobile ? 11 : 9,
                          fontWeight: 700,
                          letterSpacing: 1,
                          border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
                          background: active ? `${color}1e` : "transparent",
                          color: active ? color : "#64748b",
                          cursor: "pointer",
                        }}
                      >
                        {pos}
                      </button>
                    );
                  })}
                </div>
              )}
              {(!isMobile || poolOpen) && (
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search players…"
                  style={{
                    flex: "1 1 120px",
                    minWidth: 0,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(15,23,42,0.8)",
                    color: "#e2e8f0",
                    // 16px on touch screens so iOS doesn't auto-zoom into the field.
                    fontSize: isMobile ? 16 : 12,
                    outline: "none",
                  }}
                />
              )}
            </div>
            {(!isMobile || poolOpen) && (
              <>
                <SortableContext items={poolVisible.map((p) => p.id)} strategy={rectSortingStrategy}>
                  <div
                    ref={setPoolRef}
                    style={{
                      display: "flex",
                      // Mobile dock: a single horizontally scrolling strip
                      // keeps the dock short so the board stays visible above.
                      flexWrap: isMobile ? "nowrap" : "wrap",
                      gap: 6,
                      padding: 10,
                      minHeight: isMobile ? 0 : 100,
                      overflowY: isMobile ? "hidden" : "auto",
                      overflowX: isMobile ? "auto" : "visible",
                      WebkitOverflowScrolling: "touch",
                      background: poolOver ? "rgba(255,107,107,0.06)" : "transparent",
                      transition: "background 0.15s",
                    }}
                  >
                    {poolVisible.map(renderCard)}
                    {poolVisible.length === 0 && (
                      <span style={{ alignSelf: "center", fontSize: 11, color: "#475569", padding: 8 }}>
                        {search ? "No players match that search." : "Every listed player is on the board."}
                      </span>
                    )}
                  </div>
                </SortableContext>
                {pool.length > visible && (
                  <div style={{ padding: "8px 10px 10px", textAlign: "center", flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <button
                      onClick={() => setVisible((v) => v + POOL_PAGE)}
                      style={{ padding: "7px 16px", borderRadius: 8, fontSize: 10, fontWeight: 700, letterSpacing: 1, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15,23,42,0.8)", color: "#94a3b8", cursor: "pointer" }}
                    >
                      Show more ({pool.length - visible} more)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activePlayer ? <CardFace player={activePlayer} dragging compact={isMobile} /> : null}
        </DragOverlay>
      </DndContext>

      {showShare && (
        <TierShareModal
          board={board}
          scope={scope}
          title={title || (scope === "ALL" ? "My Dynasty Tiers" : `My ${scope} Rankings`)}
          playerById={playerById}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
