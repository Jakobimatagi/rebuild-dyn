/**
 * playerGrading.js
 * Player verdict labels, room grades, archetype classification, and tags.
 * Pure functions — no external lib dependencies, no side effects.
 */

export function getVerdict(score) {
  if (score >= 72) return "buy";
  if (score >= 52) return "hold";
  if (score >= 35) return "sell";
  return "cut";
}

export function getColor(verdict) {
  return (
    { buy: "#00f5a0", hold: "#ffd84d", sell: "#ff6b35", cut: "#ff2d55" }[
      verdict
    ] || "#d9deef"
  );
}

export function getRoomGrade(players) {
  if (!players.length) return { grade: "F", color: "#ff2d55", label: "Empty" };
  const avg = players.reduce((s, p) => s + p.score, 0) / players.length;
  const buyCount = players.filter((p) => p.verdict === "buy").length;
  const ratio = buyCount / players.length;
  if (ratio >= 0.5 && avg >= 70)
    return { grade: "A", color: "#00f5a0", label: "Elite Core" };
  if (ratio >= 0.3 && avg >= 58)
    return { grade: "B", color: "#7fff7f", label: "Good Shape" };
  if (avg >= 45) return { grade: "C", color: "#ffd84d", label: "Mixed Bag" };
  return { grade: "D", color: "#ff6b35", label: "Needs Work" };
}

export function getArchetype(player) {
  const {
    score,
    components,
    gp24,
    peakPctile,
    currentPctile,
    yearsExp,
    draftRound,
    draftSlot,
    fantasyCalcNormalized,
  } = player;
  const { age: ageScore, situ: situScore, trend: trendScore } = components;

  const isEarlyCareer = yearsExp <= 2;
  const isEliteDraft =
    isEarlyCareer && draftRound === 1 && (draftSlot || 99) <= 15;
  const isFirstDraft = isEarlyCareer && draftRound === 1;

  const isProvenElite = peakPctile >= 88;
  const isHighProd = peakPctile >= 72;
  const isSolidProd = peakPctile >= 55;
  const currentlyOn = currentPctile >= 55;
  const isModCurrent = currentPctile >= 38;

  const isYoung = ageScore >= 78;
  const isPrime = ageScore >= 60 && ageScore < 78;
  const isVet = ageScore >= 40 && ageScore < 60;
  const isOld = ageScore < 40;

  const isStarter = situScore >= 75;
  const hasRole = situScore >= 52;
  const isDeclining = trendScore < 40;

  // Elite draft picks (top-15 NFL, years 1-2) with any meaningful role are Foundational.
  // isStarter was too strict — rookies often sit at WR2/RB2 on depth charts even when
  // clearly the future focal point. Draft capital + role is enough for this tier.
  if (isEliteDraft && hasRole) return "Foundational";
  if (isFirstDraft && isStarter) return "Upside Shot";
  if (isFirstDraft && !hasRole) return "JAG - Developmental";

  // When Sleeper has no draft metadata (common for the most recent class),
  // fall back to FC market consensus to classify young players.
  // Require both FC elite ranking AND confirmed starter status for Foundational —
  // score alone is too easily inflated by age + FC for non-elite prospects.
  const isFCElite =
    fantasyCalcNormalized != null && fantasyCalcNormalized >= 80;
  if (draftRound == null && yearsExp <= 1) {
    if (isFCElite && isStarter) return "Foundational";
    if (isStarter) return "Upside Shot";
    if (hasRole) return "JAG - Developmental";
  }

  if (isProvenElite && isStarter && !isOld) return "Cornerstone";
  if (isOld && isProvenElite) return "Short Term League Winner";
  if ((isYoung || isPrime) && isStarter && isHighProd) return "Foundational";
  if (isYoung && gp24 < 10 && currentPctile < 35) return "JAG - Developmental";
  if (isYoung && hasRole && !isHighProd) return "Upside Shot";
  if ((isVet || isOld) && isSolidProd && hasRole) return "Productive Vet";
  if (currentlyOn && (isOld || isDeclining)) return "Short Term Production";
  if ((isYoung || isPrime) && isModCurrent) return "Mainstay";
  if (isModCurrent && score >= 38) return "Serviceable";
  if (score >= 28) return "JAG - Insurance";
  return "Replaceable";
}

export function getArchetypeTags(player) {
  const {
    score = 0,
    internalScore = 0,
    fantasyCalcNormalized,
    components = {},
    peakPctile,
    currentPctile,
    yearsExp = 0,
    draftRound,
    gp24 = 0,
  } = player;

  const ageScore = components.age ?? 0;
  const situScore = components.situ ?? 0;
  const trendScore = components.trend ?? 0;
  const availScore = components.avail ?? 0;
  const peak = peakPctile ?? 0;
  const current = currentPctile ?? 0;

  const tags = [];

  // Value tags
  if (internalScore - score >= 8) tags.push("Undervalued");
  if (score - internalScore >= 8) tags.push("Overvalued");

  // Trend tags
  if (trendScore >= 60) tags.push("Ascending");
  else if (trendScore <= 40) tags.push("Declining");

  // Risk tags
  if (situScore < 55) tags.push("Fragile Role");
  if (availScore < 60) tags.push("Injury Risk");
  if (peakPctile != null && currentPctile != null && peak - current >= 35)
    tags.push("Volatile Profile");

  // Ceiling tags
  if (peak >= 90) tags.push("Elite Ceiling");
  if (ageScore >= 75 && yearsExp <= 2 && draftRound === 1 && current < 55)
    tags.push("Untapped Upside");
  if (peak > 0 && peak < 75 && yearsExp >= 4) tags.push("Capped Ceiling");

  return tags;
}

export function getConfidence(player) {
  const gp24 = player.gp24 ?? 0;
  const yearsExp = player.yearsExp ?? 0;
  const trendScore = player.components?.trend ?? 50;

  const raw =
    (gp24 / 17) * 0.5 + (yearsExp / 5) * 0.3 + (trendScore / 100) * 0.2;

  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}
