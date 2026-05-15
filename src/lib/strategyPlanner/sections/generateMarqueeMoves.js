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
  MIN_RATIO,
  MAX_RATIO,
  HARD_OVERPAY_CAP,
  FC_BAND_MARQUEE,
  valueOfPlayer,
  fcOfPlayer,
  pickKey,
  formatPick,
  phaseMatches,
  passesRealismGates,
  isPairingUsed,
  recordPairing,
  needBonus,
  valueOfPickPhase,
  pickFcValue,
  trendDelta,
} from "../shared/pickParity";
import {
  getMarketComps,
  describeMarketComp,
} from "../../fantasyCalcTradeIndex";

const MAX_PICK_ATTEMPTS = 6;

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
  // FC data. See FC_BAND_MARQUEE rationale in shared/pickParity.
  const sendFc = fcOfPlayer(sellPlayer);
  const recvFc = fcOfPlayer(recvPlayer);
  if (sendFc > 0 && recvFc > 0) {
    let receiveFcTotal = recvFc;
    for (const p of pickValues) {
      receiveFcTotal += pickFcValue(p.pick, partnerPhase, leagueContext, pickOverrides);
    }
    const fcRatio = receiveFcTotal / sendFc;
    if (fcRatio < FC_BAND_MARQUEE.min || fcRatio > FC_BAND_MARQUEE.max) return null;
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

export function generateMarqueeMoves(analysis, path, opts = {}) {
  const config = path.marqueeMove;
  if (!config || typeof config.sellFilter !== "function") {
    return { title: "Marquee Moves", moves: [] };
  }

  const usedPairings = opts.usedPairings || null;

  const ctx = { analysis };
  const leagueContext = analysis?.leagueContext || {};
  const myRosterId = analysis?.rosterId;
  const pickOverrides = analysis?.rosterAuditSource?.pickValues || null;
  const compsIndex = analysis?.marketCompsBySleeperId || null;

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
      if (isPairingUsed(usedPairings, partner.rosterId, sellPlayer.id, null)) {
        continue;
      }

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
        if (balanced) {
          if (isPairingUsed(usedPairings, partner.rosterId, null, balanced.player.id)) {
            balanced = null;
            excludePlayerIds.add(rawRet.player.id);
            continue;
          }
          break;
        }
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
      score += needBonus(balanced.player, analysis);

      if (!best || score > best.score) {
        best = { partner, ret: balanced, score };
      }
    }
    if (!best) continue;

    usedReceivingPlayerIds.add(best.ret.player.id);
    recordPairing(usedPairings, best.partner.rosterId, sellPlayer.id, best.ret.player.id);

    let rationale = null;
    if (typeof config.rationale === "function") {
      try {
        rationale = config.rationale(sellPlayer, best.ret, best.partner);
      } catch {
        rationale = null;
      }
    }

    const pickPhase = best.ret.pickPhase;
    const rawComps = getMarketComps(compsIndex, sellPlayer.id, 3);
    const sendMarketComps = rawComps
      .map((c) => ({ id: c.id, date: c.date, summary: describeMarketComp(c) }))
      .filter((c) => c.summary);
    moves.push({
      send: sellPlayer,
      sendValue,
      sendMarketComps,
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
