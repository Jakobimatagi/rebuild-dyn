// Path-specific "bold move" generator. Unlike generateTradeTargets (which
// wraps the fair-market tradeSuggestions and only surfaces who to BUY),
// this section generates the big sell-side moves a strategy actually
// requires — naming which of the user's players to package out, which
// counterparty to approach, and what the return should look like.
//
// IMPORTANT: Every proposed move is value-checked against each side's
// calibrated marketValue + pick value. Picks are trimmed when the return
// overshoots OR added from the partner's unused pick inventory when the
// return underpays, and moves that can't hit a realistic parity band are
// dropped. The goal is "could plausibly happen in a real dynasty league,"
// not "textbook fair value."
//
// Each path supplies a `marqueeMove` config:
//   sellFilter(player, ctx)            — which of MY players are sell candidates
//   partnerPhase                        — 'contender' | 'retool' | 'rebuild' | 'any'
//   returnPicker(partner, sellPlayer, ctx) => { player, picks } | null
//   score(sellPlayer, ret, partner)     — higher = better fit (optional)
//   rationale(sellPlayer, ret, partner) — one-line explanation
//   title                                — section header override (optional)

import {
  valueOfPickPhase,
  pickFcValue,
  pickSlotLabel,
  trendDelta,
} from "../../marketValue";

// Re-export so existing planner modules can keep importing from here.
export { valueOfPickPhase, pickFcValue } from "../../marketValue";

// Parity band: receive / send ratio must sit inside this window.
// 0.85 — 1.25 = the initiator can net up to 25% upside (contenders pay a
// win-now premium for vets; rebuilders eat a modest discount for picks).
const MIN_RATIO = 0.85;
const MAX_RATIO = 1.25;
// If even the bare player is more than this over send value, reject —
// no amount of pick-stripping will save it.
const HARD_OVERPAY_CAP = 1.3;

// FantasyCalc market sanity thresholds.
const FC_MAX_PLAYER_RATIO = 1.4;
const FC_MIN_PLAYER_RATIO = 0.6;
const FC_PREMIUM_FLOOR = 2500;
const MAX_PICK_ATTEMPTS = 6;

// Archetype hierarchy — tier 5 is elite, tier 0 is roster cuts.
const ARCHETYPE_TIER = {
  Cornerstone: 5,
  Foundational: 5,
  Mainstay: 4,
  "Upside Shot": 4,
  "Productive Vet": 3,
  "Short Term League Winner": 3,
  "Short Term Production": 2,
  Serviceable: 2,
  "JAG - Insurance": 1,
  "JAG - Developmental": 1,
  Replaceable: 0,
};
const tierOf = (arch) => ARCHETYPE_TIER[arch] ?? 2;
const MAX_TIER_DELTA = 2;

function phaseMatches(partner, wanted) {
  if (!wanted || wanted === "any") return true;
  return partner?.teamPhase?.phase === wanted;
}

function formatPick(pick, ownerPhase) {
  if (!pick) return null;
  const year = pick.season || pick.year || "?";
  const round = pick.round;
  const suffix =
    round === 1 ? "1st" : round === 2 ? "2nd" : round === 3 ? "3rd" : `${round}th`;
  const slotLabel = pickSlotLabel(round, ownerPhase);
  return slotLabel ? `${year} ${slotLabel} ${suffix}` : `${year} ${suffix}`;
}

function pickKey(pick) {
  return `${pick.season || pick.year || "?"}-${pick.round}-${pick.originalOwner || pick.previous_owner_id || ""}`;
}

// Score-unit value for player parity math (marketValue is score-scale; FC
// values are dollar-scale and handled as a separate sanity gate).
export function valueOfPlayer(player) {
  if (!player) return 0;
  return Number(player.marketValue || player.score || 40);
}

// Shared gate. Returns null to reject, or an object describing why it passed
// so the caller can emit the move.
export function passesRealismGates(sellPlayer, recvPlayer) {
  // FantasyCalc market sanity
  const sendFc = Number(sellPlayer.dynastyMarketValue || sellPlayer.fantasyCalcValue || 0);
  const recvFc = Number(recvPlayer.dynastyMarketValue || recvPlayer.fantasyCalcValue || 0);
  if (sendFc > 0 && recvFc > 0) {
    if (recvFc > sendFc * FC_MAX_PLAYER_RATIO) return null;
    if (recvFc < sendFc * FC_MIN_PLAYER_RATIO) {
      // caller may still pass if picks are in the package
      return { soft: "underpay" };
    }
  } else if (recvFc > FC_PREMIUM_FLOOR && sendFc === 0) {
    return null;
  } else if (sendFc > FC_PREMIUM_FLOOR && recvFc === 0) {
    return null;
  }

  // Archetype hierarchy
  const sendTier = tierOf(sellPlayer.archetype);
  const recvTier = tierOf(recvPlayer.archetype);
  if (recvTier > sendTier + MAX_TIER_DELTA) return null;

  // Roster relevance — targets must be fantasy-relevant or a real stash
  // with upside, not random bench bodies.
  const depth = recvPlayer.depthOrder ?? 9;
  const breakoutProb = Number(recvPlayer.prediction?.breakoutProb || 0);
  const yearsExp = Number(recvPlayer.yearsExp ?? 5);
  const age = Number(recvPlayer.age ?? 99);
  const isStarter = depth <= 1;
  const isHandcuff = depth <= 2 && recvPlayer.position === "RB";
  const isBreakoutBet = breakoutProb >= 25;
  const isRookieStash =
    yearsExp <= 1 &&
    (recvPlayer.archetype === "Foundational" ||
      recvPlayer.archetype === "Cornerstone" ||
      recvPlayer.archetype === "Upside Shot");
  // Young stash bucket: 2nd/3rd-year players with real upside signals —
  // Upside Shot / Foundational archetype OR strong draft pedigree. This
  // covers the "deep roster spot today, fantasy-relevant tomorrow" case.
  const hasDraftPedigree =
    recvPlayer.draftRound != null && Number(recvPlayer.draftRound) <= 3;
  const isYoungStash =
    age <= 24 &&
    yearsExp <= 3 &&
    (recvPlayer.archetype === "Upside Shot" ||
      recvPlayer.archetype === "Foundational" ||
      recvPlayer.archetype === "Cornerstone" ||
      (recvPlayer.archetype === "Mainstay" && hasDraftPedigree) ||
      hasDraftPedigree);
  if (
    !isStarter &&
    !isHandcuff &&
    !isBreakoutBet &&
    !isRookieStash &&
    !isYoungStash
  ) {
    return null;
  }

  return { soft: null };
}

// Trim/add picks on the return side so we land inside the parity band.
//   - Overpay  (ratio > MAX): strip returned picks largest-first.
//   - Underpay (ratio < MIN): add partner-owned picks not already in the
//     offer, smallest-first, until we hit parity.
function balanceReturn(ret, sellPlayer, sendValue, partner, leagueContext, pickOverrides) {
  if (!ret || !ret.player) return null;
  const recvPlayer = ret.player;
  const playerVal = valueOfPlayer(recvPlayer);

  if (playerVal > sendValue * HARD_OVERPAY_CAP) return null;

  const gate = passesRealismGates(sellPlayer, recvPlayer);
  if (!gate) return null;

  const partnerPhase = partner?.teamPhase?.phase || null;
  const usedPickKeys = new Set((ret.picks || []).map(pickKey));
  const pickValues = (ret.picks || []).map((pk) => ({
    pick: pk,
    value: valueOfPickPhase(pk, partnerPhase, leagueContext),
  }));

  let totalReceive = playerVal + pickValues.reduce((s, p) => s + p.value, 0);

  // Overpay: strip picks largest-first.
  while (pickValues.length > 0 && totalReceive > sendValue * MAX_RATIO) {
    pickValues.sort((a, b) => b.value - a.value);
    const removed = pickValues.shift();
    totalReceive -= removed.value;
  }

  // Underpay: try to sweeten with partner's own unused picks.
  if (totalReceive < sendValue * MIN_RATIO) {
    const partnerPicks = (partner?.picks || [])
      .filter((pk) => !usedPickKeys.has(pickKey(pk)))
      .map((pk) => ({
        pick: pk,
        value: valueOfPickPhase(pk, partnerPhase, leagueContext),
      }))
      // Add smallest first so we don't accidentally overshoot.
      .sort((a, b) => a.value - b.value);

    for (const candidate of partnerPicks) {
      if (totalReceive >= sendValue * MIN_RATIO) break;
      // Skip if adding this pick would overshoot the max.
      if (totalReceive + candidate.value > sendValue * MAX_RATIO) continue;
      pickValues.push(candidate);
      totalReceive += candidate.value;
      usedPickKeys.add(pickKey(candidate.pick));
    }
  }

  const ratio = sendValue > 0 ? totalReceive / sendValue : 0;
  if (ratio > MAX_RATIO || ratio < MIN_RATIO) return null;

  // FC dynasty-market sanity. Score-scale parity systematically lets
  // pick-heavy returns slip past for low-FC sells (e.g., a WR3 fetching
  // a 1st). Re-validate in FC-dollar space when both player sides have
  // FC data.
  const sendFc = Number(sellPlayer.dynastyMarketValue || sellPlayer.fantasyCalcValue || 0);
  const recvFc = Number(recvPlayer.dynastyMarketValue || recvPlayer.fantasyCalcValue || 0);
  if (sendFc > 0 && recvFc > 0) {
    let receiveFcTotal = recvFc;
    for (const p of pickValues) {
      receiveFcTotal += pickFcValue(p.pick, partnerPhase, leagueContext, pickOverrides);
    }
    const fcRatio = receiveFcTotal / sendFc;
    // Slightly looser than bombshell (marquee includes both directions);
    // still tight enough to block "WR3 for a 1st" type slips.
    if (fcRatio < 0.8 || fcRatio > 1.25) return null;
  }

  return {
    player: recvPlayer,
    picks: pickValues.map((p) => p.pick),
    pickPhase: partnerPhase,
    playerValue: playerVal,
    pickValueTotal: pickValues.reduce((s, p) => s + p.value, 0),
    totalReceive,
    ratio,
  };
}

export function generateMarqueeMoves(analysis, path) {
  const config = path.marqueeMove;
  if (!config || typeof config.sellFilter !== "function") {
    return { title: "Marquee Moves", moves: [] };
  }

  const ctx = { analysis };
  const leagueContext = analysis?.leagueContext || {};
  const myRosterId = analysis?.rosterId;
  const pickOverrides = analysis?.rosterAuditSource?.pickValues || null;

  const sellPool =
    analysis?.tradeablePlayers?.length > 0
      ? analysis.tradeablePlayers
      : analysis?.enriched || [];

  const sellCandidates = sellPool
    .filter((p) => {
      try {
        return config.sellFilter(p, ctx);
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) =>
        (b.marketValue || b.score || 0) - (a.marketValue || a.score || 0),
    )
    .slice(0, 8);

  const partners = (analysis?.leagueTeams || []).filter(
    (t) => t.rosterId !== myRosterId,
  );

  const moves = [];
  const usedReceivingPlayerIds = new Set();

  for (const sellPlayer of sellCandidates) {
    const sendValue = valueOfPlayer(sellPlayer);
    if (sendValue <= 0) continue;

    let best = null;
    for (const partner of partners) {
      if (!phaseMatches(partner, config.partnerPhase)) continue;

      const excludePlayerIds = new Set(usedReceivingPlayerIds);
      const attemptCtx = { ...ctx, excludePlayerIds };
      let rawRet = null;
      let balanced = null;
      for (let attempt = 0; attempt < MAX_PICK_ATTEMPTS; attempt++) {
        try {
          rawRet = config.returnPicker(partner, sellPlayer, attemptCtx);
        } catch {
          rawRet = null;
        }
        if (!rawRet || !rawRet.player) break;
        if (excludePlayerIds.has(rawRet.player.id)) break;
        balanced = balanceReturn(
          rawRet,
          sellPlayer,
          sendValue,
          partner,
          leagueContext,
          pickOverrides,
        );
        if (balanced) break;
        excludePlayerIds.add(rawRet.player.id);
      }
      if (!balanced) continue;

      let score = 0;
      try {
        score = config.score
          ? config.score(sellPlayer, balanced, partner)
          : balanced.totalReceive;
      } catch {
        score = balanced.totalReceive;
      }
      const parityPenalty = Math.abs(1 - balanced.ratio) * 20;
      score -= parityPenalty;
      // Trend layer: sell urgency for our declining player + buy bonus
      // for a trending-down return player we're acquiring cheaply.
      score += trendDelta(sellPlayer, "sell");
      score += trendDelta(balanced.player, "buy");

      if (!best || score > best.score) {
        best = { partner, ret: balanced, score };
      }
    }
    if (!best) continue;

    usedReceivingPlayerIds.add(best.ret.player.id);

    let rationale = null;
    if (typeof config.rationale === "function") {
      try {
        rationale = config.rationale(sellPlayer, best.ret, best.partner);
      } catch {
        rationale = null;
      }
    }

    const pickPhase = best.ret.pickPhase;
    moves.push({
      send: sellPlayer,
      sendValue,
      receive: { player: best.ret.player, picks: best.ret.picks },
      receivePickLabels: (best.ret.picks || [])
        .map((pk) => formatPick(pk, pickPhase))
        .filter(Boolean),
      receiveValue: Math.round(best.ret.totalReceive),
      receivePlayerValue: Math.round(best.ret.playerValue),
      receivePickValue: Math.round(best.ret.pickValueTotal),
      valueRatio: Math.round(best.ret.ratio * 100) / 100,
      partnerTeam: best.partner.label,
      partnerPhase: best.partner.teamPhase?.phase || null,
      partnerScore: best.partner.teamPhase?.score || null,
      rationale,
    });
  }

  return {
    title: config.title || "Marquee Moves",
    subtitle: config.subtitle || null,
    moves: moves.slice(0, 5),
  };
}
