import { test } from "node:test";
import assert from "node:assert/strict";
import {
  metricPercentile,
  metricRank,
  metricDisplay,
  defenseRank,
  fmtMetric,
  ordinal,
  buildCoachProfile,
  allCoachNames,
  careerDefenseSummary,
} from "./dcFingerprint.js";

// A tiny 10-team league for one season: epa_play_allowed 0.00 … 0.09 and
// sack_rate 0.02 … 0.11 (team T0 is the best defense and the worst rusher).
function league(season = 2024) {
  return Array.from({ length: 10 }, (_, i) => ({
    season,
    team: `T${i}`,
    plays: 1000,
    epa_play_allowed: i / 100,
    sack_rate: (i + 2) / 100,
    proe_faced: i - 4.5, // league median between T4 (-0.5) and T5 (+0.5)
    head_coach: `Coach ${i}`,
  }));
}

test("metricPercentile orients lowerIsBetter and midranks ties", () => {
  const rows = league();
  // Best defense (lowest EPA allowed) = 100th percentile.
  assert.equal(metricPercentile(rows, 2024, "epa_play_allowed", 0.0, { lowerIsBetter: true }), 1);
  assert.equal(metricPercentile(rows, 2024, "epa_play_allowed", 0.09, { lowerIsBetter: true }), 0);
  // Highest sack rate = 100th percentile without the flip.
  assert.equal(metricPercentile(rows, 2024, "sack_rate", 0.11), 1);
  // Tie handling: two teams sharing a value split the tie.
  const tied = [...league(), { season: 2024, team: "T10", epa_play_allowed: 0.0 }];
  const p = metricPercentile(tied, 2024, "epa_play_allowed", 0.0, { lowerIsBetter: true });
  assert.ok(p > 0.9 && p < 1, `tied top pair midranks below 1.0, got ${p}`);
});

test("metricPercentile returns null on thin league context", () => {
  const rows = league().slice(0, 5); // < 8 teams
  assert.equal(metricPercentile(rows, 2024, "epa_play_allowed", 0.0, { lowerIsBetter: true }), null);
  assert.equal(metricPercentile(league(), 2023, "epa_play_allowed", 0.0, { lowerIsBetter: true }), null);
});

test("metricRank ranks 1 = best by the metric's orientation", () => {
  const rows = league();
  assert.deepEqual(metricRank(rows, 2024, "epa_play_allowed", 0.0, { lowerIsBetter: true }), { rank: 1, of: 10 });
  assert.deepEqual(metricRank(rows, 2024, "epa_play_allowed", 0.09, { lowerIsBetter: true }), { rank: 10, of: 10 });
  assert.deepEqual(metricRank(rows, 2024, "sack_rate", 0.11), { rank: 1, of: 10 });
});

test("metricDisplay: quality metrics carry pct+rank, funnel metrics carry offset+note", () => {
  const rows = league();
  const best = rows[0];
  const q = metricDisplay(rows, best, "epa_play_allowed");
  assert.equal(q.kind, "quality");
  assert.equal(q.pct, 1);
  assert.equal(q.rank.rank, 1);
  assert.equal(q.text, "0.000");

  const passFunnel = metricDisplay(rows, rows[9], "proe_faced"); // +4.5 PROE
  assert.equal(passFunnel.kind, "funnel");
  assert.ok(passFunnel.offset > 0.3);
  assert.equal(passFunnel.note, "pass funnel");
  const runFunnel = metricDisplay(rows, rows[0], "proe_faced"); // -4.5 PROE
  assert.ok(runFunnel.offset < -0.3);
  assert.equal(runFunnel.note, "run funnel");

  assert.equal(metricDisplay(rows, { season: 2024 }, "epa_play_allowed"), null);
});

test("defenseRank uses EPA/play allowed", () => {
  const rows = league();
  assert.deepEqual(defenseRank(rows, rows[2]), { rank: 3, of: 10 });
  assert.equal(defenseRank(rows, null), null);
});

test("fmtMetric formats by metric key and handles nulls", () => {
  assert.equal(fmtMetric("epa_play_allowed", -0.052), "-0.052");
  assert.equal(fmtMetric("epa_play_allowed", 0.052), "+0.052");
  assert.equal(fmtMetric("sack_rate", 0.0782), "7.8%");
  assert.equal(fmtMetric("deep_rate_allowed", 0.114), "11%");
  assert.equal(fmtMetric("proe_faced", 2.13), "+2.1");
  assert.equal(fmtMetric("adot_faced", 8.25), "8.3");
  assert.equal(fmtMetric("sack_rate", null), "—");
});

test("ordinal", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(22), "22nd");
});

test("buildCoachProfile merges DC stints with HC pbp seasons", () => {
  const allDcs = [{ name: "Vic Fangio", stints: [{ year: 2024, team: "PHI" }, { year: 2023, team: "MIA" }] }];
  const rows = [
    { season: 2022, team: "DEN", head_coach: "Vic Fangio", epa_play_allowed: 0.01 },
    { season: 2024, team: "PHI", head_coach: "Nick Sirianni", epa_play_allowed: -0.02 },
  ];
  const p = buildCoachProfile("vic fangio", allDcs, rows);
  assert.equal(p.name, "Vic Fangio");
  assert.deepEqual(p.stints.map((s) => `${s.year}-${s.team}`), ["2024-PHI", "2023-MIA", "2022-DEN"]);
  assert.equal(p.stints[2].headCoach, true);
  assert.equal(buildCoachProfile("Nobody", allDcs, rows), null);
});

test("allCoachNames unions DC names and pbp head coaches", () => {
  const allDcs = [{ name: "Brian Flores", stints: [] }];
  const rows = [
    { season: 2024, team: "MIN", head_coach: "Kevin O'Connell" },
    { season: 2023, team: "MIN", head_coach: "Kevin O'Connell" },
  ];
  assert.deepEqual(allCoachNames(allDcs, rows), ["Brian Flores", "Kevin O'Connell"]);
});

test("careerDefenseSummary aggregates only exact-season fingerprints", () => {
  const rows = league();
  rows.push(...league(2023));
  const stints = [
    { year: 2024, team: "T0" }, // rank 1
    { year: 2023, team: "T9" }, // rank 10
    { year: 2022, team: "T5" }, // no pbp for 2022 → skipped
  ];
  const sum = careerDefenseSummary(stints, rows);
  assert.equal(sum.seasons, 2);
  assert.deepEqual(sum.points.map((p) => p.year), [2023, 2024]); // oldest first
  assert.equal(sum.best.year, 2024);
  assert.equal(sum.best.rank.rank, 1);
  assert.equal(sum.top10, 2); // 10-team league: both ranks ≤ 10
  // plays-weighted EPA: equal plays → simple mean of 0.09 and 0.00.
  assert.ok(Math.abs(sum.avgEpa - 0.045) < 1e-9);
  assert.ok(Math.abs(sum.avgPct - 0.5) < 1e-9);
  assert.equal(careerDefenseSummary([{ year: 2022, team: "T5" }], rows), null);
});
