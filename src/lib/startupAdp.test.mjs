/**
 * Unit tests for startupAdp.js — community-feed → Sleeper-id ADP mapping.
 * Run with: npm test (Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizePlayerName,
  buildSleeperIndex,
  extractFeedPlayer,
  mapFeedToSleeper,
  rankByValue,
} from "./startupAdp.js";

const sleeperPlayers = {
  "1001": { full_name: "A.J. Brown", position: "WR" },
  "1002": { first_name: "Bijan", last_name: "Robinson", position: "RB" },
  "1003": { full_name: "Patrick Mahomes II", position: "QB" },
  "9999": { full_name: "Some Kicker", position: "K" }, // skipped (non-skill)
};

describe("normalizePlayerName", () => {
  it("strips punctuation and suffixes", () => {
    assert.equal(normalizePlayerName("A.J. Brown"), "aj brown");
    assert.equal(normalizePlayerName("Patrick Mahomes II"), "patrick mahomes");
    assert.equal(normalizePlayerName("Marvin Harrison Jr."), "marvin harrison");
  });
});

describe("buildSleeperIndex", () => {
  it("indexes skill players by name|pos and skips non-skill", () => {
    const idx = buildSleeperIndex(sleeperPlayers);
    assert.equal(idx.get("aj brown|WR"), "1001");
    assert.equal(idx.get("bijan robinson|RB"), "1002");
    assert.equal(idx.get("patrick mahomes|QB"), "1003");
    assert.equal([...idx.keys()].some((k) => k.endsWith("|K")), false);
  });
});

describe("extractFeedPlayer", () => {
  it("reads KTC-style format value objects", () => {
    const row = { playerName: "Bijan Robinson", position: "RB", superflexValues: { value: 8200 } };
    assert.deepEqual(extractFeedPlayer(row, "superflexValues"), {
      name: "Bijan Robinson", position: "RB", value: 8200, sleeperId: null,
    });
  });
  it("falls back to a flat value field and a direct sleeper id", () => {
    const row = { name: "A.J. Brown", position: "wr", value: 7000, sleeperId: "1001" };
    const fp = extractFeedPlayer(row, "superflexValues");
    assert.equal(fp.value, 7000);
    assert.equal(fp.sleeperId, "1001");
    assert.equal(fp.position, "WR");
  });
  it("rejects rows without a usable value or skill position", () => {
    assert.equal(extractFeedPlayer({ name: "X", position: "K", value: 9 }, "superflexValues"), null);
    assert.equal(extractFeedPlayer({ name: "Y", position: "WR" }, "superflexValues"), null);
  });
});

describe("mapFeedToSleeper", () => {
  const idx = buildSleeperIndex(sleeperPlayers);
  it("maps by name when no sleeper id, drops unmatched, dedupes to top value", () => {
    const feed = [
      { playerName: "A.J. Brown", position: "WR", superflexValues: { value: 7000 } },
      { playerName: "AJ Brown", position: "WR", superflexValues: { value: 7200 } }, // dupe, higher
      { playerName: "Nobody Here", position: "TE", superflexValues: { value: 5000 } }, // unmatched
    ];
    const mapped = mapFeedToSleeper(feed, idx, "superflexValues");
    assert.equal(mapped.length, 1);
    assert.equal(mapped[0].sleeper_id, "1001");
    assert.equal(mapped[0].value, 7200);
  });
});

describe("rankByValue", () => {
  it("ranks highest value as ADP rank 1", () => {
    const ranked = rankByValue([
      { sleeper_id: "a", value: 100 },
      { sleeper_id: "b", value: 300 },
      { sleeper_id: "c", value: 200 },
    ]);
    assert.deepEqual(ranked.map((r) => [r.sleeper_id, r.adp_rank]), [["b", 1], ["c", 2], ["a", 3]]);
  });
});
