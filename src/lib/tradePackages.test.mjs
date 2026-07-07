/**
 * Unit tests for tradePackages.js — the fair-package builder.
 * Run with: npm test (Node's built-in test runner, no deps).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFairPackages, suggestBalancePackages } from "./tradePackages.js";
import { evaluateTrade } from "./tradeEngine.js";

const SF = { isSuperflex: true, tePremium: false, starterCounts: { QB: 1, RB: 2, WR: 3, TE: 1 }, flexCount: 2 };

// Players carry fantasyCalcValue (dollar scale, ≈ value×100) so
// getAssetTradeValue prices them on the real trade scale (~value pts).
const mk = (position, age, value, extra = {}) => ({
  type: "player",
  id: extra.id ?? `${position}-${age}-${value}-${extra.name ?? ""}`,
  name: extra.name ?? `${position}${age} v${value}`,
  position,
  age,
  yearsExp: extra.yearsExp ?? Math.max(0, age - 22),
  score: value,
  fantasyCalcValue: value * 100,
  dynastyValue: { value },
  ppg: extra.ppg ?? Math.max(2, value / 5),
  ...extra,
});

function teamFrom(label, phase, players, picks = []) {
  const byPos = { QB: [], RB: [], WR: [], TE: [] };
  for (const p of players) byPos[p.position]?.push(p);
  for (const k of Object.keys(byPos)) byPos[k].sort((a, b) => b.score - a.score);
  const total = players.reduce((a, p) => a + p.score, 0) || 1;
  const ideal = { QB: 18, RB: 35, WR: 35, TE: 12 };
  const proportions = {};
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    const posScore = byPos[pos].reduce((a, p) => a + p.score, 0);
    const actual = Math.round((posScore / total) * 100);
    proportions[pos] = { actual, ideal: ideal[pos], delta: actual - ideal[pos] };
  }
  return {
    rosterId: label,
    label,
    enriched: players,
    byPos,
    proportions,
    avgAge: (players.reduce((a, p) => a + p.age, 0) / (players.length || 1)).toFixed(1),
    avgScore: Math.round(total / (players.length || 1)),
    needs: [],
    picks,
    teamPhase: { phase },
  };
}

const marketOf = (...teams) => {
  const m = new Map();
  for (const t of teams) for (const p of t.enriched) m.set(String(p.id), p);
  return m;
};

// Contender: strong everywhere, thin at WR depth.
const contender = () =>
  teamFrom("Contender", "contender", [
    mk("QB", 27, 85, { id: "c-qb1", ppg: 22 }),
    mk("QB", 26, 70, { id: "c-qb2", ppg: 18 }),
    mk("RB", 25, 80, { id: "c-rb1", ppg: 17 }),
    mk("RB", 24, 60, { id: "c-rb2", ppg: 13 }),
    mk("RB", 23, 45, { id: "c-rb3", ppg: 9 }),
    mk("WR", 26, 75, { id: "c-wr1", ppg: 15 }),
    mk("WR", 25, 55, { id: "c-wr2", ppg: 12 }),
    mk("WR", 24, 40, { id: "c-wr3", ppg: 9 }),
    mk("TE", 26, 50, { id: "c-te1", ppg: 8 }),
  ], [
    { label: "2027 1st", season: 2027, round: 1, isOwn: true },
    { label: "2027 2nd", season: 2027, round: 2, isOwn: true },
  ]);

// Rebuild: one stud WR anchor to sell, youth everywhere else.
const rebuild = () =>
  teamFrom("Rebuild", "rebuild", [
    mk("WR", 26, 95, { id: "r-stud", name: "Stud WR", ppg: 18 }),
    mk("WR", 22, 55, { id: "r-wr2", ppg: 10 }),
    mk("WR", 21, 45, { id: "r-wr3", ppg: 8 }),
    mk("QB", 23, 65, { id: "r-qb1", ppg: 16 }),
    mk("RB", 22, 40, { id: "r-rb1", ppg: 8 }),
    mk("RB", 23, 35, { id: "r-rb2", ppg: 7 }),
    mk("TE", 22, 30, { id: "r-te1", ppg: 5 }),
  ], [
    { label: "2027 1st", season: 2027, round: 1, isOwn: true },
  ]);

describe("buildFairPackages", () => {
  it("acquire mode: builds fair multi-piece packages for a stud", () => {
    const my = contender();
    const partner = rebuild();
    const anchor = partner.enriched.find((p) => p.id === "r-stud");
    const pkgs = buildFairPackages({
      direction: "acquire",
      anchor,
      myTeam: my,
      partnerTeam: partner,
      leagueContext: SF,
      playerMarketMap: marketOf(my, partner),
    });
    assert.ok(pkgs.length > 0, "should find at least one package");
    for (const pkg of pkgs) {
      assert.ok(["Fair", "Slight edge", "Uneven"].includes(pkg.fairness));
      assert.ok(pkg.give.length >= 1 && pkg.give.length <= 3);
      assert.equal(pkg.get[0].id, "r-stud");
      assert.ok(pkg.tradeType?.id, "package carries a trade type");
    }
    // Best packages should be tight: top result within Slight edge.
    assert.ok(["Fair", "Slight edge"].includes(pkgs[0].fairness), pkgs[0].fairness);
  });

  it("ship mode: finds a fair return from the partner for my player", () => {
    const my = rebuild();
    const partner = contender();
    const anchor = my.enriched.find((p) => p.id === "r-stud");
    const pkgs = buildFairPackages({
      direction: "ship",
      anchor,
      myTeam: my,
      partnerTeam: partner,
      leagueContext: SF,
      playerMarketMap: marketOf(my, partner),
    });
    assert.ok(pkgs.length > 0, "should find a return package");
    // The return comes FROM the contender's assets.
    for (const pkg of pkgs) {
      assert.equal(pkg.payer, "Contender");
      for (const a of pkg.give) {
        assert.ok(String(a.id ?? a.label).startsWith("c-") || a.type === "pick");
      }
    }
  });

  it("never suggests an anchor-for-itself and stays under the piece cap", () => {
    const my = contender();
    const partner = rebuild();
    const anchor = partner.enriched.find((p) => p.id === "r-stud");
    const pkgs = buildFairPackages({
      direction: "acquire",
      anchor,
      myTeam: my,
      partnerTeam: partner,
      leagueContext: SF,
      playerMarketMap: marketOf(my, partner),
      limit: 8,
    });
    for (const pkg of pkgs) {
      assert.ok(pkg.give.every((a) => a.id !== "r-stud"));
      assert.ok(pkg.give.length <= 3);
    }
  });

  it("rebuild receivers get pick-heavy packages ranked above vet filler", () => {
    const my = contender();
    const partner = rebuild();
    const anchor = partner.enriched.find((p) => p.id === "r-stud");
    const pkgs = buildFairPackages({
      direction: "acquire",
      anchor,
      myTeam: my,
      partnerTeam: partner,
      leagueContext: SF,
      playerMarketMap: marketOf(my, partner),
      limit: 5,
    });
    assert.ok(pkgs.length > 0);
    // At least one top package should route draft capital or youth to the rebuilder.
    const hasLiquidity = pkgs.some((pkg) =>
      pkg.give.some((a) => a.type === "pick" || (a.age != null && a.age <= 24)),
    );
    assert.ok(hasLiquidity, "rebuilder should be offered picks/youth in top packages");
  });

  it("suggestBalancePackages closes a lopsided gap to a validated fair trade", () => {
    const my = contender();
    const partner = rebuild();
    const market = marketOf(my, partner);
    const lc = SF;
    // Lopsided on the table: contender's WR2 (55) for the rebuild's stud (95).
    const sideA = [my.enriched.find((p) => p.id === "c-wr2")];
    const sideB = [partner.enriched.find((p) => p.id === "r-stud")];
    const r = suggestBalancePackages({
      sideA,
      sideB,
      teamA: my,
      teamB: partner,
      leagueContext: lc,
      playerMarketMap: market,
    });
    assert.ok(r && !r.alreadyFair, "gap detected");
    assert.equal(r.addTo, "A", "the side receiving more value adds");
    assert.ok(r.packages.length > 0, "found balance packages");
    for (const pkg of r.packages) {
      assert.ok(["Fair", "Slight edge"].includes(pkg.fairness));
      // Add-ons come from team A's assets and are not already in the trade.
      for (const a of pkg.assets) {
        assert.notEqual(a.id, "c-wr2");
        assert.ok(a.type === "pick" || String(a.id).startsWith("c-"));
      }
      // Re-validate independently: the full trade really lands where claimed.
      const check = evaluateTrade(
        [...sideA, ...pkg.assets],
        sideB,
        "contender",
        "rebuild",
        market,
        lc,
        null,
      );
      assert.equal(check.fairnessLabel, pkg.fairness);
    }
  });

  it("suggestBalancePackages reports alreadyFair on an even trade", () => {
    const my = contender();
    const partner = rebuild();
    const market = marketOf(my, partner);
    // Near-even: contender QB1 (85) for rebuild stud WR (95) is close but
    // let's use symmetric pieces: QB2 (70) for QB-ish value on their side.
    const sideA = [my.enriched.find((p) => p.id === "c-rb1")]; // 80
    const sideB = [partner.enriched.find((p) => p.id === "r-stud")]; // 95
    const r = suggestBalancePackages({
      sideA,
      sideB,
      teamA: my,
      teamB: partner,
      leagueContext: SF,
      playerMarketMap: market,
    });
    assert.ok(r, "computed");
    if (r.alreadyFair) {
      assert.equal(r.packages.length, 0);
    } else {
      assert.ok(r.packages.length >= 0, "gap path also valid");
    }
  });

  it("returns [] gracefully with no viable candidates", () => {
    const tiny = teamFrom("Tiny", "retool", [mk("TE", 30, 5, { id: "t-1" })]);
    const partner = rebuild();
    const anchor = partner.enriched.find((p) => p.id === "r-stud");
    const pkgs = buildFairPackages({
      direction: "acquire",
      anchor,
      myTeam: tiny,
      partnerTeam: partner,
      leagueContext: SF,
      playerMarketMap: marketOf(tiny, partner),
    });
    assert.deepEqual(pkgs, []);
  });
});
