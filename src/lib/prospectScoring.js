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

export function deriveSchool(p) {
  if (!p.seasons || !p.seasons.length) return p.school || "";
  const sorted = [...p.seasons].sort((a, b) => Number(a.season_year) - Number(b.season_year));
  return (sorted[sorted.length - 1].school || p.school || "").trim();
}

export function computeGrade(prospect, sleeperRank, capitalOverride) {
  const school     = deriveSchool(prospect);
  const { position, athletic, draftCapital } = prospect;
  const capitalKey = capitalOverride || draftCapital || "";
  const num = (v) => parseFloat(v) || 0;

  if (!prospect.seasons || prospect.seasons.length === 0) {
    return { total: 40, components: { age: 60, prod: 40, avail: 40, trend: 60, situ: CONFERENCE_SCORES[school] ?? 40 } };
  }

  const sorted = [...prospect.seasons].sort((a, b) => Number(a.season_year) - Number(b.season_year));
  const recent = sorted[sorted.length - 1];
  const prev   = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  const ageAtDraft = num(recent.age) || 22;
  const ageComp = Math.max(15, Math.min(100, 105 - (ageAtDraft - 20) * 15));

  let prodComp = 50;
  if (position === "WR" || position === "TE") {
    const score = (s) => {
      const ts  = Math.min(100, num(s.target_share_pct) * 3.5);
      const ypr = Math.min(100, num(s.yards_per_reception) * 6);
      const cr  = Math.min(100, num(s.catch_rate_pct) * 1.35);
      return ts * 0.45 + ypr * 0.30 + cr * 0.25;
    };
    prodComp = Math.round(Math.max(...sorted.map(score)) * 0.40 + score(recent) * 0.60);
  } else if (position === "QB") {
    const score = (s) => {
      const g    = Math.max(1, num(s.games));
      const cp   = Math.min(100, num(s.completion_pct) * 1.4);
      const ypa  = Math.min(100, num(s.yards_per_attempt) * 10);
      const tdpg = Math.min(100, (num(s.passing_tds) / g) * 22);
      const int_ = Math.max(0, 100 - (num(s.interceptions) / g) * 40);
      return cp * 0.25 + ypa * 0.40 + tdpg * 0.20 + int_ * 0.15;
    };
    prodComp = Math.round(Math.max(...sorted.map(score)) * 0.40 + score(recent) * 0.60);
  } else if (position === "RB") {
    const score = (s) => {
      const g    = Math.max(1, num(s.games));
      const ypc  = Math.min(100, num(s.yards_per_carry) * 15);
      const ts   = Math.min(100, num(s.target_share_pct) * 4);
      const tdpg = Math.min(100, (num(s.total_tds) / g) * 80);
      return ypc * 0.45 + ts * 0.30 + tdpg * 0.25;
    };
    prodComp = Math.round(Math.max(...sorted.map(score)) * 0.40 + score(recent) * 0.60);
  }

  const dcScore = CAPITAL_PROD_SCORES[capitalKey] ?? null;
  if (dcScore != null) prodComp = Math.round(prodComp * 0.40 + dcScore * 0.60);

  const availComp = Math.round(
    Math.min(100, (num(recent.games) / 13) * 100) * 0.60 +
    Math.min(100, sorted.length * 25) * 0.40,
  );

  let trendComp = 60;
  if (prev) {
    let delta = 0;
    if (position === "WR" || position === "TE") delta = num(recent.target_share_pct) - num(prev.target_share_pct);
    else if (position === "QB")                 delta = num(recent.yards_per_attempt) - num(prev.yards_per_attempt);
    else if (position === "RB")                 delta = num(recent.yards_per_carry)   - num(prev.yards_per_carry);
    if (position === "WR" || position === "TE") trendComp = Math.min(100, Math.max(15, 65 + delta * 2.5));
    else if (position === "QB")                 trendComp = Math.min(100, Math.max(15, 65 + delta * 10));
    else if (position === "RB")                 trendComp = Math.min(100, Math.max(15, 65 + delta * 15));
  }

  const situComp = CONFERENCE_SCORES[school] ?? 40;

  let athleticBonus = 0;
  if (athletic) {
    const ss  = num(athletic.speedScore);
    const bs  = num(athletic.burstScore);
    const ags = num(athletic.agilityScore);
    if (ss  > 0) athleticBonus += Math.min(4, Math.max(0, (ss  - 95) * 0.2));
    if (bs  > 0) athleticBonus += Math.min(3, Math.max(0, (bs  - 95) * 0.15));
    if (ags > 0) athleticBonus += Math.min(3, Math.max(0, (ags - 95) * 0.15));
  }

  const rawScore = Math.round(
    ageComp   * 0.35 + prodComp * 0.30 +
    availComp * 0.15 + trendComp * 0.10 + situComp * 0.10,
  ) + Math.round(athleticBonus);

  let mkt = null;
  let total = Math.min(99, rawScore);
  if (typeof sleeperRank === "number") {
    mkt   = Math.max(5, Math.round(100 - Math.log2(Math.max(1, sleeperRank)) * 10));
    total = Math.min(99, Math.round(rawScore * 0.40 + mkt * 0.60));
  }

  return { total, components: { age: ageComp, prod: prodComp, avail: availComp, trend: trendComp, situ: situComp, athletic: Math.round(athleticBonus), mkt } };
}

export function deriveTier(grade, capitalKey) {
  const firstRound   = ["early_1", "mid_1", "late_1"].includes(capitalKey);
  const eliteCapital = ["early_1", "mid_1"].includes(capitalKey);
  if (grade >= 72 && eliteCapital) return "Foundational";
  if (grade >= 72 && firstRound)   return "Upside Shot";
  if (grade >= 72)                 return "Upside Shot";
  if (grade >= 55 && firstRound)   return "Upside Shot";
  if (grade >= 55)                 return "Mainstay";
  if (grade >= 40)                 return "JAG - Developmental";
  if (grade >= 25)                 return "Serviceable";
  return "Replaceable";
}

export function dynastyScore(grade, position, seasons) {
  const posMult = { WR: 1.10, TE: 0.95, RB: 0.92, QB: 0.80 }[position] ?? 1.0;
  const sorted  = [...(seasons || [])].sort((a, b) => Number(a.season_year) - Number(b.season_year));
  const recent  = sorted[sorted.length - 1];
  const ageAtDraft = (parseFloat(recent?.age) || 22) + 0.5;
  const peakAge = { WR: 26, TE: 27, RB: 24, QB: 28 }[position] ?? 26;
  const primeYears = Math.max(0, peakAge - ageAtDraft + 3);
  const ageAdj = Math.min(1.20, 0.88 + primeYears * 0.04);
  return grade * posMult * ageAdj;
}
