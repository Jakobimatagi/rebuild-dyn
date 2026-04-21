/**
 * Unit tests for scoringEngine.js
 * Run with: npm test (uses Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGE_CURVES_FALLBACK,
  DEFAULT_SCORING_WEIGHTS,
  ageComponent,
  availComponent,
  buildAgeCurves,
  buildBenchmarks,
  calcScore,
  clamp,
  draftCapitalScore,
  draftTierLabel,
  getPctileRank,
  getWeightDeviationRatio,
  normalizeScoringWeights,
  playerPctiles,
  situComponent,
  trendComponent,
} from "./scoringEngine.js";

// ---------------------------------------------------------------------------
// clamp
// ---------------------------------------------------------------------------

describe("clamp", () => {
  it("returns value when inside range", () => {
    assert.equal(clamp(5, 0, 10), 5);
  });
  it("clamps below min", () => {
    assert.equal(clamp(-3, 0, 10), 0);
  });
  it("clamps above max", () => {
    assert.equal(clamp(99, 0, 10), 10);
  });
  it("accepts equal bounds", () => {
    assert.equal(clamp(7, 5, 5), 5);
  });
});

// ---------------------------------------------------------------------------
// normalizeScoringWeights
// ---------------------------------------------------------------------------

describe("normalizeScoringWeights", () => {
  it("normalizes defaults to sum to 1", () => {
    const w = normalizeScoringWeights();
    const sum = w.age + w.prod + w.avail + w.trend + w.situ;
    assert.ok(Math.abs(sum - 1) < 1e-9, `expected sum ≈ 1, got ${sum}`);
  });

  it("matches expected default ratios", () => {
    const w = normalizeScoringWeights();
    assert.equal(w.age, 0.35);
    assert.equal(w.prod, 0.30);
    assert.equal(w.avail, 0.15);
    assert.equal(w.trend, 0.10);
    assert.equal(w.situ, 0.10);
  });

  it("renormalizes arbitrary raw weights", () => {
    const w = normalizeScoringWeights({ age: 50, prod: 50, avail: 0, trend: 0, situ: 0 });
    assert.equal(w.age, 0.5);
    assert.equal(w.prod, 0.5);
    assert.equal(w.avail, 0);
  });

  it("avoids divide-by-zero when all weights are zero", () => {
    const w = normalizeScoringWeights({ age: 0, prod: 0, avail: 0, trend: 0, situ: 0 });
    assert.equal(w.age, 0);
    assert.equal(w.prod, 0);
    assert.ok(Number.isFinite(w.age));
  });

  it("coerces string inputs to numbers", () => {
    const w = normalizeScoringWeights({ age: "40", prod: "40", avail: "20", trend: "0", situ: "0" });
    assert.equal(w.age, 0.4);
    assert.equal(w.prod, 0.4);
    assert.equal(w.avail, 0.2);
  });

  it("falls back to defaults when a key is missing", () => {
    const w = normalizeScoringWeights({});
    const defaults = normalizeScoringWeights(DEFAULT_SCORING_WEIGHTS);
    assert.deepEqual(w, defaults);
  });
});

// ---------------------------------------------------------------------------
// getWeightDeviationRatio
// ---------------------------------------------------------------------------

describe("getWeightDeviationRatio", () => {
  it("returns 0 for the defaults", () => {
    assert.equal(getWeightDeviationRatio(DEFAULT_SCORING_WEIGHTS), 0);
  });

  it("grows as the weights diverge from defaults", () => {
    const skewed = { age: 100, prod: 0, avail: 0, trend: 0, situ: 0 };
    assert.ok(getWeightDeviationRatio(skewed) > 0.5);
  });

  it("is clamped to [0, 1]", () => {
    const skewed = { age: 100, prod: 0, avail: 0, trend: 0, situ: 0 };
    const r = getWeightDeviationRatio(skewed);
    assert.ok(r >= 0 && r <= 1);
  });
});

// ---------------------------------------------------------------------------
// draftCapitalScore / draftTierLabel
// ---------------------------------------------------------------------------

describe("draftCapitalScore", () => {
  it("returns null when round is missing", () => {
    assert.equal(draftCapitalScore(null, 5), null);
    assert.equal(draftCapitalScore(undefined, 5), null);
  });

  it("ranks round 1 picks by slot", () => {
    assert.equal(draftCapitalScore(1, 5), 95);
    assert.equal(draftCapitalScore(1, 15), 85);
    assert.equal(draftCapitalScore(1, 28), 78);
  });

  it("assigns fixed scores to later rounds", () => {
    assert.equal(draftCapitalScore(2, 40), 62);
    assert.equal(draftCapitalScore(3, 75), 45);
    assert.equal(draftCapitalScore(4, 110), 32);
    assert.equal(draftCapitalScore(7, 220), 18);
  });

  it("is monotonically non-increasing across rounds", () => {
    const scores = [1, 2, 3, 4, 5].map((r) => draftCapitalScore(r, 50));
    for (let i = 1; i < scores.length; i++) {
      assert.ok(scores[i] <= scores[i - 1], `round ${i + 1} > round ${i}`);
    }
  });
});

describe("draftTierLabel", () => {
  it("returns null for missing round", () => {
    assert.equal(draftTierLabel(null, 5), null);
  });

  it("labels round 1 by pick range", () => {
    assert.equal(draftTierLabel(1, 5), "Top 10 Pick");
    assert.equal(draftTierLabel(1, 15), "Mid 1st");
    assert.equal(draftTierLabel(1, 28), "Late 1st");
  });

  it("labels rounds 2–4", () => {
    assert.equal(draftTierLabel(2, 45), "2nd Round");
    assert.equal(draftTierLabel(3, 75), "3rd Round");
    assert.equal(draftTierLabel(4, 110), "4th Round");
  });

  it("falls back to ordinal suffix for later rounds", () => {
    assert.equal(draftTierLabel(7, 210), "7th Round");
  });
});

// ---------------------------------------------------------------------------
// ageComponent
// ---------------------------------------------------------------------------

describe("ageComponent", () => {
  it("awards peak score before the position peak age", () => {
    assert.equal(ageComponent("RB", 22, AGE_CURVES_FALLBACK), 95);
    assert.equal(ageComponent("WR", 24, AGE_CURVES_FALLBACK), 95);
  });

  it("decreases monotonically as age rises past peak", () => {
    const ages = [24, 25, 26, 27, 28, 29, 30];
    const scores = ages.map((a) => ageComponent("RB", a, AGE_CURVES_FALLBACK));
    for (let i = 1; i < scores.length; i++) {
      assert.ok(scores[i] <= scores[i - 1], `${ages[i]} > ${ages[i - 1]}`);
    }
  });

  it("returns the cliff floor past the cliff age", () => {
    assert.equal(ageComponent("RB", 32, AGE_CURVES_FALLBACK), 12);
    assert.equal(ageComponent("QB", 40, AGE_CURVES_FALLBACK), 12);
  });

  it("falls back to the position's default curve when ageCurves entry is missing", () => {
    const partial = { QB: AGE_CURVES_FALLBACK.QB };
    // RB peak is 24 in fallback; age 25 is past peak, so expect < 95.
    const viaPartial = ageComponent("RB", 25, partial);
    const viaFallback = ageComponent("RB", 25, AGE_CURVES_FALLBACK);
    assert.equal(viaPartial, viaFallback);
    assert.ok(viaPartial < 95);
  });

  it("tolerates null ageCurves by using fallback", () => {
    assert.equal(ageComponent("QB", 26, null), 95);
  });
});

// ---------------------------------------------------------------------------
// availComponent
// ---------------------------------------------------------------------------

describe("availComponent", () => {
  it("scales score with games played", () => {
    assert.equal(availComponent({ gp: 17 }, null), 100);
    assert.equal(availComponent({ gp: 0 }, null), 0);
    const half = availComponent({ gp: 8 }, null);
    assert.ok(half > 40 && half < 55);
  });

  it("applies injury penalty", () => {
    const healthy = availComponent({ gp: 17 }, null);
    const injured = availComponent({ gp: 17 }, "IR");
    assert.equal(healthy - injured, 20);
  });

  it("never returns below zero", () => {
    assert.equal(availComponent({ gp: 0 }, "IR"), 0);
  });

  it("finds the most recent season with games when passed an array", () => {
    const stats = [{ gp: 0 }, { gp: 12 }];
    const score = availComponent(stats, null);
    assert.equal(score, Math.round((12 / 17) * 100) === Math.round((12 / 17) * 100) ? (12 / 17) * 100 : score);
    assert.ok(Math.abs(score - (12 / 17) * 100) < 0.01);
  });

  it("returns 0 when array contains no games-played data", () => {
    assert.equal(availComponent([{ gp: 0 }, null], null), 0);
  });
});

// ---------------------------------------------------------------------------
// trendComponent
// ---------------------------------------------------------------------------

describe("trendComponent", () => {
  it("returns neutral 50 when there are too few games last season", () => {
    assert.equal(trendComponent({ gp: 2, pts_ppr: 10 }, { gp: 16, pts_ppr: 200 }), 50);
  });

  it("rewards improvement year-over-year", () => {
    const up = trendComponent({ gp: 16, pts_ppr: 240 }, { gp: 16, pts_ppr: 160 });
    assert.ok(up > 60);
  });

  it("penalizes decline year-over-year", () => {
    const down = trendComponent({ gp: 16, pts_ppr: 120 }, { gp: 16, pts_ppr: 240 });
    assert.ok(down < 60);
  });

  it("scores single-season players against a 10 ppg baseline", () => {
    const strongRookie = trendComponent({ gp: 16, pts_ppr: 240 }, { gp: 0 });
    const weakRookie = trendComponent({ gp: 16, pts_ppr: 60 }, { gp: 0 });
    assert.ok(strongRookie > weakRookie);
    assert.ok(strongRookie >= 60);
    assert.ok(weakRookie < 60);
  });

  it("returns neutral 50 when previous PPG is zero (divide-by-zero guard)", () => {
    assert.equal(trendComponent({ gp: 16, pts_ppr: 200 }, { gp: 16, pts_ppr: 0 }), 50);
  });

  it("clamps the output to [0, 100]", () => {
    const extreme = trendComponent({ gp: 16, pts_ppr: 500 }, { gp: 16, pts_ppr: 10 });
    assert.ok(extreme >= 0 && extreme <= 100);
  });
});

// ---------------------------------------------------------------------------
// situComponent
// ---------------------------------------------------------------------------

describe("situComponent", () => {
  it("penalizes free agents heavily", () => {
    assert.equal(situComponent(1, "FA", "WR"), 20);
    assert.equal(situComponent(1, null, "RB"), 20);
  });

  it("rewards starters regardless of position", () => {
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      assert.equal(situComponent(1, "NYJ", pos), 90);
    }
  });

  it("applies position-specific falloff for backups", () => {
    assert.equal(situComponent(2, "NYJ", "WR"), 82);
    assert.equal(situComponent(2, "NYJ", "RB"), 68);
    assert.equal(situComponent(2, "NYJ", "TE"), 45);
    assert.equal(situComponent(2, "NYJ", "QB"), 40);
  });

  it("returns a deep-depth default when position/depth has no mapping", () => {
    assert.equal(situComponent(5, "NYJ", "RB"), 20);
    assert.equal(situComponent(3, "NYJ", "QB"), 20);
  });

  it("falls back to RB map for unknown positions", () => {
    assert.equal(situComponent(2, "NYJ", "K"), 68);
  });
});

// ---------------------------------------------------------------------------
// getPctileRank
// ---------------------------------------------------------------------------

describe("getPctileRank", () => {
  it("returns null for missing inputs", () => {
    assert.equal(getPctileRank(10, []), null);
    assert.equal(getPctileRank(null, [1, 2, 3]), null);
    assert.equal(getPctileRank(0, [1, 2, 3]), null);
  });

  it("ranks a value against a sorted sample", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(getPctileRank(5, sorted), 40);
    assert.equal(getPctileRank(11, sorted), 100);
    assert.equal(getPctileRank(1, sorted), 0);
  });
});

// ---------------------------------------------------------------------------
// playerPctiles
// ---------------------------------------------------------------------------

describe("playerPctiles", () => {
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100 ppg
  const benchmarks = {
    raw: { QB: { 2024: sorted, 2023: sorted, 2022: sorted } },
    replacementLevel: { QB: { 2024: 5, 2023: 5, 2022: 5 } },
  };

  it("computes current/peak from three seasons", () => {
    const s24 = { gp: 17, pts_ppr: 17 * 30 }; // 30 ppg → 29th pctile + bonus
    const s23 = { gp: 17, pts_ppr: 17 * 50 }; // 50 ppg
    const s22 = { gp: 17, pts_ppr: 17 * 20 }; // 20 ppg
    const { current, peak } = playerPctiles(s24, s23, s22, "QB", benchmarks, 2024);
    assert.ok(current >= 29);
    assert.ok(peak >= current);
  });

  it("returns null pctiles for seasons with < 6 games", () => {
    const s24 = { gp: 3, pts_ppr: 20 };
    const s23 = { gp: 17, pts_ppr: 17 * 50 };
    const s22 = null;
    const { pLast, pPrev, pOlder } = playerPctiles(s24, s23, s22, "QB", benchmarks, 2024);
    assert.equal(pLast, null);
    assert.ok(pPrev > 0);
    assert.equal(pOlder, null);
  });

  it("estimates current as 65% of peak when last-season data is missing", () => {
    const s24 = null;
    const s23 = { gp: 17, pts_ppr: 17 * 60 };
    const s22 = null;
    const { current, peak } = playerPctiles(s24, s23, s22, "QB", benchmarks, 2024);
    assert.ok(current < peak);
    assert.ok(Math.abs(current - Math.round(peak * 0.65)) <= 1);
  });

  it("supports the legacy raw-array benchmark shape", () => {
    const legacy = { QB: { 2024: sorted, 2023: sorted, 2022: sorted } };
    const s24 = { gp: 17, pts_ppr: 17 * 50 };
    const { current } = playerPctiles(s24, null, null, "QB", legacy, 2024);
    assert.ok(current > 0);
  });
});

// ---------------------------------------------------------------------------
// calcScore
// ---------------------------------------------------------------------------

describe("calcScore", () => {
  const basePlayer = {
    position: "WR",
    age: 25,
    injuryStatus: null,
    depthOrder: 1,
    team: "NYJ",
    yearsExp: 3,
    draftRound: 1,
    draftSlot: 10,
  };

  it("returns a score in [0, 100] and integer components", () => {
    const { score, components } = calcScore(
      basePlayer,
      { gp: 17, pts_ppr: 17 * 18 },
      { gp: 17, pts_ppr: 17 * 16 },
      75,
      AGE_CURVES_FALLBACK,
    );
    assert.ok(score >= 0 && score <= 100, `score=${score}`);
    for (const k of ["age", "prod", "avail", "trend", "situ"]) {
      assert.ok(Number.isInteger(components[k]), `${k}=${components[k]}`);
    }
  });

  it("shifts the final score when scoring weights are reweighted", () => {
    const args = [basePlayer, { gp: 17, pts_ppr: 17 * 10 }, { gp: 17, pts_ppr: 17 * 10 }, 30, AGE_CURVES_FALLBACK];
    const def = calcScore(...args);
    const ageHeavy = calcScore(...args, { age: 100, prod: 0, avail: 0, trend: 0, situ: 0 });
    assert.notEqual(def.score, ageHeavy.score);
  });

  it("weights draft capital more for young players (yearsExp=0)", () => {
    const rookie = { ...basePlayer, yearsExp: 0, draftRound: 1, draftSlot: 5 };
    const vet = { ...basePlayer, yearsExp: 5, draftRound: 1, draftSlot: 5 };
    const rookieScore = calcScore(rookie, null, null, 20, AGE_CURVES_FALLBACK);
    const vetScore = calcScore(vet, null, null, 20, AGE_CURVES_FALLBACK);
    // Rookie inherits the Top-10 draft capital (95) into production, so prod >> 20
    assert.ok(rookieScore.components.prod > vetScore.components.prod);
  });

  it("tolerates missing stats and defaults production to 40", () => {
    const noStatPlayer = { ...basePlayer, draftRound: null, draftSlot: null };
    const { score, components } = calcScore(noStatPlayer, null, null, null, AGE_CURVES_FALLBACK);
    assert.equal(components.prod, 40);
    assert.ok(Number.isFinite(score));
  });
});

// ---------------------------------------------------------------------------
// buildAgeCurves
// ---------------------------------------------------------------------------

describe("buildAgeCurves", () => {
  it("returns the fallback curves when data is empty", () => {
    const curves = buildAgeCurves({}, []);
    assert.deepEqual(curves.RB, AGE_CURVES_FALLBACK.RB);
    assert.deepEqual(curves.WR, AGE_CURVES_FALLBACK.WR);
  });

  it("returns the fallback when samples don't meet the min bucket size", () => {
    // Two players across two years is far below MIN_BUCKET_SIZE=8 per age bucket
    const players = {
      p1: { age: 26, position: "WR", fantasy_positions: ["WR"] },
      p2: { age: 27, position: "WR", fantasy_positions: ["WR"] },
    };
    const stats = [
      { year: 2024, stats: { p1: { gp: 16, pts_ppr: 240 }, p2: { gp: 16, pts_ppr: 220 } } },
    ];
    const curves = buildAgeCurves(players, stats);
    assert.deepEqual(curves.WR, AGE_CURVES_FALLBACK.WR);
  });
});

// ---------------------------------------------------------------------------
// buildBenchmarks
// ---------------------------------------------------------------------------

describe("buildBenchmarks", () => {
  const mkPlayer = (position, age = 26) => ({
    position,
    age,
    fantasy_positions: [position],
  });

  it("produces raw, replacementLevel, and ageCurves for each position", () => {
    const players = { a: mkPlayer("RB"), b: mkPlayer("WR"), c: mkPlayer("QB"), d: mkPlayer("TE") };
    const stats24 = {
      a: { gp: 17, pts_ppr: 240 },
      b: { gp: 17, pts_ppr: 220 },
      c: { gp: 17, pts_ppr: 300 },
      d: { gp: 17, pts_ppr: 150 },
    };
    const b = buildBenchmarks(players, {}, {}, stats24, null, [], 2024);
    assert.ok(b.raw);
    assert.ok(b.replacementLevel);
    assert.ok(b.ageCurves);
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      assert.ok(Array.isArray(b.raw[pos]["2024"]));
      assert.ok(Number.isFinite(b.replacementLevel[pos]["2024"]));
    }
  });

  it("ignores samples with fewer than 8 games played", () => {
    const players = { a: mkPlayer("RB") };
    const lowGp = { a: { gp: 4, pts_ppr: 80 } };
    const b = buildBenchmarks(players, {}, {}, lowGp, null, [], 2024);
    assert.equal(b.raw.RB["2024"].length, 0);
  });

  it("respects superflex to raise QB replacement depth", () => {
    const players = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`q${i}`, mkPlayer("QB", 26)]),
    );
    const stats24 = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`q${i}`, { gp: 17, pts_ppr: (i + 1) * 17 }]),
    );
    const ctx1QB = { numTeams: 12, starterCounts: { QB: 1, RB: 2, WR: 3, TE: 1 }, flexCount: 2, isSuperflex: false };
    const ctxSF = { ...ctx1QB, isSuperflex: true };
    const b1 = buildBenchmarks(players, {}, {}, stats24, ctx1QB, [], 2024);
    const bSF = buildBenchmarks(players, {}, {}, stats24, ctxSF, [], 2024);
    // Superflex needs deeper QB replacement → lower PPG replacement value
    assert.ok(bSF.replacementLevel.QB["2024"] <= b1.replacementLevel.QB["2024"]);
  });
});
