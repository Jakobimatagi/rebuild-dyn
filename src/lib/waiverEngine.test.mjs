import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WAIVER_WEIGHTS,
  LITE_DYNASTY_SCORE,
  dynastyScore,
  projectionPercentilesByPos,
  formScore,
  trendingScore,
  availabilityScore,
  suggestFaab,
  buildBoardDeltas,
  scoreWaiverCandidates,
} from "./waiverEngine.js";

// ── fixtures ────────────────────────────────────────────────────────────────

function cand(id, overrides = {}) {
  return {
    playerId: String(id),
    name: `Player ${id}`,
    position: "WR",
    team: "KC",
    age: 24,
    injuryStatus: null,
    dynastyValue: { value: 65, tier: "Contributor" },
    ...overrides,
  };
}

function streak(overrides = {}) {
  return {
    evaluatedWeeks: 5,
    beatRate: 0.6,
    momentum: 2,
    weeksMissedRecent: 0,
    seasonEndedEarly: false,
    ...overrides,
  };
}

// ── dynasty ─────────────────────────────────────────────────────────────────

test("dynastyScore maps the 1-130 scale to 0-100", () => {
  assert.equal(dynastyScore(cand(1, { dynastyValue: { value: 130 } })), 100);
  assert.equal(dynastyScore(cand(1, { dynastyValue: { value: 65 } })), 50);
});

test("dynastyScore: lite candidates get the neutral floor, enriched-without-value gets null", () => {
  assert.equal(dynastyScore({ isLite: true, dynastyValue: null }), LITE_DYNASTY_SCORE);
  assert.equal(dynastyScore({ isLite: false, dynastyValue: null }), null);
});

// ── projection ──────────────────────────────────────────────────────────────

test("projection percentile is position-relative", () => {
  const pct = projectionPercentilesByPos([
    { playerId: "te1", position: "TE", ppg: 14 },
    { playerId: "te2", position: "TE", ppg: 6 },
    { playerId: "wr1", position: "WR", ppg: 14 },
    { playerId: "wr2", position: "WR", ppg: 16 },
    { playerId: "wr3", position: "WR", ppg: 18 },
  ]);
  // 14 PPG tops the TE pool but bottoms the WR pool.
  assert.equal(pct.get("te1"), 100);
  assert.equal(pct.get("wr1"), 0);
});

test("projection percentile: singleton position gets 50, unprojected players get no entry", () => {
  const pct = projectionPercentilesByPos([
    { playerId: "qb1", position: "QB", ppg: 20 },
    { playerId: "qb2", position: "QB", ppg: null },
  ]);
  assert.equal(pct.get("qb1"), 50);
  assert.equal(pct.has("qb2"), false);
});

// ── form ────────────────────────────────────────────────────────────────────

test("formScore: strong momentum scores high", () => {
  const s = formScore(streak({ momentum: 4, beatRate: 0.8 }));
  assert.ok(s > 75, `expected >75, got ${s}`);
});

test("formScore: null under 2 evaluated weeks or without a streak", () => {
  assert.equal(formScore(streak({ evaluatedWeeks: 1 })), null);
  assert.equal(formScore(null), null);
});

test("formScore: season-ended-early caps at 40 (pre-injury form is stale)", () => {
  const s = formScore(streak({ momentum: 5, beatRate: 0.9, seasonEndedEarly: true }));
  assert.ok(s <= 40, `expected <=40, got ${s}`);
});

// ── trending ────────────────────────────────────────────────────────────────

test("trendingScore: log-scaled, monotonic, max-adds player hits 100", () => {
  assert.equal(trendingScore(500, 0, 500, 0), 100);
  const mid = trendingScore(100, 0, 500, 0);
  const low = trendingScore(10, 0, 500, 0);
  assert.ok(mid > low && mid < 100);
  // Log scaling: 100/500 of the adds keeps well over half the score.
  assert.ok(mid > 70, `expected log-compressed mid >70, got ${mid}`);
});

test("trendingScore: drops subtract, zero adds → 0, no data → null", () => {
  const clean = trendingScore(100, 0, 500, 200);
  const dropped = trendingScore(100, 200, 500, 200);
  assert.ok(dropped < clean);
  assert.equal(trendingScore(0, 0, 500, 0), 0);
  assert.equal(trendingScore(0, 0, 0, 0), null);
});

// ── availability ────────────────────────────────────────────────────────────

test("availabilityScore follows the status table", () => {
  assert.equal(availabilityScore(cand(1)), 100);
  assert.equal(availabilityScore(cand(1, { injuryStatus: "Questionable" })), 75);
  assert.equal(availabilityScore(cand(1, { injuryStatus: "IR" })), 15);
});

test("availabilityScore: unsigned players clamp to 25; missed weeks penalize in-season", () => {
  assert.equal(availabilityScore(cand(1, { team: null })), 25);
  const healthy = availabilityScore(cand(1), streak({ weeksMissedRecent: 3 }), 8);
  assert.equal(healthy, 80);
  // Offseason (week 0): missed-weeks penalty doesn't apply.
  assert.equal(availabilityScore(cand(1), streak({ weeksMissedRecent: 3 }), 0), 100);
});

// ── composite: weight renormalization / offseason ───────────────────────────

test("offseason: weights renormalize over dynasty + trending + availability", () => {
  const results = scoreWaiverCandidates({
    candidates: [cand("a", { dynastyValue: { value: 110 } })],
    trendingAddsById: new Map([["a", 50]]),
    week: 0,
  });
  const used = results[0].breakdown.weightsUsed;
  assert.equal(results[0].breakdown.projection, null);
  assert.equal(results[0].breakdown.form, null);
  const sum = Object.values(used).reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights should sum to 1, got ${sum}`);
  assert.ok(!("projection" in used) && !("form" in used));
  // dynasty weight collapses from 0.30 to 0.30/0.55
  assert.ok(Math.abs(used.dynasty - 0.3 / 0.55) < 1e-9);
});

test("offseason: high-dynasty player outranks a high-trending scrub", () => {
  const results = scoreWaiverCandidates({
    candidates: [cand("stud", { dynastyValue: { value: 120 } })],
    liteCandidates: [cand("scrub", { dynastyValue: null })],
    trendingAddsById: new Map([["scrub", 900]]),
    week: 0,
  });
  assert.equal(results[0].playerId, "stud");
});

// ── need multiplier ─────────────────────────────────────────────────────────

test("need multiplier ranks needed position above surplus twin, score clamps at 100", () => {
  const twins = {
    candidates: [
      cand("rb", { position: "RB", dynastyValue: { value: 90 } }),
      cand("wr", { position: "WR", dynastyValue: { value: 90 } }),
    ],
    needs: ["RB"],
    surplusPositions: ["WR"],
    week: 0,
  };
  const results = scoreWaiverCandidates(twins);
  assert.equal(results[0].playerId, "rb");
  assert.equal(results[0].breakdown.needMult, 1.12);
  assert.equal(results[1].breakdown.needMult, 0.9);

  // Clamp: a perfect candidate at a needed position can't exceed 100.
  const maxed = scoreWaiverCandidates({
    candidates: [cand("max", { position: "RB", dynastyValue: { value: 130 } })],
    trendingAddsById: new Map([["max", 100]]),
    needs: ["RB"],
    week: 0,
  });
  assert.ok(maxed[0].waiverScore <= 100);
});

// ── flags ───────────────────────────────────────────────────────────────────

test("opportunity-shock flag: high trending + low dynasty only", () => {
  const results = scoreWaiverCandidates({
    candidates: [
      cand("shock", { dynastyValue: { value: 40 } }),   // dynasty ≈ 31
      cand("known", { dynastyValue: { value: 100 } }),  // dynasty ≈ 77
    ],
    trendingAddsById: new Map([["shock", 500], ["known", 500]]),
    week: 0,
  });
  const byId = new Map(results.map((r) => [r.playerId, r]));
  assert.ok(byId.get("shock").flags.includes("opportunity-shock"));
  assert.ok(!byId.get("known").flags.includes("opportunity-shock"));
  assert.ok(byId.get("known").flags.includes("trending-riser"));
});

test("stash-only flag: dynasty asset with no near-term points", () => {
  const results = scoreWaiverCandidates({
    candidates: [
      cand("stash", { position: "WR", dynastyValue: { value: 100 } }),
      cand("now1", { position: "WR", dynastyValue: { value: 40 } }),
      cand("now2", { position: "WR", dynastyValue: { value: 40 } }),
    ],
    rosProjPpgById: new Map([["stash", 2], ["now1", 12], ["now2", 10]]),
    week: 5,
  });
  const stash = results.find((r) => r.playerId === "stash");
  assert.ok(stash.flags.includes("stash-only"));
});

// ── FAAB ────────────────────────────────────────────────────────────────────

test("suggestFaab bands and bonuses", () => {
  const p = suggestFaab(85, { faabBudget: 100 });
  assert.equal(p.verdict, "priority-add");
  assert.deepEqual(p.faabPct, { min: 20, max: 35 });
  assert.equal(p.faabLabel, "$20–$35 of $100");

  const boosted = suggestFaab(85, { hasShock: true, fillsNeed: true, faabBudget: 100 });
  assert.deepEqual(boosted.faabPct, { min: 28, max: 40 }); // 35+8 clamps at 40

  const spec = suggestFaab(55, { faabBudget: 200 });
  assert.equal(spec.verdict, "speculative");
  assert.deepEqual(spec.faabPct, { min: 3, max: 8 });
});

test("suggestFaab: priority league (budget 0) and watch verdicts carry no bid", () => {
  const p = suggestFaab(85, { faabBudget: 0 });
  assert.equal(p.verdict, "priority-add");
  assert.equal(p.faabPct, null);
  const w = suggestFaab(30, { faabBudget: 100 });
  assert.equal(w.verdict, "watch");
  assert.equal(w.faabPct, null);
});

// ── board deltas ────────────────────────────────────────────────────────────

test("buildBoardDeltas: rank moves and isNew", () => {
  const prev = [
    { playerId: "a", rank: 3, waiverScore: 60 },
    { playerId: "b", rank: 1, waiverScore: 80 },
  ];
  const cur = [
    { playerId: "a", rank: 1, waiverScore: 72 },
    { playerId: "b", rank: 2, waiverScore: 75 },
    { playerId: "c", rank: 3, waiverScore: 70 },
  ];
  const deltas = buildBoardDeltas(cur, prev);
  assert.deepEqual(deltas.get("a"), { rankDelta: 2, scoreDelta: 12, isNew: false });
  assert.deepEqual(deltas.get("b"), { rankDelta: -1, scoreDelta: -5, isNew: false });
  assert.deepEqual(deltas.get("c"), { rankDelta: null, scoreDelta: null, isNew: true });
});

test("buildBoardDeltas: empty previous board marks everything new", () => {
  const deltas = buildBoardDeltas([{ playerId: "a", rank: 1, waiverScore: 50 }], null);
  assert.equal(deltas.get("a").isNew, true);
});

// ── determinism ─────────────────────────────────────────────────────────────

test("output sorted by score desc with stable dynasty/id tiebreaks", () => {
  const results = scoreWaiverCandidates({
    candidates: [
      cand("b", { dynastyValue: { value: 65 } }),
      cand("a", { dynastyValue: { value: 65 } }),
      cand("c", { dynastyValue: { value: 90 } }),
    ],
    week: 0,
  });
  assert.equal(results[0].playerId, "c");
  // Equal scores + equal dynasty → id ascending.
  assert.deepEqual(results.slice(1).map((r) => r.playerId), ["a", "b"]);
  const scores = results.map((r) => r.waiverScore);
  assert.deepEqual(scores, [...scores].sort((x, y) => y - x));
});

test("default weights sum to 1", () => {
  const sum = Object.values(DEFAULT_WAIVER_WEIGHTS).reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});
