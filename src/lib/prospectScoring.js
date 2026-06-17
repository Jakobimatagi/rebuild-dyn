// Shared prospect scoring logic — used by RookieProspector (admin) and public rankings pages.

import { TEAM_SITU } from "./teamTalent.js";

export const BLUE_BLOOD_TEAMS = new Set([
  "Alabama","Georgia","Ohio State","Michigan","LSU","Texas","Oklahoma","Notre Dame",
  "Clemson","USC","Penn State","Oregon","Florida","Miami","Tennessee","Auburn",
  "Florida State","Washington","Ole Miss","Oklahoma State","Texas A&M",
]);

export const P5_TEAMS = new Set([
  "Alabama","Georgia","Ohio State","Michigan","Texas","LSU","Oklahoma","Penn State",
  "Notre Dame","Clemson","Florida","Auburn","Tennessee","Florida State","Miami","USC",
  "Oregon","Washington","Wisconsin","Iowa","Michigan State","Nebraska","UCLA","Stanford",
  "North Carolina","NC State","Virginia Tech","Pittsburgh","Texas A&M","Arkansas",
  "Missouri","South Carolina","Kentucky","Mississippi State","Ole Miss","Vanderbilt",
  "Illinois","Indiana","Maryland","Minnesota","Northwestern","Purdue","Rutgers",
  "Iowa State","Kansas","Kansas State","Oklahoma State","TCU","Texas Tech","Baylor",
  "West Virginia","Cincinnati","Houston","BYU","UCF","Utah","Colorado","Arizona",
  "Arizona State","California","Washington State","Oregon State","Boston College",
  "Duke","Georgia Tech","Louisville","Syracuse","Wake Forest","Virginia","SMU",
]);

export const CAPITAL_PROD_SCORES = {
  early_1: 95, mid_1: 85, late_1: 78,
  early_2: 65, mid_2: 62, late_2: 58,
  early_3: 45, late_3: 40, day3: 28, udfa: 15,
};

// CFBD PPA (per-play value) calibration, by position. [p50, p90] of the FBS PPA
// distribution at each position (draft classes 2021–24): a PPA at the 50th pct
// scores 50, the 90th pct scores 85 (linear, clamped 0–100). PPA_WEIGHT is the
// share of the production component PPA can move — heaviest at QB, where it most
// strongly predicts draft capital (ρ≈0.51 vs ~0.13 for skill positions).
export const PPA_ANCHORS = { WR: [0.67, 1.41], RB: [0.11, 0.42], TE: [0.70, 1.60], QB: [0.24, 0.57] };
export const PPA_WEIGHT  = { WR: 0.10, RB: 0.10, TE: 0.10, QB: 0.18 };

export const CONFERENCE_SCORES = {
  Alabama: 95, Georgia: 95, LSU: 90, Tennessee: 88, Florida: 85, Auburn: 83,
  "Texas A&M": 85, "Ole Miss": 82, Arkansas: 78, Missouri: 75, Kentucky: 75,
  "South Carolina": 73, "Mississippi State": 72, Vanderbilt: 68,
  Texas: 87, Oklahoma: 85,
  "Ohio State": 95, Michigan: 90, "Penn State": 88, Oregon: 85, USC: 83,
  Washington: 80, Wisconsin: 80, Iowa: 78, "Michigan State": 77, Nebraska: 75,
  UCLA: 75, Minnesota: 72, Illinois: 70, Indiana: 70, Maryland: 68,
  Purdue: 68, Rutgers: 65, Northwestern: 65,
  "Oklahoma State": 78, TCU: 75, Baylor: 73, "Texas Tech": 72,
  "Kansas State": 70, "Iowa State": 68, "West Virginia": 72, UCF: 68,
  Cincinnati: 68, Houston: 65, BYU: 65, Arizona: 65, "Arizona State": 70,
  Utah: 72, Colorado: 62, Kansas: 60,
  Clemson: 88, "Florida State": 85, Miami: 82, "North Carolina": 75,
  "NC State": 72, "Virginia Tech": 70, Pittsburgh: 70, Louisville: 70,
  "Georgia Tech": 68, Stanford: 75, California: 65, Syracuse: 65,
  Duke: 63, "Boston College": 63, "Wake Forest": 60, Virginia: 58, SMU: 65,
  "Notre Dame": 88,
  "Washington State": 62, "Oregon State": 60,
};

export const TIER_RANK = Object.fromEntries(
  ["Cornerstone","Foundational","Upside Shot","Mainstay","Productive Vet",
   "Short Term League Winner","Short Term Production","Serviceable",
   "JAG - Insurance","JAG - Developmental","Replaceable"].map((t, i) => [t, i])
);

// User-assigned tier as a grade lever. Stats can't see scouting concerns
// (decision-making, mobility, scheme fit, NFL projection), so manual tier
// conviction nudges the final number — JAG/Replaceable buries a prospect
// the model would otherwise grade fairly on raw production. Negative side
// is deliberately steeper than positive: stats already reward production,
// so an "Upside Shot" doesn't need a huge bump, but a "JAG" tag has to
// override otherwise-fine raw numbers.
export const TIER_GRADE_NUDGE = {
  "Cornerstone":              6,
  "Foundational":             4,
  "Upside Shot":              2,
  "Mainstay":                 0,
  "Productive Vet":           0,
  "Short Term League Winner": -2,
  "Short Term Production":    -2,
  "Serviceable":              -5,
  "JAG - Insurance":          -10,
  "JAG - Developmental":      -15,
  "Replaceable":              -22,
};

// Common alternate spellings → CFBD's canonical school name (the keys used in
// TEAM_SITU). CFBD-autofilled prospects already carry CFBD names, but manually
// entered ones may not — without this they silently miss TEAM_SITU and fall back
// to the old table, leaving the board on a mix of old- and new-scale situ.
export const SCHOOL_ALIASES = {
  "Cal": "California",
  "Hawaii": "Hawai'i",
  "Hawai`i": "Hawai'i",
  "San Jose State": "San José State",
  "Appalachian State": "App State",
  "Miami (FL)": "Miami",
  "Miami FL": "Miami",
  "Miami-FL": "Miami",
  "Mississippi": "Ole Miss",
  "Pitt": "Pittsburgh",
  "USF": "South Florida",
  "UNC": "North Carolina",
  "UMass": "Massachusetts",
  "Southern Cal": "USC",
  "Louisiana-Lafayette": "Louisiana",
  "Louisiana Lafayette": "Louisiana",
  "UL Lafayette": "Louisiana",
  "Louisiana-Monroe": "UL Monroe",
  "Bowling Green State": "Bowling Green",
  "Texas-San Antonio": "UTSA",
  "Texas-El Paso": "UTEP",
};

export function canonicalSchool(school) {
  if (!school) return school;
  return SCHOOL_ALIASES[school] ?? SCHOOL_ALIASES[school.trim()] ?? school;
}

// Situation score for a school in a given season. Prefers CFBD's year-specific
// recruiting talent composite (TEAM_SITU); falls back to the hand-maintained
// CONFERENCE_SCORES, then a neutral 40. Year-aware so a program's rise/fall is
// reflected (e.g. 2020 Oregon ≠ 2024 Oregon).
export function situForSchool(school, year) {
  const name = canonicalSchool(school);
  const t = year != null ? TEAM_SITU[year]?.[name] : undefined;
  if (t != null) return t;
  return CONFERENCE_SCORES[name] ?? 40;
}

export function deriveSchool(p) {
  if (!p.seasons || !p.seasons.length) return p.school || "";
  const sorted = [...p.seasons].sort((a, b) => Number(a.season_year) - Number(b.season_year));
  return (sorted[sorted.length - 1].school || p.school || "").trim();
}

// `declared` flag gates pre-NFL combine/pro-day data out of the score for prospects
// who haven't officially declared. Underclassmen don't have reliable athletic measurables.
// `annTier` is the user-assigned tier (e.g. "Cornerstone") — when set, the underclassman
// grade cap is lifted, since the user has already expressed a strong opinion on the prospect.
// `ignoreCapital` strips out post-NFL-draft signals (capital blend, market blend) and the
// underclass cap, so prospects across draft years can be compared on stats + context alone.
// Used for the VS class-vs-class view.
// Per-season production score (0–100) for one college season, by position.
// Single source of truth shared by computeGrade (peak 40% / final 60% blend)
// and the deep-dive trajectory chart. Tighter scales push mid-tier lines into
// the 40s/50s so "good" vs "elite" stays visible in the final grade.
export function seasonProdScore(position, s) {
  const num = (v) => parseFloat(v) || 0;
  const g = Math.max(1, num(s.games));
  if (position === "WR") {
    const tsRaw = num(s.target_share_pct);
    const ts   = Math.min(100, tsRaw * 2.5 + Math.max(0, tsRaw - 20) * 1.875); // 20%=50, 28%=85, 32%+=100
    const ypr  = Math.min(100, num(s.yards_per_reception) * 4);
    const cr   = Math.min(100, num(s.catch_rate_pct) * 1.1);
    const ypg  = Math.min(100, (num(s.receiving_yards) / g) * 0.7);
    const tdpg = Math.min(100, (num(s.receiving_tds) / g) * 60);
    const lng  = num(s.longest_reception);
    const lngComp = lng > 0 ? Math.min(100, lng * 1.1) : 0;
    const expBonus = lng > 0 ? lngComp * 0.05 : 0;
    return ts * 0.30 + ypg * 0.17 + ypr * 0.15 + cr * 0.15 + tdpg * 0.18 + lngComp * 0.05 + expBonus;
  }
  if (position === "TE") {
    const tsRaw = num(s.target_share_pct);
    const ts   = Math.min(100, Math.max(0, (tsRaw - 8) * 5.5 + 30)); // structurally lower TS at TE
    const ypr  = Math.min(100, num(s.yards_per_reception) * 4);
    const cr   = Math.min(100, num(s.catch_rate_pct) * 1.1);
    const ypg  = Math.min(100, (num(s.receiving_yards) / g) * 1.4);
    const tdpg = Math.min(100, (num(s.receiving_tds) / g) * 60);
    const lng  = num(s.longest_reception);
    const lngComp = lng > 0 ? Math.min(100, lng * 1.1) : 0;
    return ts * 0.25 + ypg * 0.17 + ypr * 0.15 + cr * 0.18 + tdpg * 0.20 + lngComp * 0.05;
  }
  if (position === "QB") {
    const att  = Math.max(1, num(s.pass_attempts));
    const cp   = Math.min(100, num(s.completion_pct) * 1.2);
    const ypa  = Math.min(100, num(s.yards_per_attempt) * 8);
    const tdPct  = Math.min(100, (num(s.passing_tds) / att) * 1200);
    const intPct = Math.max(0, 100 - (num(s.interceptions) / att) * 2000);
    const tdpg = Math.min(100, (num(s.passing_tds) / g) * 22);
    const rtg  = num(s.passer_rating);
    const rtgComp = rtg > 0 ? Math.min(100, Math.max(0, (rtg - 130) * 1.1 + 30)) : null; // 130≈30, 175≈80
    const efficiency = rtgComp != null ? rtgComp : (cp * 0.4 + ypa * 0.6);
    const ctchRaw = num(s.catchable_rate_pct);
    const ctchComp = ctchRaw > 0 ? Math.min(100, Math.max(0, (ctchRaw - 65) * 5)) : null;
    if (ctchComp == null) return efficiency * 0.40 + tdPct * 0.18 + tdpg * 0.12 + ypa * 0.15 + intPct * 0.15;
    return efficiency * 0.30 + ctchComp * 0.10 + tdPct * 0.18 + tdpg * 0.12 + ypa * 0.15 + intPct * 0.15;
  }
  if (position === "RB") {
    const ypc  = Math.min(100, num(s.yards_per_carry) * 12);
    const ypg  = Math.min(100, (num(s.rushing_yards) / g) * 0.55);
    const ts   = Math.min(100, num(s.target_share_pct) * 5);
    const recPg= Math.min(100, (num(s.receptions) / g) * 22);
    const ruTd = num(s.rushing_tds), reTd = num(s.receiving_tds);
    const totalTds = (ruTd + reTd) > 0 ? (ruTd + reTd) : num(s.total_tds);
    const tdpg = Math.min(100, (totalTds / g) * 65);
    const lng  = num(s.longest_rush);
    const lngComp = lng > 0 ? Math.min(100, lng * 1.0) : 0;
    return ypc * 0.30 + ypg * 0.20 + tdpg * 0.25 + ts * 0.10 + recPg * 0.10 + lngComp * 0.05;
  }
  return 50;
}

// Prospect archetype from the final-season stat/usage/PPA profile. Pure
// classification for the deep-dive (no grade impact) — a quick read on *how* a
// player produced, not how much. Returns { name, blurb, color }.
const ARCHETYPE_COLORS = { elite: "#00f5a0", good: "#7b8cff", neutral: "#9aa4bf", dev: "#808898" };
export function deriveArchetype(prospect) {
  const num = (v) => parseFloat(v) || 0;
  const pos = prospect.position;
  const seasons = [...(prospect.seasons || [])].sort((a, b) => Number(a.season_year) - Number(b.season_year));
  if (!seasons.length) return null;
  const s = seasons[seasons.length - 1];
  const ath = prospect.athletic || {};
  const ppa = ath.ppa?.[s.season_year] || {};
  const use = ath.use?.[s.season_year] || {};
  const g = Math.max(1, num(s.games));
  const A = (name, blurb, tone = "good") => ({ name, blurb, color: ARCHETYPE_COLORS[tone] });

  if (pos === "WR") {
    const ts = num(s.target_share_pct), ypr = num(s.yards_per_reception);
    const rushU = num(use.rush);
    if (rushU >= 0.05 || num(s.rush_attempts) / g >= 1.5) return A("Gadget / Slot", "Manufactured touches via motion and the run game on top of receiving work.", "neutral");
    if (ts >= 25) return ypr >= 15 ? A("Alpha X", "True No. 1 — commands a huge target share and wins downfield.", "elite")
                                   : A("Volume Possession", "High-volume chain-mover; earns targets more than he stretches the field.");
    if (ts >= 20) return A("Volume Possession", "Featured, high-volume role; earns targets more than he stretches the field.");
    if (ypr >= 16) return A("Field Stretcher", "Lower volume but explosive — a vertical, big-play profile.");
    return A("Rotational / Developmental", "Complementary college usage; projection leans on traits and landing spot.", "dev");
  }
  if (pos === "RB") {
    const domRaw = parseFloat(ath.dom?.[s.season_year]);
    const dom = Number.isFinite(domRaw) ? domRaw : null;
    const recPg = num(s.receptions) / g, ts = num(s.target_share_pct), ypc = num(s.yards_per_carry);
    if (recPg >= 3 || ts >= 12) return A("Receiving Back", "Real passing-down value — a true three-down / PPR asset.", "elite");
    if ((dom != null && dom >= 32) || num(use.rush) >= 0.55) return A("Workhorse", "Carries the offense — bell-cow scrimmage share.", "elite");
    if (ypc >= 6 || num(ppa.all) >= 0.35) return A("Explosive / Boom", "Big-play efficiency; home-run hitter who may not be a true workhorse.");
    return A("Committee / Rotational", "Shared a backfield in college; volume projection is the question.", "neutral");
  }
  if (pos === "TE") {
    const ts = num(s.target_share_pct), ypr = num(s.yards_per_reception), tdpg = num(s.receiving_tds) / g;
    if (ts >= 18) return A("Move / Receiving TE", "Offense-warping receiving role at the position — a true mismatch.", "elite");
    if (tdpg >= 0.5) return A("Red-Zone Weapon", "Touchdown-dependent scoring profile; volume is thinner.");
    if (ts >= 12 || ypr >= 14) return A("Flex Seam", "Developing receiving role with field-stretching flashes.");
    return A("Inline / Developmental", "Light receiving usage in college; receiving projection is speculative.", "dev");
  }
  if (pos === "QB") {
    const rushYpg = num(s.rushing_yards) / g, ypa = num(s.yards_per_attempt), cp = num(s.completion_pct);
    const rushTd = num(s.rushing_tds);
    if (rushYpg >= 40 || rushTd >= 8 || num(ppa.rush) >= 0.3) return A("Dual-Threat", "Rushing equity adds a fantasy floor on top of his arm.", "elite");
    if (ypa >= 9.2) return A("Gunslinger", "Aggressive, high-aDOT passer — big plays with some volatility.");
    if (cp >= 68 && ypa < 8.5) return A("Game Manager", "Accurate and efficient but lower-ceiling as a passer.", "neutral");
    return A("Pocket Passer", "Wins from the pocket with timing and accuracy.");
  }
  return null;
}

export function computeGrade(prospect, sleeperRank, capitalOverride, declared = false, annTier = "", ignoreCapital = false) {
  const school     = deriveSchool(prospect);
  const { position, athletic, draftCapital } = prospect;
  const capitalKey = capitalOverride || draftCapital || "";
  const num = (v) => parseFloat(v) || 0;

  if (!prospect.seasons || prospect.seasons.length === 0) {
    return { total: 35, components: { age: 55, prod: 35, avail: 25, trend: 50, situ: situForSchool(school), athletic: 0, mkt: null, confidence: 50 } };
  }

  const sorted = [...prospect.seasons].sort((a, b) => Number(a.season_year) - Number(b.season_year));
  const recent = sorted[sorted.length - 1];
  const prev   = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  // Age curve: peak at 21–22, penalize too-young (insufficient sample) AND too-old (less upside)
  const ageAtDraft = num(recent.age) || 22;
  const ageComp = Math.max(20, Math.min(100,
    100 - Math.max(0, 21 - ageAtDraft) * 8 - Math.max(0, ageAtDraft - 22) * 14
  ));

  // Position-specific production: peak season 40% / final season 60%, via the
  // shared per-season scorer (single source of truth with the deep-dive chart).
  let prodComp = 50;
  if (["WR", "TE", "QB", "RB"].includes(position)) {
    const peak = Math.max(...sorted.map((s) => seasonProdScore(position, s)));
    const rec  = seasonProdScore(position, recent);
    const blended = peak * 0.40 + rec * 0.60;
    prodComp = Math.round(position === "RB" ? Math.min(100, blended) : blended);
  }

  // RB total-offense dominator (CFBD): the back's share of team scrimmage
  // yards/TDs — a workhorse signal raw per-game stats miss. Stored per season in
  // the athletic bag by the importer; blended into production at 15% when present.
  // 38%+ ≈ elite (≈100), 25% ≈ 65, 20% ≈ 52.
  if (position === "RB" && athletic?.dom) {
    const dom = parseFloat(athletic.dom[recent.season_year]);
    if (Number.isFinite(dom) && dom > 0) {
      const domScore = Math.min(100, dom * 2.6);
      prodComp = Math.round(prodComp * 0.85 + domScore * 0.15);
    }
  }

  // WR/TE QB-help context (CFBD): production behind a weak passer is underrated,
  // behind an elite passer slightly inflated. `qb[year] = { p: percentile }` from
  // the importer. Light, capped at ±4 (50th pct = no change).
  if ((position === "WR" || position === "TE") && athletic?.qb) {
    const qbPct = parseFloat(athletic.qb[recent.season_year]?.p);
    if (Number.isFinite(qbPct)) {
      const nudge = Math.max(-4, Math.min(4, (50 - qbPct) / 12.5));
      prodComp = Math.max(0, Math.min(100, prodComp + nudge));
    }
  }

  // Per-play efficiency (CFBD PPA — its EPA equivalent). `ppa[year] = { all, ... }`
  // from the importer. Backtest (2026-06-17, draft classes 2021–24 vs draft
  // capital): PPA strongly orders QB capital (Spearman ρ≈0.51) and cleanly
  // separates NFL-caliber skill players from the pool (drafted mean ≫ pool), with
  // a lighter ordering signal among drafted skill players. So it's a position-aware
  // production nudge — anchored to each position's PPA distribution (p50→50, p90→85)
  // and weighted heaviest for QB, where the signal is strongest. Uses the final
  // college season (falls back to peak), mirroring the dominator blend.
  if (athletic?.ppa && PPA_ANCHORS[position]) {
    let ppaVal = parseFloat(athletic.ppa[recent.season_year]?.all);
    if (!Number.isFinite(ppaVal)) {
      const vals = sorted.map((s) => parseFloat(athletic.ppa[s.season_year]?.all)).filter(Number.isFinite);
      ppaVal = vals.length ? Math.max(...vals) : null;
    }
    if (ppaVal != null) {
      const [p50, p90] = PPA_ANCHORS[position];
      const ppaScore = Math.max(0, Math.min(100, 50 + ((ppaVal - p50) / (p90 - p50)) * 35));
      const w = PPA_WEIGHT[position];
      prodComp = Math.round(prodComp * (1 - w) + ppaScore * w);
    }
  }

  // Ball-security penalty: lost fumbles per game (caps at -12)
  const fumblesLost = num(recent.fumbles_lost) || num(recent.fumbles);
  const fumblesPg   = fumblesLost / Math.max(1, num(recent.games));
  prodComp = Math.max(0, prodComp - Math.min(12, fumblesPg * 35));

  const dcScore = CAPITAL_PROD_SCORES[capitalKey] ?? null;
  if (dcScore != null && !ignoreCapital) prodComp = Math.round(prodComp * 0.40 + dcScore * 0.60);

  const availComp = Math.round(
    Math.min(100, (num(recent.games) / 13) * 100) * 0.60 +
    Math.min(100, sorted.length * 25) * 0.40,
  );

  // Default trend penalizes single-season samples (no growth signal yet)
  let trendComp = prev ? 60 : 48;
  if (prev) {
    let delta = 0;
    if (position === "WR" || position === "TE") delta = num(recent.target_share_pct) - num(prev.target_share_pct);
    else if (position === "QB")                 delta = num(recent.yards_per_attempt) - num(prev.yards_per_attempt);
    else if (position === "RB")                 delta = num(recent.yards_per_carry)   - num(prev.yards_per_carry);
    if (position === "WR" || position === "TE") trendComp = Math.min(100, Math.max(15, 65 + delta * 2.5));
    else if (position === "QB")                 trendComp = Math.min(100, Math.max(15, 65 + delta * 10));
    else if (position === "RB")                 trendComp = Math.min(100, Math.max(15, 65 + delta * 15));

    // Injury-context floor: a peak season followed by a reduced-games return
    // year is a high-floor profile, not a genuine decliner. Don't penalize
    // trend below 55 when the previous season was elite AND the recent season
    // had clearly reduced availability (Tyson knee-injury case).
    const recentGames = num(recent.games);
    const prevGames   = num(prev.games);
    const reducedAvail = recentGames > 0 && prevGames > 0 && recentGames < prevGames * 0.85;
    let prevElite = false;
    if (position === "WR" || position === "TE") prevElite = num(prev.target_share_pct)  >= 25;
    else if (position === "QB")                 prevElite = num(prev.yards_per_attempt) >= 9;
    else if (position === "RB")                 prevElite = num(prev.yards_per_carry)   >= 6;
    if (reducedAvail && prevElite && trendComp < 55) trendComp = 55;
  }

  const situComp = situForSchool(school, recent.season_year);

  // Combine/pro-day data is unreliable until a player declares — gate the bonus.
  let athleticBonus = 0;
  if (declared && athletic) {
    const ss  = num(athletic.speedScore);
    const bs  = num(athletic.burstScore);
    const ags = num(athletic.agilityScore);
    if (ss  > 0) athleticBonus += Math.min(4, Math.max(0, (ss  - 95) * 0.2));
    if (bs  > 0) athleticBonus += Math.min(3, Math.max(0, (bs  - 95) * 0.15));
    if (ags > 0) athleticBonus += Math.min(3, Math.max(0, (ags - 95) * 0.15));
  }

  // Sample-size confidence: 1 season = 0.92, 2 = 0.97, 3+ = 1.0 (light dampening, not heavy)
  const confidence = Math.min(1.0, 0.86 + sorted.length * 0.06);

  // Production carries the grade. Differentiation comes from what the user enters,
  // not from age/school context that's similar across most prospects.
  let rawScore = Math.round((
    prodComp  * 0.50 +
    ageComp   * 0.20 +
    availComp * 0.10 +
    trendComp * 0.10 +
    situComp  * 0.10
  ) * confidence) + Math.round(athleticBonus);

  // User tier conviction adjusts the grade. JAG/Replaceable buries a prospect
  // whose stats are okay but whom the user has flagged based on tape/scouting.
  rawScore = Math.max(0, rawScore + (TIER_GRADE_NUDGE[annTier] || 0));

  // Underclassmen with no NFL signal AND no user-assigned tier or comp can't easily
  // reach A territory — too speculative. A tier or comp is treated as user conviction.
  // (Skipped in ignoreCapital mode so cross-class VS comparisons aren't asymmetric.)
  const hasComp = !!(prospect.comparablePlayer || prospect.comparable_player);
  if (!ignoreCapital && !declared && !capitalKey && typeof sleeperRank !== "number" && !annTier && !hasComp) {
    rawScore = Math.min(78, rawScore);
  }

  let mkt = null;
  let total = Math.min(99, rawScore);
  if (typeof sleeperRank === "number") {
    mkt = Math.max(5, Math.round(100 - Math.log2(Math.max(1, sleeperRank)) * 10));
    // Market blend only applies when there's no draft capital and we're not in
    // ignoreCapital mode. Capital is the post-NFL-draft consensus signal already
    // baked into prodComp; layering Sleeper's dynasty ADP on top double-counts.
    if (!capitalKey && !ignoreCapital) {
      total = Math.min(99, Math.round(rawScore * 0.40 + mkt * 0.60));
    }
  }

  return {
    total,
    components: {
      age: ageComp, prod: prodComp, avail: availComp, trend: trendComp, situ: situComp,
      athletic: Math.round(athleticBonus), mkt, confidence: Math.round(confidence * 100),
    },
  };
}

// Most recent completed NFL draft year. The draft is held late April, so before
// May the latest completed draft is the prior calendar year's.
export function currentDraftYear(now = new Date()) {
  const y = now.getFullYear();
  return now.getMonth() >= 4 ? y : y - 1;
}

// Three-state prospect status, derived from existing data (no migration):
//  - "drafted":  their draft-class year's NFL draft has already happened AND they
//                have draft capital → they're in the NFL; we judge how the college
//                profile translates and where they landed.
//  - "declared": flagged declared for an upcoming (not-yet-held) draft → we project
//                draft capital and a landing spot.
//  - "prospect": not declared → a forward-looking, future-class watch.
// `cap`/`declared`/year are read from the annotation first, then the prospect
// record (camelCase admin shape or snake_case public shape).
export function prospectStatus(prospect, annotation = {}, now = new Date()) {
  const cap = annotation.draftCapital || prospect.draftCapital || prospect.draft_capital || "";
  const declared = annotation.declared ?? prospect.declared ?? false;
  const year = parseInt(prospect.projectedDraftYear || prospect.projected_draft_year, 10) || null;
  if (cap && year && year <= currentDraftYear(now)) return "drafted";
  if (declared) return "declared";
  return "prospect";
}

export const PROSPECT_STATUS_META = {
  drafted:  { label: "Drafted",      color: "#00f5a0", blurb: "On an NFL roster — evaluating how the college profile translates to the pros." },
  declared: { label: "Declared",     color: "#7b8cff", blurb: "Declared for the upcoming draft — projecting draft capital and a landing spot." },
  prospect: { label: "Not Declared", color: "#ffd84d", blurb: "Underclassman / future prospect — a forward-looking watch." },
};

// Draft-class year a prospect should be bucketed into. The stored
// `projected_draft_year` is unreliable for undeclared players (often defaulted to
// the current year), so we derive it from NCAA eligibility instead:
//  - drafted / declared → the actual or declared year is authoritative.
//  - undeclared → draft-eligible 3 years after HS graduation, i.e. 3 years after
//    the first college season (HS-grad year ≈ first college season). Clamped so a
//    player never lands earlier than the next upcoming draft (a completed draft
//    can't be a future prospect's "expected" year) and a deliberately-later manual
//    `projected_draft_year` (e.g. a redshirt) is still respected.
// Caveat: first *statistical* season slightly overshoots true HS-grad year for
// redshirts; recruiting class year isn't stored, so this is the best proxy.
export function effectiveDraftYear(prospect, annotation = {}, now = new Date()) {
  const status = prospectStatus(prospect, annotation, now);
  const projected = parseInt(prospect.projectedDraftYear || prospect.projected_draft_year, 10) || null;
  if ((status === "drafted" || status === "declared") && projected) return projected;
  const years = (prospect.seasons || []).map((s) => parseInt(s.season_year, 10)).filter(Boolean);
  const firstSeason = years.length ? Math.min(...years) : null;
  const eligible = firstSeason ? firstSeason + 3 : null;
  const upcoming = currentDraftYear(now) + 1;
  return Math.max(eligible || 0, projected || 0, upcoming);
}

export function deriveTier(grade, capitalKey) {
  const firstRound   = ["early_1", "mid_1", "late_1"].includes(capitalKey);
  const eliteCapital = ["early_1", "mid_1"].includes(capitalKey);
  if (grade >= 78 && eliteCapital) return "Foundational";
  if (grade >= 78 && firstRound)   return "Upside Shot";
  if (grade >= 78)                 return "Upside Shot";
  if (grade >= 62 && firstRound)   return "Upside Shot";
  if (grade >= 62)                 return "Mainstay";
  if (grade >= 46)                 return "JAG - Developmental";
  if (grade >= 30)                 return "Serviceable";
  return "Replaceable";
}

// Per-position prime windows. The `tail` is the number of years past peak before
// significant decline — RBs cliff hard at 27–28, QBs extend deep into their 30s,
// so a uniform `+3` tail mis-reads both extremes. 1QB-tuned multipliers; SF would
// flip QB.mult upward (deferred — see superflex follow-up).
const POSITION_AGING = {
  QB: { mult: 0.85, peakAge: 30, tail: 5 },
  WR: { mult: 1.10, peakAge: 26, tail: 4 },
  TE: { mult: 0.95, peakAge: 27, tail: 4 },
  RB: { mult: 0.92, peakAge: 24, tail: 2 },
};

export function dynastyScore(grade, position, seasons) {
  const cfg = POSITION_AGING[position] ?? { mult: 1.0, peakAge: 26, tail: 3 };
  const sorted  = [...(seasons || [])].sort((a, b) => Number(a.season_year) - Number(b.season_year));
  const recent  = sorted[sorted.length - 1];
  const ageAtDraft = (parseFloat(recent?.age) || 22) + 0.5;
  const primeYears = Math.max(0, cfg.peakAge - ageAtDraft + cfg.tail);
  const ageAdj = Math.min(1.25, 0.85 + primeYears * 0.04);
  return grade * cfg.mult * ageAdj;
}
