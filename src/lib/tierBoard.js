// Pure state helpers for the Tier Maker board (S–E tier rows of Sleeper
// player ids) plus localStorage (de)serialization. Kept free of other lib
// imports so the node test runner can load it without a browser shim.

export const TIERS = ["S", "A", "B", "C", "D", "E"];

// One independent board per scope. "ALL" mixes positions; the rest are
// single-position boards. Switching scope never resets anything.
export const SCOPES = ["ALL", "QB", "RB", "WR", "TE"];

// Classic tiermaker row palette (dark letter text on each).
export const TIER_COLORS = {
  S: "#ff7f7f",
  A: "#ffbf7f",
  B: "#ffdf80",
  C: "#ffff7f",
  D: "#bfff7f",
  E: "#7fff7f",
};

const STORAGE_KEY = "dyn_tier_boards_v1";

export function emptyBoard() {
  return Object.fromEntries(TIERS.map((t) => [t, []]));
}

export function emptyBoards() {
  return Object.fromEntries(SCOPES.map((s) => [s, emptyBoard()]));
}

// Coerce anything (bad localStorage payloads, older versions) into a valid
// board: every tier present, ids as strings, no duplicates across tiers.
export function normalizeBoard(raw) {
  const board = emptyBoard();
  if (!raw || typeof raw !== "object") return board;
  const seen = new Set();
  for (const tier of TIERS) {
    const ids = Array.isArray(raw[tier]) ? raw[tier] : [];
    for (const id of ids) {
      const key = String(id);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      board[tier].push(key);
    }
  }
  return board;
}

// Tier key containing the player, or null when they're still in the pool.
export function findTier(board, playerId) {
  const id = String(playerId);
  for (const tier of TIERS) {
    if (board[tier].includes(id)) return tier;
  }
  return null;
}

export function boardCount(board) {
  return TIERS.reduce((n, tier) => n + board[tier].length, 0);
}

// Move a player into `toTier` at `toIndex` (append when omitted/out of
// range), removing them from wherever they currently sit. Returns a new
// board; the input is never mutated.
export function moveCard(board, playerId, toTier, toIndex) {
  if (!TIERS.includes(toTier)) return board;
  const id = String(playerId);
  const next = {};
  for (const tier of TIERS) next[tier] = board[tier].filter((p) => p !== id);
  const row = next[toTier];
  const at =
    Number.isInteger(toIndex) && toIndex >= 0 && toIndex <= row.length
      ? toIndex
      : row.length;
  row.splice(at, 0, id);
  return next;
}

// Send a player back to the pool. Returns the same board object when the
// player wasn't placed, so callers can cheap-compare to skip re-renders.
export function removeCard(board, playerId) {
  const id = String(playerId);
  if (!findTier(board, id)) return board;
  const next = {};
  for (const tier of TIERS) next[tier] = board[tier].filter((p) => p !== id);
  return next;
}

export function clearTier(board, tier) {
  if (!TIERS.includes(tier) || board[tier].length === 0) return board;
  return { ...board, [tier]: [] };
}

// ── localStorage persistence ─────────────────────────────────────────────────
// Doc shape: { version: 1, boards: { [scope]: board }, titles: { [scope]: str },
//              updatedAt }

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadBoards() {
  const empty = { boards: emptyBoards(), titles: {}, updatedAt: 0 };
  const store = storage();
  if (!store) return empty;
  try {
    const raw = JSON.parse(store.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return empty;
    const boards = emptyBoards();
    if (raw.boards && typeof raw.boards === "object") {
      for (const scope of SCOPES) {
        boards[scope] = normalizeBoard(raw.boards[scope]);
      }
    }
    const titles = {};
    if (raw.titles && typeof raw.titles === "object") {
      for (const scope of SCOPES) {
        if (typeof raw.titles[scope] === "string") titles[scope] = raw.titles[scope];
      }
    }
    return { boards, titles, updatedAt: Number(raw.updatedAt) || 0 };
  } catch {
    return empty;
  }
}

export function saveBoards(boards, titles = {}) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, boards, titles, updatedAt: Date.now() }),
    );
  } catch {
    // Quota/private-mode failures just mean no local draft — not fatal.
  }
}
