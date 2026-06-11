/**
 * tradeFinder.ts
 *
 * Logic layer for the "Find Trades" feature. Pure functions — no React, no DOM.
 *
 * The flow is *directed*, the inverse of TradeTargets: the user hand-picks the
 * assets they want to SEND from their own roster, hits "Find Trades", and we
 * surface the league partners who actually need what's going out — then build
 * the fair return each of them would send back, shaped by the user's strategy:
 *
 *   - rebuilder : the return leans on early draft capital + young, foundational
 *                 upside; aging vets are avoided.
 *   - contender : the return leans on proven, productive players in their prime;
 *                 raw picks/projects are de-prioritized.
 *
 * It reuses the JS trade engine primitives (untyped `any` at the boundary) for
 * valuation and fairness so a Find-Trades idea prices identically to the Trade
 * Calculator.
 */
import {
  getAssetTradeValue,
  evaluateTrade,
  buildTradeRationale,
} from "./tradeEngine";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type Strategy = "contender" | "rebuilder";
export type TeamPhase = "contender" | "retool" | "rebuild";

export interface SendAsset {
  type: "player" | "pick";
  // players
  id?: string | number;
  name?: string;
  position?: string;
  age?: number | null;
  score?: number | null;
  ppg?: number | string | null;
  // picks
  label?: string;
  round?: number;
  season?: string | number;
  ownerPhase?: TeamPhase | null;
  value?: number;
  // allow the raw enriched/pick object through
  [k: string]: any;
}

export interface ReturnAsset {
  type: "player" | "pick";
  label: string;
  value: number;
  position: string | null;
  /** Why this asset fits the chosen strategy (e.g. "early pick", "young upside"). */
  note: string | null;
}

export interface TradeIdea {
  /** Stable within a result set: `${partnerRosterId}`. */
  id: string;
  partner: {
    rosterId: number | string;
    label: string;
    phase: TeamPhase | null;
    needs: string[];
  };
  /** Positions of the sent players this partner is actually short at. */
  matchedNeeds: string[];
  /** What the partner receives — the user's selected assets. */
  youSend: ReturnAsset[];
  /** What the partner sends back. */
  youGet: ReturnAsset[];
  outgoingValue: number;
  incomingValue: number;
  fairnessLabel: string;
  rationale: { positives: string[]; concerns: string[] };
  fitScore: number;
}

export interface FindTradesResult {
  sendValue: number;
  sentPositions: string[];
  ideas: TradeIdea[];
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Don't bother sourcing return pieces below this — roster filler. */
const MIN_RETURN_ASSET = 4;
/** Cap the return package shape so ideas stay clean. */
const MAX_RETURN_PIECES = 4;
const MAX_IDEAS = 8;

// Ages at/above which a vet's dynasty value is depreciating — a rebuilder
// shouldn't be taking these back.
const AGING_THRESHOLD: Record<string, number> = { RB: 26, WR: 29, TE: 30, QB: 33 };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : fallback;
}

function phaseOf(team: any): TeamPhase | null {
  return team?.teamPhase?.phase ?? null;
}

function isAgingVet(p: any): boolean {
  const age = num(p.age, 0);
  if (!age) return false;
  return age >= (AGING_THRESHOLD[p.position] ?? 30);
}

function hasMarketValue(p: any): boolean {
  return (
    num(p.dynastyMarketValue) > 0 ||
    num(p.fantasyCalcValue) > 0 ||
    num(p.rosterAuditValue) > 0
  );
}

function buildPlayerMarketMap(leagueTeams: any[]): Map<string, any> {
  return new Map(
    leagueTeams.flatMap((team) =>
      (team.enriched || []).map((p: any) => [String(p.id), p] as [string, any]),
    ),
  );
}

function rosterPhaseMap(leagueTeams: any[]): Map<string, TeamPhase | null> {
  return new Map(leagueTeams.map((t) => [String(t.rosterId), phaseOf(t)]));
}

function sendAssetLabel(a: SendAsset): string {
  if (a.type === "pick") return String(a.label);
  return `${a.name} (${a.position})`;
}

// ---------------------------------------------------------------------------
// Strategy preference — orders which partner assets we'd rather receive.
// This is a *preference* score (what shape of return we want), separate from
// trade value (how much it's worth). A rebuilder ranks an early pick above a
// same-valued aging vet even though the engine prices them the same.
// ---------------------------------------------------------------------------

interface Candidate {
  asset: any; // engine-ready asset (type + ownerPhase/value where relevant)
  value: number;
  pref: number;
  note: string | null;
}

function pickPref(round: number, strategy: Strategy): { pref: number; note: string } {
  const early = round <= 2;
  if (strategy === "rebuilder") {
    // Picks are the headline ask for a rebuild — rank them above players.
    return {
      pref: 150 - round * 12,
      note: round === 1 ? "1st-round capital" : early ? "early pick" : "draft capital",
    };
  }
  // Contenders want ready players; picks are filler unless they're firsts.
  return { pref: early ? 55 - round * 8 : 30 - round * 6, note: "pick" };
}

function playerPref(
  p: any,
  value: number,
  strategy: Strategy,
): { pref: number; note: string | null } {
  const age = num(p.age, 26);
  const score = num(p.score);
  const ppg = num(p.ppg);

  if (strategy === "rebuilder") {
    const young = age <= 24;
    const foundational =
      p.archetype === "Foundational" || p.archetype === "Cornerstone" || score >= 72;
    let pref = score + (young ? 25 : 0) + (age <= 22 ? 12 : 0) + (foundational ? 10 : 0);
    if (isAgingVet(p)) pref -= 60; // hard de-prioritize depreciating vets
    const note = young && foundational ? "young foundational" : young ? "young upside" : null;
    return { pref, note };
  }

  // Contender: reward proven, prime-age production; punish raw projects.
  const prime = age >= 23 && age <= 28;
  let pref = score + ppg * 2 + (prime ? 12 : 0);
  if (age <= 22 && ppg < 6) pref -= 30; // unproven youngster doesn't help win now
  const note = ppg >= 11 ? "proven producer" : prime && score >= 65 ? "win-now starter" : null;
  return { pref, note };
}

/**
 * Everything a partner could realistically send back, scored by strategy
 * preference. Players come from their movable pool (surplus + acquirable), plus
 * — for a rebuilder — any genuinely young upside piece worth chasing. Picks come
 * from their tradeable near-term draft capital.
 */
function partnerCandidates(
  partner: any,
  strategy: Strategy,
  playerMarketMap: Map<string, any>,
  phaseByRoster: Map<string, TeamPhase | null>,
  leagueContext: any,
  tradeMarket: any,
): Candidate[] {
  const currentYear = new Date().getFullYear();
  const seen = new Set<string>();
  const out: Candidate[] = [];

  const playerPool = [
    ...(partner.tradeablePlayers || []),
    // A rebuilder will gladly pry loose a young, ascending piece even if the
    // partner doesn't consider it "surplus".
    ...(strategy === "rebuilder"
      ? (partner.targetablePlayers || []).filter((p: any) => num(p.age, 99) <= 24)
      : []),
  ];

  for (const p of playerPool) {
    const key = `player:${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!hasMarketValue(p)) continue;
    const value = getAssetTradeValue(
      { ...p, type: "player" },
      playerMarketMap,
      leagueContext,
      tradeMarket,
    );
    if (value < MIN_RETURN_ASSET) continue;
    const { pref, note } = playerPref(p, value, strategy);
    out.push({ asset: { ...p, type: "player" }, value, pref, note });
  }

  for (const pk of partner.picks || []) {
    if (pk.round > 4) continue;
    if (Number(pk.season) > currentYear + 2) continue;
    const key = `pick:${pk.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const originPhase = pk.isOwn
      ? phaseOf(partner)
      : phaseByRoster.get(String(pk.originalRosterId)) ?? null;
    // Price picks on the same trade scale evaluateTrade uses (pickFcValue/100),
    // so the band-matching, displayed value, and fairness all agree. Stamp the
    // resolved value onto the asset so downstream reads stay consistent.
    const assetWithPhase = { ...pk, type: "pick", ownerPhase: originPhase };
    const value = getAssetTradeValue(assetWithPhase, playerMarketMap, leagueContext, tradeMarket);
    if (value < MIN_RETURN_ASSET) continue;
    const { pref, note } = pickPref(pk.round, strategy);
    out.push({ asset: { ...assetWithPhase, value }, value, pref, note });
  }

  return out;
}

/**
 * Pick the return bundle: land the total inside a fair band around `target`,
 * while preferring the strategy-favored shape. Tries a single clean asset
 * first, then a small greedy bundle in preference order.
 */
function assembleReturn(
  candidates: Candidate[],
  target: number,
): { assets: any[]; total: number } | null {
  if (!candidates.length) return null;

  const lo = Math.max(1, Math.round(target * 0.9) - 3);
  const hi = Math.round(target * 1.14) + 4;

  // 1) Single asset inside the band — most-preferred, then closest to target.
  const single = candidates
    .filter((c) => c.value >= lo && c.value <= hi)
    .sort(
      (a, b) => b.pref - a.pref || Math.abs(a.value - target) - Math.abs(b.value - target),
    )[0];
  if (single) return { assets: [single.asset], total: Math.round(single.value) };

  // 2) Greedy bundle in preference order, packing toward the band ceiling.
  const sorted = [...candidates].sort((a, b) => b.pref - a.pref);
  const assets: any[] = [];
  let total = 0;
  for (const c of sorted) {
    if (assets.length >= MAX_RETURN_PIECES) break;
    if (total + c.value <= hi) {
      assets.push(c.asset);
      total += c.value;
    }
    if (total >= lo) break;
  }
  if (assets.length && total >= lo && total <= hi) {
    return { assets, total: Math.round(total) };
  }

  // No bundle lands inside the fair band — surface nothing rather than a
  // lopsided "closest asset". A partner with no fair return simply isn't a match.
  return null;
}

// ---------------------------------------------------------------------------
// Return-asset shaping for the view
// ---------------------------------------------------------------------------

function noteFor(asset: any, strategy: Strategy): string | null {
  if (asset.type === "pick") return pickPref(asset.round, strategy).note;
  return playerPref(asset, num(asset.value), strategy).note;
}

function toReturnAsset(asset: any, value: number, strategy: Strategy): ReturnAsset {
  const isPick = asset.type === "pick";
  return {
    type: asset.type,
    label: isPick ? String(asset.label) : `${asset.name} (${asset.position}, ${asset.score})`,
    value: Math.round(value),
    position: isPick ? null : asset.position ?? null,
    note: noteFor(asset, strategy),
  };
}

function sentToReturnAsset(a: SendAsset, value: number): ReturnAsset {
  return {
    type: a.type,
    label: sendAssetLabel(a),
    value: Math.round(value),
    position: a.type === "player" ? a.position ?? null : null,
    note: null,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function resolveStrategy(phase: TeamPhase | null): Strategy {
  return phase === "rebuild" ? "rebuilder" : "contender";
}

/**
 * Find realistic trade partners for a hand-picked outgoing package.
 *
 * @returns null when there's nothing to work with (no team / no send assets).
 */
export function findTrades(
  myTeam: any,
  leagueTeams: any[] | null | undefined,
  sendAssets: SendAsset[],
  strategy: Strategy,
  leagueContext: any,
  tradeMarket: any,
): FindTradesResult | null {
  if (!myTeam || !Array.isArray(leagueTeams) || !leagueTeams.length) return null;
  if (!sendAssets?.length) return null;

  const playerMarketMap = buildPlayerMarketMap(leagueTeams);
  const phaseByRoster = rosterPhaseMap(leagueTeams);
  const myPhase = phaseOf(myTeam);

  const sendValues = sendAssets.map((a) =>
    getAssetTradeValue(a as any, playerMarketMap, leagueContext, tradeMarket),
  );
  const sendValue = sendValues.reduce((s, v) => s + v, 0);

  const sentPlayerPositions = sendAssets
    .filter((a) => a.type === "player" && a.position)
    .map((a) => a.position as string);
  const sentPositionSet = new Set(sentPlayerPositions);
  const sentPositions = [...sentPositionSet];
  const sendingPlayers = sentPlayerPositions.length > 0;

  const youSend = sendAssets.map((a, i) => sentToReturnAsset(a, sendValues[i]));

  const ideas: TradeIdea[] = [];

  for (const partner of leagueTeams) {
    if (String(partner.rosterId) === String(myTeam.rosterId)) continue;

    // Which of the positions I'm shipping does this partner actually want? A
    // need or a flat-out weak room both qualify.
    const wantPool = new Set<string>([
      ...(partner.needs || []),
      ...(partner.weakRooms || []),
    ]);
    const matchedNeeds = sentPositions.filter((pos) => wantPool.has(pos));

    // The headline filter: when you're sending players, only surface partners
    // who need at least one of those positions. (Pure pick-for-player asks fall
    // back to any partner — anyone will deal a player for capital.)
    if (sendingPlayers && matchedNeeds.length === 0) continue;

    const candidates = partnerCandidates(
      partner,
      strategy,
      playerMarketMap,
      phaseByRoster,
      leagueContext,
      tradeMarket,
    );
    const bundle = assembleReturn(candidates, sendValue);
    if (!bundle || !bundle.assets.length) continue;

    const receiveValues = bundle.assets.map((a) =>
      a.type === "pick"
        ? num(a.value)
        : getAssetTradeValue(a, playerMarketMap, leagueContext, tradeMarket),
    );

    const ev = evaluateTrade(
      sendAssets as any[],
      bundle.assets,
      myPhase || "retool",
      phaseOf(partner) || "retool",
      playerMarketMap,
      leagueContext,
      tradeMarket,
    );

    const rationale =
      buildTradeRationale({
        ownTeam: myTeam,
        partnerTeam: partner,
        outgoing: sendAssets,
        incoming: bundle.assets,
        leagueContext,
      }) || { positives: [], concerns: [] };

    // Lead the rationale with the directed framing so the card reads as an
    // answer to "who wants what I'm shipping, and what do they send back".
    const lead =
      matchedNeeds.length > 0
        ? `${partner.label} is short at ${matchedNeeds.join(" / ")} — exactly what you're sending.`
        : `${partner.label} can spare ${bundle.assets.map((a) => (a.type === "pick" ? "picks" : a.position)).join(" / ")} for the capital you're offering.`;
    const positives = [lead, ...(rationale.positives || [])];

    const incomingValue = receiveValues.reduce((s, v) => s + v, 0);

    // Hard fairness guards — never surface a one-sided deal. The band keeps the
    // raw gap tight; this drops anything the engine still flags Lopsided, or
    // where you'd be giving up materially more than you get back regardless of
    // any phase bonus that might otherwise paper over it.
    if (ev?.fairnessLabel === "Lopsided") continue;
    if (incomingValue < sendValue * 0.82) continue;

    // Rank: realistic-fairness first, then how well the partner's need lines up
    // with what we're sending, then strategy alignment of the partner's phase.
    const fairnessRank: Record<string, number> = {
      Fair: 30,
      "Slight edge": 18,
      Uneven: 6,
      Lopsided: 0,
    };
    const phaseFit =
      (strategy === "rebuilder" && phaseOf(partner) === "contender") ||
      (strategy === "contender" && phaseOf(partner) === "rebuild")
        ? 10
        : 0;
    const fitScore =
      (fairnessRank[ev?.fairnessLabel] ?? 0) +
      matchedNeeds.length * 8 +
      phaseFit +
      Math.round(incomingValue * 0.1);

    ideas.push({
      id: String(partner.rosterId),
      partner: {
        rosterId: partner.rosterId,
        label: partner.label,
        phase: phaseOf(partner),
        needs: partner.needs || [],
      },
      matchedNeeds,
      youSend,
      youGet: bundle.assets.map((a, i) => toReturnAsset(a, receiveValues[i], strategy)),
      outgoingValue: Math.round(sendValue),
      incomingValue: Math.round(incomingValue),
      fairnessLabel: ev?.fairnessLabel ?? "Fair",
      rationale: { positives, concerns: rationale.concerns || [] },
      fitScore,
    });
  }

  ideas.sort((a, b) => b.fitScore - a.fitScore);

  return {
    sendValue: Math.round(sendValue),
    sentPositions,
    ideas: ideas.slice(0, MAX_IDEAS),
  };
}
