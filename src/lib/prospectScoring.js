// Shared prospect scoring logic — used by RookieProspector (admin) and public rankings pages.

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
export function computeGrade(prospect, sleeperRank, capitalOverride, declared = false, annTier = "", ignoreCapital = false) {
  const school     = deriveSchool(prospect);
  const { position, athletic, draftCapital } = prospect;
  const capitalKey = capitalOverride || draftCapital || "";
  const num = (v) => parseFloat(v) || 0;

  if (!prospect.seasons || prospect.seasons.length === 0) {
    return { total: 35, components: { age: 55, prod: 35, avail: 25, trend: 50, situ: CONFERENCE_SCORES[school] ?? 40, athletic: 0, mkt: null, confidence: 50 } };
  }

  const sorted = [...prospect.seasons].sort((a, b) => Number(a.season_year) - Number(b.season_year));
  const recent = sorted[sorted.length - 1];
  const prev   = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  // Age curve: peak at 21–22, penalize too-young (insufficient sample) AND too-old (less upside)
  const ageAtDraft = num(recent.age) || 22;
  const ageComp = Math.max(20, Math.min(100,
    100 - Math.max(0, 21 - ageAtDraft) * 8 - Math.max(0, ageAtDraft - 22) * 14
  ));

  // Position-specific production. Tighter scales force mid-tier stat lines to score
  // in the 40s/50s rather than crowding the 70s — that's what makes "good" vs "elite"
  // visible in the final grade.
  let prodComp = 50;
  if (position === "WR") {
    const score = (s) => {
      const g    = Math.max(1, num(s.games));
      // TS curve: 20%=50 (anchor), 25%≈72, 28%=85, 32%+=100. Realistic college
      // ceiling is 32–35%, so old `ts*2.5` (40%=100) bunched elite with very-good.
      const tsRaw = num(s.target_share_pct);
      const ts   = Math.min(100, tsRaw * 2.5 + Math.max(0, tsRaw - 20) * 1.875);
      const ypr  = Math.min(100, num(s.yards_per_reception) * 4);           // 25 YPR = 100, 15 = 60
      const cr   = Math.min(100, num(s.catch_rate_pct) * 1.1);              // 91% CR = 100, 65% = 71
      const ypg  = Math.min(100, (num(s.receiving_yards) / g) * 0.7);       // 143 yds/g = 100, 80 = 56
      const tdpg = Math.min(100, (num(s.receiving_tds) / g) * 60);          // 1.67 TD/g = 100, 0.6 = 36
      const lng  = num(s.longest_reception);
      const lngComp = lng > 0 ? Math.min(100, lng * 1.1) : 0;               // 91+ yard play = 100
      const expBonus = lng > 0 ? lngComp * 0.05 : 0;                        // small extra for explosive ability
      return ts * 0.30 + ypg * 0.17 + ypr * 0.15 + cr * 0.15 + tdpg * 0.18 + lngComp * 0.05 + expBonus;
    };
    prodComp = Math.round(Math.max(...sorted.map(score)) * 0.40 + score(recent) * 0.60);
  } else if (position === "TE") {
    const score = (s) => {
      const g    = Math.max(1, num(s.games));
      // TE scales: target shares are structurally lower (offense flows through WRs)
      // and YPG ceilings are ~half of WR. 8%=30, 12%≈52, 18%=85, 22%+=100.
      const tsRaw = num(s.target_share_pct);
      const ts   = Math.min(100, Math.max(0, (tsRaw - 8) * 5.5 + 30));
      const ypr  = Math.min(100, num(s.yards_per_reception) * 4);           // 25 YPR = 100, 15 = 60
      const cr   = Math.min(100, num(s.catch_rate_pct) * 1.1);              // 91% CR = 100, 65% = 71
      const ypg  = Math.min(100, (num(s.receiving_yards) / g) * 1.4);       // 71 yds/g = 100, 50 = 70
      const tdpg = Math.min(100, (num(s.receiving_tds) / g) * 60);          // 1.67 TD/g = 100, 0.6 = 36
      const lng  = num(s.longest_reception);
      const lngComp = lng > 0 ? Math.min(100, lng * 1.1) : 0;
      // TE-tuned weights: trim TS (lower ceiling = less signal), bump CR (drops are
      // death at TE) and tdpg (red-zone usage is the key separator at the position).
      return ts * 0.25 + ypg * 0.17 + ypr * 0.15 + cr * 0.18 + tdpg * 0.20 + lngComp * 0.05;
    };
    prodComp = Math.round(Math.max(...sorted.map(score)) * 0.40 + score(recent) * 0.60);
  } else if (position === "QB") {
    const score = (s) => {
      const g    = Math.max(1, num(s.games));
      const att  = Math.max(1, num(s.pass_attempts));
      const cp   = Math.min(100, num(s.completion_pct) * 1.2);              // 83% CP = 100, 65% = 78
      const ypa  = Math.min(100, num(s.yards_per_attempt) * 8);             // 12.5 YPA = 100, 8.5 = 68
      const tdPct  = Math.min(100, (num(s.passing_tds) / att) * 1200);      // 8.3% TD = 100, 5% = 60
      const intPct = Math.max(0, 100 - (num(s.interceptions) / att) * 2000);// 5% INT = 0, 2% = 60
      const tdpg = Math.min(100, (num(s.passing_tds) / g) * 22);            // 4.5 TD/g = 100
      const rtg  = num(s.passer_rating);
      // Passer rating curve stretched so elite ratings separate from very-good:
      // 130≈30, 155≈57, 175≈80, 195+ caps at 100. Prior curve saturated at 155
      // and bunched everyone from solid → elite at the ceiling.
      const rtgComp = rtg > 0 ? Math.min(100, Math.max(0, (rtg - 130) * 1.1 + 30)) : null;
      const efficiency = rtgComp != null ? rtgComp : (cp * 0.4 + ypa * 0.6);
      // Catchable-rate (% of throws on-target) is pure QB accuracy independent
      // of drops or hero catches. When entered, it displaces 0.10 from the
      // efficiency bucket so QBs aren't credited/penalized for receiver play.
      // 65%=0, 75%=50, 82%=85, 85%+=100 — separates elite from very-good.
      const ctchRaw = num(s.catchable_rate_pct);
      const ctchComp = ctchRaw > 0 ? Math.min(100, Math.max(0, (ctchRaw - 65) * 5)) : null;
      if (ctchComp == null) {
        return efficiency * 0.40 + tdPct * 0.18 + tdpg * 0.12 + ypa * 0.15 + intPct * 0.15;
      }
      return efficiency * 0.30 + ctchComp * 0.10 + tdPct * 0.18 + tdpg * 0.12 + ypa * 0.15 + intPct * 0.15;
    };
    prodComp = Math.round(Math.max(...sorted.map(score)) * 0.40 + score(recent) * 0.60);
  } else if (position === "RB") {
    const score = (s) => {
      const g    = Math.max(1, num(s.games));
      const ypc  = Math.min(100, num(s.yards_per_carry) * 12);              // 8.3 YPC = 100, 5.5 = 66
      const ypg  = Math.min(100, (num(s.rushing_yards) / g) * 0.55);        // 182 yds/g = 100, 100 = 55
      const ts   = Math.min(100, num(s.target_share_pct) * 5);              // 20% TS for an RB is elite
      const recPg= Math.min(100, (num(s.receptions) / g) * 22);             // 4.5 rec/g = 100
      const ruTd = num(s.rushing_tds);
      const reTd = num(s.receiving_tds);
      const totalTds = (ruTd + reTd) > 0 ? (ruTd + reTd) : num(s.total_tds);
      const tdpg = Math.min(100, (totalTds / g) * 65);                      // 1.54 TD/g = 100
      const lng  = num(s.longest_rush);
      const lngComp = lng > 0 ? Math.min(100, lng * 1.0) : 0;               // 100-yd run = 100
      return ypc * 0.30 + ypg * 0.20 + tdpg * 0.25 + ts * 0.10 + recPg * 0.10 + lngComp * 0.05;
    };
    prodComp = Math.round(Math.min(100, Math.max(...sorted.map(score)) * 0.40 + score(recent) * 0.60));
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

  const situComp = CONFERENCE_SCORES[school] ?? 40;

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
