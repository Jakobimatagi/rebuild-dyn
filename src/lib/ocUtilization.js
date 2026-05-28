// ── OC player-utilization engine ─────────────────────────────────────────────
// Reads the *same* cached Sleeper season-stats payload used by teamFantasyRanks,
// but mines the opportunity fields (snaps, targets, carries, air yards, red-zone
// looks) that the PPG-only room ranking ignores. The goal is to characterize
// *how* an offense deploys a position room — funnel vs. committee, alpha vs.
// democracy, downfield vs. underneath — so the OC page can answer usage
// questions, not just production questions.
//
// Denominators come straight from Sleeper's per-team aggregate rows
// (`TEAM_{abbr}`), which carry exact team totals for rec_tgt / rush_att /
// rec_air_yd / rec_rz_tgt / rush_rz_att / pass_att. That makes every share an
// exact fraction rather than a sum-of-individuals estimate (which would miss
// targets/carries that went to players we don't surface). Snap share is the one
// metric that's player-local: off_snp / tm_off_snp, both on the player row.

import { NFL_TEAMS } from "./ocData.js";

export const USAGE_POSITIONS = ["QB", "RB", "WR", "TE"];
const NFL_TEAM_SET = new Set(NFL_TEAMS.map((t) => t.abbr));

function num(v) { return Number(v) || 0; }
function ratio(n, d) { return d > 0 ? n / d : null; }

/**
 * Exact team denominators from the Sleeper TEAM_{abbr} aggregate row.
 * Falls back to zeros (→ null shares) when the row is missing.
 */
export function teamDenominators(seasonStats, teamAbbr) {
  const t = seasonStats?.[`TEAM_${teamAbbr}`] || {};
  return {
    rec_tgt:     num(t.rec_tgt),
    rush_att:    num(t.rush_att),
    rec_air_yd:  num(t.rec_air_yd),
    rec_rz_tgt:  num(t.rec_rz_tgt),
    rush_rz_att: num(t.rush_rz_att),
    pass_att:    num(t.pass_att),
  };
}

/**
 * Per-player usage for one team-season, grouped by position, plus room
 * concentration and the team's pass/run identity.
 *
 * Returns:
 *   {
 *     team, denom,
 *     byPos: { QB:[player…], RB:[…], WR:[…], TE:[…] },   // sorted by pts desc
 *     passRate,                                          // pass_att / (pass+rush)
 *     concentration: {
 *       target: { hhi, effective, lead: {name,pos,share} },
 *       carry:  { hhi, effective, lead: {name,pos,share} },
 *     },
 *     played,                                            // any usage signal at all
 *   }
 *
 * Each player carries every metric the UI cites:
 *   snapShare, targets/targetShare, carries/carryShare,
 *   rzTgt/rzTargetShare, rzCarry/rzCarryShare,
 *   airYards/airYardShare, adot, wopr, touches, plus raw box (rec, yds, tds).
 */
export function buildTeamUsage(players, seasonStats, historicalRoster, teamAbbr) {
  if (!NFL_TEAM_SET.has(teamAbbr)) return null;
  const denom = teamDenominators(seasonStats, teamAbbr);
  const byPos = { QB: [], RB: [], WR: [], TE: [] };

  for (const [id, stat] of Object.entries(seasonStats || {})) {
    if (id.startsWith("TEAM_")) continue;
    const hist = historicalRoster?.[id];
    const fb   = players?.[id];
    const team = hist?.team || fb?.team;
    if (team !== teamAbbr) continue;
    const pos = hist?.position || fb?.position;
    if (!USAGE_POSITIONS.includes(pos)) continue;

    const name = hist?.name
      || fb?.full_name
      || (fb ? `${fb.first_name || ""} ${fb.last_name || ""}`.trim() : id);

    const targets  = num(stat.rec_tgt);
    const carries  = num(stat.rush_att);
    const snaps    = num(stat.off_snp);
    const tmSnaps  = num(stat.tm_off_snp);
    const airYards = num(stat.rec_air_yd);
    const rzTgt    = num(stat.rec_rz_tgt);
    const rzCarry  = num(stat.rush_rz_att);
    const rec      = num(stat.rec);

    const targetShare = ratio(targets, denom.rec_tgt);
    const airYardShare = ratio(airYards, denom.rec_air_yd);

    byPos[pos].push({
      id, name, pos,
      gp:   num(stat.gp),
      pts:  num(stat.pts_ppr),
      // workload
      snaps, tmSnaps,
      snapShare: ratio(snaps, tmSnaps),
      // passing-game role
      targets,
      targetShare,
      airYards,
      airYardShare,
      adot: ratio(airYards, targets),
      // WOPR = 1.5·target-share + 0.7·air-yard-share (Josh Hermsmeyer's metric)
      wopr: (targetShare != null && airYardShare != null)
        ? 1.5 * targetShare + 0.7 * airYardShare
        : null,
      // rushing role
      carries,
      carryShare: ratio(carries, denom.rush_att),
      // red-zone equity
      rzTgt,
      rzTargetShare: ratio(rzTgt, denom.rec_rz_tgt),
      rzCarry,
      rzCarryShare: ratio(rzCarry, denom.rush_rz_att),
      // box context
      rec,
      recYd:  num(stat.rec_yd),
      recTd:  num(stat.rec_td),
      rushYd: num(stat.rush_yd),
      rushTd: num(stat.rush_td),
      touches: carries + rec,
    });
  }

  for (const pos of USAGE_POSITIONS) {
    byPos[pos].sort((a, b) => b.pts - a.pts);
  }

  const all = USAGE_POSITIONS.flatMap((p) => byPos[p]);
  const passRate = ratio(denom.pass_att, denom.pass_att + denom.rush_att);

  const concentration = {
    target: concentrationOf(all, "targetShare"),
    carry:  concentrationOf(all, "carryShare"),
  };

  const played = all.some((p) =>
    p.targets > 0 || p.carries > 0 || p.snaps > 0 || p.pts > 0);

  return { team: teamAbbr, denom, byPos, passRate, concentration, played };
}

/**
 * Herfindahl-style concentration over an already-team-normalized share field
 * (shares sum to ~1 across the offense). hhi = Σ share², effective = 1/hhi
 * (≈ how many players the opportunity is effectively spread across), lead = the
 * single biggest claimant. Returns nulls when there's no usage to measure.
 */
function concentrationOf(playersList, shareKey) {
  let hhi = 0;
  let lead = null;
  for (const p of playersList) {
    const s = p[shareKey];
    if (s == null || s <= 0) continue;
    hhi += s * s;
    if (!lead || s > lead.share) lead = { name: p.name, pos: p.pos, share: s };
  }
  if (hhi === 0) return { hhi: null, effective: null, lead: null };
  return { hhi, effective: 1 / hhi, lead };
}

/**
 * Roll an OC's played stints into a single usage "fingerprint" — the averages
 * the fingerprint panel cites — while keeping the per-stint rows for detail.
 *
 * Returns null when `oc` is undefined; { played:[], … } with empty averages
 * when no stint has loaded/played data yet (caller renders a pending state).
 */
export function aggregateOcUsage(oc, players, statsByYear, rosterByYear) {
  if (!oc) return null;

  const stints = oc.stints.map((s) => {
    const stats  = statsByYear[s.year];
    const roster = rosterByYear[s.year];
    if (!players || !stats) {
      return { stint: s, usage: null, played: false };
    }
    const usage = buildTeamUsage(players, stats, roster, s.team);
    return { stint: s, usage, played: !!usage?.played };
  });

  const played = stints.filter((r) => r.played);
  const avg = (fn) => {
    const vals = played.map(fn).filter((v) => v != null && Number.isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const fingerprint = {
    passRate:        avg((r) => r.usage.passRate),
    leadTargetShare: avg((r) => r.usage.concentration.target.lead?.share),
    leadCarryShare:  avg((r) => r.usage.concentration.carry.lead?.share),
    targetHHI:       avg((r) => r.usage.concentration.target.hhi),
    carryHHI:        avg((r) => r.usage.concentration.carry.hhi),
    // team aDOT = team air yards / team targets (downfield-ness of the scheme)
    teamAdot:        avg((r) => ratio(r.usage.denom.rec_air_yd, r.usage.denom.rec_tgt)),
  };

  return { stints, played, fingerprint };
}

// ── League-wide leaderboards ──────────────────────────────────────────────────
// Build per-player and per-team usage rows across all 32 teams for one season,
// ready to sort into the Phase-C boards.

/**
 * Flatten one season into every player's usage row (team-attributed) plus a
 * per-team summary keyed by abbr. minGp filters out cameo lines that distort
 * share leaderboards (a 1-game player can post a freak single-game share).
 */
export function buildSeasonUsage(players, seasonStats, historicalRoster, ocByTeam = {}, { minGp = 4 } = {}) {
  const teamRows = [];
  const playerRows = [];

  for (const t of NFL_TEAMS) {
    const usage = buildTeamUsage(players, seasonStats, historicalRoster, t.abbr);
    if (!usage) continue;
    teamRows.push({
      team: t.abbr,
      teamName: t.name,
      division: t.division,
      oc: ocByTeam[t.abbr]?.name || null,
      passRate: usage.passRate,
      targetHHI: usage.concentration.target.hhi,
      carryHHI: usage.concentration.carry.hhi,
      leadTarget: usage.concentration.target.lead,
      leadCarry: usage.concentration.carry.lead,
      teamAdot: ratio(usage.denom.rec_air_yd, usage.denom.rec_tgt),
    });
    for (const pos of USAGE_POSITIONS) {
      for (const p of usage.byPos[pos]) {
        if (p.gp < minGp) continue;
        playerRows.push({ ...p, team: t.abbr, oc: ocByTeam[t.abbr]?.name || null });
      }
    }
  }

  return { teamRows, playerRows };
}

// ── Formatting helpers (shared by every usage surface) ───────────────────────
export function pct(v, digits = 0) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function dec(v, digits = 1) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

/**
 * Plain-language backfield/passing-room shape from an HHI value. Tuned for
 * whole-offense share HHIs: a true bell-cow back lands ~0.45+, an even
 * three-way committee ~0.15. Used for the fingerprint's one-word label.
 */
export function concentrationLabel(hhi) {
  if (hhi == null) return "—";
  if (hhi >= 0.40) return "Bell-cow";
  if (hhi >= 0.28) return "Lead-back";
  if (hhi >= 0.18) return "Tilted";
  return "Committee";
}
