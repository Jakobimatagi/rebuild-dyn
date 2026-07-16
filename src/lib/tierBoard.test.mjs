/**
 * Unit tests for tierBoard.js
 * Run with: npm test (Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TIERS,
  SCOPES,
  emptyBoard,
  emptyBoards,
  normalizeBoard,
  findTier,
  boardCount,
  moveCard,
  removeCard,
  clearTier,
} from "./tierBoard.js";

describe("emptyBoard / emptyBoards", () => {
  it("has every tier as an empty array", () => {
    const board = emptyBoard();
    assert.deepEqual(Object.keys(board), TIERS);
    for (const tier of TIERS) assert.deepEqual(board[tier], []);
  });

  it("builds one board per scope", () => {
    assert.deepEqual(Object.keys(emptyBoards()), SCOPES);
  });
});

describe("normalizeBoard", () => {
  it("handles garbage input", () => {
    assert.deepEqual(normalizeBoard(null), emptyBoard());
    assert.deepEqual(normalizeBoard("nope"), emptyBoard());
    assert.deepEqual(normalizeBoard({ S: "not-an-array" }), emptyBoard());
  });

  it("stringifies ids and drops duplicates across tiers", () => {
    const board = normalizeBoard({ S: [4046, "4046", "1234"], A: ["1234", "9999"] });
    assert.deepEqual(board.S, ["4046", "1234"]);
    assert.deepEqual(board.A, ["9999"]);
  });

  it("ignores unknown tier keys", () => {
    const board = normalizeBoard({ F: ["1"], S: ["2"] });
    assert.deepEqual(board.S, ["2"]);
    assert.equal(boardCount(board), 1);
  });
});

describe("moveCard", () => {
  it("appends a pool player to the target tier", () => {
    const board = moveCard(emptyBoard(), "4046", "S");
    assert.deepEqual(board.S, ["4046"]);
  });

  it("moves a player between tiers without duplicating", () => {
    let board = moveCard(emptyBoard(), "4046", "S");
    board = moveCard(board, "4046", "B");
    assert.deepEqual(board.S, []);
    assert.deepEqual(board.B, ["4046"]);
    assert.equal(boardCount(board), 1);
  });

  it("inserts at an explicit index for reordering", () => {
    let board = emptyBoard();
    board = moveCard(board, "1", "A");
    board = moveCard(board, "2", "A");
    board = moveCard(board, "3", "A");
    board = moveCard(board, "3", "A", 0); // drag last card to the front
    assert.deepEqual(board.A, ["3", "1", "2"]);
  });

  it("appends when the index is out of range and rejects bad tiers", () => {
    let board = moveCard(emptyBoard(), "1", "A", 99);
    assert.deepEqual(board.A, ["1"]);
    assert.equal(moveCard(board, "1", "F"), board);
  });

  it("never mutates the input board", () => {
    const before = moveCard(emptyBoard(), "1", "S");
    const snapshot = JSON.parse(JSON.stringify(before));
    moveCard(before, "1", "E");
    assert.deepEqual(before, snapshot);
  });
});

describe("removeCard", () => {
  it("sends a placed player back to the pool", () => {
    const board = removeCard(moveCard(emptyBoard(), "4046", "S"), "4046");
    assert.equal(boardCount(board), 0);
  });

  it("returns the same object when the player is not placed", () => {
    const board = emptyBoard();
    assert.equal(removeCard(board, "4046"), board);
  });
});

describe("findTier / clearTier", () => {
  it("finds the tier a player sits in", () => {
    const board = moveCard(emptyBoard(), "4046", "C");
    assert.equal(findTier(board, "4046"), "C");
    assert.equal(findTier(board, 4046), "C"); // numeric ids coerce
    assert.equal(findTier(board, "other"), null);
  });

  it("clears a single tier and leaves the rest", () => {
    let board = moveCard(emptyBoard(), "1", "S");
    board = moveCard(board, "2", "A");
    board = clearTier(board, "S");
    assert.deepEqual(board.S, []);
    assert.deepEqual(board.A, ["2"]);
    assert.equal(clearTier(board, "S"), board); // already empty → same object
  });
});
