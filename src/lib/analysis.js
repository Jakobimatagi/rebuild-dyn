import { IDEAL_PROPORTION, POSITION_PRIORITY } from "../constants";

const AGE_CURVES = {
  QB: { peak: 27, decline: 32, cliff: 35 },
  RB: { peak: 24, decline: 27, cliff: 30 },
  WR: { peak: 26, decline: 30, cliff: 33 },
  TE: { peak: 27, decline: 30, cliff: 33 },
};

function buildBenchmarks(players, stats22, stats23, stats24) {
  const raw = { QB: {}, RB: {}, WR: {}, TE: {} };
  POSITION_PRIORITY.forEach((pos) => {
    raw[pos] = { 2022: [], 2023: [], 2024: [] };
  });

  const allStats = { 2022: stats22, 2023: stats23, 2024: stats24 };
  Object.entries(allStats).forEach(([year, stats]) => {
    Object.entries(stats).forEach(([id, s]) => {
      if (!s || !s.gp || s.gp < 8) return;
      const p = players[id];
      if (!p) return;
      const pos = p.fantasy_positions?.[0] || p.position;
      if (!POSITION_PRIORITY.includes(pos)) return;
      const ppg = (s.pts_ppr || 0) / s.gp;
      if (ppg > 0) raw[pos][year].push(ppg);
    });
  });

  POSITION_PRIORITY.forEach((pos) =>
    Object.keys(raw[pos]).forEach((yr) => raw[pos][yr].sort((a, b) => a - b)),
  );

  return raw;
}

function getPctileRank(ppg, sorted) {
  if (!ppg || !sorted?.length) return null;
  const below = sorted.filter((v) => v < ppg).length;
  return Math.round((below / sorted.length) * 100);
}

function playerPctiles(s24, s23, s22, pos, benchmarks) {
  const b = benchmarks[pos] || {};
  const ppg = (s) => (s?.gp >= 6 ? (s.pts_ppr || 0) / s.gp : 0);
  const p24 = getPctileRank(ppg(s24), b["2024"]);
  const p23 = getPctileRank(ppg(s23), b["2023"]);
  const p22 = getPctileRank(ppg(s22), b["2022"]);
  const valid = [p24, p23, p22].filter((v) => v !== null);
  const peak = valid.length > 0 ? Math.max(...valid) : null;
  const current = p24 ?? (peak != null ? Math.round(peak * 0.65) : 40);
  return { current, peak, p24, p23, p22 };
}

function draftCapitalScore(round, slot) {
  if (!round) return null;
  if (round === 1) {
    if (slot <= 10) return 95;
    if (slot <= 20) return 85;
    return 78;
  }
  if (round === 2) return 62;
  if (round === 3) return 45;
  if (round === 4) return 32;
  return 18;
}

export function draftTierLabel(round, slot) {
  if (!round) return null;
  if (round === 1 && slot <= 10) return "Top 10 Pick";
  if (round === 1 && slot <= 20) return "Mid 1st";
  if (round === 1) return "Late 1st";
  if (round === 2) return "2nd Round";
  if (round === 3) return "3rd Round";
  if (round === 4) return "4th Round";
  return `${round}th Round`;
}

function ageComponent(pos, age) {
  const c = AGE_CURVES[pos] || AGE_CURVES.WR;
  if (age <= c.peak) return 95;
  if (age <= c.decline) {
    return Math.max(30, 95 - ((age - c.peak) / (c.decline - c.peak)) * 65);
  }
  if (age <= c.cliff) {
    return Math.max(10, 30 - ((age - c.decline) / (c.cliff - c.decline)) * 20);
  }
  return 5;
}

function availComponent(s24, injuryStatus) {
  const gp = s24?.gp || 0;
  const base = (gp / 17) * 100;
  const penalty =
    { IR: 20, Out: 10, Doubtful: 5, Questionable: 2, PUP: 15 }[injuryStatus] ||
    0;
  return Math.max(0, Math.min(100, base - penalty));
}

function trendComponent(s24, s23) {
  const gp24 = s24?.gp || 0;
  const gp23 = s23?.gp || 0;
  if (gp24 < 4 || gp23 < 4) return 50;
  const ppg24 = (s24.pts_ppr || 0) / gp24;
  const ppg23 = (s23.pts_ppr || 0) / gp23;
  if (ppg23 === 0) return 50;
  const pct = (ppg24 - ppg23) / ppg23;
  return Math.min(100, Math.max(0, 60 + pct * 100));
}

function situComponent(depthOrder, team) {
  if (!team || team === "FA") return 20;
  if (depthOrder === 1) return 90;
  if (depthOrder === 2) return 55;
  return 30;
}

function calcScore(player, s24, s23, currentPctile) {
  const age = ageComponent(player.position, player.age);
  const avail = availComponent(s24, player.injuryStatus);
  const trend = trendComponent(s24, s23);
  const situ = situComponent(player.depthOrder, player.team);

  const dc = draftCapitalScore(player.draftRound, player.draftSlot);
  const dcWeight = dc != null ? ([0.6, 0.4, 0.2][player.yearsExp] ?? 0) : 0;
  const rawProd = currentPctile ?? 40;
  const prod = Math.round(
    rawProd * (1 - dcWeight) + (dc ?? rawProd) * dcWeight,
  );

  const score = Math.round(
    age * 0.35 + prod * 0.3 + avail * 0.15 + trend * 0.1 + situ * 0.1,
  );
  return {
    score,
    components: {
      age: Math.round(age),
      prod: Math.round(prod),
      avail: Math.round(avail),
      trend: Math.round(trend),
      situ: Math.round(situ),
    },
  };
}

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

  if (isEliteDraft && isStarter) return "Foundational";
  if (isFirstDraft && isStarter) return "Upside Shot";
  if (isFirstDraft && !hasRole) return "JAG - Developmental";

  if (draftRound == null && yearsExp <= 1) {
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

export function buildRosterAnalysis(
  myRoster,
  players,
  league,
  tradedPicks,
  stats24,
  stats23,
  stats22 = {},
  users = [],
  rosters = [],
) {
  const playerIds = myRoster.players || [];
  const rid = myRoster.roster_id;
  const draftRounds = league.settings?.draft_rounds || 5;
  const currentYear = new Date().getFullYear();
  const futureSeasons = [currentYear, currentYear + 1, currentYear + 2];

  const userById = new Map(
    users.map((u) => [
      u.user_id,
      u.metadata?.team_name || u.team_name || u.display_name,
    ]),
  );
  const rosterLabelById = new Map(
    rosters.map((r) => [
      r.roster_id,
      userById.get(r.owner_id) ||
        r.settings?.team_name ||
        `Roster ${r.roster_id}`,
    ]),
  );

  const tradedAway = new Set(
    tradedPicks
      .filter((p) => p.roster_id === rid && p.owner_id !== rid)
      .map((p) => `${p.season}_${p.round}_${p.roster_id}`),
  );

  const ownPicks = futureSeasons.flatMap((season) =>
    Array.from({ length: draftRounds }, (_, i) => i + 1)
      .filter((round) => !tradedAway.has(`${season}_${round}_${rid}`))
      .map((round) => ({ season: String(season), round, isOwn: true })),
  );

  const acquiredPicks = tradedPicks
    .filter((p) => p.owner_id === rid && p.roster_id !== rid)
    .map((p) => ({
      season: String(p.season),
      round: p.round,
      isOwn: false,
      fromTeam: rosterLabelById.get(p.roster_id) || `Roster ${p.roster_id}`,
    }));

  const picks = [...ownPicks, ...acquiredPicks].sort(
    (a, b) => a.season.localeCompare(b.season) || a.round - b.round,
  );

  const isSuperflex =
    league.roster_positions?.filter((p) => p === "QB").length > 1 ||
    league.roster_positions?.includes("SUPER_FLEX");

  const benchmarks = buildBenchmarks(players, stats22, stats23, stats24);

  const enriched = playerIds
    .map((id) => {
      const p = players[id];
      if (!p) return null;
      const pos = p.fantasy_positions?.[0] || p.position;
      if (!["QB", "RB", "WR", "TE"].includes(pos)) return null;
      const s24 = stats24[id] || null;
      const s23 = stats23[id] || null;
      const s22 = stats22[id] || null;
      const age = p.age || 26;
      const yearsExp = p.years_exp ?? 0;
      const draftRound = p.draft_round ?? p.metadata?.draft_round ?? null;
      const draftSlot = p.draft_slot ?? p.metadata?.draft_slot ?? null;
      const draftYear = p.draft_year ?? p.metadata?.draft_year ?? null;

      const playerData = {
        position: pos,
        age,
        yearsExp,
        draftRound,
        draftSlot,
        team: p.team || "FA",
        injuryStatus: p.injury_status || null,
        depthOrder: p.depth_chart_order || 2,
      };

      const pctiles = playerPctiles(s24, s23, s22, pos, benchmarks);
      const { score, components } = calcScore(
        playerData,
        s24,
        s23,
        pctiles.current,
      );
      const verdict = getVerdict(score);
      const ppg = s24?.gp > 0 ? ((s24.pts_ppr || 0) / s24.gp).toFixed(1) : null;
      const gp24 = s24?.gp || 0;

      const enrichedPlayer = {
        id,
        score,
        components,
        verdict,
        name: `${p.first_name} ${p.last_name}`,
        position: pos,
        team: p.team || "FA",
        age,
        yearsExp,
        draftRound,
        draftSlot,
        draftYear,
        injuryStatus: p.injury_status || null,
        ppg,
        gp24,
        peakPctile: pctiles.peak,
        currentPctile: pctiles.current,
        pctile24: pctiles.p24,
        pctile23: pctiles.p23,
        pctile22: pctiles.p22,
        draftTier: draftTierLabel(draftRound, draftSlot),
      };

      enrichedPlayer.archetype = getArchetype(enrichedPlayer);
      return enrichedPlayer;
    })
    .filter(Boolean);

  const byPos = {};
  POSITION_PRIORITY.forEach((pos) => {
    byPos[pos] = enriched
      .filter((p) => p.position === pos)
      .sort((a, b) => b.score - a.score);
  });

  const totalScore = enriched.reduce((s, p) => s + p.score, 0) || 1;
  const proportions = {};
  POSITION_PRIORITY.forEach((pos) => {
    const posScore = byPos[pos].reduce((s, p) => s + p.score, 0);
    const actual = posScore / totalScore;
    const ideal = IDEAL_PROPORTION[pos];
    proportions[pos] = {
      actual: Math.round(actual * 100),
      ideal: Math.round(ideal * 100),
      delta: Math.round((actual - ideal) * 100),
    };
  });

  const sells = enriched
    .filter((p) => p.verdict === "sell" || p.verdict === "cut")
    .sort((a, b) => a.score - b.score);
  const buys = enriched
    .filter((p) => p.verdict === "buy")
    .sort((a, b) => b.score - a.score);
  const holds = enriched.filter((p) => p.verdict === "hold");
  const avgAge = enriched.length
    ? (enriched.reduce((s, p) => s + p.age, 0) / enriched.length).toFixed(1)
    : "N/A";
  const avgScore = enriched.length
    ? Math.round(enriched.reduce((s, p) => s + p.score, 0) / enriched.length)
    : 0;

  const picksByYear = {};
  picks.forEach((pick) => {
    const yr = pick.season || "Unknown";
    if (!picksByYear[yr]) picksByYear[yr] = [];
    picksByYear[yr].push(pick);
  });

  const weakRooms = POSITION_PRIORITY.filter((pos) => {
    const room = byPos[pos];
    return (
      room.length < 2 || room.filter((p) => p.verdict === "buy").length === 0
    );
  });

  return {
    enriched,
    byPos,
    sells,
    buys,
    holds,
    avgAge,
    avgScore,
    picksByYear,
    weakRooms,
    isSuperflex,
    picks,
    proportions,
  };
}
