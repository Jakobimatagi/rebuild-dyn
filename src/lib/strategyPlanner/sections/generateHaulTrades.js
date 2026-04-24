// Haul Trades — multi-asset dynasty moves that go beyond 1-for-1.
//
// Two patterns:
//
//   CONSOLIDATION HAUL (3-for-1): package 3 mid-tier players from the
//     user's roster (Mainstay / Productive Vet / STP, score 50–70) for
//     one elite same-position anchor on a partner. Classic "Cooper Kupp +
//     Diontae + a 3rd for Ja'Marr Chase."
//
//   LIQUIDATION HAUL (1-for-many): ship one star anchor for 3+ picks +
//     an optional young throw-in. Classic "Saquon for 2027 1st + 2028 1st
//     + 2028 1st + Trey Benson."
//
// Reuses every existing realism gate (FC parity, archetype tier, roster
// relevance) — just operates on multi-player packages.
//
// Each path supplies a `haulTrades` config:
//   showConsolidation?: boolean (default true)
//   showLiquidation?:   boolean (default true)
//   consolidationFilter?(player, ctx) => boolean  — override sell pool
//   liquidationFilter?(player, ctx) => boolean    — override anchor pool
//   partnerPhase?: string                          — filter partners

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MIN_RATIO = 0.85;
const MAX_RATIO = 1.25;
const FC_MIN_RATIO = 0.85;
const FC_MAX_RATIO = 1.25;

// Consolidation: require 2-4 players on the send side (the "haul feel").
const CONSOL_MIN_PLAYERS = 2;
const CONSOL_MAX_PLAYERS = 4;
// Liquidation: at least 2 picks required (otherwise it's just a bombshell).
const LIQ_MIN_PICKS = 2;
const LIQ_MAX_PICKS = 5;
// And up to 2 throw-in players received alongside picks.
const LIQ_MAX_THROW_INS = 2;

// Archetype tiers — same as elsewhere.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fcVal(p) {
  return Number(p?.dynastyMarketValue || p?.fantasyCalcValue || 0);
}

function pickKey(pick) {
  return `${pick.season || pick.year || "?"}-${pick.round}-${pick.originalOwner || pick.previous_owner_id || ""}`;
}

function formatPick(pick, ownerPhase) {
  if (!pick) return null;
  const year = pick.season || pick.year || "?";
  const round = pick.round;
  const suffix =
    round === 1
      ? "1st"
      : round === 2
        ? "2nd"
        : round === 3
          ? "3rd"
          : `${round}th`;
  const slotLabel = pickSlotLabel(round, ownerPhase);
  return slotLabel ? `${year} ${slotLabel} ${suffix}` : `${year} ${suffix}`;
}

function phaseMatches(partner, wanted) {
  if (!wanted || wanted === "any") return true;
  return partner?.teamPhase?.phase === wanted;
}

// ---------------------------------------------------------------------------
// Default filters
// ---------------------------------------------------------------------------

// Consolidation send pool: mid-tier players with real name value (score
// 50-70, rank 25-80ish). NOT ascending young talent, NOT elite anchors.
function defaultConsolidationFilter(p) {
  if (!p) return false;
  const fc = fcVal(p);
  if (fc <= 0) return false;
  const score = Number(p.score || 0);
  if (score < 50 || score > 72) return false;
  const age = Number(p.age ?? 99);
  // Don't consolidate away ascending young talent
  if (
    age <= 24 &&
    (p.archetype === "Cornerstone" ||
      p.archetype === "Foundational" ||
      p.archetype === "Upside Shot")
  )
    return false;
  return (
    p.archetype === "Mainstay" ||
    p.archetype === "Productive Vet" ||
    p.archetype === "Short Term League Winner" ||
    p.archetype === "Short Term Production" ||
    p.archetype === "Serviceable"
  );
}

// Liquidation anchor pool: genuine stars with dynasty market clout.
function defaultLiquidationFilter(p) {
  if (!p) return false;
  const fc = fcVal(p);
  if (fc < 3000) return false; // must be worth a real haul
  const score = Number(p.score || 0);
  if (score < 65) return false;
  // Don't liquidate ascending young cornerstones (that's a teardown, not
  // a haul)
  const age = Number(p.age ?? 99);
  if (
    age <= 24 &&
    (p.archetype === "Cornerstone" || p.archetype === "Foundational")
  )
    return false;
  return (
    p.archetype !== "JAG - Insurance" &&
    p.archetype !== "JAG - Developmental" &&
    p.archetype !== "Replaceable"
  );
}

// ---------------------------------------------------------------------------
// CONSOLIDATION HAUL (3-for-1)
//
// We're the BUYER consolidating depth into quality. Package 2-4 of our
// roster's mid-tier players for one elite-ish target on a partner team.
// ---------------------------------------------------------------------------
function findConsolidation(
  sendPool,
  partners,
  userPhase,
  leagueContext,
  usedPlayerIds,
  usedTargetIds,
  partnerPhaseFilter,
) {
  const results = [];

  for (const partner of partners) {
    if (!phaseMatches(partner, partnerPhaseFilter)) continue;
    const partnerPhase = partner?.teamPhase?.phase || null;

    // Find elite targets on the partner's roster
    const targets = (partner.enriched || [])
      .filter((p) => {
        if (!p || !p.position) return false;
        if (usedTargetIds.has(p.id)) return false;
        const fc = fcVal(p);
        if (fc < 2500) return false;
        const score = Number(p.score || 0);
        if (score < 68) return false;
        // Target should be a real quality player
        return (
          tierOf(p.archetype) >= 4 && // Mainstay+ only
          Number(p.age ?? 99) <= 28
        );
      })
      .sort((a, b) => fcVal(b) - fcVal(a));

    for (const target of targets) {
      const targetFc = fcVal(target);
      const targetValue = valueOfPlayer(target);
      if (targetValue <= 0) continue;

      // Find the best 2-4 player package from our send pool for this target.
      // Players should ideally share the target's position or a FLEX-worthy
      // position (RB/WR/TE).
      const eligible = sendPool
        .filter((p) => {
          if (usedPlayerIds.has(p.id)) return false;
          if (p.id === target.id) return false;
          // Skip per-piece realism gate — passesRealismGates is designed
          // for 1-for-1 trades and rejects when a single mid-tier piece
          // is compared against an elite target. For consolidation, the
          // PACKAGE parity check below handles fairness.
          return true;
        })
        .sort((a, b) => fcVal(b) - fcVal(a));

      if (eligible.length < CONSOL_MIN_PLAYERS) continue;

      // Greedy: add pieces largest-first until we hit the parity band
      const chosen = [];
      let totalSendValue = 0;
      let totalSendFc = 0;

      for (const piece of eligible) {
        if (chosen.length >= CONSOL_MAX_PLAYERS) break;
        const pVal = valueOfPlayer(piece);
        const pFc = fcVal(piece);
        // Don't overshoot — if adding this piece pushes past max, skip
        if (totalSendValue + pVal > targetValue * MAX_RATIO && chosen.length >= CONSOL_MIN_PLAYERS) continue;
        chosen.push(piece);
        totalSendValue += pVal;
        totalSendFc += pFc;
        // Stop once we've hit the band
        if (
          chosen.length >= CONSOL_MIN_PLAYERS &&
          totalSendValue >= targetValue * MIN_RATIO
        )
          break;
      }

      if (chosen.length < CONSOL_MIN_PLAYERS) continue;

      // Score-scale parity
      const ratio = targetValue > 0 ? totalSendValue / targetValue : 0;
      if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;

      // FC dynasty-market parity
      if (targetFc > 0 && totalSendFc > 0) {
        const fcRatio = totalSendFc / targetFc;
        if (fcRatio < FC_MIN_RATIO || fcRatio > FC_MAX_RATIO) continue;
      }

      // Trend scoring
      let score = targetFc - totalSendFc;
      score -= chosen.length * 50; // small penalty per piece (simpler = better)
      score -= Math.abs(1 - ratio) * targetFc * 0.3;
      for (const piece of chosen) {
        score += trendDelta(piece, "sell"); // trending-down sells = bonus
      }
      score += trendDelta(target, "buy"); // trending-down target = discount

      results.push({
        mode: "consolidation",
        sendPlayers: chosen,
        sendPicks: [],
        sendValues: {
          total: Math.round(totalSendValue),
          fc: Math.round(totalSendFc),
        },
        target,
        targetValues: {
          total: Math.round(targetValue),
          fc: Math.round(targetFc),
        },
        partner,
        partnerPhase,
        ratio: Math.round(ratio * 100) / 100,
        score,
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// LIQUIDATION HAUL (1-for-many)
//
// Ship one star for a pile of picks + optional young throw-in(s).
// Must yield at least 2 picks (otherwise it's just a bombshell).
// ---------------------------------------------------------------------------
function findLiquidation(
  anchorPool,
  partners,
  leagueContext,
  usedPlayerIds,
  usedTargetIds,
  partnerPhaseFilter,
  pickOverrides,
) {
  const results = [];

  for (const anchor of anchorPool) {
    if (usedPlayerIds.has(anchor.id)) continue;
    const anchorValue = valueOfPlayer(anchor);
    const anchorFc = fcVal(anchor);
    if (anchorValue <= 0 || anchorFc <= 0) continue;

    let best = null;

    for (const partner of partners) {
      if (!phaseMatches(partner, partnerPhaseFilter)) continue;
      const partnerPhase = partner?.teamPhase?.phase || null;

      // Build the pick haul — largest picks first for the bombshell feel
      const partnerPicks = (partner?.picks || [])
        .map((pk) => ({
          pick: pk,
          value: valueOfPickPhase(pk, partnerPhase, leagueContext),
          fc: pickFcValue(pk, partnerPhase, leagueContext, pickOverrides),
        }))
        .sort((a, b) => b.value - a.value);

      // Find throw-in candidates — small young pieces
      const throwIns = (partner?.enriched || [])
        .filter((p) => {
          if (!p || usedTargetIds.has(p.id)) return false;
          const pVal = valueOfPlayer(p);
          if (pVal > anchorValue * 0.4) return false; // sweetener, not the prize
          if (Number(p.age ?? 99) > 25) return false;
          const gate = passesRealismGates(anchor, p);
          return !!gate;
        })
        .sort(
          (a, b) =>
            (a.marketValue || a.score || 0) - (b.marketValue || b.score || 0),
        )
        .slice(0, LIQ_MAX_THROW_INS);

      // Greedy pick selection
      let totalReceive = 0;
      let totalReceiveFc = 0;
      const chosenPicks = [];
      const chosenThrowIns = [];

      // Add throw-ins first (small value, establishes the "young piece" feel)
      for (const ti of throwIns) {
        if (chosenThrowIns.length >= LIQ_MAX_THROW_INS) break;
        const tv = valueOfPlayer(ti);
        const tfv = fcVal(ti);
        if (totalReceive + tv > anchorValue * MAX_RATIO) continue;
        chosenThrowIns.push(ti);
        totalReceive += tv;
        totalReceiveFc += tfv;
      }

      // Add picks largest-first
      for (const cand of partnerPicks) {
        if (chosenPicks.length >= LIQ_MAX_PICKS) break;
        if (totalReceive >= anchorValue * MIN_RATIO) break;
        if (totalReceive + cand.value > anchorValue * MAX_RATIO) continue;
        chosenPicks.push(cand);
        totalReceive += cand.value;
        totalReceiveFc += cand.fc;
      }

      if (chosenPicks.length < LIQ_MIN_PICKS) continue;

      const ratio = anchorValue > 0 ? totalReceive / anchorValue : 0;
      if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;

      // FC dynasty-market sanity
      if (anchorFc > 0 && totalReceiveFc > 0) {
        const fcRatio = totalReceiveFc / anchorFc;
        if (fcRatio < FC_MIN_RATIO || fcRatio > FC_MAX_RATIO) continue;
      }

      let score = totalReceiveFc;
      score += chosenPicks.length * 200; // prefer more picks
      score -= Math.abs(1 - ratio) * anchorFc * 0.3;
      score += trendDelta(anchor, "sell"); // declining anchor = sell now

      if (!best || score > best.score) {
        best = {
          anchor,
          partner,
          partnerPhase,
          chosenPicks,
          chosenThrowIns,
          totalReceive: Math.round(totalReceive),
          totalReceiveFc: Math.round(totalReceiveFc),
          anchorValue: Math.round(anchorValue),
          anchorFc: Math.round(anchorFc),
          ratio: Math.round(ratio * 100) / 100,
          score,
        };
      }
    }

    if (best) results.push(best);
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------
export function generateHaulTrades(analysis, path) {
  const config = path?.haulTrades || {};
  const showConsolidation = config.showConsolidation !== false;
  const showLiquidation = config.showLiquidation !== false;

  const leagueContext = analysis?.leagueContext || {};
  const myRosterId = analysis?.rosterId;
  const userPhase = analysis?.teamPhase?.phase || null;
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

  const myPlayers = analysis?.enriched || [];
  const usedPlayerIds = new Set();
  const usedTargetIds = new Set();

  // --- Consolidation Haul (3-for-1) ---
  let consolidations = [];
  if (showConsolidation) {
    const consolFilter =
      typeof config.consolidationFilter === "function"
        ? config.consolidationFilter
        : defaultConsolidationFilter;
    const consolPool = myPlayers.filter((p) => consolFilter(p));

    consolidations = findConsolidation(
      consolPool,
      partners,
      userPhase,
      leagueContext,
      usedPlayerIds,
      usedTargetIds,
      config.partnerPhase,
    );

    // Mark used
    for (const c of consolidations) {
      usedTargetIds.add(c.target.id);
      for (const p of c.sendPlayers) usedPlayerIds.add(p.id);
    }
  }

  // --- Liquidation Haul (1-for-many) ---
  let liquidations = [];
  if (showLiquidation) {
    const liqFilter =
      typeof config.liquidationFilter === "function"
        ? config.liquidationFilter
        : defaultLiquidationFilter;
    const liqPool = myPlayers
      .filter((p) => !usedPlayerIds.has(p.id) && liqFilter(p))
      .sort((a, b) => fcVal(b) - fcVal(a));

    liquidations = findLiquidation(
      liqPool,
      partners,
      leagueContext,
      usedPlayerIds,
      usedTargetIds,
      config.partnerPhase,
      pickOverrides,
    );
  }

  // Format output moves
  const moves = [];

  for (const c of consolidations.slice(0, 3)) {
    moves.push({
      mode: "consolidation",
      sendPlayers: c.sendPlayers,
      sendMarketComps: compsForPlayer(c.sendPlayers[0]),
      sendPicks: c.sendPicks,
      sendPickLabels: [],
      sendValue: c.sendValues.total,
      sendFcValue: c.sendValues.fc,
      receive: { player: c.target, picks: [] },
      receivePickLabels: [],
      receiveValue: c.targetValues.total,
      receiveFcValue: c.targetValues.fc,
      receivePlayerValue: c.targetValues.total,
      receivePickValue: 0,
      valueRatio: c.ratio,
      partnerTeam: c.partner.label,
      partnerPhase: c.partnerPhase,
      rationale: `Consolidate depth into quality: package ${c.sendPlayers.map((p) => p.name).join(" + ")} (combined FC $${c.sendValues.fc.toLocaleString()}) to ${c.partner.label} for ${c.target.name} (FC $${c.targetValues.fc.toLocaleString()}) — fewer roster spots, higher ceiling at ${c.target.position}.`,
    });
  }

  for (const l of liquidations.slice(0, 3)) {
    const pickLabels = l.chosenPicks
      .map((pk) => formatPick(pk.pick, l.partnerPhase))
      .filter(Boolean);
    const throwInNames = l.chosenThrowIns.map((p) => p.name);

    moves.push({
      mode: "liquidation",
      sendPlayers: [l.anchor],
      sendMarketComps: compsForPlayer(l.anchor),
      sendPicks: [],
      sendPickLabels: [],
      sendValue: l.anchorValue,
      sendFcValue: l.anchorFc,
      receive: {
        player: l.chosenThrowIns[0] || null,
        players: l.chosenThrowIns,
        picks: l.chosenPicks.map((pk) => pk.pick),
      },
      receivePickLabels: pickLabels,
      receiveValue: l.totalReceive,
      receiveFcValue: l.totalReceiveFc,
      receivePlayerValue: Math.round(
        l.chosenThrowIns.reduce((s, p) => s + valueOfPlayer(p), 0),
      ),
      receivePickValue: Math.round(
        l.chosenPicks.reduce((s, p) => s + p.value, 0),
      ),
      valueRatio: l.ratio,
      partnerTeam: l.partner.label,
      partnerPhase: l.partnerPhase,
      rationale: `Liquidation haul: ship ${l.anchor.name} (FC $${l.anchorFc.toLocaleString()}) to ${l.partner.label} for ${l.chosenPicks.length} pick${l.chosenPicks.length > 1 ? "s" : ""}${throwInNames.length > 0 ? ` + ${throwInNames.join(" + ")}` : ""} — max future asset extraction while the market still pays elite prices.`,
    });
  }

  return {
    title: config.title || "Haul Trades",
    subtitle:
      config.subtitle ||
      "Multi-asset dynasty moves — consolidate depth into stars, or liquidate stars into draft capital hauls.",
    moves,
    consolidationCount: consolidations.length,
    liquidationCount: liquidations.length,
    enabled: moves.length > 0,
  };
}
