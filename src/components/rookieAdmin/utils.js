import { BLUE_BLOOD_TEAMS, P5_TEAMS, dynastyScore } from "../../lib/prospectScoring.js";
import { SESSION_KEY } from "./constants.js";

export function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
export function saveSession(user) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch {}
}
export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export function normalizeName(s) {
  return (s || "").toLowerCase().replace(/[^a-z]/g, "");
}

export function computeCurrentDraftYear() {
  const n = new Date();
  return n.getMonth() >= 4 ? n.getFullYear() + 1 : n.getFullYear();
}

export function schoolTier(team) {
  if (!team) return 2;
  if (BLUE_BLOOD_TEAMS.has(team)) return 5;
  if (P5_TEAMS.has(team)) return 3;
  return 2;
}

export function gradeLetter(score) {
  if (score >= 78) return "A";
  if (score >= 62) return "B";
  if (score >= 46) return "C";
  if (score >= 30) return "D";
  return "F";
}

export function blankSeason(position) {
  const base = { season_year: "", age: "", school: "", games: "" };
  if (position === "QB") return {
    ...base,
    completions: "", pass_attempts: "", completion_pct: "", passing_yards: "", yards_per_attempt: "",
    passer_rating: "", passing_tds: "", interceptions: "", sacks: "",
    rushing_yards: "", rushing_tds: "", fumbles_lost: "",
  };
  if (position === "RB") return {
    ...base,
    rush_attempts: "", rushing_yards: "", yards_per_carry: "", longest_rush: "", rushing_tds: "",
    targets: "", receptions: "", receiving_yards: "", target_share_pct: "", receiving_tds: "",
    total_tds: "", fumbles_lost: "",
  };
  return {
    ...base,
    targets: "", receptions: "", receiving_yards: "", yards_per_reception: "",
    target_share_pct: "", catch_rate_pct: "", receiving_tds: "", longest_reception: "",
    rush_attempts: "", rushing_yards: "", rushing_tds: "",
    special_teams_yards: "", fumbles_lost: "",
  };
}

export function initAddForm(position = "WR") {
  return {
    id: null,
    position,
    name: "",
    projectedDraftYear: String(computeCurrentDraftYear()),
    draftCapital: "",
    comparablePlayer: "",
    declared: false,
    rookieDraftAdp: "",
    landingSpot: "",
    tier: "",
    athletic: {},
    seasons: [blankSeason(position)],
  };
}

export function computeValueScore(p, grade, sleeperRank, rosterData) {
  const ds = dynastyScore(grade, p.position, p.seasons);
  const sleeperBonus = typeof sleeperRank === "number" ? Math.max(0, (50 - sleeperRank) * 0.3) : 0;
  const tradeValue = rosterData?.tradeValues?.[p.name] ?? grade * 0.8;
  return Math.round((ds + sleeperBonus + tradeValue * 0.05) * 10) / 10;
}
