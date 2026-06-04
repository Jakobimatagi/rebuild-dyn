/**
 * tradeEngine.js
 * Trade market calibration, offer-package building, and suggestion ranking.
 */
import { POSITION_PRIORITY, IDEAL_PROPORTION } from "../constants";
import { estimatePickValue, pickFcValue } from "./marketValue";
import {
  classifyLeagueTeams,
  getRosterNeeds,
  getRosterSurplusPositions,
} from "./rosterBuilder";
import { assignPositionRanks } from "./playerGrading";

// ---------------------------------------------------------------------------
// Asset helpers
// ---------------------------------------------------------------------------

function createAssetLabel(asset) {
  if (asset.type === "pick") return asset.label;
  return `${asset.name} (${asset.position}, ${asset.score})`;
}

function isPremiumQuarterbackTarget(target, leagueContext, targetValue) {
  return (
    leagueContext.isSuperflex &&
    target.position === "QB" &&
    targetValue >= 88 &&
    (target.age <= 26 || target.draftRound === 1)
  );
}

function isMeaningfulAsset(asset, targetValue) {
  if (asset.type === "pick") {
    return asset.round <= 2;
  }
  return asset.value >= Math.max(58, Math.round(targetValue * 0.6));
}

function packageHasAnchorAsset(assets, targetValue, target, leagueContext) {
  return assets.some((asset) => {
    if (asset.type === "pick") {
      return (
        asset.round === 1 ||
        (asset.round === 2 &&
          isPremiumQuarterbackTarget(target, leagueContext, targetValue))
      );
    }
    if (asset.position === "QB") return asset.value >= 55;
    return asset.value >= Math.max(60, Math.round(targetValue * 0.62));
  });
}

function getTargetAssetClass(target, leagueContext, targetValue) {
  if (isPremiumQuarterbackTarget(target, leagueContext, targetValue)) {
    return "premium_qb";
  }
  if (target.position === "WR" && target.age <= 24 && targetValue >= 82) {
    return "young_premium_wr";
  }
  if (
    target.position === "TE" &&
    leagueContext.tePremium &&
    targetValue >= 78
  ) {
    return "premium_te";
  }
  if (targetValue >= 86) return "elite_asset";
  if (targetValue >= 72) return "core_asset";
  return "starter_asset";
}

function getPackageRules(target, leagueContext, targetValue) {
  const assetClass = getTargetAssetClass(target, leagueContext, targetValue);

  if (assetClass === "premium_qb") {
    return {
      assetClass,
      minMeaningfulAssets: 2,
      minPackageSize: 2,
      requireAnchorAsset: true,
      allowPickOnly: false,
      maxOverpay: 6,
      underpayTolerance: 0,
      minPlayerValue: Math.max(62, Math.round(targetValue * 0.7)),
      requireFirstOrEquivalent: true,
    };
  }

  if (assetClass === "young_premium_wr") {
    return {
      assetClass,
      minMeaningfulAssets: 2,
      minPackageSize: 2,
      requireAnchorAsset: true,
      allowPickOnly: false,
      maxOverpay: 8,
      underpayTolerance: 1,
      minPlayerValue: Math.max(58, Math.round(targetValue * 0.64)),
      requireFirstOrEquivalent: false,
    };
  }

  if (assetClass === "premium_te") {
    return {
      assetClass,
      minMeaningfulAssets: 2,
      minPackageSize: 2,
      requireAnchorAsset: true,
      allowPickOnly: false,
      maxOverpay: 8,
      underpayTolerance: 2,
      minPlayerValue: Math.max(56, Math.round(targetValue * 0.62)),
      requireFirstOrEquivalent: false,
    };
  }

  if (assetClass === "elite_asset") {
    return {
      assetClass,
      minMeaningfulAssets: 2,
      minPackageSize: 2,
      requireAnchorAsset: true,
      allowPickOnly: false,
      maxOverpay: 10,
      underpayTolerance: 2,
      minPlayerValue: Math.max(54, Math.round(targetValue * 0.58)),
      requireFirstOrEquivalent: false,
    };
  }

  if (assetClass === "core_asset") {
    return {
      assetClass,
      minMeaningfulAssets: 1,
      minPackageSize: 1,
      requireAnchorAsset: false,
      allowPickOnly: false,
      maxOverpay: 10,
      underpayTolerance: 2,
      minPlayerValue: 50,
      requireFirstOrEquivalent: false,
    };
  }

  return {
    assetClass,
    minMeaningfulAssets: 1,
    minPackageSize: 1,
    requireAnchorAsset: false,
    allowPickOnly: true,
    maxOverpay: 8,
    underpayTolerance: 3,
    minPlayerValue: 0,
    requireFirstOrEquivalent: false,
  };
}

function packageHasFirstOrEquivalent(assets, targetValue) {
  return assets.some((asset) => {
    if (asset.type === "pick") return asset.round === 1;
    return asset.value >= Math.max(70, Math.round(targetValue * 0.76));
  });
}

function isCleanTradeShape(sent, received) {
  const totalAssets = sent.length + received.length;
  if (!sent.length || !received.length) return false;
  if (sent.length > 3 || received.length > 3) return false;
  if (totalAssets > 4) return false;
  return true;
}

function isCleanPlayerComp(received, sent) {
  const receivedPlayers = received.filter((asset) => asset.type === "player");
  const sentPlayers = sent.filter((asset) => asset.type === "player");
  return (
    isCleanTradeShape(sent, received) &&
    receivedPlayers.length === 1 &&
    received.length <= 2 &&
    sentPlayers.length <= 1
  );
}

function getSuggestionTier(targetValue, marketGap, rules) {
  const gap = Math.abs(marketGap);
  if (
    rules.assetClass === "premium_qb" ||
    rules.assetClass === "young_premium_wr"
  ) {
    return gap <= 3 ? "blockbuster" : "aggressive";
  }
  if (targetValue >= 80) return gap <= 4 ? "aggressive" : "blockbuster";
  if (targetValue >= 68) return gap <= 5 ? "balanced" : "aggressive";
  return "balanced";
}

// Scale factor: dynastyMarketValue and pickFcValue are FC dollar scale (~100–9000).
// Dividing by 100 maps them onto a display range of 1–90 that roughly matches
// what other dynasty calculators show and preserves real market spreads.
// Score-based marketValue (0-100 scale) is used as a fallback only when FC
// data is unavailable — it intentionally stays on the same numeric range.
const FC_SCALE = 100;

export function getAssetTradeValue(
  asset,
  playerMarketMap,
  leagueContext,
  tradeMarket,
) {
  if (asset.type === "pick") {
    // pickFcValue returns FC dollar scale; divide to normalize.
    const fcVal = pickFcValue(asset, asset.ownerPhase ?? null, leagueContext, null);
    const marketMultiplier = tradeMarket?.pickRoundMultipliers?.[asset.round] || 1;
    return Math.max(1, Math.round((fcVal / FC_SCALE) * marketMultiplier));
  }

  const player = playerMarketMap.get(String(asset.id)) || asset;
  const multiplier = tradeMarket?.positionMultipliers?.[player.position] || 1;

  // Prefer dynastyMarketValue (FC dollar blend) — it preserves the real spread
  // between elite and good players that the normalized 0-100 score compresses.
  const dmv = Number(player.dynastyMarketValue || 0);
  if (dmv > 0) {
    return Math.max(1, Math.round((dmv / FC_SCALE) * multiplier));
  }

  // Fallback: no FC/RA coverage means the player is off the dynasty radar
  // (deep bench, aged-out vet). The 0-100 score lives on a different, far more
  // compressed scale than dmv/FC_SCALE, so using it directly massively
  // over-values market-abandoned players. Map it onto the trade scale with a
  // low ceiling instead — an off-market player tops out near roster-filler.
  const score = Number(player.score || player.marketValue || 0);
  return Math.max(1, Math.round((score / 100) * 15 * multiplier));
}

function pushRosterAsset(map, rosterId, asset) {
  if (rosterId == null) return;
  const key = String(rosterId);
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(asset);
}

// ---------------------------------------------------------------------------
// Trade market calibration (from transaction history)
// ---------------------------------------------------------------------------

export function buildTradeMarket(transactions, leagueTeams, leagueContext) {
  const playerMarketMap = new Map(
    leagueTeams.flatMap((team) =>
      team.enriched.map((player) => [String(player.id), player]),
    ),
  );
  const positionSamples = { QB: [], RB: [], WR: [], TE: [] };
  const pickSamples = { 1: [], 2: [], 3: [], 4: [] };
  const recentTrades = [];
  let cleanTradeCount = 0;

  transactions.filter((t) => t.type === "trade").forEach((transaction) => {
    const sentByRoster = new Map();
    const receivedByRoster = new Map();

    Object.entries(transaction.adds || {}).forEach(([playerId, toRoster]) => {
      const fromRoster = transaction.drops?.[playerId];
      const player = playerMarketMap.get(String(playerId));
      if (!player || fromRoster == null) return;

      const asset = { ...player, type: "player", label: player.name };
      pushRosterAsset(sentByRoster, fromRoster, asset);
      pushRosterAsset(receivedByRoster, toRoster, asset);
    });

    (transaction.draft_picks || []).forEach((pick) => {
      const asset = {
        type: "pick",
        season: String(pick.season),
        round: pick.round,
        isOwn: false,
        label: `${pick.season} ${pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `${pick.round}th`}`,
      };
      pushRosterAsset(sentByRoster, pick.previous_owner_id, asset);
      pushRosterAsset(receivedByRoster, pick.owner_id, asset);
    });

    Array.from(receivedByRoster.keys()).forEach((rosterId) => {
      const received = receivedByRoster.get(rosterId) || [];
      const sent = sentByRoster.get(rosterId) || [];
      if (!received.length || !sent.length) return;

      const receivedValue = received.reduce(
        (sum, asset) =>
          sum + getAssetTradeValue(asset, playerMarketMap, leagueContext, null),
        0,
      );
      const sentValue = sent.reduce(
        (sum, asset) =>
          sum + getAssetTradeValue(asset, playerMarketMap, leagueContext, null),
        0,
      );
      if (!receivedValue || !sentValue) return;

      if (!isCleanTradeShape(sent, received)) return;

      cleanTradeCount += 1;

      const ratio = Math.max(0.82, Math.min(1.3, sentValue / receivedValue));

      received.forEach((asset) => {
        if (asset.type === "player" && positionSamples[asset.position]) {
          positionSamples[asset.position].push(ratio);
          if (recentTrades.length < 12 && isCleanPlayerComp(received, sent)) {
            recentTrades.push({
              position: asset.position,
              target: asset.name,
              cost: sent.map(createAssetLabel).join(" + "),
              shape: `${sent.length}-for-${received.length}`,
            });
          }
        }

        if (asset.type === "pick" && pickSamples[asset.round]) {
          pickSamples[asset.round].push(ratio);
        }
      });
    });
  });

  const avg = (values, fallback = 1) =>
    values.length
      ? Number(
          (
            values.reduce((sum, value) => sum + value, 0) / values.length
          ).toFixed(2),
        )
      : fallback;

  return {
    positionMultipliers: {
      QB: avg(positionSamples.QB, 1),
      RB: avg(positionSamples.RB, 1),
      WR: avg(positionSamples.WR, 1),
      TE: avg(positionSamples.TE, 1),
    },
    pickRoundMultipliers: {
      1: avg(pickSamples[1], 1),
      2: avg(pickSamples[2], 1),
      3: avg(pickSamples[3], 1),
      4: avg(pickSamples[4], 1),
    },
    sampleCount: cleanTradeCount,
    recentTrades,
  };
}

// ---------------------------------------------------------------------------
// Offer package builder
// ---------------------------------------------------------------------------

function buildOfferPackage(
  target,
  myTeam,
  partner,
  playerMarketMap,
  leagueContext,
  tradeMarket,
) {
  const partnerNeeds = new Set(partner.needs);
  const currentYear = new Date().getFullYear();
  const targetValue = getAssetTradeValue(
    { ...target, type: "player" },
    playerMarketMap,
    leagueContext,
    tradeMarket,
  );
  const premiumQuarterback = isPremiumQuarterbackTarget(
    target,
    leagueContext,
    targetValue,
  );
  const rules = getPackageRules(target, leagueContext, targetValue);
  const myPhase = myTeam.teamPhase?.phase ?? null;
  const pickAssets = myTeam.picks
    .filter((pick) => {
      const season = Number(pick.season);
      if (season > currentYear + 1) return false;
      if (premiumQuarterback && pick.round > 2) return false;
      return pick.round <= 3;
    })
    .map((pick) => ({
      ...pick,
      type: "pick",
      ownerPhase: myPhase,
      value: estimatePickValue(pick, leagueContext, tradeMarket, myPhase),
    }))
    .sort((a, b) => b.value - a.value);

  const playerAssets = myTeam.tradeablePlayers
    .map((player) => ({
      ...player,
      type: "player",
      value: getAssetTradeValue(
        { ...player, type: "player" },
        playerMarketMap,
        leagueContext,
        tradeMarket,
      ),
      fitBoost: partnerNeeds.has(player.position) ? 10 : 0,
    }))
    .sort((a, b) => b.fitBoost + b.value - (a.fitBoost + a.value));

  for (const player of playerAssets) {
    if (
      premiumQuarterback &&
      player.position !== "QB" &&
      player.value < rules.minPlayerValue
    ) {
      continue;
    }

    if (player.type === "player" && player.value < rules.minPlayerValue) {
      continue;
    }

    let packageAssets = [player];
    let totalValue = player.value;

    if (totalValue < targetValue - rules.underpayTolerance) {
      for (const pick of pickAssets) {
        if (
          packageAssets.some(
            (asset) =>
              asset.type === "pick" &&
              asset.round === pick.round &&
              asset.season === pick.season,
          )
        ) {
          continue;
        }
        packageAssets.push(pick);
        totalValue += pick.value;
        if (totalValue >= targetValue - rules.underpayTolerance) break;
      }
    }

    const meaningfulAssets = packageAssets.filter((asset) =>
      isMeaningfulAsset(asset, targetValue),
    ).length;
    const hasAnchorAsset = packageHasAnchorAsset(
      packageAssets,
      targetValue,
      target,
      leagueContext,
    );
    const hasFirstEquivalent = packageHasFirstOrEquivalent(
      packageAssets,
      targetValue,
    );

    if (
      totalValue >= targetValue - rules.underpayTolerance &&
      totalValue <= targetValue + rules.maxOverpay &&
      (partnerNeeds.has(player.position) || packageAssets.length > 1) &&
      packageAssets.length >= rules.minPackageSize &&
      meaningfulAssets >= rules.minMeaningfulAssets &&
      (!rules.requireAnchorAsset || hasAnchorAsset) &&
      (!rules.requireFirstOrEquivalent || hasFirstEquivalent)
    ) {
      return {
        assets: packageAssets,
        outgoingValue: totalValue,
        targetValue,
        rules,
      };
    }
  }

  if (targetValue <= 68 && !premiumQuarterback && rules.allowPickOnly) {
    let packageAssets = [];
    let totalValue = 0;
    for (const pick of pickAssets) {
      packageAssets.push(pick);
      totalValue += pick.value;
      if (totalValue >= targetValue - 3) break;
    }
    if (
      packageAssets.length &&
      totalValue >= targetValue - rules.underpayTolerance &&
      totalValue <= targetValue + rules.maxOverpay
    ) {
      return {
        assets: packageAssets,
        outgoingValue: totalValue,
        targetValue,
        rules,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Trade calculator — evaluate any proposed trade
// ---------------------------------------------------------------------------

function phaseAdjustment(assets, phase) {
  let adj = 0;
  for (const asset of assets) {
    if (asset.type === "pick") {
      adj += phase === "rebuild" ? 8 : phase === "retool" ? 3 : -3;
    } else {
      if (
        asset.archetype === "Short Term League Winner" ||
        asset.archetype === "Productive Vet"
      ) {
        adj += phase === "contender" ? 6 : phase === "rebuild" ? -5 : 0;
      }
      if (asset.age <= 23) {
        adj += phase === "rebuild" ? 5 : phase === "contender" ? -2 : 2;
      }
      if (
        asset.archetype === "Cornerstone" ||
        asset.archetype === "Foundational"
      ) {
        adj += phase === "rebuild" ? 4 : 0;
      }
    }
  }
  return adj;
}

// ---------------------------------------------------------------------------
// Positional shift detection — for a single team's perspective (outgoing → incoming),
// classify what's happening at each position: upgrade, downgrade, buy, sell, lateral.
// ---------------------------------------------------------------------------

function detectPositionalShifts(sent, received, leagueContext) {
  const sentPlayers = sent.filter((a) => a.type === "player");
  const recvPlayers = received.filter((a) => a.type === "player");

  const groupByPos = (players) =>
    players.reduce((acc, p) => {
      if (!acc[p.position]) acc[p.position] = [];
      acc[p.position].push(p);
      return acc;
    }, {});

  const sentByPos = groupByPos(sentPlayers);
  const recvByPos = groupByPos(recvPlayers);
  const allPos = new Set([...Object.keys(sentByPos), ...Object.keys(recvByPos)]);

  const isPremiumPos = (pos) =>
    (pos === "QB" && leagueContext?.isSuperflex) ||
    (pos === "TE" && leagueContext?.tePremium) ||
    pos === "WR";

  const shifts = [];

  for (const pos of allPos) {
    const bestSent = sentByPos[pos]
      ? Math.max(...sentByPos[pos].map((p) => p.score || 0))
      : 0;
    const bestRecv = recvByPos[pos]
      ? Math.max(...recvByPos[pos].map((p) => p.score || 0))
      : 0;
    const premium = isPremiumPos(pos);
    // Premium positions use a tighter threshold so near-tier-ups register as upgrades.
    const threshold = premium ? 5 : 8;

    if (!recvByPos[pos]) {
      shifts.push({ position: pos, direction: "sell", sentScore: bestSent, recvScore: 0, premium });
    } else if (!sentByPos[pos]) {
      shifts.push({ position: pos, direction: "buy", sentScore: 0, recvScore: bestRecv, premium });
    } else if (bestRecv >= bestSent + threshold) {
      shifts.push({ position: pos, direction: "upgrade", sentScore: bestSent, recvScore: bestRecv, premium });
    } else if (bestRecv <= bestSent - threshold) {
      shifts.push({ position: pos, direction: "downgrade", sentScore: bestSent, recvScore: bestRecv, premium });
    } else {
      // Still record the swap for premium positions — a QB-for-QB swap matters even if lateral.
      shifts.push({ position: pos, direction: "lateral", sentScore: bestSent, recvScore: bestRecv, premium });
    }
  }

  return shifts;
}

// For each detected upgrade at a premium position, boost the received side's
// effective value — the market pays extra to move up a tier at scarce spots.
function upgradePremiumMultiplier(shifts, leagueContext) {
  let mult = 1;
  for (const s of shifts) {
    if (s.direction !== "upgrade") continue;
    if (s.position === "QB" && leagueContext?.isSuperflex) mult += 0.18;
    else if (s.position === "TE" && leagueContext?.tePremium) mult += 0.10;
    else if (s.position === "WR") mult += 0.08;
    else mult += 0.05;
  }
  return Math.min(mult, 1.30); // cap at 30% total boost
}

export function evaluateTrade(
  sideA,
  sideB,
  teamAPhase,
  teamBPhase,
  playerMarketMap,
  leagueContext,
  tradeMarket,
) {
  const valueA = sideA.reduce(
    (sum, asset) =>
      sum + getAssetTradeValue(asset, playerMarketMap, leagueContext, tradeMarket),
    0,
  );
  const valueB = sideB.reduce(
    (sum, asset) =>
      sum + getAssetTradeValue(asset, playerMarketMap, leagueContext, tradeMarket),
    0,
  );

  const teamAPhaseAdj = phaseAdjustment(sideB, teamAPhase);
  const teamBPhaseAdj = phaseAdjustment(sideA, teamBPhase);

  // Team A sends sideA, receives sideB
  const teamANet = valueB + teamAPhaseAdj - valueA;
  // Team B sends sideB, receives sideA
  const teamBNet = valueA + teamBPhaseAdj - valueB;

  // Detect positional shifts for each team's perspective
  // Team A: sends sideA, receives sideB
  const shiftsA = detectPositionalShifts(sideA, sideB, leagueContext);
  // Team B: sends sideB, receives sideA
  const shiftsB = detectPositionalShifts(sideB, sideA, leagueContext);

  // Consolidation discount: packaging multiple pieces always costs a premium in the
  // real dynasty market — the sum-of-parts overstates what that package actually fetches.
  const surplus = Math.abs(sideA.length - sideB.length);
  const consolidationDiscount = surplus >= 3 ? 0.80 : surplus >= 2 ? 0.85 : surplus >= 1 ? 0.94 : 1;

  let effectiveA = valueA;
  let effectiveB = valueB;
  if (sideA.length > sideB.length) {
    effectiveA = Math.round(valueA * consolidationDiscount);
  } else if (sideB.length > sideA.length) {
    effectiveB = Math.round(valueB * consolidationDiscount);
  }

  // Positional upgrade premium: when a team is upgrading at a premium position
  // (QB in SF, TE in TE-premium, WR), boost the received side's effective value to
  // reflect what the market actually demands for a tier-up at that spot.
  const multA = upgradePremiumMultiplier(shiftsA, leagueContext);
  const multB = upgradePremiumMultiplier(shiftsB, leagueContext);
  if (multA > 1) effectiveB = Math.round(effectiveB * multA);
  if (multB > 1) effectiveA = Math.round(effectiveA * multB);

  // Percentage-based gap: a 20-point gap on a 300-point trade is minor, not "Lopsided".
  const rawGap = Math.abs(valueA - valueB);
  const adjustedGap = Math.abs(effectiveA - effectiveB);
  const maxEffective = Math.max(effectiveA, effectiveB, 1);
  const gapPct = adjustedGap / maxEffective;

  let fairnessLabel;
  if (gapPct <= 0.07) fairnessLabel = "Fair";
  else if (gapPct <= 0.20) fairnessLabel = "Slight edge";
  else if (gapPct <= 0.42) fairnessLabel = "Uneven";
  else fairnessLabel = "Lopsided";

  return {
    sideAValue: valueA,
    sideBValue: valueB,
    rawGap,
    adjustedGap,
    consolidationDiscount: consolidationDiscount < 1 ? consolidationDiscount : null,
    shiftsA,
    shiftsB,
    fairnessLabel,
    teamA: {
      netValue: teamANet,
      phaseAdj: teamAPhaseAdj,
      verdict: teamANet >= -3 ? "good" : "overpay",
    },
    teamB: {
      netValue: teamBNet,
      phaseAdj: teamBPhaseAdj,
      verdict: teamBNet >= -3 ? "good" : "overpay",
    },
  };
}

// ---------------------------------------------------------------------------
// Three-way trade evaluation — each leg sends a set of assets, and every asset
// is routed to one of the other two legs (asset.to = destination leg id).
// Computes per-team value in/out, a phase-adjusted net, positional shifts, and
// an overall fairness label from the spread of the three teams' raw nets.
// ---------------------------------------------------------------------------

export function evaluateThreeWayTrade(
  legs,
  playerMarketMap,
  leagueContext,
  tradeMarket,
) {
  const received = new Map(legs.map((l) => [l.id, []]));
  for (const leg of legs) {
    for (const asset of leg.sends || []) {
      if (received.has(asset.to)) {
        received.get(asset.to).push({ ...asset, from: leg.id });
      }
    }
  }

  const assetVal = (a) =>
    getAssetTradeValue(a, playerMarketMap, leagueContext, tradeMarket);

  const teams = legs.map((leg) => {
    const sent = leg.sends || [];
    const recv = received.get(leg.id) || [];
    const valueSent = sent.reduce((s, a) => s + assetVal(a), 0);
    const valueReceivedRaw = recv.reduce((s, a) => s + assetVal(a), 0);

    // Consolidation discount — a bundle of many pieces fetches less than the
    // sum of its parts, scaled by how many assets land in this team's lap.
    const n = recv.length;
    const discount = n >= 4 ? 0.85 : n === 3 ? 0.9 : n === 2 ? 0.96 : 1;
    const valueReceived = Math.round(valueReceivedRaw * discount);

    const phaseAdj = phaseAdjustment(recv, leg.phase);
    const rawNet = valueReceived - valueSent;
    const netValue = rawNet + phaseAdj;
    const shifts = detectPositionalShifts(sent, recv, leagueContext);

    return {
      id: leg.id,
      label: leg.label,
      phase: leg.phase,
      sent,
      received: recv,
      valueSent,
      valueReceived,
      valueReceivedRaw,
      consolidationDiscount: discount < 1 ? discount : null,
      phaseAdj,
      rawNet,
      netValue,
      verdict: netValue >= -3 ? "good" : "overpay",
      shifts,
    };
  });

  // Fairness from the spread of raw (pre-phase) nets — in a clean trade the
  // three nets sum to roughly zero, so a tight spread means everyone pays fair.
  const rawNets = teams.map((t) => t.rawNet);
  const spread = Math.max(...rawNets) - Math.min(...rawNets);
  const maxVolume = Math.max(
    ...teams.map((t) => Math.max(t.valueSent, t.valueReceived)),
    1,
  );
  const gapPct = spread / maxVolume;

  let fairnessLabel;
  if (gapPct <= 0.07) fairnessLabel = "Fair";
  else if (gapPct <= 0.2) fairnessLabel = "Slight edge";
  else if (gapPct <= 0.42) fairnessLabel = "Uneven";
  else fairnessLabel = "Lopsided";

  return { teams, spread, gapPct, fairnessLabel };
}

// ---------------------------------------------------------------------------
// Per-side rationale — explains *for each team* what's good (positives) and
// what should give them pause (concerns) about the proposed deal. The rules
// are intentionally phase-aware: "good" for a contender is "won't help" for a
// rebuilder, and vice versa. Uses PPG, archetype tags, position needs/surplus,
// and OC outlook so the bullets feel grounded in the data, not generic.
// ---------------------------------------------------------------------------

const PRODUCTIVE_VET_ARCHETYPES = new Set([
  "Productive Vet",
  "Short Term League Winner",
  "Cornerstone",
  "Foundational",
]);

export function buildTradeRationale({
  ownTeam,
  partnerTeam,
  outgoing,   // assets this team SENDS
  incoming,   // assets this team RECEIVES
  leagueContext, // eslint-disable-line no-unused-vars
}) {
  const positives = [];
  const concerns = [];

  if (!ownTeam) return { positives, concerns };

  const ownPhase = ownTeam.teamPhase?.phase || "retool";
  const ownNeeds = new Set(ownTeam.needs || []);
  const ownSurplus = new Set(ownTeam.surplusPositions || []);
  const partnerPhase = partnerTeam?.teamPhase?.phase || "retool";

  const incomingPlayers = (incoming || []).filter((a) => a.type === "player");
  const outgoingPlayers = (outgoing || []).filter((a) => a.type === "player");
  const incomingPicks = (incoming || []).filter((a) => a.type === "pick");
  const outgoingPicks = (outgoing || []).filter((a) => a.type === "pick");

  // ── Positives — incoming players ──────────────────────────────────────
  for (const p of incomingPlayers) {
    const ppg = parseFloat(p.ppg) || 0;
    const archetype = p.archetype || "—";

    if (ownNeeds.has(p.position)) {
      positives.push(
        `Fills your ${p.position} need: ${p.name} (${archetype}${ppg ? `, ${ppg.toFixed(1)} PPG` : ""}).`,
      );
    }

    if (archetype === "Cornerstone" || archetype === "Foundational") {
      positives.push(
        `Acquires a ${archetype} — ${p.name}, age ${p.age}. Long-term core piece.`,
      );
    } else if (
      ownPhase === "contender" &&
      PRODUCTIVE_VET_ARCHETYPES.has(archetype) &&
      ppg >= 11
    ) {
      positives.push(
        `Plug-and-play starter for the title push: ${p.name} averaged ${ppg.toFixed(1)} PPG.`,
      );
    } else if (ownPhase === "rebuild" && p.age <= 23) {
      positives.push(
        `Young upside for the rebuild: ${p.name} (age ${p.age}, ${archetype}).`,
      );
    } else if (
      ownPhase === "retool" &&
      (archetype === "Upside Shot" || archetype === "Mainstay" || archetype === "Foundational")
    ) {
      positives.push(
        `${p.name} (${archetype}) fits a retool window — productive without aging out.`,
      );
    }

    if (p.ocOutlook && Math.abs(p.ocOutlook.multiplierPct) >= 2.5 && p.ocOutlook.multiplierPct > 0) {
      positives.push(
        `${p.team} OC outlook bumps ${p.name}'s Year-1 environment +${p.ocOutlook.multiplierPct.toFixed(1)}%.`,
      );
    }
  }

  // ── Positives — incoming picks ────────────────────────────────────────
  if (incomingPicks.length) {
    const earlyCount = incomingPicks.filter((p) => p.round <= 2).length;
    if (ownPhase === "rebuild") {
      positives.push(
        earlyCount > 0
          ? `${earlyCount} early pick${earlyCount > 1 ? "s" : ""} accelerate the rebuild.`
          : `Picks add youth and flexibility to the rebuild.`,
      );
    } else if (ownPhase === "retool" && earlyCount > 0) {
      positives.push(`${earlyCount} early pick${earlyCount > 1 ? "s" : ""} keep the retool optionality alive.`);
    }
  }

  // ── Positives — outgoing assets (cashing in / shedding) ──────────────
  for (const p of outgoingPlayers) {
    const archetype = p.archetype || "—";
    if (ownPhase === "rebuild" && p.age >= 28) {
      positives.push(`Cashes in aging ${p.name} (age ${p.age}) before further decline.`);
    } else if (
      ownPhase === "rebuild" &&
      (archetype === "Productive Vet" || archetype === "Short Term League Winner")
    ) {
      positives.push(`Sells ${archetype} ${p.name} at peak value to a contender.`);
    } else if (ownSurplus.has(p.position) && archetype !== "Cornerstone") {
      positives.push(`${p.name} comes from your surplus at ${p.position}.`);
    }
  }

  // ── Concerns — outgoing assets ────────────────────────────────────────
  for (const p of outgoingPlayers) {
    const archetype = p.archetype || "—";
    const ppg = parseFloat(p.ppg) || 0;
    if (archetype === "Cornerstone") {
      concerns.push(`Dealing a Cornerstone (${p.name}) — long-term identity loss.`);
    } else if (
      ownPhase === "contender" &&
      ppg >= 12 &&
      !ownSurplus.has(p.position)
    ) {
      concerns.push(
        `${p.name} (${ppg.toFixed(1)} PPG) is part of your active lineup — needs a replacement plan.`,
      );
    } else if (
      ownPhase === "rebuild" &&
      p.age <= 23 &&
      (archetype === "Foundational" || archetype === "Upside Shot")
    ) {
      concerns.push(
        `Trading young upside (${p.name}, age ${p.age}) cuts against the rebuild.`,
      );
    }
  }

  // ── Concerns — incoming assets that don't fit phase ──────────────────
  for (const p of incomingPlayers) {
    const ppg = parseFloat(p.ppg) || 0;
    if (ownPhase === "rebuild" && p.age >= 29) {
      concerns.push(`Adding age-${p.age} ${p.name} doesn't fit the rebuild timeline.`);
    } else if (
      ownPhase === "contender" &&
      p.age <= 21 &&
      ppg < 6 &&
      p.archetype !== "Foundational"
    ) {
      concerns.push(`${p.name} is unproven — won't help this year's lineup.`);
    }
  }

  // ── Concerns — outgoing picks during a rebuild ───────────────────────
  if (outgoingPicks.length && ownPhase === "rebuild") {
    const earlyOut = outgoingPicks.filter((p) => p.round <= 2).length;
    if (earlyOut > 0) {
      concerns.push(
        `Trading ${earlyOut} early pick${earlyOut > 1 ? "s" : ""} during a rebuild is a high-cost route.`,
      );
    }
  }

  // Phase-mismatch nudge — buyer/seller alignment is the cleanest deals
  if (
    (ownPhase === "contender" && partnerPhase === "rebuild") ||
    (ownPhase === "rebuild" && partnerPhase === "contender")
  ) {
    positives.unshift(
      ownPhase === "contender"
        ? `Partner is rebuilding — they have the youth/picks you can't grow yourself.`
        : `Partner is contending — they'll pay a premium for the win-now help.`,
    );
  }

  // Dedupe + cap
  const dedupe = (arr) => Array.from(new Set(arr)).slice(0, 5);
  return {
    ownPhase,
    partnerPhase,
    positives: dedupe(positives),
    concerns: dedupe(concerns),
  };
}

// ---------------------------------------------------------------------------
// Suggested balancing asset — propose the cleanest single-asset add that
// closes the fairness gap. Considers partner's positional needs and prefers
// candidates that don't overshoot the gap by much. Returns up to 3 options.
// ---------------------------------------------------------------------------

export function suggestBalancingAsset({
  sideA,
  sideB,
  teamA,
  teamB,
  valueA,
  valueB,
  leagueContext,
  tradeMarket,
  playerMarketMap,
}) {
  if (!teamA || !teamB) return null;
  const gap = (valueB || 0) - (valueA || 0);
  if (Math.abs(gap) <= 3) return null; // already fair

  const adderIsA = gap > 0;
  const adder = adderIsA ? teamA : teamB;
  const partner = adderIsA ? teamB : teamA;
  const need = Math.abs(gap);

  const inTrade = new Set([
    ...(sideA || []).map((a) => (a.type === "pick" ? `pick:${a.label}` : `player:${a.id}`)),
    ...(sideB || []).map((a) => (a.type === "pick" ? `pick:${a.label}` : `player:${a.id}`)),
  ]);

  const partnerNeeds = new Set(partner.needs || []);

  const candidates = [];

  for (const p of adder.tradeablePlayers || []) {
    const key = `player:${p.id}`;
    if (inTrade.has(key)) continue;
    const value = getAssetTradeValue(
      { ...p, type: "player" },
      playerMarketMap,
      leagueContext,
      tradeMarket,
    );
    if (value <= 0) continue;
    candidates.push({
      type: "player",
      asset: { ...p, type: "player" },
      value,
      partnerFit: partnerNeeds.has(p.position),
      label: `${p.name} (${p.position}, ${p.score})`,
    });
  }

  const adderPhase = adder.teamPhase?.phase ?? null;
  for (const pick of adder.picks || []) {
    if (pick.round > 4) continue;
    const key = `pick:${pick.label}`;
    if (inTrade.has(key)) continue;
    const value = estimatePickValue(pick, leagueContext, tradeMarket, adderPhase);
    if (value <= 0) continue;
    candidates.push({
      type: "pick",
      asset: { ...pick, type: "pick", ownerPhase: adderPhase, value },
      value,
      partnerFit: false,
      label: pick.label,
    });
  }

  if (!candidates.length) return null;

  // Score: prefer assets that close the gap with minimum overshoot,
  // bonus for partner positional fit, mild penalty for big overshoots.
  for (const c of candidates) {
    const distance = Math.abs(c.value - need);
    let score = -distance + (c.partnerFit ? 6 : 0);
    if (c.value > need + 12) score -= (c.value - need - 12) * 0.5;
    if (c.value < need - 12) score -= (need - c.value - 12) * 0.3;
    c.score = score;
  }
  candidates.sort((a, b) => b.score - a.score);

  // Filter out candidates that wildly overshoot the gap — those would just
  // flip the trade in the other direction, not balance it.
  const usable = candidates.filter(
    (c) => c.value <= need + 18 && c.value >= need - 18,
  );

  const top = (usable.length ? usable : candidates).slice(0, 3);

  const newGap = (c) =>
    Math.abs((adderIsA ? valueA + c.value : valueA) - (adderIsA ? valueB : valueB + c.value));

  return {
    side: adderIsA ? "A" : "B",
    addingTeam: adder.label,
    receivingTeam: partner.label,
    gap: Math.round(gap),
    options: top.map((c) => ({
      type: c.type,
      label: c.label,
      value: Math.round(c.value),
      partnerFit: c.partnerFit,
      newAbsGap: Math.round(newGap(c)),
    })),
  };
}

// ---------------------------------------------------------------------------
// What-If trade simulation
// ---------------------------------------------------------------------------

function projectRosterAfterTrade(
  team,
  outgoingAssets,
  incomingAssets,
  leagueContext,
  playerMarketMap,
) {
  const outgoingPlayerIds = new Set(
    outgoingAssets.filter((a) => a.type === "player").map((a) => String(a.id)),
  );
  const outgoingPickKeys = new Set(
    outgoingAssets.filter((a) => a.type === "pick").map((a) => a.label),
  );

  // Build new enriched player list — drop outgoing, append full incoming objects.
  const newEnriched = team.enriched.filter(
    (p) => !outgoingPlayerIds.has(String(p.id)),
  );
  for (const asset of incomingAssets) {
    if (asset.type !== "player") continue;
    const full = playerMarketMap.get(String(asset.id)) || asset;
    newEnriched.push(full);
  }

  // Rebuild byPos sorted by score, mirroring buildRosterSnapshot.
  const newByPos = {};
  for (const pos of POSITION_PRIORITY) {
    newByPos[pos] = newEnriched
      .filter((p) => p.position === pos)
      .sort((a, b) => b.score - a.score);
  }

  // Proportions, needs, and surplus all derive from byPos + total score.
  const totalScore =
    newEnriched.reduce((sum, p) => sum + (p.score || 0), 0) || 1;
  const newProportions = {};
  for (const pos of POSITION_PRIORITY) {
    const posScore = newByPos[pos].reduce((sum, p) => sum + (p.score || 0), 0);
    const actual = posScore / totalScore;
    const ideal = IDEAL_PROPORTION[pos];
    newProportions[pos] = {
      actual: Math.round(actual * 100),
      ideal: Math.round(ideal * 100),
      delta: Math.round((actual - ideal) * 100),
    };
  }

  // Weak rooms: same heuristic as rosterBuilder.
  const newWeakRooms = POSITION_PRIORITY.filter((pos) => {
    const room = newByPos[pos];
    if (room.length < 2) return true;
    const buyCount = room.filter((p) => p.verdict === "buy").length;
    if (buyCount === 0) return true;
    const avg = room.reduce((s, p) => s + (p.score || 0), 0) / room.length;
    if (avg < 45) return true;
    if (buyCount <= 1 && avg < 58) return true;
    return false;
  });

  const newNeeds = getRosterNeeds(newByPos, newProportions);
  const newSurplus = getRosterSurplusPositions(
    newByPos,
    newProportions,
    leagueContext.isSuperflex,
  );

  // Picks: drop outgoing labels, append incoming.
  const newPicks = team.picks
    .filter((p) => !outgoingPickKeys.has(p.label))
    .slice();
  for (const asset of incomingAssets) {
    if (asset.type !== "pick") continue;
    newPicks.push({
      season: asset.season,
      round: asset.round,
      isOwn: false,
      label: asset.label,
    });
  }

  const avgScore = newEnriched.length
    ? Math.round(
        newEnriched.reduce((s, p) => s + (p.score || 0), 0) / newEnriched.length,
      )
    : 0;
  const avgAge = newEnriched.length
    ? (
        newEnriched.reduce((s, p) => s + (p.age || 0), 0) / newEnriched.length
      ).toFixed(1)
    : "N/A";

  // Return a *clone* with the new derived fields. Drop teamPhase + posRanks
  // so classifyLeagueTeams / assignPositionRanks recompute cleanly when called
  // against the simulated league.
  return {
    ...team,
    enriched: newEnriched,
    byPos: newByPos,
    proportions: newProportions,
    weakRooms: newWeakRooms,
    needs: newNeeds,
    surplusPositions: newSurplus,
    picks: newPicks,
    avgScore,
    avgAge,
    teamPhase: null,
    posRanks: undefined,
  };
}

function buildPosRanksDelta(beforePosRanks, afterPosRanks) {
  const out = {};
  for (const pos of POSITION_PRIORITY) {
    const b = beforePosRanks?.[pos];
    const a = afterPosRanks?.[pos];
    out[pos] = {
      before: b?.rank ?? null,
      after: a?.rank ?? null,
      // Positive delta = improvement (rank went DOWN, e.g. 8 → 3 = +5).
      delta:
        b?.rank != null && a?.rank != null ? b.rank - a.rank : null,
      beforeColor: b?.color ?? null,
      afterColor: a?.color ?? null,
      qualityBefore: b?.quality ?? null,
      qualityAfter: a?.quality ?? null,
    };
  }
  return out;
}

function diffNeedsSurplus(beforeArr, afterArr) {
  const before = new Set(beforeArr || []);
  const after = new Set(afterArr || []);
  const resolved = [...before].filter((p) => !after.has(p));
  const opened = [...after].filter((p) => !before.has(p));
  return { resolved, opened, before: [...before], after: [...after] };
}

/**
 * Simulate a proposed trade and return the post-trade phase + position-rank
 * deltas for both sides.
 *
 * sideA = assets going FROM team A to team B (outgoing for A, incoming for B).
 * sideB = assets going FROM team B to team A.
 *
 * The rest of the league is held fixed — non-participating teams contribute
 * their existing rosters to the simulated league for league-relative ranking.
 * We shallow-clone every team in the simulated league so classifyLeagueTeams
 * and assignPositionRanks (which mutate) don't corrupt the live state.
 */
export function simulateTrade(
  teamA,
  teamB,
  sideA,
  sideB,
  leagueTeams,
  leagueContext,
  playerMarketMap,
) {
  if (!teamA || !teamB) return null;
  if ((!sideA?.length && !sideB?.length)) return null;

  const projectedA = projectRosterAfterTrade(
    teamA,
    sideA,
    sideB,
    leagueContext,
    playerMarketMap,
  );
  const projectedB = projectRosterAfterTrade(
    teamB,
    sideB,
    sideA,
    leagueContext,
    playerMarketMap,
  );

  // Build the simulated league: every team gets a shallow clone so the
  // mutators below don't write into live objects.
  const simLeague = leagueTeams.map((t) => {
    if (t.rosterId === teamA.rosterId) return projectedA;
    if (t.rosterId === teamB.rosterId) return projectedB;
    return { ...t, teamPhase: null, posRanks: undefined };
  });

  classifyLeagueTeams(simLeague, leagueContext);
  assignPositionRanks(simLeague, leagueContext.isSuperflex);

  const simA = simLeague.find((t) => t.rosterId === teamA.rosterId);
  const simB = simLeague.find((t) => t.rosterId === teamB.rosterId);

  const buildSide = (before, after) => ({
    rosterId: before.rosterId,
    label: before.label,
    teamPhase: {
      before: before.teamPhase
        ? {
            phase: before.teamPhase.phase,
            score: before.teamPhase.score,
            starterPPG: before.teamPhase.starterPPG,
          }
        : null,
      after: after.teamPhase
        ? {
            phase: after.teamPhase.phase,
            score: after.teamPhase.score,
            starterPPG: after.teamPhase.starterPPG,
          }
        : null,
      scoreDelta:
        (after.teamPhase?.score ?? 0) - (before.teamPhase?.score ?? 0),
      starterPpgDelta:
        (after.teamPhase?.starterPPG ?? 0) -
        (before.teamPhase?.starterPPG ?? 0),
      phaseChanged:
        before.teamPhase?.phase !== after.teamPhase?.phase,
    },
    posRanks: buildPosRanksDelta(before.posRanks, after.posRanks),
    needs: diffNeedsSurplus(before.needs, after.needs),
    surplus: diffNeedsSurplus(before.surplusPositions, after.surplusPositions),
    weakRooms: diffNeedsSurplus(before.weakRooms, after.weakRooms),
    avgScore: {
      before: parseFloat(before.avgScore) || 0,
      after: parseFloat(after.avgScore) || 0,
      delta:
        (parseFloat(after.avgScore) || 0) -
        (parseFloat(before.avgScore) || 0),
    },
  });

  return {
    teamA: buildSide(teamA, simA),
    teamB: buildSide(teamB, simB),
  };
}

// ---------------------------------------------------------------------------
// Sell suggestions for rebuilders
// ---------------------------------------------------------------------------

function buildSellSuggestions(
  myTeam,
  leagueTeams,
  playerMarketMap,
  leagueContext,
  tradeMarket,
) {
  const suggestions = [];

  const sellCandidates = myTeam.enriched.filter(
    (p) =>
      (p.archetype === "Short Term League Winner" ||
        p.archetype === "Productive Vet" ||
        (p.age >= 28 && p.score >= 55)) &&
      p.archetype !== "Cornerstone",
  );

  const contenderPartners = leagueTeams.filter(
    (t) =>
      t.rosterId !== myTeam.rosterId &&
      t.teamPhase?.phase === "contender",
  );

  for (const candidate of sellCandidates.slice(0, 5)) {
    for (const partner of contenderPartners) {
      if (!partner.needs.includes(candidate.position)) continue;

      // Build a reverse offer: what the partner could send us
      const candidateValue = getAssetTradeValue(
        { ...candidate, type: "player" },
        playerMarketMap,
        leagueContext,
        tradeMarket,
      );

      // Look for young players or picks the partner could send
      const partnerAssets = [
        ...partner.tradeablePlayers
          .filter((p) => p.age <= 25 || p.archetype === "Upside Shot")
          .slice(0, 3)
          .map((p) => ({
            ...p,
            type: "player",
            value: getAssetTradeValue(
              { ...p, type: "player" },
              playerMarketMap,
              leagueContext,
              tradeMarket,
            ),
          })),
        ...partner.picks
          .filter((p) => p.round <= 2)
          .slice(0, 3)
          .map((p) => ({
            ...p,
            type: "pick",
            ownerPhase: partner.teamPhase?.phase ?? null,
            value: estimatePickValue(p, leagueContext, tradeMarket, partner.teamPhase?.phase ?? null),
          })),
      ].sort((a, b) => b.value - a.value);

      // Build a package from partner's assets that matches candidate value
      let packageAssets = [];
      let totalValue = 0;
      for (const asset of partnerAssets) {
        if (totalValue >= candidateValue - 3) break;
        packageAssets.push(asset);
        totalValue += asset.value;
      }

      if (
        packageAssets.length === 0 ||
        totalValue < candidateValue - 8 ||
        totalValue > candidateValue + 12
      )
        continue;

      const receiveText = packageAssets.map(createAssetLabel);
      const fitScore =
        candidateValue +
        (packageAssets.some((a) => a.type === "pick") ? 10 : 0) +
        (packageAssets.some((a) => a.age <= 24) ? 6 : 0) -
        Math.abs(totalValue - candidateValue);

      suggestions.push({
        partnerTeam: partner.label,
        needPos: candidate.position,
        targetPlayer: candidate,
        direction: "sell",
        tier: candidateValue >= 80 ? "blockbuster" : candidateValue >= 65 ? "aggressive" : "balanced",
        marketGap: totalValue - candidateValue,
        marketNote: `Selling ${candidate.position} to a contender who needs the position.`,
        recentComp: tradeMarket.recentTrades.find(
          (t) => t.position === candidate.position,
        ),
        receive: receiveText.map((label) => ({ type: "asset", label })),
        send: [createAssetLabel({ ...candidate, type: "player" })],
        fitScore,
        summary: `${partner.label} is contending and needs ${candidate.position} help. Sell ${candidate.name} for youth/picks to fuel your rebuild.`,
        rationale: [
          `${candidate.name} (${candidate.age}yo, ${candidate.archetype}) has peak value now but limited dynasty upside for a rebuilding team.`,
          `${partner.label} is a contender weak at ${candidate.position}.`,
          `Suggested return: ${receiveText.join(" + ")} (${totalValue} total market value).`,
          `Getting younger assets accelerates your rebuild timeline.`,
        ],
      });
      break; // one suggestion per candidate
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Trade suggestions
// ---------------------------------------------------------------------------

export function buildTradeSuggestions(
  myTeam,
  leagueTeams,
  leagueContext,
  tradeMarket,
) {
  const suggestions = [];
  const playerMarketMap = new Map(
    leagueTeams.flatMap((team) =>
      team.enriched.map((player) => [String(player.id), player]),
    ),
  );

  leagueTeams
    .filter((team) => team.rosterId !== myTeam.rosterId)
    .forEach((partner) => {
      myTeam.needs.slice(0, 3).forEach((needPos) => {
        if (partner.weakRooms.includes(needPos)) return;

        partner.targetablePlayers
          .filter((player) => player.position === needPos)
          .slice(0, 3)
          .forEach((target) => {
            const offer = buildOfferPackage(
              target,
              myTeam,
              partner,
              playerMarketMap,
              leagueContext,
              tradeMarket,
            );
            if (!offer) return;

            const partnerNeedText = partner.needs.length
              ? partner.needs.slice(0, 2).join(" / ")
              : "future pick liquidity";
            const sendText = offer.assets.map(createAssetLabel);
            const targetTradeValue = getAssetTradeValue(
              { ...target, type: "player" },
              playerMarketMap,
              leagueContext,
              tradeMarket,
            );
            const marketPremium =
              tradeMarket.positionMultipliers[target.position] || 1;
            const recentComp = tradeMarket.recentTrades.find(
              (trade) => trade.position === target.position,
            );
            const tier = getSuggestionTier(
              targetTradeValue,
              offer.outgoingValue - targetTradeValue,
              offer.rules,
            );
            const myPhase = myTeam.teamPhase?.phase;
            const partnerPhase = partner.teamPhase?.phase;

            let fitScore =
              targetTradeValue +
              (partner.needs.some((need) =>
                offer.assets.some((asset) => asset.position === need),
              )
                ? 12
                : 0) +
              (myTeam.surplusPositions.includes(needPos) ? -8 : 8) -
              Math.abs(targetTradeValue - offer.outgoingValue);

            // Phase alignment: rebuilder↔contender trades are more likely to happen
            if (
              (myPhase === "contender" && partnerPhase === "rebuild") ||
              (myPhase === "rebuild" && partnerPhase === "contender")
            )
              fitScore += 8;

            // Contenders prefer proven producers
            if (
              myPhase === "contender" &&
              (target.archetype === "Short Term League Winner" ||
                target.archetype === "Productive Vet")
            )
              fitScore += 6;

            // Rebuilders prefer young upside
            if (
              myPhase === "rebuild" &&
              target.age <= 24 &&
              target.archetype !== "Replaceable"
            )
              fitScore += 6;

            suggestions.push({
              partnerTeam: partner.label,
              needPos,
              targetPlayer: target,
              tier,
              marketGap: offer.outgoingValue - targetTradeValue,
              marketNote: `${target.position} market in this league is running ${marketPremium.toFixed(2)}x baseline across ${tradeMarket.sampleCount} recent trades.`,
              recentComp,
              receive: [
                {
                  type: "player",
                  label: `${target.name} (${target.position})`,
                },
              ],
              send: sendText,
              fitScore,
              summary: `${partner.label} can spare ${needPos} help, while your outgoing package is sized to both their ${partnerNeedText} needs and your league's recent trade prices.`,
              rationale: [
                `You are thin at ${needPos} and ${target.name} carries a ${target.score}/100 dynasty score with an adjusted trade value of ${targetTradeValue}.`,
                `${partner.label} profiles weak at ${partnerNeedText}.`,
                `Suggested send: ${sendText.join(" + ")} (${offer.outgoingValue} total market value).`,
                `${leagueContext.formatLabel} boosts ${target.position} pricing in this room.`,
                recentComp
                  ? `Recent clean comp (${recentComp.shape}): ${recentComp.target} was acquired for ${recentComp.cost}.`
                  : `No exact recent comp found, so this package leans on league-rule pricing instead.`,
              ],
            });
          });
      });
    });

  // Merge sell suggestions for rebuilding teams
  const myPhaseGlobal = myTeam.teamPhase?.phase;
  if (myPhaseGlobal === "rebuild" || myPhaseGlobal === "retool") {
    const sellSuggestions = buildSellSuggestions(
      myTeam,
      leagueTeams,
      playerMarketMap,
      leagueContext,
      tradeMarket,
    );
    suggestions.push(...sellSuggestions);
  }

  return suggestions
    .sort((a, b) => b.fitScore - a.fitScore)
    .filter(
      (suggestion, index, list) =>
        list.findIndex(
          (item) =>
            item.partnerTeam === suggestion.partnerTeam &&
            item.targetPlayer.id === suggestion.targetPlayer.id,
        ) === index,
    )
    .slice(0, 8);
}

// Purpose-built fair-offer assembler for trade targets. Unlike buildOfferPackage
// (tuned for win-now acquisitions with anchor/meaningful-asset guards), this just
// finds the cleanest bundle from your tradeable assets whose total lands in a fair
// band around the target's value — preferring a single asset, then the fewest
// pieces, and biasing toward assets the partner needs.
export function assembleFairPackage(
  myTeam,
  targetValue,
  partner,
  playerMarketMap,
  leagueContext,
  tradeMarket,
) {
  const myPhase = myTeam.teamPhase?.phase ?? null;
  const partnerNeeds = new Set(partner.needs || []);
  const currentYear = new Date().getFullYear();

  const players = (myTeam.tradeablePlayers || []).map((p) => ({
    ...p,
    type: "player",
    value: getAssetTradeValue(
      { ...p, type: "player" },
      playerMarketMap,
      leagueContext,
      tradeMarket,
    ),
    partnerFit: partnerNeeds.has(p.position),
  }));
  const picks = (myTeam.picks || [])
    .filter((pk) => Number(pk.season) <= currentYear + 1 && pk.round <= 4)
    .map((pk) => ({
      ...pk,
      type: "pick",
      ownerPhase: myPhase,
      value: estimatePickValue(pk, leagueContext, tradeMarket, myPhase),
      partnerFit: false,
    }));

  const pool = [...players, ...picks].filter((a) => a.value > 0);
  if (!pool.length) return null;

  const lo = Math.max(1, Math.round(targetValue * 0.92) - 3);
  const hi = Math.round(targetValue * 1.12) + 4;

  // 1) Single asset inside the band — prefer a partner-need fit, then closest value.
  const singles = pool
    .filter((a) => a.value >= lo && a.value <= hi)
    .sort(
      (a, b) =>
        b.partnerFit - a.partnerFit ||
        Math.abs(a.value - targetValue) - Math.abs(b.value - targetValue),
    );
  if (singles.length) {
    return { assets: [singles[0]], outgoingValue: Math.round(singles[0].value) };
  }

  // 2) Greedy bundle — pack from the largest asset down without exceeding the
  //    ceiling, stopping once we clear the floor. Capped at 4 pieces for a clean shape.
  const sorted = [...pool].sort((a, b) => b.value - a.value);
  const assets = [];
  let total = 0;
  for (const asset of sorted) {
    if (assets.length >= 4) break;
    if (total + asset.value <= hi) {
      assets.push(asset);
      total += asset.value;
    }
    if (total >= lo) break;
  }
  if (assets.length && total >= lo && total <= hi) {
    return { assets, outgoingValue: Math.round(total) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Trade Tinder — FantasyCalc real-trade cards
// ---------------------------------------------------------------------------

function parseFCPickName(name) {
  if (!name) return null;
  const year = (name.match(/20\d\d/) || [])[0];
  const round = /1st/i.test(name) ? 1 : /2nd/i.test(name) ? 2 : /3rd/i.test(name) ? 3 : /4th/i.test(name) ? 4 : null;
  if (!year || !round) return null;
  return {
    type: "pick",
    id: `fc-pick-${year}-${round}-${name.replace(/\s+/g, "")}`,
    season: year,
    round,
    label: name,
    isOwn: false,
    value: null,
  };
}

function fcFairnessLabel(valueDiff) {
  const abs = Math.abs(valueDiff);
  if (abs < 400) return "Fair";
  if (abs < 1200) return "Slight edge";
  if (abs < 2800) return "Uneven";
  return "Lopsided";
}

export function buildFCTinderCards(
  fcTrades,
  leagueTeams,
  leagueContext,
  tradeMarket,
  { swipedHashes = new Set(), maxCards = 50 } = {},
) {
  if (!Array.isArray(fcTrades) || !fcTrades.length) return [];

  const playerMarketMap = new Map(
    leagueTeams.flatMap((t) => t.enriched.map((p) => [String(p.id), p])),
  );

  function enrichAsset(raw) {
    if (!raw) return null;
    if (raw.position === "PICK" || raw.isPick) return parseFCPickName(raw.name);
    if (raw.sleeperId) {
      const player = playerMarketMap.get(String(raw.sleeperId));
      if (player) return { ...player, type: "player" };
    }
    if (!raw.name || !raw.position || raw.position === "PICK") return null;
    return {
      type: "player",
      id: `fc-${raw.sleeperId || raw.name}`,
      name: raw.name,
      position: raw.position,
      score: null,
      value: null,
      unknown: true,
    };
  }

  const cards = [];
  const seen = new Set(swipedHashes);

  for (const trade of fcTrades) {
    if (!trade?.id || !Array.isArray(trade.side1) || !Array.isArray(trade.side2)) continue;

    const tradeHash = `fc-${trade.id}`;
    if (seen.has(tradeHash)) continue;
    seen.add(tradeHash);

    const assetsA = trade.side1.map(enrichAsset).filter(Boolean);
    const assetsB = trade.side2.map(enrichAsset).filter(Boolean);
    if (!assetsA.length || !assetsB.length) continue;

    // When all assets are matched in the league, use our engine for a
    // league-context-aware evaluation (format, position premiums, phase).
    // Otherwise fall back to FantasyCalc's own value differential.
    const allKnown = [...assetsA, ...assetsB].every((a) => !a.unknown);
    let fairnessLabel, engineVerdict, engineNet, valueA, valueB;

    if (allKnown) {
      const ev = evaluateTrade(
        assetsA,
        assetsB,
        null,
        null,
        playerMarketMap,
        leagueContext,
        tradeMarket,
      );
      if (ev.fairnessLabel === "Lopsided") continue;
      fairnessLabel = ev.fairnessLabel;
      engineVerdict = fairnessLabel === "Fair" ? "fair" : ev.teamA.netValue > 0 ? "team_a" : "team_b";
      engineNet = ev.teamA.netValue;
      valueA = ev.sideAValue;
      valueB = ev.sideBValue;
    } else {
      const valueDiff = Number(trade.maybeTradedValueDiff || 0);
      fairnessLabel = fcFairnessLabel(valueDiff);
      if (fairnessLabel === "Lopsided") continue;
      engineVerdict = fairnessLabel === "Fair" ? "fair" : valueDiff > 0 ? "team_b" : "team_a";
      engineNet = -valueDiff;
      valueA = null;
      valueB = null;
    }

    cards.push({
      tradeHash,
      source: "fc",
      fcGrade: trade.maybeGrade || null,
      teamA: { label: "Side A", phase: null, wins: null, losses: null },
      teamB: { label: "Side B", phase: null, wins: null, losses: null },
      assetsA,
      assetsB,
      valueA,
      valueB,
      fairnessLabel,
      engineVerdict,
      engineNet,
    });

    if (cards.length >= maxCards) break;
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Trade Tinder — league-wide trade card queue
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function buildTradeHash(assetsA, assetsB) {
  const key = (a) =>
    a.type === "pick" ? `pk-${a.season}-${a.round}` : `pl-${a.id}`;
  const sideA = assetsA.map(key).sort().join(",");
  const sideB = assetsB.map(key).sort().join(",");
  return [sideA, sideB].sort().join("|");
}

export function buildTinderQueue(
  leagueTeams,
  leagueContext,
  tradeMarket,
  { seed, swipedHashes = new Set(), maxCards = 25 } = {},
) {
  const rng = mulberry32(seed ?? dailySeed());

  const playerMarketMap = new Map(
    leagueTeams.flatMap((t) => t.enriched.map((p) => [String(p.id), p])),
  );

  const cards = [];
  const seen = new Set(swipedHashes);
  // Diversity guards: max 1 card per team-pair, max 2 cards featuring any player
  const pairSeen = new Set();
  const playerCount = new Map();
  const MAX_PLAYER_APPEARANCES = 2;

  const teams = [...leagueTeams].sort(() => rng() - 0.5);

  function pairKey(a, b) {
    return [a.rosterId, b.rosterId].sort().join("|");
  }

  function trackPlayers(assetsA, assetsB) {
    for (const a of [...assetsA, ...assetsB]) {
      if (a.type === "player" && a.id) {
        playerCount.set(String(a.id), (playerCount.get(String(a.id)) || 0) + 1);
      }
    }
  }

  function playerOverLimit(assetsA, assetsB) {
    for (const a of [...assetsA, ...assetsB]) {
      if (a.type === "player" && a.id) {
        if ((playerCount.get(String(a.id)) || 0) >= MAX_PLAYER_APPEARANCES) return true;
      }
    }
    return false;
  }

  function makeCard(teamA, teamB, assetsA, assetsB) {
    const pk = pairKey(teamA, teamB);
    if (pairSeen.has(pk)) return false;
    if (playerOverLimit(assetsA, assetsB)) return false;

    const tradeHash = buildTradeHash(assetsA, assetsB);
    if (seen.has(tradeHash)) return false;

    const ev = evaluateTrade(
      assetsA,
      assetsB,
      teamA.teamPhase?.phase,
      teamB.teamPhase?.phase,
      playerMarketMap,
      leagueContext,
      tradeMarket,
    );
    if (ev.fairnessLabel === "Lopsided") return false;

    seen.add(tradeHash);
    pairSeen.add(pk);
    trackPlayers(assetsA, assetsB);

    let engineVerdict = "fair";
    if (ev.fairnessLabel !== "Fair") {
      engineVerdict = ev.teamA.netValue > 0 ? "team_a" : "team_b";
    }

    cards.push({
      tradeHash,
      teamA: {
        rosterId: teamA.rosterId,
        label: teamA.label,
        phase: teamA.teamPhase?.phase ?? "unknown",
        wins: teamA.wins ?? 0,
        losses: teamA.losses ?? 0,
      },
      teamB: {
        rosterId: teamB.rosterId,
        label: teamB.label,
        phase: teamB.teamPhase?.phase ?? "unknown",
        wins: teamB.wins ?? 0,
        losses: teamB.losses ?? 0,
      },
      assetsA,
      assetsB,
      valueA: ev.sideAValue,
      valueB: ev.sideBValue,
      fairnessLabel: ev.fairnessLabel,
      engineVerdict,
      engineNet: ev.teamA.netValue,
    });
    return true;
  }

  // ── Path 1: package-for-star ─────────────────────────────────────────────
  // Each team pair gets at most one card. Pick a random high-value target from
  // teamB and build a package offer from teamA. One card per pair.
  const shuffledTeams = [...teams];
  for (let i = 0; i < shuffledTeams.length && cards.length < maxCards; i++) {
    const teamA = shuffledTeams[i];
    const partners = shuffledTeams
      .filter((t) => t.rosterId !== teamA.rosterId)
      .sort(() => rng() - 0.5);

    for (const teamB of partners) {
      if (cards.length >= maxCards) break;
      if (pairSeen.has(pairKey(teamA, teamB))) continue;

      // Pick one random qualifying target from teamB
      const candidates = [
        ...(teamB.targetablePlayers || []),
        ...(teamB.tradeablePlayers || []),
      ]
        .filter((p) => (p.score || 0) > 50)
        .sort(() => rng() - 0.5);

      let placed = false;
      for (const target of candidates) {
        if (playerOverLimit([{ ...target, type: "player" }], [])) continue;
        const offer = buildOfferPackage(
          target,
          teamA,
          teamB,
          playerMarketMap,
          leagueContext,
          tradeMarket,
        );
        if (!offer?.assets?.length) continue;
        if (makeCard(teamA, teamB, offer.assets, [{ ...target, type: "player" }])) {
          placed = true;
          break;
        }
      }
      // Move on to next team pair regardless
      void placed;
    }
  }

  // ── Path 2: star-for-package ──────────────────────────────────────────────
  // For pairs not yet covered: team A gives a quality star; team B returns
  // a 2-asset package of comparable value. One card per uncovered pair.
  for (let i = 0; i < shuffledTeams.length && cards.length < maxCards; i++) {
    const teamA = shuffledTeams[i];
    const starsA = (teamA.enriched || [])
      .filter((p) => (p.score || 0) > 60)
      .sort(() => rng() - 0.5);

    if (!starsA.length) continue;

    const partners = shuffledTeams
      .filter((t) => t.rosterId !== teamA.rosterId)
      .sort(() => rng() - 0.5);

    for (const teamB of partners) {
      if (cards.length >= maxCards) break;
      if (pairSeen.has(pairKey(teamA, teamB))) continue;

      const bPlayers = (teamB.enriched || [])
        .filter((p) => (p.score || 0) > 35)
        .sort(() => rng() - 0.5)
        .slice(0, 8)
        .map((p) => ({ ...p, type: "player" }));

      const bPicks = (teamB.picks || [])
        .filter((pk) => pk.round <= 2)
        .map((pk) => ({ ...pk, type: "pick" }));

      const bAssets = [...bPlayers, ...bPicks];
      if (bAssets.length < 2) continue;

      // Try stars until one generates a valid card for this pair
      let placed = false;
      outer: for (const star of starsA) {
        if (playerOverLimit([{ ...star, type: "player" }], [])) continue;
        const assetsA = [{ ...star, type: "player" }];
        for (let ii = 0; ii < bAssets.length && !placed; ii++) {
          for (let jj = ii + 1; jj < bAssets.length && !placed; jj++) {
            if (
              bAssets[ii].type === "player" &&
              bAssets[jj].type === "player" &&
              bAssets[ii].id === bAssets[jj].id
            ) continue;
            if (makeCard(teamA, teamB, assetsA, [bAssets[ii], bAssets[jj]])) {
              placed = true;
              break outer;
            }
          }
        }
      }
      void placed;
    }
  }

  return cards.sort(() => rng() - 0.5).slice(0, maxCards);
}

// Build player sentiment cards (Buy / Sell / Ignore) for the Trade Jury queue.
// Picks interesting players — high value, age-edge, or positionally notable.
export function buildPlayerSentimentCards(
  leagueTeams,
  { swipedHashes = new Set(), maxCards = 15, seed } = {},
) {
  const rng = mulberry32(seed ?? dailySeed());

  // Collect all rostered players with enough value to be interesting
  const allPlayers = [];
  for (const team of leagueTeams) {
    for (const p of team.enriched || []) {
      if (!p.name || !p.position || !p.id) continue;
      const val = p.score || p.value || 0;
      if (val < 40) continue; // ignore fringe players
      allPlayers.push({
        id: String(p.id),
        name: p.name,
        position: p.position,
        age: p.age,
        value: Math.round(val),
        team: p.team || null,
        ownerLabel: team.label || null,
      });
    }
  }

  // De-duplicate by player id
  const seen = new Map();
  for (const p of allPlayers) {
    if (!seen.has(p.id) || seen.get(p.id).value < p.value) seen.set(p.id, p);
  }

  // Score each player's "discussion-worthiness"
  // - Very high value guys are always interesting
  // - Players on the age bubble (26-30) are buy/sell flashpoints
  // - Young stars are buy targets people want to debate
  function interestScore(p) {
    let s = p.value;
    const age = p.age || 25;
    if (age >= 26 && age <= 30) s += 15; // prime sell window
    if (age <= 23 && p.value >= 60) s += 20; // young stars
    if (age >= 31) s += 10; // "is he cooked?" debate
    return s + rng() * 20; // randomize slightly so it shuffles each session
  }

  const candidates = [...seen.values()]
    .filter((p) => !swipedHashes.has(`sentiment-${p.id}`))
    .sort((a, b) => interestScore(b) - interestScore(a))
    .slice(0, maxCards);

  return candidates.map((p) => ({
    type: "sentiment",
    cardHash: `sentiment-${p.id}`,
    player: p,
  }));
}
