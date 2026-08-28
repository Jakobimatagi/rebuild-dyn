import { getAssetTradeValue } from "./tradeEngine.js";

// ---------------------------------------------------------------------------
// Roster efficiency — Buying Power vs. Expected Value, at the roster level.
//
// "Buying power" is the aggregate market value of everything a team controls
// (players + picks). It's a guide, not the goal. "Expected value" is what the
// lineup actually projects to produce (starter PPG). Roster efficiency is the
// extent to which a team's buying power is allocated toward the best possible
// expected value — and the two ways it commonly goes wrong:
//
//   1. Over-extended ("all in") — high on-field output squeezed from a thin
//      base of buying power, having spent future capital (picks + youth) past
//      the point of diminishing returns, shortening the contention window.
//   2. Under-leveraged ("hoarding") — sitting on buying power that isn't
//      translating into wins; assets banked rather than fielded.
//
// Everything is league-relative: a team is graded against the other rosters in
// its own league, so the read reflects that market, not a global scale.
// ---------------------------------------------------------------------------

const FUTURE_AGE = 24; // players this age or younger count as "future" capital
const HI = 58; // percentile at/above which a metric reads as a league strength
const LO = 42; // percentile at/below which a metric reads as a league weakness

function percentile(arr, value) {
  const n = arr.length;
  if (n <= 1) return 50;
  const below = arr.filter((x) => x < value).length;
  const equal = arr.filter((x) => x === value).length;
  // Midpoint of the equal band so ties don't all read as 0th percentile.
  return Math.round(((below + equal / 2) / n) * 100);
}

function rankOf(arr, value) {
  return arr.filter((x) => x > value).length + 1;
}

function gradeFromIndex(idx) {
  if (idx >= 22) return { grade: "A", color: "#00f5a0" };
  if (idx >= 8) return { grade: "B", color: "#7bd88f" };
  if (idx > -8) return { grade: "C", color: "#ffd84d" };
  if (idx > -22) return { grade: "D", color: "#ff9d4d" };
  return { grade: "F", color: "#ff6b35" };
}

// Quadrant read from where a team sits on the buying-power / expected-value map.
function classify(bpPct, evPct, futureShare, phase) {
  const bpHi = bpPct >= HI;
  const bpLo = bpPct <= LO;
  const evHi = evPct >= HI;
  const evLo = evPct <= LO;
  const thin = futureShare < 0.16; // little future capital left in the tank

  if (evHi && bpLo) {
    return {
      archetype: "Maxed Out",
      quadrant: "over-extended",
      color: "#ff9d4d",
      headline: "Punching above your asset weight",
      note: thin
        ? "Top-tier lineup output from a thin base of buying power, with little future capital left. You're near the ceiling of this core — pushing further risks diminishing returns and a short window."
        : "You're squeezing strong lineup output from modest buying power — efficient, but keep an eye on how much future capital you spend chasing marginal gains.",
      risk: "over-extended",
    };
  }
  if (bpHi && evLo) {
    return {
      archetype: "Under-leveraged",
      quadrant: "under-leveraged",
      color: "#7b8cff",
      headline: "Buying power sitting idle",
      note: "You control a lot of market value that isn't translating into lineup output. This is the classic hoarding trap — consolidate or deploy your assets into starters that move your expected value.",
      risk: "under-leveraged",
    };
  }
  if (bpHi && evHi) {
    return {
      archetype: "Loaded & Efficient",
      quadrant: "loaded",
      color: "#00f5a0",
      headline: "Deep and productive",
      note: "Both your buying power and your on-field output rank near the top of the league. You're allocating well — protect the window and avoid overpaying for the last marginal upgrade.",
      risk: null,
    };
  }
  if (bpLo && evLo) {
    return {
      archetype: "Rebuilding",
      quadrant: "rebuilding",
      color: "#94a3b8",
      headline: "Low on both — building the base",
      note: phase === "rebuild"
        ? "Light on buying power and output, as expected mid-rebuild. Keep accumulating cheap future capital, then convert it toward expected value when your window opens."
        : "Light on both buying power and output. Prioritize accumulating value before chasing wins.",
      risk: null,
    };
  }
  return {
    archetype: "Balanced",
    quadrant: "balanced",
    color: "#ffd84d",
    headline: "Roughly in line",
    note: "Your buying power and expected value track each other — no glaring misallocation. Look for spots to turn surplus depth into a starter upgrade.",
    risk: null,
  };
}

/**
 * Compute the roster-efficiency map for every team in a league.
 *
 * @param {Array} leagueTeams  classified teams (need enriched, picks, teamPhase.starterPPG)
 * @param {Object} leagueContext
 * @param {Object} tradeMarket
 * @param {string|number} myRosterId  the viewing team's roster id
 * @returns {null | { rows, me, medianBpPct, medianEvPct }}
 */
export function computeRosterEfficiency(leagueTeams, leagueContext, tradeMarket, myRosterId) {
  if (!leagueTeams?.length) return null;

  const playerMarketMap = new Map(
    leagueTeams.flatMap((t) => (t.enriched || []).map((p) => [String(p.id), p])),
  );

  const rows = leagueTeams.map((team) => {
    const phase = team.teamPhase?.phase || "retool";
    const pv = (p) =>
      getAssetTradeValue({ ...p, type: "player" }, playerMarketMap, leagueContext, tradeMarket);

    let playerBP = 0;
    let youngBP = 0;
    for (const p of team.enriched || []) {
      const v = pv(p);
      playerBP += v;
      if ((p.age ?? 99) <= FUTURE_AGE) youngBP += v;
    }

    let pickBP = 0;
    for (const pk of team.picks || []) {
      pickBP += getAssetTradeValue(
        { ...pk, type: "pick", ownerPhase: phase },
        playerMarketMap,
        leagueContext,
        tradeMarket,
      );
    }

    const buyingPower = playerBP + pickBP;
    const expectedValue = Number(team.teamPhase?.starterPPG || 0);
    const futureCapital = pickBP + youngBP;

    return {
      rosterId: team.rosterId,
      label: team.label,
      phase,
      buyingPower,
      playerBP,
      pickBP,
      expectedValue,
      futureCapital,
      futureShare: buyingPower > 0 ? futureCapital / buyingPower : 0,
      avgAge: parseFloat(team.avgAge) || null,
    };
  });

  const bpArr = rows.map((r) => r.buyingPower);
  const evArr = rows.map((r) => r.expectedValue);

  for (const r of rows) {
    r.bpPct = percentile(bpArr, r.buyingPower);
    r.evPct = percentile(evArr, r.expectedValue);
    r.bpRank = rankOf(bpArr, r.buyingPower);
    r.evRank = rankOf(evArr, r.expectedValue);
    // Efficiency: does on-field output outrank the assets that produce it?
    // Positive = converting buying power into expected value better than league.
    r.efficiencyIndex = r.evPct - r.bpPct;
    r.numTeams = rows.length;
    const g = gradeFromIndex(r.efficiencyIndex);
    r.grade = g.grade;
    r.gradeColor = g.color;
    Object.assign(r, classify(r.bpPct, r.evPct, r.futureShare, r.phase));
  }

  const me = rows.find((r) => String(r.rosterId) === String(myRosterId)) || null;

  return {
    rows,
    me,
    medianBpPct: 50,
    medianEvPct: 50,
  };
}
