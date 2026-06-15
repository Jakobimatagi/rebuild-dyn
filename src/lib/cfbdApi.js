// ── CFBD client ──────────────────────────────────────────────────────────────
// Talks to the /api/cfbd serverless proxy (which holds the key + does the heavy
// filtering) and maps its compact responses into the shapes the Rookie
// Prospector already uses: the per-position `seasons[]` schema (blankSeason),
// a draft-capital key from CAPITAL_PROD_SCORES, and recruiting context.
//
// CFBD returns completion % and usage as fractions (0.665, 0.194); the form
// stores them as percentages (66.5, 19.4), so we scale here.

import { blankSeason } from "../components/rookieAdmin/utils.js";

async function getJson(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/cfbd?${qs}`);
  if (!res.ok) {
    let msg = `CFBD request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

const str = (v) => (v === null || v === undefined ? "" : String(v));
const pct = (v) => (v === null || v === undefined ? "" : String(Math.round(v * 1000) / 10));

// CFBD search can return one row per (player, team); collapse to unique players
// keeping the most recent / first-listed team.
export async function searchPlayers(term) {
  const rows = await getJson({ resource: "search", q: term });
  const seen = new Map();
  for (const r of rows) {
    if (!seen.has(r.id)) seen.set(r.id, r);
  }
  return [...seen.values()];
}

// Map one CFBD career season → a blankSeason-shaped object for the position.
// We start from blankSeason so every field the form expects exists; CFBD fills
// what it has and leaves the rest blank (targets, catch_rate_pct, age, sacks,
// special-teams, fumbles — none are in CFBD's free season feed).
function mapSeason(position, s) {
  const out = blankSeason(position);
  out.season_year = str(s.year);
  out.school = str(s.team);
  out.games = str(s.games);

  const rec = s.receiving || {};
  const rush = s.rushing || {};
  const pass = s.passing || {};

  if (position === "QB") {
    out.completions = str(pass.comp);
    out.pass_attempts = str(pass.att);
    out.completion_pct = pct(pass.pct);
    out.passing_yards = str(pass.yds);
    out.yards_per_attempt = str(pass.ypa);
    out.passer_rating = str(pass.rating);
    out.passing_tds = str(pass.td);
    out.interceptions = str(pass.int);
    out.rushing_yards = str(rush.yds);
    out.rushing_tds = str(rush.td);
    out.fumbles_lost = str(s.fumblesLost);
  } else if (position === "RB") {
    out.rush_attempts = str(rush.car);
    out.rushing_yards = str(rush.yds);
    out.yards_per_carry = str(rush.ypc);
    out.longest_rush = str(rush.long);
    out.rushing_tds = str(rush.td);
    out.receptions = str(rec.rec);
    out.receiving_yards = str(rec.yds);
    out.receiving_tds = str(rec.td);
    out.target_share_pct = pct(s.passUsage);
    const totalTds = (rush.td || 0) + (rec.td || 0);
    out.total_tds = totalTds ? String(totalTds) : "";
    out.fumbles_lost = str(s.fumblesLost);
  } else {
    // WR / TE
    out.receptions = str(rec.rec);
    out.receiving_yards = str(rec.yds);
    out.yards_per_reception = str(rec.ypr);
    out.receiving_tds = str(rec.td);
    out.longest_reception = str(rec.long);
    out.target_share_pct = pct(s.passUsage);
    out.rush_attempts = str(rush.car);
    out.rushing_yards = str(rush.yds);
    out.rushing_tds = str(rush.td);
    out.special_teams_yards = str(s.specialTeamsYds);
    out.fumbles_lost = str(s.fumblesLost);
  }
  return out;
}

// Pull a player's college seasons, mapped to the form schema. `position`
// selects which stat block fills; `from`/`to` bound the year scan.
export async function fetchCareerSeasons(playerId, position, { from, to } = {}) {
  const data = await getJson({
    resource: "career",
    playerId,
    position,
    ...(from ? { from: String(from) } : {}),
    ...(to ? { to: String(to) } : {}),
  });
  const seasons = (data.seasons || []).map((s) => mapSeason(position, s));
  return {
    player: data.player, seasons,
    dominatorByYear: byYear(data.seasons, "dominator"),
    qbHelpByYear: byYear(data.seasons, "qbHelp"),
  };
}

// { [season_year]: <field> } from raw server seasons, skipping null/undefined.
// Stored in the prospect's `athletic` bag and read by the grade/card.
//   dominator (RB) → number%   ·   qbHelp (WR/TE) → { p, r, n }
function byYear(rawSeasons, field) {
  const m = {};
  for (const s of rawSeasons || []) {
    if (s && s[field] != null) m[String(s.year)] = s[field];
  }
  return Object.keys(m).length ? m : null;
}

// Round + pick within round → CAPITAL_PROD_SCORES key. Pick thirds map to
// early/mid/late; rounds 4-7 collapse to day3; missing round = udfa.
export function draftToCapitalKey({ round, pick }) {
  if (round == null) return "udfa";
  const third = pick == null ? "mid" : pick <= 11 ? "early" : pick <= 22 ? "mid" : "late";
  if (round === 1) return `${third}_1`;
  if (round === 2) return `${third}_2`;
  if (round === 3) return pick != null && pick <= 16 ? "early_3" : "late_3";
  if (round >= 4) return "day3";
  return "udfa";
}

export async function fetchDraftInfo(playerId, name, year) {
  const info = await getJson({
    resource: "draft",
    ...(playerId ? { playerId } : {}),
    ...(name ? { name } : {}),
    year: String(year),
  });
  if (!info) return null;
  return { ...info, capitalKey: draftToCapitalKey(info) };
}

export async function fetchRecruiting(playerId, name, year) {
  return getJson({
    resource: "recruiting",
    ...(playerId ? { playerId } : {}),
    ...(name ? { name } : {}),
    year: String(year),
  });
}

export async function fetchClass(year, position, limit = 40) {
  return getJson({ resource: "class", year: String(year), position, limit: String(limit) });
}

// Top-`limit` producers at a position for a college season, each with seasons
// already mapped to the form schema and a draft-capital key resolved. Powers
// the bulk importer. `year` is the college season; prospects' draft year is
// year + 1.
export async function fetchClassImport(year, position, limit = 50) {
  const rows = await getJson({
    resource: "class-import", year: String(year), position, limit: String(limit),
  });
  return rows.map((r) => ({
    playerId: r.playerId,
    name: r.name,
    position,
    seasons: (r.seasons || []).map((s) => mapSeason(position, s)),
    draftCapital: r.draft ? draftToCapitalKey(r.draft) : "",
    dominatorByYear: byYear(r.seasons, "dominator"),
    qbHelpByYear: byYear(r.seasons, "qbHelp"),
  }));
}
