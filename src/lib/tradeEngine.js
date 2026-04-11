/**
 * tradeEngine.js
 * Trade market calibration, offer-package building, and suggestion ranking.
 */
import { POSITION_PRIORITY } from "../constants";
import { estimatePickValue } from "./marketValue";

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

function getAssetTradeValue(
  asset,
  playerMarketMap,
  leagueContext,
  tradeMarket,
) {
  if (asset.type === "pick") {
    return estimatePickValue(asset, leagueContext, tradeMarket);
  }

  const player = playerMarketMap.get(String(asset.id)) || asset;
  const multiplier = tradeMarket?.positionMultipliers?.[player.position] || 1;
  return Math.round((player.marketValue || player.score || 40) * multiplier);
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
      value: estimatePickValue(pick, leagueContext, tradeMarket),
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

  const rawGap = Math.abs(valueA - valueB);
  let fairnessLabel;
  if (rawGap <= 5) fairnessLabel = "Fair";
  else if (rawGap <= 12) fairnessLabel = "Slight edge";
  else if (rawGap <= 20) fairnessLabel = "Uneven";
  else fairnessLabel = "Lopsided";

  return {
    sideAValue: valueA,
    sideBValue: valueB,
    rawGap,
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
            value: estimatePickValue(p, leagueContext, tradeMarket),
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
