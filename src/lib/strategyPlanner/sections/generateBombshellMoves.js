// Bombshell Moves — the marquee's spicier cousin. Two modes:
//
//   ACQUIRE mode (for contenders, consolidators, surgical buyers):
//     Start from a PREMIUM TARGET on a partner. Package the user's anchor
//     player + user picks (largest first) until parity hits the band.
//     Classic "three 1sts for Drake London" move.
//
//   LIQUIDATE mode (for rebuilders, teardowners, soft-landers):
//     Start from the user's own STAR ANCHOR. Build a return from the
//     partner — picks first (the whole point is the pick haul) plus an
//     optional throw-in player. Classic "Saquon for 2027 1st + 2028 1st
//     + a young RB."
//
// Same realism gates as marquee (FC market sanity, archetype tier, roster
// relevance, parity band).
//
// Each path supplies a `bombshellMove` config. Shared fields:
//   mode: 'acquire' | 'liquidate'
//   partnerPhase: 'contender'|'retool'|'rebuild'|'any'
//   title, subtitle, score?, rationale?
//
// Acquire-mode fields:
//   targetPicker(partner, ctx) => player | null
//   anchorFilter(player, ctx)   => boolean
//
// Liquidate-mode fields:
//   anchorPicker(analysis, ctx) => player | null
//   throwInFilter?(player, ctx) => boolean  (optional — picks-only OK)

import {
  passesRealismGates,
  valueOfPlayer,
  valueOfPickPhase,
  pickFcValue,
} from "./generateMarqueeMoves";
import { pickSlotLabel, trendDelta } from "../../marketValue";
import {
  getMarketComps,
  describeMarketComp,
} from "../../fantasyCalcTradeIndex";

const MIN_RATIO = 0.85;
const MAX_RATIO = 1.25;
const HARD_UNDERPAY_CAP = 0.6;
const MAX_PICKS_IN_PACKAGE = 4;

// FC-DOLLAR sanity band. Every bombshell must clear this when both sides
// have FantasyCalc data. Score-scale parity isn't enough — picks are
// systematically undervalued in score-scale relative to the dynasty
// market, which is how Shaheed-for-a-1st slipped through.
const FC_MIN_RATIO = 0.85;
const FC_MAX_RATIO = 1.2;

function fcOfPlayer(p) {
  return Number(p?.dynastyMarketValue || p?.fantasyCalcValue || 0);
}

// Sums FC dollars on a side: player + picks.
function fcOfPackage(player, picks, ownerPhase, leagueContext, pickOverrides) {
  let total = fcOfPlayer(player);
  for (const pk of picks || []) {
    total += pickFcValue(pk, ownerPhase, leagueContext, pickOverrides);
  }
  return total;
}

// Dynasty-market sanity check. If anchor has no FC, skip (we can't
// validate). If anchor has FC, EVERY player in the package needs FC too
// — otherwise we're estimating one side and it's not safe.
function passesFcSanity({
  anchorFc,
  receivePlayer,
  receivePicks,
  receiveOwnerPhase,
  leagueContext,
  pickOverrides,
}) {
  if (anchorFc <= 0) return true; // can't gate without FC
  // If a player is on the receive side, they MUST have FC too — no
  // estimating premium players we can't validate
  if (receivePlayer && fcOfPlayer(receivePlayer) <= 0) return false;
  const receiveFc = fcOfPackage(
    receivePlayer,
    receivePicks,
    receiveOwnerPhase,
    leagueContext,
    pickOverrides,
  );
  if (receiveFc <= 0) return false;
  const ratio = receiveFc / anchorFc;
  return ratio >= FC_MIN_RATIO && ratio <= FC_MAX_RATIO;
}

function pickKey(pick) {
  return `${pick.season || pick.year || "?"}-${pick.round}-${pick.originalOwner || pick.previous_owner_id || ""}`;
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

function phaseMatches(partner, wanted) {
  if (!wanted || wanted === "any") return true;
  return partner?.teamPhase?.phase === wanted;
}

// ---------------------------------------------------------------------------
// ACQUIRE: user packages anchor + user picks to land a premium target.
// ---------------------------------------------------------------------------
function buildAcquirePackage(
  anchor,
  target,
  userPicks,
  usedPickKeys,
  userPhase,
  leagueContext,
  pickOverrides,
) {
  const targetValue = valueOfPlayer(target);
  if (targetValue <= 0) return null;
  const anchorValue = valueOfPlayer(anchor);
  if (anchorValue <= 0) return null;

  if (anchorValue > targetValue * MAX_RATIO) return null;
  if (anchorValue < targetValue * HARD_UNDERPAY_CAP) return null;

  const gate = passesRealismGates(anchor, target);
  if (!gate) return null;

  const availablePicks = (userPicks || [])
    .filter((pk) => !usedPickKeys.has(pickKey(pk)))
    .map((pk) => ({
      pick: pk,
      value: valueOfPickPhase(pk, userPhase, leagueContext),
    }))
    .sort((a, b) => b.value - a.value);

  let totalSend = anchorValue;
  const chosenPicks = [];

  for (const candidate of availablePicks) {
    if (chosenPicks.length >= MAX_PICKS_IN_PACKAGE) break;
    if (totalSend >= targetValue * MIN_RATIO) break;
    if (totalSend + candidate.value > targetValue * MAX_RATIO) continue;
    chosenPicks.push(candidate);
    totalSend += candidate.value;
  }

  const ratio = targetValue > 0 ? totalSend / targetValue : 0;
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) return null;

  // FC dynasty-market sanity. In acquire mode, the SEND side has the
  // picks, so we check whether the user's package FC is within band of
  // the target's FC. Reject if target has FC but anchor doesn't (can't
  // value half-blind).
  const targetFc = fcOfPlayer(target);
  if (targetFc > 0) {
    if (!passesFcSanity({
      anchorFc: targetFc,
      receivePlayer: anchor,
      receivePicks: chosenPicks.map((p) => p.pick),
      receiveOwnerPhase: userPhase,
      leagueContext,
      pickOverrides,
    })) {
      return null;
    }
  }

  return {
    mode: "acquire",
    anchor,
    anchorValue,
    sendPicks: chosenPicks.map((p) => p.pick),
    sendPickValueTotal: chosenPicks.reduce((s, p) => s + p.value, 0),
    totalSend,
    target,
    targetValue,
    receivePicks: [],
    receivePickValueTotal: 0,
    totalReceive: targetValue,
    ratio,
  };
}

// ---------------------------------------------------------------------------
// LIQUIDATE: user ships a star anchor for a pick haul (+ optional throw-in).
// ---------------------------------------------------------------------------
function buildLiquidatePackage(
  anchor,
  partner,
  throwInFilter,
  leagueContext,
  usedThrowInIds,
  pickOverrides,
) {
  const anchorValue = valueOfPlayer(anchor);
  if (anchorValue <= 0) return null;
  const anchorFc = fcOfPlayer(anchor);
  // Liquidate-mode demands the dynasty-market signal. Without FC on the
  // anchor we can't tell if a "1st for Shaheed" is plausible — bail.
  if (anchorFc <= 0) return null;

  const partnerPhase = partner?.teamPhase?.phase || null;

  // Pick a throw-in player (optional). Ideally a small young piece that
  // wouldn't carry the trade by itself.
  let throwIn = null;
  let throwInValue = 0;
  if (typeof throwInFilter === "function") {
    const candidates = (partner?.enriched || [])
      .filter((p) => {
        if (!p || usedThrowInIds?.has(p.id)) return false;
        try {
          return throwInFilter(p, {});
        } catch {
          return false;
        }
      })
      // Prefer smaller pieces — we want picks to carry the haul
      .sort(
        (a, b) =>
          (a.marketValue || a.score || 0) - (b.marketValue || b.score || 0),
      );
    for (const candidate of candidates) {
      const cv = valueOfPlayer(candidate);
      // Don't let the throw-in dominate — it's a sweetener, not the prize
      if (cv > anchorValue * 0.5) continue;
      // Still must clear the realism gate (we're receiving them)
      const gate = passesRealismGates(anchor, candidate);
      if (!gate) continue;
      throwIn = candidate;
      throwInValue = cv;
      break;
    }
  }

  // Build pick package from partner's inventory — largest first, since
  // liquidate mode is specifically about PICK HAUL.
  const partnerPicks = (partner?.picks || [])
    .map((pk) => ({
      pick: pk,
      value: valueOfPickPhase(pk, partnerPhase, leagueContext),
    }))
    .sort((a, b) => b.value - a.value);

  let totalReceive = throwInValue;
  const chosenPicks = [];

  for (const candidate of partnerPicks) {
    if (chosenPicks.length >= MAX_PICKS_IN_PACKAGE) break;
    if (totalReceive >= anchorValue * MIN_RATIO) break;
    if (totalReceive + candidate.value > anchorValue * MAX_RATIO) continue;
    chosenPicks.push(candidate);
    totalReceive += candidate.value;
  }

  // Bombshell requires at least one pick in the haul — otherwise it's
  // just a regular marquee move.
  if (chosenPicks.length === 0) return null;

  const ratio = anchorValue > 0 ? totalReceive / anchorValue : 0;
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) return null;

  // FC dynasty-market sanity. The score-scale check above let
  // "Shaheed for a late 1st" slip through because picks are
  // systematically undervalued relative to FC reality. Re-check the
  // exact same package in FC-dollar space.
  if (
    !passesFcSanity({
      anchorFc,
      receivePlayer: throwIn,
      receivePicks: chosenPicks.map((p) => p.pick),
      receiveOwnerPhase: partnerPhase,
      leagueContext,
      pickOverrides,
    })
  ) {
    return null;
  }

  return {
    mode: "liquidate",
    anchor,
    anchorValue,
    sendPicks: [],
    sendPickValueTotal: 0,
    totalSend: anchorValue,
    target: throwIn, // may be null — picks-only liquidation is valid
    targetValue: throwInValue,
    receivePicks: chosenPicks.map((p) => p.pick),
    receivePickValueTotal: chosenPicks.reduce((s, p) => s + p.value, 0),
    totalReceive,
    ratio,
    partnerPhase,
  };
}

// ---------------------------------------------------------------------------
// Main generator — branches on config.mode.
// ---------------------------------------------------------------------------
export function generateBombshellMoves(analysis, path) {
  const config = path.bombshellMove;
  if (!config) {
    return { title: "Bombshell Moves", moves: [], enabled: false };
  }
  const mode = config.mode || "acquire";

  const ctx = { analysis };
  const leagueContext = analysis?.leagueContext || {};
  const myRosterId = analysis?.rosterId;
  const userPhase = analysis?.teamPhase?.phase || null;
  const userPicks = analysis?.picks || [];
  const pickOverrides = analysis?.rosterAuditSource?.pickValues || null;
  const compsIndex = analysis?.marketCompsBySleeperId || null;
  const compsForPlayer = (player) => {
    const raw = getMarketComps(compsIndex, player?.id, 3);
    return raw
      .map((c) => ({ id: c.id, date: c.date, summary: describeMarketComp(c) }))
      .filter((c) => c.summary);
  };

  const partners = (analysis?.leagueTeams || []).filter(
    (t) => t.rosterId !== myRosterId,
  );

  const moves = [];

  if (mode === "acquire") {
    if (
      typeof config.targetPicker !== "function" ||
      typeof config.anchorFilter !== "function"
    ) {
      return { title: config.title || "Bombshell Moves", moves: [], enabled: false };
    }

    const anchorPool =
      analysis?.tradeablePlayers?.length > 0
        ? analysis.tradeablePlayers
        : analysis?.enriched || [];

    const anchorCandidates = anchorPool
      .filter((p) => {
        try {
          return config.anchorFilter(p, ctx);
        } catch {
          return false;
        }
      })
      .sort(
        (a, b) =>
          (b.marketValue || b.score || 0) - (a.marketValue || a.score || 0),
      );

    const usedPickKeys = new Set();
    const usedTargetIds = new Set();
    const usedAnchorIds = new Set();

    for (const partner of partners) {
      if (!phaseMatches(partner, config.partnerPhase)) continue;

      let target = null;
      try {
        target = config.targetPicker(partner, { ...ctx, usedTargetIds });
      } catch {
        target = null;
      }
      if (!target || usedTargetIds.has(target.id)) continue;

      let best = null;
      for (const anchor of anchorCandidates) {
        if (usedAnchorIds.has(anchor.id)) continue;
        const pkg = buildAcquirePackage(
          anchor,
          target,
          userPicks,
          usedPickKeys,
          userPhase,
          leagueContext,
          pickOverrides,
        );
        if (!pkg) continue;

        let score = 0;
        try {
          score = config.score
            ? config.score(anchor, target, pkg.sendPicks, partner)
            : valueOfPlayer(target);
        } catch {
          score = valueOfPlayer(target);
        }
        score -= Math.abs(1 - pkg.ratio) * 20;
        score -= pkg.sendPicks.length * 2;
        // Trend: trending-down anchor = more urgency to ship (bonus).
        // Trending-up target = harder to pry loose (penalty).
        score += trendDelta(anchor, "sell");
        score += trendDelta(target, "buy");

        if (!best || score > best.score) best = { pkg, score };
      }
      if (!best) continue;

      const { pkg } = best;
      usedTargetIds.add(target.id);
      usedAnchorIds.add(pkg.anchor.id);
      pkg.sendPicks.forEach((pk) => usedPickKeys.add(pickKey(pk)));

      let rationale = null;
      if (typeof config.rationale === "function") {
        try {
          rationale = config.rationale(pkg.anchor, target, pkg.sendPicks, partner);
        } catch {
          rationale = null;
        }
      }

      moves.push({
        mode: "acquire",
        send: pkg.anchor,
        sendMarketComps: compsForPlayer(pkg.anchor),
        sendPicks: pkg.sendPicks,
        sendPickLabels: pkg.sendPicks
          .map((pk) => formatPick(pk, userPhase))
          .filter(Boolean),
        sendValue: Math.round(pkg.totalSend),
        sendPlayerValue: Math.round(pkg.anchorValue),
        sendPickValue: Math.round(pkg.sendPickValueTotal),
        receive: { player: target, picks: [] },
        receivePickLabels: [],
        receiveValue: Math.round(pkg.targetValue),
        receivePlayerValue: Math.round(pkg.targetValue),
        receivePickValue: 0,
        valueRatio: Math.round(pkg.ratio * 100) / 100,
        partnerTeam: partner.label,
        partnerPhase: partner.teamPhase?.phase || null,
        partnerScore: partner.teamPhase?.score || null,
        rationale,
      });
    }
  } else if (mode === "liquidate") {
    if (typeof config.anchorPicker !== "function") {
      return { title: config.title || "Bombshell Moves", moves: [], enabled: false };
    }

    // Anchor(s) to liquidate — the user's stars/vets worth the pick haul.
    let anchorCandidates = [];
    try {
      const raw = config.anchorPicker(analysis, ctx);
      anchorCandidates = Array.isArray(raw) ? raw : raw ? [raw] : [];
    } catch {
      anchorCandidates = [];
    }
    anchorCandidates = anchorCandidates
      .filter(Boolean)
      .sort(
        (a, b) =>
          (b.marketValue || b.score || 0) - (a.marketValue || a.score || 0),
      );

    const usedAnchorIds = new Set();
    const usedThrowInIds = new Set();

    for (const anchor of anchorCandidates) {
      if (usedAnchorIds.has(anchor.id)) continue;

      let best = null;
      for (const partner of partners) {
        if (!phaseMatches(partner, config.partnerPhase)) continue;
        const pkg = buildLiquidatePackage(
          anchor,
          partner,
          config.throwInFilter,
          leagueContext,
          usedThrowInIds,
          pickOverrides,
        );
        if (!pkg) continue;

        let score = 0;
        try {
          score = config.score
            ? config.score(anchor, pkg.target, pkg.receivePicks, partner)
            : pkg.totalReceive;
        } catch {
          score = pkg.totalReceive;
        }
        score -= Math.abs(1 - pkg.ratio) * 20;
        // Prefer more picks in the haul — bombshell feel
        score += pkg.receivePicks.length * 3;
        // Trend: trending-down anchor = sell urgency (bonus).
        score += trendDelta(anchor, "sell");

        if (!best || score > best.score) best = { pkg, partner, score };
      }
      if (!best) continue;

      const { pkg, partner } = best;
      usedAnchorIds.add(anchor.id);
      if (pkg.target) usedThrowInIds.add(pkg.target.id);

      let rationale = null;
      if (typeof config.rationale === "function") {
        try {
          rationale = config.rationale(
            anchor,
            pkg.target,
            pkg.receivePicks,
            partner,
          );
        } catch {
          rationale = null;
        }
      }

      moves.push({
        mode: "liquidate",
        send: anchor,
        sendMarketComps: compsForPlayer(anchor),
        sendPicks: [],
        sendPickLabels: [],
        sendValue: Math.round(pkg.totalSend),
        sendPlayerValue: Math.round(pkg.anchorValue),
        sendPickValue: 0,
        receive: { player: pkg.target, picks: pkg.receivePicks },
        receivePickLabels: pkg.receivePicks
          .map((pk) => formatPick(pk, pkg.partnerPhase))
          .filter(Boolean),
        receiveValue: Math.round(pkg.totalReceive),
        receivePlayerValue: Math.round(pkg.targetValue),
        receivePickValue: Math.round(pkg.receivePickValueTotal),
        valueRatio: Math.round(pkg.ratio * 100) / 100,
        partnerTeam: partner.label,
        partnerPhase: partner.teamPhase?.phase || null,
        partnerScore: partner.teamPhase?.score || null,
        rationale,
      });
    }
  }

  moves.sort((a, b) => (b.receiveValue || 0) - (a.receiveValue || 0));

  return {
    title: config.title || "Bombshell Moves",
    subtitle: config.subtitle || null,
    moves: moves.slice(0, 3),
    enabled: true,
  };
}
