/**
 * ocUsageModel.js
 *
 * Team / OC usage deep-dive analytics and a transparent predictive usage model,
 * built on the nflverse historical utilization (player_utilization_seasons, 1999+)
 * and scheme fingerprints (team_scheme_seasons) published by the Python pipeline.
 *
 * Three capabilities:
 *   1. teamPlayerTrends  — every player's multi-season usage for one team, with a
 *      rising/falling trend, so you can eyeball who's ascending in a room.
 *   2. buildOcUsageProfile — an OC/playcaller's *system* tendencies aggregated over
 *      all their team-seasons: pass rate / PROE / aDOT, target & carry concentration,
 *      and the share each usage role-slot tends to get (R1/R2/R3 receiving, B1/B2
 *      rushing). This is "how this coach deploys a room."
 *   3. projectTeamUsage — apply an OC profile to a team's current pecking order to
 *      project each player's forward usage, flagging breakouts (projected ≫ recent)
 *      and fallers (projected ≪ recent). Transparent, not a black box.
 *
 * Role slots are usage-derived (rank within the room), so they work without a
 * position field: the most-targeted player is the R1 slot, the most-carried is B1.
 */

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const keyTS = (s, t) => `${s}|${t}`;

/** Normalize a raw utilization row, adding true aDOT (intended air yards / target). */
function normUtil(r) {
  const targets = num(r.targets) ?? 0;
  const air = num(r.rec_air_yards) ?? 0;
  return {
    season: Number(r.season),
    team: r.team,
    player_id: r.player_id,
    sleeper_id: r.sleeper_id ?? null,
    name: r.name,
    targets,
    carries: num(r.carries) ?? 0,
    target_share: num(r.target_share) ?? 0,
    carry_share: num(r.carry_share) ?? 0,
    air_yard_share: num(r.air_yard_share) ?? 0,
    rz_target_share: num(r.rz_target_share) ?? 0,
    rz_carry_share: num(r.rz_carry_share) ?? 0,
    adot: targets > 0 ? air / targets : null,
  };
}

/**
 * Every player's multi-season usage for one team, newest activity first.
 * @returns Array<{ player_id, name, sleeper_id, seasons:[normUtil…],
 *   latest, trendTarget, trendCarry }>
 */
export function teamPlayerTrends(allUtil, team) {
  const byPlayer = new Map();
  for (const raw of allUtil) {
    if (raw.team !== team) continue;
    const r = normUtil(raw);
    if (!byPlayer.has(r.player_id)) {
      byPlayer.set(r.player_id, {
        player_id: r.player_id, name: r.name, sleeper_id: r.sleeper_id, seasons: [],
      });
    }
    byPlayer.get(r.player_id).seasons.push(r);
  }
  const out = [];
  for (const p of byPlayer.values()) {
    p.seasons.sort((a, b) => a.season - b.season);
    const latest = p.seasons[p.seasons.length - 1];
    const prev = p.seasons.length > 1 ? p.seasons[p.seasons.length - 2] : null;
    p.latest = latest;
    p.trendTarget = prev ? round(latest.target_share - prev.target_share, 4) : null;
    p.trendCarry = prev ? round(latest.carry_share - prev.carry_share, 4) : null;
    out.push(p);
  }
  // Sort by latest PPR-opportunity involvement (a target is worth ~1.7x a carry).
  const involvement = (p) => p.latest.target_share * 1.7 + p.latest.carry_share;
  out.sort((a, b) => involvement(b) - involvement(a));
  return out;
}

function slotShares(rows, shareKey, maxSlots) {
  const shares = rows.map((r) => r[shareKey]).filter((v) => v > 0).sort((a, b) => b - a);
  return shares.slice(0, maxSlots);
}

function hhi(rows, shareKey) {
  const s = rows.map((r) => r[shareKey]).filter((v) => v > 0);
  if (!s.length) return null;
  return round(s.reduce((acc, v) => acc + v * v, 0), 4);
}

/**
 * Aggregate an OC/playcaller's usage tendencies over their team-seasons.
 * @param {Array<{team:string,season:number}>} teamSeasons  the coach's stints.
 * @param {Array} allUtil   raw player_utilization_seasons rows.
 * @param {Array} schemeRows  raw team_scheme_seasons rows (for pass rate / PROE / aDOT).
 * @returns {object|null} profile with recvSlots/rushSlots (avg share per role-slot),
 *   concentration (HHI + lead share), and scheme rates; null if no data.
 */
export function buildOcUsageProfile({ teamSeasons = [], allUtil = [], schemeRows = [], maxRecv = 5, maxRush = 3 } = {}) {
  const utilByTS = new Map();
  for (const raw of allUtil) {
    const k = keyTS(Number(raw.season), raw.team);
    if (!utilByTS.has(k)) utilByTS.set(k, []);
    utilByTS.get(k).push(normUtil(raw));
  }
  const schemeByTS = new Map();
  for (const s of schemeRows) schemeByTS.set(keyTS(Number(s.season), s.team), s);

  const recvAcc = Array.from({ length: maxRecv }, () => []);
  const rushAcc = Array.from({ length: maxRush }, () => []);
  const acc = { passRate: [], proe: [], adot: [], epaPlay: [], targetHHI: [], carryHHI: [], leadTarget: [], leadCarry: [] };
  let n = 0;

  for (const { team, season } of teamSeasons) {
    const rows = utilByTS.get(keyTS(Number(season), team));
    if (!rows || !rows.length) continue;
    n += 1;
    const recv = slotShares(rows, "target_share", maxRecv);
    const rush = slotShares(rows, "carry_share", maxRush);
    recv.forEach((v, i) => recvAcc[i].push(v));
    rush.forEach((v, i) => rushAcc[i].push(v));
    acc.targetHHI.push(hhi(rows, "target_share"));
    acc.carryHHI.push(hhi(rows, "carry_share"));
    if (recv[0] != null) acc.leadTarget.push(recv[0]);
    if (rush[0] != null) acc.leadCarry.push(rush[0]);

    const sc = schemeByTS.get(keyTS(Number(season), team));
    if (sc) {
      if (num(sc.pass_rate) != null) acc.passRate.push(num(sc.pass_rate));
      if (num(sc.proe) != null) acc.proe.push(num(sc.proe));
      if (num(sc.adot) != null) acc.adot.push(num(sc.adot));
      if (num(sc.epa_play) != null) acc.epaPlay.push(num(sc.epa_play));
    }
  }
  if (n === 0) return null;

  return {
    n,
    recvSlots: recvAcc.map((a) => mean(a)),
    rushSlots: rushAcc.map((a) => mean(a)),
    passRate: mean(acc.passRate),
    proe: mean(acc.proe),
    adot: mean(acc.adot),
    epaPlay: mean(acc.epaPlay),
    targetHHI: mean(acc.targetHHI),
    carryHHI: mean(acc.carryHHI),
    leadTargetShare: mean(acc.leadTarget),
    leadCarryShare: mean(acc.leadCarry),
    concentration: concentrationLabel(mean(acc.targetHHI)),
  };
}

/**
 * Project a team's current pecking order through an OC profile and flag
 * breakouts / fallers. Each player's projected share blends their own recent
 * share (stickiness) with what the OC's profile gives that role-slot.
 *
 * @param {Array<{name, sleeper_id?, recentTargetShare, recentCarryShare}>} players
 * @param {object} ocProfile  from buildOcUsageProfile
 * @param {number} stickiness  weight on the player's own recent share (0-1)
 * @returns Array sorted by usage delta desc: { name, slot, recentTargetShare,
 *   projTargetShare, targetDelta, recentCarryShare, projCarryShare, carryDelta,
 *   signal: 'breakout'|'faller'|'steady', score }
 */
export function projectTeamUsage(players, ocProfile, { stickiness = 0.5 } = {}) {
  if (!ocProfile) return [];
  const recvRanked = [...players].sort((a, b) => (b.recentTargetShare || 0) - (a.recentTargetShare || 0));
  const recvSlot = new Map(recvRanked.map((p, i) => [p, i]));
  const rushRanked = [...players].sort((a, b) => (b.recentCarryShare || 0) - (a.recentCarryShare || 0));
  const rushSlot = new Map(rushRanked.map((p, i) => [p, i]));

  const out = players.map((p) => {
    const ri = recvSlot.get(p);
    const bi = rushSlot.get(p);
    const ocRecv = ocProfile.recvSlots[ri] ?? 0;
    const ocRush = ocProfile.rushSlots[bi] ?? 0;
    const recentT = p.recentTargetShare || 0;
    const recentC = p.recentCarryShare || 0;
    // Only project a receiving role if the player is actually a pass-game piece
    // (had real target share) — otherwise the OC's R-slot would invent targets.
    const projT = recentT > 0.02 ? round(stickiness * recentT + (1 - stickiness) * ocRecv, 4) : recentT;
    const projC = recentC > 0.02 ? round(stickiness * recentC + (1 - stickiness) * ocRush, 4) : recentC;
    const dT = round(projT - recentT, 4);
    const dC = round(projC - recentC, 4);
    // Combined usage score: targets are worth ~1.7x carries in PPR opportunity.
    const score = round(dT * 1.7 + dC, 4);
    return {
      name: p.name,
      sleeper_id: p.sleeper_id ?? null,
      recvSlot: ri,
      recentTargetShare: round(recentT, 4),
      projTargetShare: projT,
      targetDelta: dT,
      recentCarryShare: round(recentC, 4),
      projCarryShare: projC,
      carryDelta: dC,
      score,
      signal: score > 0.015 ? "breakout" : score < -0.015 ? "faller" : "steady",
    };
  });
  return out.sort((a, b) => b.score - a.score);
}

// ── helpers ──────────────────────────────────────────────────────────────────
function mean(a) {
  const v = a.filter((x) => x != null && Number.isFinite(x));
  return v.length ? round(v.reduce((s, x) => s + x, 0) / v.length, 4) : null;
}
function round(v, d = 4) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}
export function concentrationLabel(hhiVal) {
  if (hhiVal == null) return "—";
  if (hhiVal >= 0.16) return "Funnel (alpha-heavy)";
  if (hhiVal >= 0.11) return "Tilted";
  if (hhiVal >= 0.08) return "Balanced";
  return "Spread (committee)";
}
