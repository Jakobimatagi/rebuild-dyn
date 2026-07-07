// Fair-package builder — "I want that player / I want to move this player,
// what's a fair, blueprint-aware package?" Pure logic, no UI.
//
// Given an anchor asset on one side of a two-team trade, searches the other
// team's roster + picks for 1–3 asset combos that (a) land inside the fair
// band of the market math (evaluateTrade — same engine as the calculator, so
// suggestions and verdicts never disagree), (b) fit the receiving team's
// blueprint (alignPlayerToBlueprint), and (c) respect real lineup value
// (computeLineupRoles / NFL-backup rule: no dead-weight QBs as "value").
// Each package is labeled with its dynasty trade type (tradeTypes.js).

import { evaluateTrade, getAssetTradeValue } from "./tradeEngine.js";
import { classifyDraftBlueprint, DRAFT_BLUEPRINTS, alignPlayerToBlueprint } from "./draftBlueprints.js";
import { classifyTradeType } from "./tradeTypes.js";
import { computeLineupRoles, isNflBackupQb } from "./tradeBlueprintImpact.js";

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const FAIRNESS_SCORE = {
  Fair: 3,
  "Slight edge": 2,
  Uneven: 0.5,
  Lopsided: -2,
};

const GIVE_WILLINGNESS = { off: 2, fit: 0.5, core: -3 }; // seller's perspective
const RECEIVE_FIT = { core: 2, fit: 1, off: -2 };        // buyer's perspective

// Build the tradeable asset pool for a team: enriched players + rounds 1–3
// picks, each stamped with its trade value on the calculator's scale.
function assetPool(team, playerMarketMap, leagueContext, tradeMarket, rosterPhaseMap) {
  const players = (team.enriched || []).map((p) => ({ ...p, type: "player" }));
  const picks = (team.picks || [])
    .filter((p) => num(p.round, 9) <= 3)
    .map((p) => ({
      ...p,
      type: "pick",
      ownerPhase: p.isOwn
        ? (team.teamPhase?.phase ?? null)
        : (rosterPhaseMap?.get(String(p.originalRosterId)) ?? team.teamPhase?.phase ?? null),
    }));
  return [...players, ...picks]
    .map((a) => ({
      asset: a,
      tv: getAssetTradeValue(a, playerMarketMap, leagueContext, tradeMarket),
    }))
    .filter((c) => c.tv >= 2);
}

const assetKey = (a) => (a.type === "pick" ? `pick|${a.label}` : `player|${a.id}`);

// Annotate one candidate with blueprint fit for both sides and lineup value
// for the receiver — shared by the anchor architect and the balance finder.
function annotateCandidate(c, ctx) {
  const { payerBp, receiverBp, packageReceiver, receiverPhase, receiverRoles, playerMarketMap, leagueContext, tradeMarket } = ctx;
  const a = c.asset;
  let giveTag = "fit";
  let recvTag = null;
  let recvReason = null;
  let fillsNeed = false;
  let startsForReceiver = false;
  let nflBackup = false;
  let fitScore = 0;
  if (a.type === "player") {
    giveTag = payerBp ? alignPlayerToBlueprint(a, payerBp).tag : "fit";
    const recv = receiverBp ? alignPlayerToBlueprint(a, receiverBp) : { tag: "fit", reason: null };
    recvTag = recv.tag;
    recvReason = recv.reason;
    nflBackup = isNflBackupQb(a);
    // An NFL backup fills no lineup need — same rule as the impact panel.
    fillsNeed = !nflBackup && (packageReceiver.needs || []).includes(a.position);
    // Would this piece start for the receiver? Compare against their
    // current lineup: better trade value than a same-position starter's.
    const posStarters = (packageReceiver.enriched || []).filter(
      (p) => p.position === a.position && receiverRoles.get(String(p.id))?.starter,
    );
    const weakestStarterTv = posStarters.length
      ? Math.min(...posStarters.map((p) => getAssetTradeValue({ ...p, type: "player" }, playerMarketMap, leagueContext, tradeMarket)))
      : 0;
    startsForReceiver = !nflBackup && (posStarters.length === 0 || c.tv > weakestStarterTv);
    fitScore =
      num(GIVE_WILLINGNESS[giveTag]) +
      num(RECEIVE_FIT[recvTag]) +
      (fillsNeed ? 1 : 0) +
      (startsForReceiver ? 1 : 0) +
      (nflBackup && receiverPhase !== "rebuild" ? -2 : 0);
  } else {
    // Picks: liquidity — rebuilders prize them, contenders shrug.
    fitScore = receiverPhase === "rebuild" ? 1.5 : receiverPhase === "retool" ? 0.5 : -0.5;
  }
  return { ...c, giveTag, recvTag, recvReason, fillsNeed, startsForReceiver, nflBackup, fitScore };
}

// Blueprint/lineup context for pieces flowing payer → receiver.
function fitContext(payer, packageReceiver, leagueContext, playerMarketMap, tradeMarket) {
  const payerTop = classifyDraftBlueprint(payer, leagueContext)?.top;
  const receiverTop = classifyDraftBlueprint(packageReceiver, leagueContext)?.top;
  return {
    payerBp: payerTop ? DRAFT_BLUEPRINTS[payerTop.id] : null,
    receiverBp: receiverTop ? DRAFT_BLUEPRINTS[receiverTop.id] : null,
    packageReceiver,
    receiverPhase: packageReceiver.teamPhase?.phase || null,
    receiverRoles: computeLineupRoles(packageReceiver.enriched, leagueContext),
    playerMarketMap,
    leagueContext,
    tradeMarket,
  };
}

// All 1–3 piece combos whose raw value sum lands in [lo, hi], capped.
function enumerateCombos(candidates, lo, hi) {
  const combos = [];
  const n = candidates.length;
  for (let i = 0; i < n; i++) {
    const a = candidates[i];
    if (a.tv >= lo && a.tv <= hi) combos.push([a]);
    if (a.tv >= hi) continue;
    for (let j = i + 1; j < n; j++) {
      const b = candidates[j];
      const s2 = a.tv + b.tv;
      if (s2 >= lo && s2 <= hi) combos.push([a, b]);
      if (s2 >= hi) continue;
      for (let k = j + 1; k < n; k++) {
        const c = candidates[k];
        const s3 = s2 + c.tv;
        if (s3 >= lo && s3 <= hi) combos.push([a, b, c]);
        if (combos.length > 600) break;
      }
      if (combos.length > 600) break;
    }
    if (combos.length > 600) break;
  }
  return combos;
}

/**
 * Build fair, blueprint-aware trade packages around an anchor asset.
 *
 * @param {object} args
 * @param {"acquire"|"ship"} args.direction  acquire: anchor is on partnerTeam's
 *   roster and MY side pays; ship: anchor is mine and the PARTNER pays.
 * @param {object} args.anchor      asset object ({type:"player"|"pick", ...})
 * @param {object} args.myTeam      league-team snapshot (enriched, picks, teamPhase)
 * @param {object} args.partnerTeam league-team snapshot
 * @param {object} args.leagueContext
 * @param {object} [args.tradeMarket]
 * @param {Map}    args.playerMarketMap
 * @param {Map}    [args.rosterPhaseMap]  rosterId -> phase (for acquired picks)
 * @param {number} [args.limit=5]
 * @returns {Array<{
 *   give: Array, get: Array,           // from the PAYING team's perspective
 *   payer: string, receiver: string,   // team labels
 *   verdict: object,                   // evaluateTrade output
 *   fairness: string, myNet: number, partnerNet: number,
 *   tradeType: {id,label,detail,meta}, // classified from MY perspective
 *   pieces: Array<{asset, tv, giveTag, recvTag, recvReason, fillsNeed, startsForReceiver, nflBackup}>,
 *   score: number,
 * }>}
 */
export function buildFairPackages({
  direction = "acquire",
  anchor,
  myTeam,
  partnerTeam,
  leagueContext,
  tradeMarket = null,
  playerMarketMap,
  rosterPhaseMap = null,
  limit = 5,
}) {
  if (!anchor || !myTeam?.enriched || !partnerTeam?.enriched) return [];

  const payer = direction === "acquire" ? myTeam : partnerTeam;         // sends the package
  const packageReceiver = direction === "acquire" ? partnerTeam : myTeam; // gets the package
  const anchorReceiver = direction === "acquire" ? myTeam : partnerTeam;  // gets the anchor

  const anchorValue = getAssetTradeValue(anchor, playerMarketMap, leagueContext, tradeMarket);
  if (!anchorValue) return [];

  const ctx = fitContext(payer, packageReceiver, leagueContext, playerMarketMap, tradeMarket);

  // Candidate pool from the paying team, annotated once.
  const anchorK = assetKey(anchor);
  const candidates = assetPool(payer, playerMarketMap, leagueContext, tradeMarket, rosterPhaseMap)
    .filter((c) => assetKey(c.asset) !== anchorK && c.tv <= anchorValue * 1.15)
    .map((c) => annotateCandidate(c, ctx))
    .sort((a, b) => b.tv - a.tv)
    .slice(0, 28);

  // Enumerate 1–3 piece combos whose raw sum lands near the anchor value.
  const combos = enumerateCombos(candidates, anchorValue * 0.72, anchorValue * 1.28);

  // Pre-rank by fit + proximity, then run the full trade engine on the best.
  const preRanked = combos
    .map((pieces) => {
      const sum = pieces.reduce((s, p) => s + p.tv, 0);
      const fit = pieces.reduce((s, p) => s + p.fitScore, 0);
      const proximity = 1 - Math.abs(sum - anchorValue) / anchorValue;
      return { pieces, pre: fit + proximity * 3 - (pieces.length - 1) * 0.4 };
    })
    .sort((a, b) => b.pre - a.pre)
    .slice(0, 40);

  const packages = preRanked.map(({ pieces }) => {
    const give = pieces.map((p) => p.asset);
    // sideA = package (payer sends), sideB = anchor.
    const verdict = evaluateTrade(
      give,
      [anchor],
      payer.teamPhase?.phase || null,
      anchorReceiver.teamPhase?.phase || null,
      playerMarketMap,
      leagueContext,
      tradeMarket,
    );
    const fairness = verdict.fairnessLabel;
    // Nets from MY side of the table.
    const myNet = direction === "acquire" ? verdict.teamA.netValue : verdict.teamB.netValue;
    const partnerNet = direction === "acquire" ? verdict.teamB.netValue : verdict.teamA.netValue;
    // Classified from MY perspective: what does this deal do for me?
    const tradeType = classifyTradeType({
      outgoing: direction === "acquire" ? give : [anchor],
      incoming: direction === "acquire" ? [anchor] : give,
      team: myTeam,
    });
    const score =
      num(FAIRNESS_SCORE[fairness], 0) * 2 +
      pieces.reduce((s, p) => s + p.fitScore, 0) -
      Math.abs(myNet) * 0.05 -
      (pieces.length - 1) * 0.4;
    return {
      give,
      get: [anchor],
      payer: payer.label,
      receiver: packageReceiver.label,
      verdict,
      fairness,
      myNet,
      partnerNet,
      tradeType,
      pieces,
      score,
    };
  });

  return packages
    .filter((p) => p.fairness === "Fair" || p.fairness === "Slight edge" || p.fairness === "Uneven")
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Given a trade already on the table, find 1–3 asset add-ons from the side
 * that's winning the value exchange to bring the WHOLE trade into the fair
 * band. Every returned package is validated by re-running evaluateTrade on
 * the full trade (so consolidation discounts and phase bonuses are priced
 * in), and pieces are ranked by blueprint fit for the team receiving them.
 *
 * @returns {null | {
 *   alreadyFair: boolean,
 *   gap: number,                 // pre-balance value gap (trade pts)
 *   addTo: "A"|"B",              // which side must add
 *   adderLabel: string, receiverLabel: string,
 *   packages: Array<{ assets, pieces, fairness, netA, netB, score }>,
 * }}
 */
export function suggestBalancePackages({
  sideA,
  sideB,
  teamA,
  teamB,
  leagueContext,
  tradeMarket = null,
  playerMarketMap,
  rosterPhaseMap = null,
  limit = 4,
}) {
  if (!teamA?.enriched || !teamB?.enriched || !sideA?.length || !sideB?.length) return null;
  const sum = (side) =>
    side.reduce((s, a) => s + getAssetTradeValue(a, playerMarketMap, leagueContext, tradeMarket), 0);
  const valueA = sum(sideA);
  const valueB = sum(sideB);
  const phaseA = teamA.teamPhase?.phase || null;
  const phaseB = teamB.teamPhase?.phase || null;

  const baseline = evaluateTrade(sideA, sideB, phaseA, phaseB, playerMarketMap, leagueContext, tradeMarket);
  const gap = Math.abs(valueB - valueA);
  if (baseline.fairnessLabel === "Fair") {
    return { alreadyFair: true, gap: Math.round(gap), addTo: null, adderLabel: null, receiverLabel: null, packages: [] };
  }

  // The side RECEIVING more value owes the balance.
  const adderIsA = valueB > valueA;
  const adder = adderIsA ? teamA : teamB;
  const receiver = adderIsA ? teamB : teamA;

  const inTrade = new Set([...sideA, ...sideB].map(assetKey));
  const ctx = fitContext(adder, receiver, leagueContext, playerMarketMap, tradeMarket);
  const candidates = assetPool(adder, playerMarketMap, leagueContext, tradeMarket, rosterPhaseMap)
    .filter((c) => !inTrade.has(assetKey(c.asset)) && c.tv <= gap * 1.35)
    .map((c) => annotateCandidate(c, ctx))
    .sort((a, b) => b.tv - a.tv)
    .slice(0, 26);

  const combos = enumerateCombos(candidates, gap * 0.55, gap * 1.35);

  // Pre-rank by fit + proximity to the gap, then validate the FULL trade.
  const preRanked = combos
    .map((pieces) => {
      const total = pieces.reduce((s, p) => s + p.tv, 0);
      const fit = pieces.reduce((s, p) => s + p.fitScore, 0);
      const proximity = 1 - Math.abs(total - gap) / Math.max(gap, 1);
      return { pieces, pre: fit + proximity * 3 - (pieces.length - 1) * 0.4 };
    })
    .sort((a, b) => b.pre - a.pre)
    .slice(0, 40);

  const packages = preRanked
    .map(({ pieces }) => {
      const adds = pieces.map((p) => p.asset);
      const newA = adderIsA ? [...sideA, ...adds] : sideA;
      const newB = adderIsA ? sideB : [...sideB, ...adds];
      const verdict = evaluateTrade(newA, newB, phaseA, phaseB, playerMarketMap, leagueContext, tradeMarket);
      const score =
        num(FAIRNESS_SCORE[verdict.fairnessLabel], 0) * 2 +
        pieces.reduce((s, p) => s + p.fitScore, 0) -
        (Math.abs(verdict.teamA.netValue) + Math.abs(verdict.teamB.netValue)) * 0.03 -
        (pieces.length - 1) * 0.4;
      return {
        assets: adds,
        pieces,
        fairness: verdict.fairnessLabel,
        netA: verdict.teamA.netValue,
        netB: verdict.teamB.netValue,
        score,
      };
    })
    .filter((p) => p.fairness === "Fair" || p.fairness === "Slight edge")
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    alreadyFair: false,
    gap: Math.round(gap),
    addTo: adderIsA ? "A" : "B",
    adderLabel: adder.label,
    receiverLabel: receiver.label,
    packages,
  };
}
