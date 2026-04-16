// Tier Moves — same-position upgrades and downgrades, gated by the
// DYNASTY MARKET (FantasyCalc value + rank), not internal score.
//
//   TIER-UP: swap a middling starter for a clearly better same-position
//     player, adding a pick to close the dynasty-value gap.
//     "Chuba Hubbard + a 2nd for Breece Hall."
//
//   TIER-DOWN: cash an AGING or DECLINING high-value player for a real
//     productive starter at the same position + partner picks.
//     "J.K. Dobbins for Jaylen Warren + a 2027 1st."
//
// CRITICAL: we require FantasyCalc values on BOTH sides. FC is the
// dynasty market — it's the only trustworthy tier signal. marketValue is
// score-scale and includes our own archetype/age adjustments, which
// means ascending 23yo Foundational types look "liquidatable" when they
// really aren't. FC captures what the league would actually pay.
//
// Tier-down sources must also pass an explicit "sellability" check —
// aging, declining, or pure short-term production. We DO NOT
// tier-down ascending young talent (age ≤ 25 and Foundational/Upside
// Shot/Cornerstone) no matter how high their score is.

import {
  passesRealismGates,
  valueOfPickPhase,
  pickFcValue,
} from "./generateMarqueeMoves";
import { pickSlotLabel, trendDelta } from "../../marketValue";

const MIN_RATIO = 0.88;
const MAX_RATIO = 1.18;
const MAX_PICKS_PER_PACKAGE = 2;

// Tier-up: target dynasty value must be this richer than yours
const UP_FC_MIN = 1.15;
const UP_FC_MAX = 1.6;
// Tier-down: target dynasty value must be this fraction of yours
const DOWN_FC_MIN = 0.65;
const DOWN_FC_MAX = 0.9;

// Untouchable tier-down filter — never sell ascending young talent
function isUntouchableYoung(p) {
  if (!p) return true;
  const age = Number(p.age ?? 99);
  if (age > 25) return false;
  return (
    p.archetype === "Cornerstone" ||
    p.archetype === "Foundational" ||
    p.archetype === "Upside Shot"
  );
}

// Archetype hierarchy (for 1-tier-max delta)
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

function fcValue(p) {
  return Number(p?.dynastyMarketValue || p?.fantasyCalcValue || 0);
}

// Pad picks to close a value gap. baseValue is the CHEAPER side; target
// is the richer side. Smallest picks first (avoid overshooting).
function padPicks({ baseValue, targetValue, availablePicks, maxCount = MAX_PICKS_PER_PACKAGE }) {
  let total = baseValue;
  const chosen = [];
  if (baseValue >= targetValue * MIN_RATIO) {
    const ratio = baseValue / targetValue;
    if (ratio > MAX_RATIO) return null;
    return { chosen, total, ratio };
  }
  const sortedAsc = [...availablePicks].sort((a, b) => a.value - b.value);
  for (const cand of sortedAsc) {
    if (chosen.length >= maxCount) break;
    if (total >= targetValue * MIN_RATIO) break;
    if (total + cand.value > targetValue * MAX_RATIO) continue;
    chosen.push(cand);
    total += cand.value;
  }
  const ratio = total / targetValue;
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) return null;
  return { chosen, total, ratio };
}

// ---- SELL-SIDE FILTERS ---------------------------------------------------

// Tier-up source: a middling starter worth upgrading. NOT an ascender.
// Uses FC positional rank as the primary tier signal: top-12 = elite (skip),
// 13-36 = solid starter (skip), 37-72 = mid-tier upgrade zone, 73+ = bench.
function isTierUpSource(p) {
  if (!p) return false;
  if (isUntouchableYoung(p)) return false;
  if (p.archetype === "Cornerstone") return false;
  const fc = fcValue(p);
  if (fc <= 0) return false; // need FC to compare
  // FC rank gate — only mid-tier players are upgrade candidates
  const rank = Number(p.fantasyCalcRank || 0);
  if (rank > 0 && rank <= 36) return false;  // already a solid starter
  if (rank > 72) return false;               // too far down to tier-up from
  // Fallback to score bucket when FC rank is unavailable
  if (rank <= 0) {
    const score = Number(p.score || 0);
    if (score < 48 || score > 72) return false;
  }
  // Archetype must be a realistic upgrade target (not an ascending star
  // and not an unrosterable JAG)
  return (
    p.archetype === "Mainstay" ||
    p.archetype === "Productive Vet" ||
    p.archetype === "Short Term Production" ||
    p.archetype === "Short Term League Winner" ||
    p.archetype === "Serviceable"
  );
}

// Tier-down source: genuinely sellable — aging, declining, or pure STP.
// A 23yo Foundational WR is NOT sellable regardless of how many picks
// someone would pay.
function isTierDownSource(p) {
  if (!p) return false;
  if (isUntouchableYoung(p)) return false;
  if (p.archetype === "Cornerstone") return false;
  const fc = fcValue(p);
  if (fc <= 0) return false;
  const age = Number(p.age ?? 99);
  const archetype = p.archetype || "";
  // Aging past peak
  if (age >= 28) return true;
  // Short-term archetypes — value is front-loaded by definition
  if (
    archetype === "Short Term League Winner" ||
    archetype === "Short Term Production"
  ) {
    return true;
  }
  // Productive Vet 27+ — starting to bleed dynasty value
  if (archetype === "Productive Vet" && age >= 27) return true;
  return false;
}

// ---- TIER-UP LOOKUP ------------------------------------------------------
function findTierUp(
  userPlayer,
  partners,
  userPicks,
  userPhase,
  leagueContext,
  usedTargetIds,
  usedPickKeys,
  pickOverrides,
) {
  const userFc = fcValue(userPlayer);
  if (userFc <= 0) return null;

  const availablePicks = (userPicks || [])
    .filter((pk) => !usedPickKeys.has(pickKey(pk)))
    .map((pk) => ({
      pick: pk,
      value: pickFcValue(pk, userPhase, leagueContext, pickOverrides),
    }));

  let best = null;

  for (const partner of partners) {
    for (const other of partner.enriched || []) {
      if (!other || !other.position) continue;
      if (other.position !== userPlayer.position) continue;
      if (other.id === userPlayer.id) continue;
      if (usedTargetIds.has(other.id)) continue;

      const otherFc = fcValue(other);
      if (otherFc <= 0) continue; // dynasty market must cover both sides

      // Dynasty-value band: clear upgrade but not a star
      if (otherFc < userFc * UP_FC_MIN) continue;
      if (otherFc > userFc * UP_FC_MAX) continue;

      // Must be a real starter at the position
      if ((other.score || 0) < 68) continue;
      if (Number(other.age ?? 99) > 28) continue;
      // FC rank: target should be a clear dynasty-market upgrade
      const otherRank = Number(other.fantasyCalcRank || 0);
      const userRank = Number(userPlayer.fantasyCalcRank || 0);
      if (otherRank > 0 && userRank > 0 && otherRank >= userRank) continue;

      // Archetype must be same or higher tier
      if (tierOf(other.archetype) < tierOf(userPlayer.archetype)) continue;
      if (
        other.archetype === "Short Term Production" ||
        other.archetype === "JAG - Insurance" ||
        other.archetype === "JAG - Developmental" ||
        other.archetype === "Replaceable"
      )
        continue;

      // Standard realism gate
      if (!passesRealismGates(userPlayer, other)) continue;

      // Pad: user's package (player + picks) → target value
      const packed = padPicks({
        baseValue: userFc,
        targetValue: otherFc,
        availablePicks,
      });
      if (!packed) continue;

      const score =
        (otherFc - userFc) -
        packed.chosen.length * 100 -
        Math.abs(1 - packed.ratio) * userFc * 0.3 +
        // Trend: trending-down user player = more urgency to upgrade;
        // trending-up target = harder to pry loose (penalty).
        trendDelta(userPlayer, "sell") +
        trendDelta(other, "buy");

      if (!best || score > best.score) {
        best = {
          partner,
          target: other,
          packed,
          userFc,
          otherFc,
          score,
        };
      }
    }
  }

  return best;
}

// ---- TIER-DOWN LOOKUP ----------------------------------------------------
function findTierDown(userPlayer, partners, leagueContext, usedTargetIds, pickOverrides) {
  const userFc = fcValue(userPlayer);
  if (userFc <= 0) return null;

  let best = null;

  for (const partner of partners) {
    const partnerPhase = partner.teamPhase?.phase || null;
    const partnerPicks = (partner.picks || []).map((pk) => ({
      pick: pk,
      value: pickFcValue(pk, partnerPhase, leagueContext, pickOverrides),
    }));

    for (const other of partner.enriched || []) {
      if (!other || !other.position) continue;
      if (other.position !== userPlayer.position) continue;
      if (other.id === userPlayer.id) continue;
      if (usedTargetIds.has(other.id)) continue;

      const otherFc = fcValue(other);
      if (otherFc <= 0) continue;

      // Dynasty-value band for tier-down
      if (otherFc > userFc * DOWN_FC_MAX) continue;
      if (otherFc < userFc * DOWN_FC_MIN) continue;

      // Target must be a REAL starter — not bench filler
      if ((other.score || 0) < 58) continue;
      // Not a pure JAG
      if (
        other.archetype === "JAG - Insurance" ||
        other.archetype === "JAG - Developmental" ||
        other.archetype === "Replaceable" ||
        other.archetype === "Short Term Production"
      )
        continue;
      // Archetype tier can be 1 below but no more
      if (tierOf(other.archetype) < tierOf(userPlayer.archetype) - 1) continue;

      // Realism gate
      if (!passesRealismGates(userPlayer, other)) continue;

      // Pad partner picks to close the gap (otherFc up to userFc)
      const packed = padPicks({
        baseValue: otherFc,
        targetValue: userFc,
        availablePicks: partnerPicks,
      });
      if (!packed) continue;
      // Tier-down requires at least one pick in the return — that's the
      // whole point of the move
      if (packed.chosen.length === 0) continue;

      const score =
        (userFc - otherFc) +
        packed.chosen.length * 150 -
        Math.abs(1 - packed.ratio) * userFc * 0.3 +
        // Trend: trending-down seller = sell now urgency.
        trendDelta(userPlayer, "sell");

      if (!best || score > best.score) {
        best = {
          partner,
          partnerPhase,
          target: other,
          packed,
          userFc,
          otherFc,
          score,
        };
      }
    }
  }

  return best;
}

// ---- MAIN GENERATOR ------------------------------------------------------
export function generateTierMoves(analysis, path) {
  const config = path?.tierMoves || {};
  const showUp = config.showUp !== false;
  const showDown = config.showDown !== false;

  const leagueContext = analysis?.leagueContext || {};
  const myRosterId = analysis?.rosterId;
  const userPhase = analysis?.teamPhase?.phase || null;
  const userPicks = analysis?.picks || [];

  const pickOverrides = analysis?.rosterAuditSource?.pickValues || null;

  const partners = (analysis?.leagueTeams || []).filter(
    (t) => t.rosterId !== myRosterId,
  );

  const myPlayers = analysis?.enriched || [];

  const tierUps = [];
  const tierDowns = [];

  if (showUp) {
    const usedTargetIds = new Set();
    const usedPickKeys = new Set();
    const usedSenderIds = new Set();

    const upCandidates = myPlayers
      .filter(isTierUpSource)
      .sort((a, b) => fcValue(b) - fcValue(a))
      .slice(0, 12);

    for (const userPlayer of upCandidates) {
      if (usedSenderIds.has(userPlayer.id)) continue;
      const match = findTierUp(
        userPlayer,
        partners,
        userPicks,
        userPhase,
        leagueContext,
        usedTargetIds,
        usedPickKeys,
        pickOverrides,
      );
      if (!match) continue;

      usedTargetIds.add(match.target.id);
      usedSenderIds.add(userPlayer.id);
      match.packed.chosen.forEach((c) => usedPickKeys.add(pickKey(c.pick)));

      tierUps.push({
        direction: "up",
        send: userPlayer,
        sendPicks: match.packed.chosen.map((c) => c.pick),
        sendPickLabels: match.packed.chosen
          .map((c) => formatPick(c.pick, userPhase))
          .filter(Boolean),
        sendValue: Math.round(match.packed.total),
        sendPlayerValue: Math.round(match.userFc),
        sendPickValue: Math.round(
          match.packed.chosen.reduce((s, c) => s + c.value, 0),
        ),
        receive: { player: match.target, picks: [] },
        receivePickLabels: [],
        receiveValue: Math.round(match.otherFc),
        receivePlayerValue: Math.round(match.otherFc),
        receivePickValue: 0,
        valueRatio: Math.round(match.packed.ratio * 100) / 100,
        partnerTeam: match.partner.label,
        partnerPhase: match.partner.teamPhase?.phase || null,
        position: userPlayer.position,
        rationale: `Upgrade at ${userPlayer.position}: ship ${userPlayer.name} (FC $${match.userFc.toLocaleString()})${match.packed.chosen.length > 0 ? ` + ${match.packed.chosen.length} pick${match.packed.chosen.length === 1 ? "" : "s"}` : ""} to ${match.partner.label} for ${match.target.name} (FC $${match.otherFc.toLocaleString()}) — clear dynasty-market upgrade at the same spot.`,
      });
    }
  }

  if (showDown) {
    const usedTargetIds = new Set();
    const usedSenderIds = new Set();

    const downCandidates = myPlayers
      .filter(isTierDownSource)
      .sort((a, b) => fcValue(b) - fcValue(a))
      .slice(0, 12);

    for (const userPlayer of downCandidates) {
      if (usedSenderIds.has(userPlayer.id)) continue;
      const match = findTierDown(
        userPlayer,
        partners,
        leagueContext,
        usedTargetIds,
        pickOverrides,
      );
      if (!match) continue;

      usedTargetIds.add(match.target.id);
      usedSenderIds.add(userPlayer.id);

      tierDowns.push({
        direction: "down",
        send: userPlayer,
        sendPicks: [],
        sendPickLabels: [],
        sendValue: Math.round(match.userFc),
        sendPlayerValue: Math.round(match.userFc),
        sendPickValue: 0,
        receive: {
          player: match.target,
          picks: match.packed.chosen.map((c) => c.pick),
        },
        receivePickLabels: match.packed.chosen
          .map((c) => formatPick(c.pick, match.partnerPhase))
          .filter(Boolean),
        receiveValue: Math.round(match.packed.total),
        receivePlayerValue: Math.round(match.otherFc),
        receivePickValue: Math.round(
          match.packed.chosen.reduce((s, c) => s + c.value, 0),
        ),
        valueRatio: Math.round(match.packed.ratio * 100) / 100,
        partnerTeam: match.partner.label,
        partnerPhase: match.partnerPhase,
        position: userPlayer.position,
        rationale: `Tier down at ${userPlayer.position}: cash ${userPlayer.name} (age ${userPlayer.age}, ${userPlayer.archetype}, FC $${match.userFc.toLocaleString()}) to ${match.partner.label} for ${match.target.name} (FC $${match.otherFc.toLocaleString()}) + ${match.packed.chosen.length} pick${match.packed.chosen.length === 1 ? "" : "s"} — real starter stays, extra draft capital banked before he declines.`,
      });
    }
  }

  tierUps.sort((a, b) => (b.receiveValue || 0) - (a.receiveValue || 0));
  tierDowns.sort((a, b) => (b.sendValue || 0) - (a.sendValue || 0));

  return {
    title: "Tier Swap Moves",
    subtitle:
      "Same-position swaps gated by the dynasty market (FantasyCalc). Tier-up = upgrade a middling starter. Tier-down = cash an aging/declining player for a real starter + pick haul. Ascending young talent never flows out.",
    tierUps: tierUps.slice(0, 3),
    tierDowns: tierDowns.slice(0, 3),
  };
}
