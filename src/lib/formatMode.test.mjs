/**
 * Unit tests for format-mode detection (dynasty vs redraft).
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveFormatMode, isValidFormatMode, formatModeLabel } from "./formatMode.js";

describe("deriveFormatMode", () => {
  it("treats Sleeper type 2 as dynasty", () => {
    assert.equal(deriveFormatMode({ settings: { type: 2 } }), "dynasty");
  });
  it("treats type 0 (redraft) and type 1 (keeper) as redraft", () => {
    assert.equal(deriveFormatMode({ settings: { type: 0 } }), "redraft");
    assert.equal(deriveFormatMode({ settings: { type: 1 } }), "redraft");
  });
  it("falls back to the league name when type is missing", () => {
    assert.equal(deriveFormatMode({ name: "The Dynasty League" }), "dynasty");
    assert.equal(deriveFormatMode({ name: "2026 Redraft Home League" }), "redraft");
    assert.equal(deriveFormatMode({ name: "Best Ball Keeper" }), "redraft");
  });
  it("defaults to dynasty when nothing is known", () => {
    assert.equal(deriveFormatMode({}), "dynasty");
    assert.equal(deriveFormatMode(null), "dynasty");
    assert.equal(deriveFormatMode({ name: "Just A League" }), "dynasty");
  });
  it("prefers explicit type over the name", () => {
    // A redraft league that happens to have 'dynasty' in the name is still redraft.
    assert.equal(deriveFormatMode({ settings: { type: 0 }, name: "Fake Dynasty" }), "redraft");
  });
});

describe("isValidFormatMode / formatModeLabel", () => {
  it("validates known modes", () => {
    assert.ok(isValidFormatMode("dynasty"));
    assert.ok(isValidFormatMode("redraft"));
    assert.ok(!isValidFormatMode("keeper"));
    assert.ok(!isValidFormatMode(""));
  });
  it("labels modes", () => {
    assert.equal(formatModeLabel("redraft"), "Redraft");
    assert.equal(formatModeLabel("dynasty"), "Dynasty");
  });
});
