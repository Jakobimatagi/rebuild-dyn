// ── Team-room fantasy production ranking ─────────────────────────────────────
// Aggregates Sleeper season stats by NFL team + position to answer "where did
// the X room rank in fantasy PPG out of the 32 teams?". Used by the OC admin
// page so we can correlate scheme/playcaller with downstream fantasy output.
//
// Inputs:
//   players:           Sleeper /players/nfl response — *current* state, used
//                      as a fallback for name when historicalRoster is missing
//                      a player.
//   seasonStats:       Sleeper /stats/nfl/regular/{year} response.
//   historicalRoster:  /api/historical-rosters response for the same year:
//                      { sleeperId: { team, position, name } }. Required for
//                      correct year-aware attribution — Sleeper's player.team
//                      is the *current* team, so without this map every
//                      historical season silently buckets players under their
//                      2026 team.
//
// Notes:
//   - We sum the room's total PPR points and divide by 17 (NFL regular-season
//     length since 2021) to get team-room PPG. Using a fixed denominator keeps
//     comparisons even when individual players miss games — what we're asking
//     is "how productive was the position group as a whole, per team game?".
//   - "FA"/blank teams are dropped — those are players without a team in the
//     stat snapshot at fetch time and would corrupt the room totals.

import { NFL_TEAMS } from "./ocData.js";

export const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE"];
const NFL_REG_GAMES = 17;

const NFL_TEAM_SET = new Set(NFL_TEAMS.map((t) => t.abbr));

/**
 * Build per-team, per-position room totals for a given season.
 * Returns: { [teamAbbr]: { QB: {points, ppg, players: [...] }, RB: {...}, ... } }
 *
 * `historicalRoster` is the season-of-record source-of-truth for team and
 * position. When omitted (e.g., a season we haven't fetched the map for yet)
 * we fall back to the current `players` map, which is wrong for any player
 * who has changed teams — caller should guard against that case in the UI.
 */
export function buildTeamRoomTotals(players, seasonStats, historicalRoster) {
  const totals = {};
  NFL_TEAMS.forEach((t) => {
    totals[t.abbr] = {};
    FANTASY_POSITIONS.forEach((pos) => {
      totals[t.abbr][pos] = { points: 0, players: [] };
    });
  });

  Object.entries(seasonStats || {}).forEach(([playerId, stat]) => {
    const hist     = historicalRoster?.[playerId];
    const fallback = players?.[playerId];
    const team     = hist?.team || fallback?.team;
    if (!team || !NFL_TEAM_SET.has(team)) return;
    const pos      = hist?.position || fallback?.position;
    if (!FANTASY_POSITIONS.includes(pos)) return;
    const points   = Number(stat?.pts_ppr) || 0;
    if (points === 0 && !stat?.gp) return;

    const name = hist?.name
      || fallback?.full_name
      || (fallback ? `${fallback.first_name || ""} ${fallback.last_name || ""}`.trim() : playerId);

    const room = totals[team][pos];
    room.points += points;
    room.players.push({
      id:     playerId,
      name,
      points,
      gp:     Number(stat?.gp) || 0,
    });
  });

  // Compute PPG and sort player lists by points desc for display.
  Object.values(totals).forEach((byPos) => {
    Object.values(byPos).forEach((room) => {
      room.ppg = room.points / NFL_REG_GAMES;
      room.players.sort((a, b) => b.points - a.points);
    });
  });

  return totals;
}

/**
 * For one position, return the teams sorted by total room PPG (desc).
 * Returns: [{ team, points, ppg, rank, players }]
 */
export function rankByPosition(totals, position) {
  const rows = NFL_TEAMS.map((t) => {
    const room = totals[t.abbr]?.[position] || { points: 0, ppg: 0, players: [] };
    return { team: t.abbr, points: room.points, ppg: room.ppg, players: room.players };
  });
  rows.sort((a, b) => b.ppg - a.ppg);
  rows.forEach((row, i) => { row.rank = i + 1; });
  return rows;
}

/**
 * Build the team x position rank matrix used by the table view.
 * Returns: { [teamAbbr]: { QB: { rank, ppg, points }, RB: ..., ... } }
 */
export function buildRankMatrix(totals) {
  const matrix = {};
  NFL_TEAMS.forEach((t) => { matrix[t.abbr] = {}; });

  FANTASY_POSITIONS.forEach((pos) => {
    const ranked = rankByPosition(totals, pos);
    ranked.forEach((row) => {
      matrix[row.team][pos] = {
        rank:   row.rank,
        ppg:    row.ppg,
        points: row.points,
        players: row.players,
      };
    });
  });

  return matrix;
}

/**
 * Pretty rank suffix: "1st", "2nd", "3rd", "4th", … "21st", "22nd", "23rd".
 */
export function ordinal(n) {
  if (!Number.isFinite(n)) return "—";
  const v = Math.abs(n) % 100;
  const s = ["th", "st", "nd", "rd"];
  const k = v % 10;
  return n + (v >= 11 && v <= 13 ? "th" : s[k] || "th");
}

/**
 * Color rank into tiered buckets — top 8 green, 9-16 sky, 17-24 amber, bottom 8 rose.
 */
export function rankColor(rank) {
  if (!rank) return "text-slate-500";
  if (rank <= 8)  return "text-emerald-300";
  if (rank <= 16) return "text-sky-300";
  if (rank <= 24) return "text-amber-300";
  return "text-rose-300";
}
