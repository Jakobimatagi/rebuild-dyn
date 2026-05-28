import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamUsage,
  aggregateOcUsage,
  buildSeasonUsage,
  teamDenominators,
  concentrationLabel,
  pct,
  dec,
} from "./ocUtilization.js";

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// One team (CHI) with hand-computable totals.
//  - Team aggregate row carries the exact denominators.
//  - rb1 owns 80/100 carries, rb2 owns 20/100  → carry shares .8 / .2
//  - wr1 owns 60/100 targets, te1 owns 40/100   → target shares .6 / .4
//  - wr1 air yards 700/1000 = .7 share, te1 300/1000 = .3 share
const players = {
  rb1: { full_name: "Bell Cow",   team: "CHI", position: "RB" },
  rb2: { full_name: "Change Up",  team: "CHI", position: "RB" },
  wr1: { full_name: "Alpha Dog",  team: "CHI", position: "WR" },
  te1: { full_name: "Big Slot",   team: "CHI", position: "TE" },
  k1:  { full_name: "Toe Punter", team: "CHI", position: "K"  }, // ignored
};

const stats = {
  TEAM_CHI: { rec_tgt: 100, rush_att: 100, rec_air_yd: 1000, rec_rz_tgt: 20, rush_rz_att: 10, pass_att: 110 },
  rb1: { rush_att: 80, rush_rz_att: 8, off_snp: 700, tm_off_snp: 1000, rec_tgt: 0,  gp: 16, pts_ppr: 250, rush_yd: 1200, rush_td: 10 },
  rb2: { rush_att: 20, rush_rz_att: 2, off_snp: 300, tm_off_snp: 1000, rec_tgt: 0,  gp: 16, pts_ppr: 90 },
  wr1: { rec_tgt: 60, rec_air_yd: 700, rec_rz_tgt: 14, off_snp: 900, tm_off_snp: 1000, rec: 45, rec_yd: 900, rec_td: 8, gp: 17, pts_ppr: 220 },
  te1: { rec_tgt: 40, rec_air_yd: 300, rec_rz_tgt: 6,  off_snp: 800, tm_off_snp: 1000, rec: 30, rec_yd: 350, rec_td: 4, gp: 17, pts_ppr: 150 },
  k1:  { pts_ppr: 999, gp: 17 },
};

test("teamDenominators reads the TEAM_ aggregate row", () => {
  const d = teamDenominators(stats, "CHI");
  assert.equal(d.rec_tgt, 100);
  assert.equal(d.rush_att, 100);
  assert.equal(d.rec_air_yd, 1000);
  assert.equal(d.pass_att, 110);
});

test("buildTeamUsage computes exact shares against team denominators", () => {
  const u = buildTeamUsage(players, stats, null, "CHI");
  const rb1 = u.byPos.RB.find((p) => p.id === "rb1");
  const wr1 = u.byPos.WR.find((p) => p.id === "wr1");
  const te1 = u.byPos.TE.find((p) => p.id === "te1");

  // carry share
  assert.ok(close(rb1.carryShare, 0.8));
  assert.ok(close(u.byPos.RB.find((p) => p.id === "rb2").carryShare, 0.2));
  // snap share is player-local (off_snp / tm_off_snp)
  assert.ok(close(rb1.snapShare, 0.7));
  // target share
  assert.ok(close(wr1.targetShare, 0.6));
  assert.ok(close(te1.targetShare, 0.4));
  // aDOT = air yards / targets
  assert.ok(close(wr1.adot, 700 / 60));
  // WOPR = 1.5*tgt_share + 0.7*air_share  → wr1: 1.5*.6 + .7*.7 = 1.39
  assert.ok(close(wr1.wopr, 1.5 * 0.6 + 0.7 * 0.7));
  // red-zone shares
  assert.ok(close(rb1.rzCarryShare, 0.8));
  assert.ok(close(wr1.rzTargetShare, 0.7));
});

test("buildTeamUsage derives pass rate and room concentration", () => {
  const u = buildTeamUsage(players, stats, null, "CHI");
  // pass rate = pass_att / (pass_att + rush_att) = 110 / 210
  assert.ok(close(u.passRate, 110 / 210));
  // carry HHI = .8^2 + .2^2 = .68 ; lead = rb1 at .8
  assert.ok(close(u.concentration.carry.hhi, 0.68));
  assert.equal(u.concentration.carry.lead.name, "Bell Cow");
  assert.ok(close(u.concentration.carry.lead.share, 0.8));
  // target HHI = .6^2 + .4^2 = .52 ; lead = wr1 at .6
  assert.ok(close(u.concentration.target.hhi, 0.52));
  assert.equal(u.concentration.target.lead.name, "Alpha Dog");
});

test("buildTeamUsage ignores non-skill positions and missing denominators", () => {
  const u = buildTeamUsage(players, stats, null, "CHI");
  // kicker never enters any room
  const all = ["QB", "RB", "WR", "TE"].flatMap((p) => u.byPos[p]);
  assert.ok(!all.some((p) => p.id === "k1"));
  // a team with no TEAM_ row → shares null, not NaN/Infinity
  const empty = buildTeamUsage(players, { rb1: stats.rb1 }, { rb1: { team: "DAL", position: "RB", name: "x" } }, "DAL");
  assert.equal(empty.byPos.RB[0].carryShare, null);
});

test("historicalRoster overrides current team for attribution", () => {
  // wr1 currently CHI but played for DAL this season → lands on DAL.
  const hist = { wr1: { team: "DAL", position: "WR", name: "Alpha Dog" } };
  const statsDal = { ...stats, TEAM_DAL: { rec_tgt: 120, rush_att: 0, rec_air_yd: 1000 } };
  const u = buildTeamUsage(players, statsDal, hist, "DAL");
  assert.equal(u.byPos.WR.length, 1);
  assert.ok(close(u.byPos.WR[0].targetShare, 60 / 120));
});

test("aggregateOcUsage averages the fingerprint across played stints", () => {
  const oc = { name: "Test OC", stints: [{ year: 2024, team: "CHI" }] };
  const agg = aggregateOcUsage(oc, players, { 2024: stats }, { 2024: null });
  assert.equal(agg.played.length, 1);
  assert.ok(close(agg.fingerprint.passRate, 110 / 210));
  assert.ok(close(agg.fingerprint.leadCarryShare, 0.8));
  assert.ok(close(agg.fingerprint.teamAdot, 1000 / 100));
});

test("aggregateOcUsage flags unplayed stints (no stats yet)", () => {
  const oc = { name: "Test OC", stints: [{ year: 2099, team: "CHI" }] };
  const agg = aggregateOcUsage(oc, players, {}, {});
  assert.equal(agg.played.length, 0);
  assert.equal(agg.fingerprint.passRate, null);
});

test("buildSeasonUsage applies the min-games filter to player boards", () => {
  const cameo = { ...stats, wr2: { rec_tgt: 5, off_snp: 50, tm_off_snp: 1000, gp: 1, pts_ppr: 8 } };
  const cameoPlayers = { ...players, wr2: { full_name: "One Game", team: "CHI", position: "WR" } };
  const { playerRows, teamRows } = buildSeasonUsage(cameoPlayers, cameo, null, {}, { minGp: 4 });
  assert.ok(!playerRows.some((p) => p.id === "wr2"), "1-game cameo filtered out");
  assert.ok(playerRows.some((p) => p.id === "wr1"));
  // every NFL team gets a summary row
  assert.equal(teamRows.length, 32);
});

test("formatting + label helpers handle nulls", () => {
  assert.equal(pct(null), "—");
  assert.equal(pct(0.27, 1), "27.0%");
  assert.equal(dec(null), "—");
  assert.equal(dec(11.76, 1), "11.8");
  assert.equal(concentrationLabel(null), "—");
  assert.equal(concentrationLabel(0.5), "Bell-cow");
  assert.equal(concentrationLabel(0.1), "Committee");
});
