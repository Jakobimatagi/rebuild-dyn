// Shared primitives for the strategy planner's trade-section generators
// (Marquee, Bombshell, Haul, Tier). Before this module, each section
// duplicated these constants and helpers, which let parity bands drift
// silently and made any fix a 4-place hunt.

import {
  valueOfPickPhase,
  pickFcValue,
  pickSlotLabel,
  trendDelta,
} from "../../marketValue";

export { valueOfPickPhase, pickFcValue, pickSlotLabel, trendDelta };

// Score-scale parity (marketValue units). Receive / send ratio must sit
// in this band before the trade is emitted. 0.85 — 1.25 lets the
// initiator take a small premium: contenders pay a win-now premium for
// vets; rebuilders eat a modest discount in exchange for picks.
export const MIN_RATIO = 0.85;
export const MAX_RATIO = 1.25;

// Hard caps on raw player-vs-player overpay/underpay before any pick
// math kicks in. Used by package builders to short-circuit obviously
// unrecoverable deals.
export const HARD_OVERPAY_CAP = 1.3;
export const HARD_UNDERPAY_CAP = 0.6;

// FC dynasty-market sanity bands per generator.
//
// We keep these separate (instead of one global band) because each
// section operates on a different package shape, and each band was
// tuned for its shape:
//
//   MARQUEE — 1-for-1 with possible pick adjustments on either side.
//     Floor is looser (0.8) because the marquee balancer can shift
//     picks in either direction to compensate, and we want to allow
//     small underpays that are still plausible offers.
//   BOMBSHELL — pick-heavy hauls or anchor packages. Ceiling is tighter
//     (1.2) because picks systematically undervalue in score-scale, so
//     score-parity can drift the FC band wide on the upside; we
//     re-anchor in FC-dollar space.
//   HAUL — multi-piece packages. Same window as marquee since the
//     multi-player smoothing already absorbs noise.
//
// If you tighten or loosen one, update the comment so the next reader
// doesn't re-derive the variance.
export const FC_BAND_MARQUEE = { min: 0.8, max: 1.25 };
export const FC_BAND_BOMBSHELL = { min: 0.85, max: 1.2 };
export const FC_BAND_HAUL = { min: 0.85, max: 1.25 };

// Archetype hierarchy — tier 5 is elite, 0 is roster cuts. Used to
// reject deals where the receive side is more than MAX_TIER_DELTA tiers
// above the send side (you don't get Cornerstones for Replaceables).
export const ARCHETYPE_TIER = {
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
export const tierOf = (arch) => ARCHETYPE_TIER[arch] ?? 2;
export const MAX_TIER_DELTA = 2;

// Internal thresholds for the player-only side of passesRealismGates.
const FC_PLAYER_RATIO_MAX = 1.4;
const FC_PLAYER_RATIO_MIN = 0.6;
const FC_PREMIUM_FLOOR = 2500;

// Confidence floor for receive-side (buy) players. Confidence is 0-100
// per playerGrading.getConfidence — weighted by gp24, yearsExp, and
// trend. A floor of 50 drops the speculative half (rookies, very-low-
// GP vets) so trade-section recommendations carry similar conviction
// across paths. Rookie acquisitions still surface through the
// rookieStrategy section, which is the right channel for them.
// Players without a numeric confidence value are NOT rejected — we
// only block when we have data and that data is below the floor.
export const MIN_CONFIDENCE_FOR_BUY = 50;

// Score-unit value for player parity math. marketValue is score-scale;
// FC values are dollar-scale and handled by fcOfPlayer.
export function valueOfPlayer(player) {
  if (!player) return 0;
  return Number(player.marketValue || player.score || 40);
}

export function fcOfPlayer(player) {
  return Number(player?.dynastyMarketValue || player?.fantasyCalcValue || 0);
}

export function pickKey(pick) {
  return `${pick.season || pick.year || "?"}-${pick.round}-${pick.originalOwner || pick.previous_owner_id || ""}`;
}

export function formatPick(pick, ownerPhase) {
  if (!pick) return null;
  const year = pick.season || pick.year || "?";
  const round = pick.round;
  const suffix =
    round === 1 ? "1st" : round === 2 ? "2nd" : round === 3 ? "3rd" : `${round}th`;
  const slotLabel = pickSlotLabel(round, ownerPhase);
  return slotLabel ? `${year} ${slotLabel} ${suffix}` : `${year} ${suffix}`;
}

export function phaseMatches(partner, wanted) {
  if (!wanted || wanted === "any") return true;
  return partner?.teamPhase?.phase === wanted;
}

// Per-side realism gate: FC sanity, archetype hierarchy, and roster
// relevance. Returns null to reject, or { soft } where soft may be
// 'underpay' so the caller can still pass if picks are sweetening the
// package.
export function passesRealismGates(sellPlayer, recvPlayer) {
  const sendFc = fcOfPlayer(sellPlayer);
  const recvFc = fcOfPlayer(recvPlayer);
  if (sendFc > 0 && recvFc > 0) {
    if (recvFc > sendFc * FC_PLAYER_RATIO_MAX) return null;
    if (recvFc < sendFc * FC_PLAYER_RATIO_MIN) return { soft: "underpay" };
  } else if (recvFc > FC_PREMIUM_FLOOR && sendFc === 0) {
    return null;
  } else if (sendFc > FC_PREMIUM_FLOOR && recvFc === 0) {
    return null;
  }

  const sendTier = tierOf(sellPlayer.archetype);
  const recvTier = tierOf(recvPlayer.archetype);
  if (recvTier > sendTier + MAX_TIER_DELTA) return null;

  if (
    typeof recvPlayer.confidence === "number" &&
    recvPlayer.confidence < MIN_CONFIDENCE_FOR_BUY
  ) {
    return null;
  }

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

// Soft scoring bonus for receive-side players who fill a roster need.
// Reads analysis.weakRooms (an ordered list of weak positions produced
// by getRosterNeeds, worst-first). Applied in the trade sections'
// score functions — kept soft because rebuilder paths legitimately
// hunt cross-position upside, and we don't want to hard-block a great
// rookie WR just because the user's WR room is fine.
//
// Magnitudes are calibrated for the score scales in Marquee / Bombshell
// / Haul where typical score nudges (parityPenalty, trendDelta) are in
// the ±5–10 range. Skipped for Tier sections since those are same-
// position swaps by construction — the bonus would apply uniformly.
export function needBonus(player, analysis) {
  if (!player || !analysis) return 0;
  const weak = analysis.weakRooms || analysis.needs || [];
  if (weak.length === 0) return 0;
  const pos = player.position;
  if (!pos) return 0;
  const idx = weak.indexOf(pos);
  if (idx === 0) return 10;
  if (idx === 1) return 6;
  if (idx === 2) return 3;
  return 0;
}

// Cross-section dedup. Without this, the same (partner, anchor) ship or
// the same (partner, target) acquire can surface in Marquee, Bombshell,
// Haul, and Tier simultaneously — each section formulates the same
// trade goal a slightly different way, and the user sees noise.
//
// Two pairings are tracked per emitted move:
//   - sell:  the user's anchor going to a specific partner
//   - buy:   a specific partner's player coming back to the user
// Either match counts as a duplicate. Generators consult before
// emitting and record after.
function sellPairingKey(partnerRosterId, anchorId) {
  return `sell:${partnerRosterId}|${anchorId}`;
}
function buyPairingKey(partnerRosterId, recvPlayerId) {
  return `buy:${partnerRosterId}|${recvPlayerId}`;
}

export function isPairingUsed(
  usedPairings,
  partnerRosterId,
  anchorId,
  recvPlayerId,
) {
  if (!usedPairings || partnerRosterId == null) return false;
  if (anchorId != null && usedPairings.has(sellPairingKey(partnerRosterId, anchorId))) {
    return true;
  }
  if (recvPlayerId != null && usedPairings.has(buyPairingKey(partnerRosterId, recvPlayerId))) {
    return true;
  }
  return false;
}

export function recordPairing(
  usedPairings,
  partnerRosterId,
  anchorId,
  recvPlayerId,
) {
  if (!usedPairings || partnerRosterId == null) return;
  if (anchorId != null) usedPairings.add(sellPairingKey(partnerRosterId, anchorId));
  if (recvPlayerId != null) usedPairings.add(buyPairingKey(partnerRosterId, recvPlayerId));
}

// FC-dollar parity check on a multi-piece package. Returns true if the
// receive side's FC total lands within `band` of the anchor FC. Skips
// the check (returns true) when the anchor lacks FC; rejects when the
// anchor has FC but a player on the receive side doesn't — we won't
// estimate half the deal.
export function passesFcSanity({
  anchorFc,
  receivePlayer,
  receivePicks,
  receiveOwnerPhase,
  leagueContext,
  pickOverrides,
  band = FC_BAND_BOMBSHELL,
}) {
  if (anchorFc <= 0) return true;
  if (receivePlayer && fcOfPlayer(receivePlayer) <= 0) return false;
  let receiveFc = fcOfPlayer(receivePlayer);
  for (const pk of receivePicks || []) {
    receiveFc += pickFcValue(pk, receiveOwnerPhase, leagueContext, pickOverrides);
  }
  if (receiveFc <= 0) return false;
  const ratio = receiveFc / anchorFc;
  return ratio >= band.min && ratio <= band.max;
}
