// Dynasty trade-type taxonomy. Pure logic, no UI.
//
// Codifies the ten canonical dynasty trade structures (tier manipulation,
// timeline/directional, market arbitrage, roster construction) plus a few
// pragmatic fallbacks, and classifies a proposed trade into the type that
// best describes it FROM ONE TEAM'S PERSPECTIVE (outgoing = what they give,
// incoming = what they get). The same trade usually classifies as the inverse
// type from the other side (Tier Down ↔ Tier Up, Vet-for-Pick ↔ Pick-for-Vet).
//
// Values ride the 1–130 forward dynasty scale (pVal fallback chain), the same
// scale draftBlueprints uses — NOT trade points — so classification stays
// market-map-free and unit-testable.

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const pVal = (p) =>
  num(p?.dynastyValue?.value, num(p?.marketValue, num(p?.score, num(p?.value, 0))));
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// Tier bands on the 1–130 scale.
const ELITE = 85;      // Tier 1 — blue chip
const STARTABLE = 45;  // startable-caliber piece
const VET_AGE = 26;    // "producing veteran" per the master matrix

// An NFL backup QB scores nothing while his starter is healthy — fantasy slot
// is irrelevant. Only QB gets this hard rule: an NFL RB2/WR2 still sees work.
// depthOrder is Sleeper's depth_chart_order stamped by rosterBuilder; when
// Sleeper reported no slot (depthOrderKnown === false) the stamped value is a
// conservative default, not a fact — never brand a player off it. Lives here
// (dependency-free) so tradeEngine, tradeBlueprintImpact, and tradePackages
// can all share it without an import cycle.
export const isNflBackupQb = (p) =>
  p?.position === "QB" &&
  p?.depthOrderKnown !== false &&
  Number.isFinite(Number(p.depthOrder)) &&
  Number(p.depthOrder) >= 2;

/**
 * The master trade matrix — metadata for every named type. `give`/`get`/
 * `objective`/`bestTime` mirror the dynasty playbook so the UI can teach
 * while it labels.
 */
export const TRADE_TYPES = {
  tierDown: {
    id: "tierDown",
    label: "Tier Down (Value Harvest)",
    give: "1 elite asset",
    get: "1 good asset + premium capital",
    objective: "De-risk a top-heavy roster and harvest depth while the name premium is high",
    bestTime: "In-season or peak hype",
  },
  tierUp: {
    id: "tierUp",
    label: "Tier Up (Blue-Chip Consolidation)",
    give: "Multiple mid assets/picks",
    get: "1 blue-chip cornerstone",
    objective: "Maximize starting-lineup ceiling — elite producers win titles",
    bestTime: "Offseason / startup",
  },
  lateralPivot: {
    id: "lateralPivot",
    label: "Lateral Pivot (Insulation)",
    give: "1 player",
    get: "1 same-tier player",
    objective: "Swap age/situation risk without sacrificing current-year points",
    bestTime: "Any time",
  },
  vetForPick: {
    id: "vetForPick",
    label: "Vet-for-Pick Liquidation",
    give: "Producing veteran (26+)",
    get: "Future 1sts/2nds or young prospects",
    objective: "Classic rebuild — convert points-now into appreciating assets",
    bestTime: "Weeks 6–10 (trade deadline)",
  },
  pickForVet: {
    id: "pickForVet",
    label: "Pick-for-Vet Cash-In",
    give: "Future draft capital",
    get: "Point-producing veteran",
    objective: "All-in push — buy discounted weekly points for a title run",
    bestTime: "In-season / depth crisis",
  },
  rookieFever: {
    id: "rookieFever",
    label: "Rookie Fever Liquidation",
    give: "Hyped current-year pick",
    get: "Proven young producer",
    objective: "Sell the mystery box at its hype peak for a certified NFL producer",
    bestTime: "On the clock / rookie draft",
  },
  timeArbitrage: {
    id: "timeArbitrage",
    label: "Time Arbitrage (Kick the Can)",
    give: "Current-year pick",
    get: "Future-year higher pick",
    objective: "Exploit leaguemates' time discount — turn 2nds into 1sts by waiting",
    bestTime: "During the rookie draft",
  },
  twoForOne: {
    id: "twoForOne",
    label: "2-for-1 Depth Consolidation",
    give: "Two startable depth pieces",
    get: "One superior starter",
    objective: "Upgrade weekly ceiling when the bench is deeper than the lineup",
    bestTime: "Bye-week / injury crunch",
  },
  oneForTwo: {
    id: "oneForTwo",
    label: "1-for-2 Bench Churn",
    give: "One mid-tier starter",
    get: "Two upside stashes or piece + early 2nd",
    objective: "Build an insulation layer of starting options in deep formats",
    bestTime: "Deep-league offseason",
  },
  handcuff: {
    id: "handcuff",
    label: "Handcuff / Insurance Swap",
    give: "Minor capital",
    get: "Your starter's direct backup",
    objective: "Buy structural variance insurance behind a brittle cornerstone",
    bestTime: "Preseason",
  },
  // Pragmatic fallbacks (not in the canonical ten, still real shapes).
  pickAccumulation: {
    id: "pickAccumulation",
    label: "Pick Accumulation",
    give: "Young/unsettled players",
    get: "Draft capital",
    objective: "Stockpile liquidity without a clear vet liquidation",
    bestTime: "Any time",
  },
  winNowPush: {
    id: "winNowPush",
    label: "Win-Now Push",
    give: "Youth",
    get: "Immediate production",
    objective: "Trade timeline for points",
    bestTime: "In-season",
  },
  youthPivot: {
    id: "youthPivot",
    label: "Youth Pivot",
    give: "Immediate production",
    get: "Youth",
    objective: "Trade points for timeline",
    bestTime: "Offseason",
  },
  valueSwap: {
    id: "valueSwap",
    label: "Lateral Value Swap",
    give: "Comparable value",
    get: "Comparable value",
    objective: "Fit-for-fit exchange",
    bestTime: "Any time",
  },
};

/**
 * Classify a trade from one team's perspective into the best-matching type.
 *
 * @param {object} args
 * @param {Array}  args.outgoing   assets this team gives
 * @param {Array}  args.incoming   assets this team gets
 * @param {object} [args.team]     receiving team (league-team shape) — enables
 *                                 handcuff detection against their RB room
 * @param {number} [args.currentSeason]  rookie-draft year for rookie-fever /
 *                                 time-arbitrage; defaults to earliest pick
 *                                 season in the trade
 * @returns {{ id, label, detail, meta }}
 */
export function classifyTradeType({ outgoing = [], incoming = [], team = null, currentSeason = null }) {
  const inPlayers = incoming.filter((a) => a.type === "player");
  const inPicks = incoming.filter((a) => a.type === "pick");
  const outPlayers = outgoing.filter((a) => a.type === "player");
  const outPicks = outgoing.filter((a) => a.type === "pick");

  const bestIn = inPlayers.reduce((m, p) => Math.max(m, pVal(p)), 0);
  const bestOut = outPlayers.reduce((m, p) => Math.max(m, pVal(p)), 0);
  const inAge = mean(inPlayers.map((p) => num(p.age)).filter(Boolean));
  const outAge = mean(outPlayers.map((p) => num(p.age)).filter(Boolean));
  const allPickSeasons = [...inPicks, ...outPicks].map((p) => num(p.season)).filter(Boolean);
  const nowSeason = num(currentSeason, allPickSeasons.length ? Math.min(...allPickSeasons) : 0);

  const done = (id, detail) => ({ id, label: TRADE_TYPES[id].label, detail, meta: TRADE_TYPES[id] });

  // 1. Handcuff / insurance: incoming RB backing up one of MY elite RBs.
  if (team?.enriched) {
    const myEliteRbTeams = new Set(
      team.enriched
        .filter((p) => p.position === "RB" && pVal(p) >= 80 && p.team && p.team !== "FA")
        .map((p) => p.team),
    );
    const cuff = inPlayers.find(
      (p) => p.position === "RB" && pVal(p) < 50 && p.team && myEliteRbTeams.has(p.team),
    );
    if (cuff && bestOut < 60) {
      return done("handcuff", `${cuff.name} insures your ${cuff.team} backfield anchor`);
    }
  }

  // 2. Time arbitrage: picks-for-picks, deferring to a later year for a better round.
  if (!inPlayers.length && !outPlayers.length && inPicks.length && outPicks.length) {
    const bestInPick = inPicks.reduce((m, p) => Math.min(m, num(p.round, 9)), 9);
    const bestOutPick = outPicks.reduce((m, p) => Math.min(m, num(p.round, 9)), 9);
    const inYear = Math.max(...inPicks.map((p) => num(p.season)));
    const outYear = Math.min(...outPicks.map((p) => num(p.season)));
    if (bestInPick < bestOutPick && inYear > outYear) {
      return done("timeArbitrage", `Turning a ${outYear} round-${bestOutPick} into a ${inYear} round-${bestInPick} by waiting`);
    }
    return done("valueSwap", "Pick-for-pick value exchange");
  }

  // 3. Rookie fever: current-year early pick out, proven young producer in.
  if (
    nowSeason &&
    outPicks.some((p) => num(p.season) === nowSeason && num(p.round, 9) <= 2) &&
    !outPlayers.some((p) => pVal(p) >= STARTABLE) &&
    inPlayers.length === 1 &&
    bestIn >= 60 &&
    num(inPlayers[0].age, 99) <= 26 &&
    num(inPlayers[0].yearsExp, 0) >= 2
  ) {
    return done("rookieFever", `Selling the ${nowSeason} mystery box for a certified producer`);
  }

  // 4. Tier down: elite out; near-tier piece + premium capital back.
  if (
    bestOut >= ELITE &&
    incoming.length >= 2 &&
    bestIn >= bestOut - 35 &&
    bestIn < bestOut &&
    (inPicks.some((p) => num(p.round, 9) <= 2) || inPlayers.filter((p) => pVal(p) >= STARTABLE).length >= 2)
  ) {
    return done("tierDown", "Dropping half a tier to harvest depth while the name premium is high");
  }

  // 5. Tier up: elite in; multiple lesser pieces out.
  if (
    bestIn >= ELITE &&
    outgoing.length >= 2 &&
    bestOut < bestIn &&
    inPlayers.length === 1
  ) {
    return done("tierUp", `Consolidating ${outgoing.length} pieces into a blue-chip cornerstone`);
  }

  // 6. Vet-for-pick liquidation: producing vet out; picks or unproven
  //    prospects back (a vet swapped for an established star is not this).
  const unprovenIn =
    inPlayers.length > 0 && inPlayers.every((p) => num(p.age, 99) <= 24 && pVal(p) < 70);
  const clearlyAgingOut = outPlayers.some((p) => num(p.age, 0) >= 28 && pVal(p) >= 55);
  if (
    outPlayers.some((p) => num(p.age, 0) >= VET_AGE && pVal(p) >= 55) &&
    ((inPicks.length >= 1 && inPicks.length >= inPlayers.length) ||
      // Prospects-only returns read as liquidation only for clearly aging vets;
      // a 26-year-old flipped for stashes is bench churn, not a teardown.
      (unprovenIn && (inPicks.length >= 1 || clearlyAgingOut)))
  ) {
    return done("vetForPick", "Converting points-now into appreciating assets — the classic rebuild move");
  }

  // 7. Pick-for-vet cash-in: real draft capital out; producing vet in.
  const unprovenOut =
    outPlayers.length > 0 && outPlayers.every((p) => num(p.age, 99) <= 24 && pVal(p) < 70);
  if (
    inPlayers.some((p) => num(p.age, 0) >= VET_AGE && pVal(p) >= 55) &&
    outPicks.length >= 1 &&
    (outPicks.length >= outPlayers.length || unprovenOut)
  ) {
    return done("pickForVet", "Buying discounted weekly points for the title push");
  }

  // 8. Pick accumulation: players out (no clear vet), mostly picks back.
  if (inPicks.length > inPlayers.length && outPlayers.length > outPicks.length) {
    return done("pickAccumulation", "Stockpiling draft capital");
  }

  // 9. 2-for-1 consolidation (non-elite version of tier up).
  if (outgoing.length > incoming.length && inPlayers.length === 1 && bestIn > bestOut) {
    return done("twoForOne", `Packaging ${outgoing.length} pieces into a superior starter`);
  }

  // 10. 1-for-2 bench churn.
  if (
    incoming.length > outgoing.length &&
    outPlayers.length === 1 &&
    bestOut > bestIn &&
    (inPlayers.every((p) => num(p.age, 99) <= 25) || inPicks.some((p) => num(p.round, 9) <= 2))
  ) {
    return done("oneForTwo", "Refilling the bench with upside behind the lineup");
  }

  // 11. Age-directional player swaps (uneven tiers, no picks driving it).
  if (inPlayers.length && outPlayers.length) {
    const sameTier = Math.abs(bestIn - bestOut) <= 12;
    if (sameTier && inPlayers.length === 1 && outPlayers.length === 1) {
      const ageNote =
        inAge && outAge && Math.abs(inAge - outAge) >= 3
          ? inAge < outAge
            ? " — shedding age risk for an ascending profile"
            : " — cashing youth for proven production"
          : "";
      return done("lateralPivot", `Same-tier swap${ageNote}`);
    }
    if (inAge && outAge && inAge >= outAge + 2) {
      return done("winNowPush", "Trading future assets for immediate production");
    }
    if (inAge && outAge && outAge >= inAge + 2) {
      return done("youthPivot", "Cashing in veteran production for the next window");
    }
  }

  return done("valueSwap", "Comparable value both ways — a fit-for-fit exchange");
}
