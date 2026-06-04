/**
 * tradeTargets.ts
 *
 * Logic layer for the Trade Targets feature. Pure functions — no React, no DOM.
 * Consumes the JS trade engine primitives and produces a fully typed
 * `TradeTargetsModel` that the presentation layer renders.
 *
 * Four trade archetypes:
 *   - buy-low     : opponent players the market undervalues vs. their production
 *   - sell-high   : your players at peak market value with weakening fundamentals
 *   - tier-down   : trade one of your elites for a near-tier player + a bridge pick
 *   - insulation  : (rebuild) flip aging vets to contenders for picks / young talent
 */

// The engine is plain JS; imports come in untyped (`any`), which is fine here —
// this module is the typed boundary around it.
import {
  getAssetTradeValue,
  assembleFairPackage,
  evaluateTrade,
  buildTradeRationale,
} from "./tradeEngine";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type Strategy = "contender" | "rebuilder";
export type TeamPhase = "contender" | "retool" | "rebuild";
export type Position = "QB" | "RB" | "WR" | "TE" | string;
export type TradeArchetypeId = "buy-low" | "sell-high" | "tier-down" | "insulation";

/** The subset of an enriched Sleeper player this feature reads. */
export interface PlayerLike {
  id: string | number;
  name: string;
  position: Position;
  age?: number | null;
  team?: string | null;
  score?: number | null;
  ppg?: number | string | null;
  archetype?: string | null;
  verdict?: string | null;
  fantasyCalcValue?: number | null;
  rosterAuditValue?: number | null;
  dynastyMarketValue?: number | null;
  fantasyCalcTrend?: number | null;
  draftRound?: number | null;
  ocOutlook?: OcOutlook | null;
}

export interface OcOutlook {
  ocName: string;
  multiplierPct?: number | null;
  projectedPpg?: number | null;
  baselinePpg?: number | null;
  schemes?: string[];
  isFirstYearOC?: boolean;
}

export interface Pick {
  id?: string | number;
  season: string | number;
  round: number;
  label: string;
  ownerPhase?: TeamPhase | null;
}

/** A league team as surfaced by the roster/analysis pipeline. */
export interface LeagueTeam {
  rosterId: number | string;
  label: string;
  teamPhase?: { phase?: TeamPhase | null } | null;
  needs?: string[];
  surplusPositions?: string[];
  enriched: PlayerLike[];
  /** Players you could realistically acquire from this team (untouchables excluded). */
  targetablePlayers?: PlayerLike[];
  /** Your own sellable assets (only meaningful on your team). */
  tradeablePlayers?: PlayerLike[];
  picks?: Pick[];
}

/** Resolved view of the user's team plus the active strategy toggle. */
export interface UserRosterState {
  rosterId: number | string;
  label: string;
  detectedPhase: TeamPhase | null;
  strategy: Strategy;
  needs: string[];
  surplusPositions: string[];
}

/** The headline "Market vs. Production" comparison rendered per target. */
export interface ValueGap {
  /** FC / community-perceived value, on the display scale (~1–90). */
  marketValue: number;
  /** RosterAudit / production-expected value, same scale. */
  expectedValue: number;
  /** expectedValue − marketValue (positive ⇒ market undervalues the player). */
  delta: number;
  deltaPct: number;
  direction: "undervalued" | "overvalued" | "fair";
}

export interface SendAsset {
  type: "player" | "pick";
  label: string;
  value: number;
  position: string | null;
}

/** How matchable a counterparty is for a given deal. */
export interface PartnerMatch {
  rosterId: number | string;
  label: string;
  phase: TeamPhase | null;
  needs: string[];
  matchScore: number;
}

export interface TradeRationale {
  positives: string[];
  concerns: string[];
}

export interface TradeTarget {
  /** Stable, unique within a model: `${archetype}:${ownerRosterId}:${playerId}`. */
  id: string;
  archetype: TradeArchetypeId;
  player: {
    id: string | number;
    name: string;
    position: Position;
    age: number | null;
    team: string | null;
    score: number | null;
    ppg: number | string | null;
    archetype: string | null;
    ocOutlook: OcOutlook | null;
  };
  /** The counterparty. For sell-high this is your own team. */
  owner: PartnerMatch;
  valueGap: ValueGap;
  /** Assets you'd send (acquisitions) or move (sell-high). */
  send: SendAsset[];
  /** Assets you'd receive. Empty for sell-high (it's a "shop this" flag). */
  receive: SendAsset[];
  outgoingValue: number;
  incomingValue: number;
  fairnessLabel: string;
  rationale: TradeRationale;
  fitScore: number;
}

export interface ArchetypeResult {
  archetype: TradeArchetypeId;
  title: string;
  blurb: string;
  /** Whether this archetype is primary for the active strategy. */
  primary: boolean;
  targets: TradeTarget[];
}

export interface TradeTargetsModel {
  user: UserRosterState;
  results: Record<TradeArchetypeId, ArchetypeResult>;
  /** Convenience ordering for tabs — primary archetypes first. */
  order: TradeArchetypeId[];
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const FC_SCALE = 100;
/** Below this trade value a player is roster filler, not a target worth surfacing. */
const MIN_TARGET_VALUE = 12;
/** Tier-down only fires off genuinely top-tier assets, not mid starters. */
const ELITE_VALUE = 40;
/** |deltaPct| at/above which we call the value gap meaningful. */
const GAP_PCT = 12;
const MAX_PER_LIST = 8;

// Aging curves where a vet's dynasty value depreciates fastest.
const AGING_THRESHOLD: Record<string, number> = { RB: 26, WR: 29, TE: 30, QB: 33 };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function assetLabel(asset: any): string {
  if (asset.type === "pick") return asset.label;
  return `${asset.name} (${asset.position}, ${asset.score})`;
}

function toSendAsset(asset: any): SendAsset {
  return {
    type: asset.type,
    label: assetLabel(asset),
    value: Math.round(num(asset.value)),
    position: asset.type === "player" ? asset.position : null,
  };
}

function phaseOf(team: LeagueTeam): TeamPhase | null {
  return team.teamPhase?.phase ?? null;
}

function isAgingVet(p: PlayerLike): boolean {
  const age = num(p.age, 0);
  const threshold = AGING_THRESHOLD[p.position] ?? 30;
  return age >= threshold;
}

/**
 * A player with no FantasyCalc *and* no RosterAudit value (so dmv collapses to
 * 0) is off the dynasty market entirely — a washed vet or deep-bench body.
 * They aren't worth trading for or building a package around, so we never
 * surface them as targets or use them as trade pieces.
 */
function hasMarketValue(p: PlayerLike): boolean {
  return num(p.dynastyMarketValue) > 0 || num(p.fantasyCalcValue) > 0 || num(p.rosterAuditValue) > 0;
}

/** Value a pick on the same dmv/FC_SCALE scale as players (not score-scale). */
function pickTradeValue(
  pk: Pick,
  partner: LeagueTeam,
  playerMarketMap: Map<string, PlayerLike>,
  leagueContext: any,
  tradeMarket: any,
): number {
  return getAssetTradeValue(
    { ...pk, type: "pick", ownerPhase: phaseOf(partner) },
    playerMarketMap,
    leagueContext,
    tradeMarket,
  );
}

/** FC-vs-RA value gap, on the display (÷100) scale. */
export function computeValueGap(p: PlayerLike): ValueGap {
  const fc = num(p.fantasyCalcValue);
  const ra = num(p.rosterAuditValue);
  const dmv = num(p.dynastyMarketValue);

  const marketValue = Math.round((fc > 0 ? fc : dmv) / FC_SCALE);
  // When RA is missing we can't claim a gap — expected falls back to market.
  const expectedValue = Math.round((ra > 0 ? ra : fc > 0 ? fc : dmv) / FC_SCALE);

  const delta = expectedValue - marketValue;
  const base = marketValue || 1;
  const deltaPct = Math.round((delta / base) * 100);
  const direction =
    deltaPct >= GAP_PCT ? "undervalued" : deltaPct <= -GAP_PCT ? "overvalued" : "fair";

  return { marketValue, expectedValue, delta, deltaPct, direction };
}

function buildPlayerMarketMap(leagueTeams: LeagueTeam[]): Map<string, PlayerLike> {
  return new Map(
    leagueTeams.flatMap((team) =>
      (team.enriched || []).map((p) => [String(p.id), p] as [string, PlayerLike]),
    ),
  );
}

function targetPlayerShape(p: PlayerLike) {
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    age: p.age ?? null,
    team: p.team ?? null,
    score: p.score ?? null,
    ppg: p.ppg ?? null,
    archetype: p.archetype ?? null,
    ocOutlook: p.ocOutlook ?? null,
  };
}

/**
 * How good a counterparty is for a deal centered on `target`.
 *  +  contenders who need immediate points will move a struggling player
 *  −  a fellow rebuilder has no reason to sell cheap upside
 */
function partnerMatchScore(partner: LeagueTeam, target: PlayerLike): number {
  const phase = phaseOf(partner);
  let s = 50;
  if (phase === "contender") s += 12;
  if (phase === "rebuild") s -= 10;
  if ((partner.needs || []).includes(target.position)) s += 8;
  return clamp(s, 0, 100);
}

function toPartnerMatch(partner: LeagueTeam, target: PlayerLike): PartnerMatch {
  return {
    rosterId: partner.rosterId,
    label: partner.label,
    phase: phaseOf(partner),
    needs: partner.needs || [],
    matchScore: partnerMatchScore(partner, target),
  };
}

// ---------------------------------------------------------------------------
// Archetype: Buy Low
// ---------------------------------------------------------------------------
// Opponent players the market is discounting (FC < RA, sinking FC trend, or a
// recent ppg dip) but who retain talent / draft capital. Strategy flips the age
// lens: contenders chase proven vets, rebuilders chase young upside.

function buildBuyLow(
  myTeam: LeagueTeam,
  leagueTeams: LeagueTeam[],
  strategy: Strategy,
  playerMarketMap: Map<string, PlayerLike>,
  leagueContext: any,
  tradeMarket: any,
): TradeTarget[] {
  const myPhase = phaseOf(myTeam);
  const out: TradeTarget[] = [];

  for (const partner of leagueTeams) {
    if (partner.rosterId === myTeam.rosterId) continue;

    for (const target of partner.targetablePlayers || []) {
      if (!hasMarketValue(target)) continue;
      const targetValue = getAssetTradeValue(
        { ...target, type: "player" },
        playerMarketMap,
        leagueContext,
        tradeMarket,
      );
      if (targetValue < MIN_TARGET_VALUE) continue;

      const gap = computeValueGap(target);
      const trend = num(target.fantasyCalcTrend);
      const score = num(target.score);
      const ppg = num(target.ppg);

      // Buy-low signal: market discount vs production, a falling price, or a
      // talented player whose recent box score is lagging their dynasty grade.
      // Never surface a player the market is actively *over*-pricing — that
      // would contradict the "buy low" framing the value gap renders.
      const slumpingTalent = score >= 60 && ppg > 0 && ppg < 9;
      const discounted =
        gap.direction === "undervalued" ||
        ((trend < 0 || slumpingTalent) && gap.direction !== "overvalued");
      if (!discounted) continue;

      // Strategy lens on age/profile.
      const age = num(target.age, 26);
      const youngUpside = age <= 24 || score >= 70;
      const provenVet = age >= 25 && ppg >= 8;
      if (strategy === "rebuilder" && !youngUpside) continue;
      if (strategy === "contender" && !provenVet && !(score >= 75)) continue;

      const built = buildAcquisition(
        target,
        targetValue,
        partner,
        myTeam,
        myPhase,
        "buy-low",
        playerMarketMap,
        leagueContext,
        tradeMarket,
      );
      if (built) out.push(built);
    }
  }

  return rank(out);
}

// ---------------------------------------------------------------------------
// Archetype: Sell High
// ---------------------------------------------------------------------------
// Your players whose market price tops their production (FC > RA), or who sit at
// a trend peak while aging — sell before the inevitable slide. This is a "shop
// this asset" flag, not a packaged offer.

function buildSellHigh(myTeam: LeagueTeam, strategy: Strategy): TradeTarget[] {
  const out: TradeTarget[] = [];

  for (const p of myTeam.tradeablePlayers || []) {
    const gap = computeValueGap(p);
    const market = gap.marketValue;
    if (market < MIN_TARGET_VALUE) continue;

    const trend = num(p.fantasyCalcTrend);
    const aging = isAgingVet(p);
    const verdict = (p.verdict || "").toLowerCase();

    const overpriced = gap.direction === "overvalued";
    const peakAndAging = aging && (trend >= 0 || num(p.ppg) >= 10);
    const flaggedSell = verdict === "sell" || verdict === "cut";

    if (!overpriced && !peakAndAging && !flaggedSell) continue;

    // Strategy: contenders cash out aging vets/spec youth at peak; rebuilders
    // especially want to move declining vets before they crater.
    if (strategy === "rebuilder" && !aging && !overpriced) continue;

    const positives: string[] = [];
    const concerns: string[] = [];
    if (overpriced) {
      positives.push(
        `Market price (${gap.marketValue}) is running ${Math.abs(gap.deltaPct)}% ahead of production value (${gap.expectedValue}) — sell the perception.`,
      );
    }
    if (aging) {
      concerns.push(
        `Past the ${p.position} aging cliff at ${num(p.age)} — dynasty value depreciates from here.`,
      );
    }
    if (trend > 0) {
      positives.push("FantasyCalc price is trending up — strike while demand is hot.");
    }
    if (num(p.ppg) >= 10) {
      positives.push(`Still posting ${num(p.ppg)} PPG, so contenders will pay starter prices.`);
    }

    out.push({
      id: `sell-high:${myTeam.rosterId}:${p.id}`,
      archetype: "sell-high",
      player: targetPlayerShape(p),
      owner: {
        rosterId: myTeam.rosterId,
        label: "Your roster",
        phase: phaseOf(myTeam),
        needs: myTeam.needs || [],
        matchScore: 0,
      },
      valueGap: gap,
      send: [
        {
          type: "player",
          label: assetLabel({ ...p, type: "player" }),
          value: market,
          position: p.position,
        },
      ],
      receive: [],
      outgoingValue: market,
      incomingValue: 0,
      fairnessLabel: overpriced ? "Sell high" : aging ? "Sell before decline" : "Shop now",
      rationale: { positives, concerns },
      fitScore: market + Math.max(0, -gap.deltaPct) + (aging ? 8 : 0),
    });
  }

  return out.sort((a, b) => b.fitScore - a.fitScore).slice(0, MAX_PER_LIST);
}

// ---------------------------------------------------------------------------
// Archetype: Tier-Down
// ---------------------------------------------------------------------------
// Trade one of your elite assets for either a near-tier player at the same
// position PLUS a bridge pick (precise tier-down), or — when no equal-tier
// replacement exists in the league — a haul of picks + young talent from a
// contender (a premium-stud flip). Both convert top-end value into breadth.

/** A resolved return package for tiering down off one elite. */
interface TierDownDeal {
  receiveAssets: any[];
  incomingValue: number;
  /** What the card leads with — a player, or a pick stand-in if all-picks. */
  headline: PlayerLike;
  /** Lead positive line, framed to the deal shape. */
  lead: string;
}

/**
 * Sell-side elites worth tiering down from. `tradeablePlayers` deliberately
 * holds back the #1 player at each position, but those premium studs are
 * exactly the assets a rebuilder flips to a contender for a haul. So we widen
 * the pool to any enriched player whose trade value clears ELITE_VALUE, deduped
 * against the already-tradeable list.
 */
function eliteSellPool(
  myTeam: LeagueTeam,
  playerMarketMap: Map<string, PlayerLike>,
  leagueContext: any,
  tradeMarket: any,
): { p: PlayerLike; value: number }[] {
  const seen = new Set<string>();
  const pool: { p: PlayerLike; value: number }[] = [];
  for (const p of [...(myTeam.tradeablePlayers || []), ...(myTeam.enriched || [])]) {
    const key = String(p.id);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!hasMarketValue(p)) continue;
    const value = getAssetTradeValue({ ...p, type: "player" }, playerMarketMap, leagueContext, tradeMarket);
    if (value < ELITE_VALUE) continue;
    pool.push({ p, value });
  }
  return pool.sort((a, b) => b.value - a.value).slice(0, 4);
}

/** Precise tier-down: a near-tier same-position player + a bridge pick. */
function nearTierDeal(
  elite: { p: PlayerLike; value: number },
  partner: LeagueTeam,
  strategy: Strategy,
  playerMarketMap: Map<string, PlayerLike>,
  leagueContext: any,
  tradeMarket: any,
): TierDownDeal | null {
  const lo = elite.value * 0.55;
  const hi = elite.value * 0.9;

  // A near-tier player at the SAME position, a clear step below your elite.
  const candidate = (partner.targetablePlayers || [])
    .filter(
      (p) =>
        p.position === elite.p.position &&
        hasMarketValue(p) &&
        // A rebuilder tiering down should not take on an aging vet — that
        // imports the exact depreciation a rebuild is trying to avoid.
        !(strategy === "rebuilder" && isAgingVet(p)),
    )
    .map((p) => ({
      p,
      value: getAssetTradeValue({ ...p, type: "player" }, playerMarketMap, leagueContext, tradeMarket),
    }))
    .filter((c) => c.value >= lo && c.value <= hi)
    .sort((a, b) => b.value - a.value)[0];
  if (!candidate) return null;

  // A bridge pick from that team to close the gap to fair. Valued on the player
  // trade scale so a deep future pick reads as worthless, not inflated.
  const gapNeeded = elite.value - candidate.value;
  const bridge = (partner.picks || [])
    .map((pk) => ({
      pk,
      value: pickTradeValue(pk, partner, playerMarketMap, leagueContext, tradeMarket),
    }))
    .filter((b) => b.value > 0)
    .sort((a, b) => Math.abs(a.value - gapNeeded) - Math.abs(b.value - gapNeeded))[0];
  if (!bridge) return null;

  return {
    receiveAssets: [
      { ...candidate.p, type: "player", value: candidate.value },
      { ...bridge.pk, type: "pick", value: bridge.value },
    ],
    incomingValue: Math.round(candidate.value + bridge.value),
    headline: candidate.p,
    lead: `Turn ${elite.p.name} into ${candidate.p.name} + ${bridge.pk.label} — keep ~90% of the on-field production and bank a pick.`,
  };
}

/**
 * Premium-stud flip: when no near-tier same-position player exists in the
 * league (e.g. a top-3 QB nobody can match), sell the elite to a contender for
 * a haul of picks + young talent. This is how a #1-at-position asset actually
 * gets moved in a rebuild — quantity and youth for one irreplaceable stud.
 */
function haulDeal(
  elite: { p: PlayerLike; value: number },
  partner: LeagueTeam,
  playerMarketMap: Map<string, PlayerLike>,
  leagueContext: any,
  tradeMarket: any,
): TierDownDeal | null {
  // Only a win-now buyer pays a haul for someone else's elite.
  if (phaseOf(partner) === "rebuild") return null;

  // Demand a slight premium: you're giving up your single best, irreplaceable asset.
  const lo = elite.value * 0.95;
  const hi = elite.value * 1.25;

  const picks = (partner.picks || [])
    .filter((pk) => pk.round <= 3)
    .map((pk) => {
      const value = pickTradeValue(pk, partner, playerMarketMap, leagueContext, tradeMarket);
      return { asset: { ...pk, type: "pick" as const, ownerPhase: phaseOf(partner), value }, value };
    });
  const youngsters = (partner.targetablePlayers || [])
    .filter((p) => !isAgingVet(p) && hasMarketValue(p))
    .map((p) => {
      const value = getAssetTradeValue({ ...p, type: "player" }, playerMarketMap, leagueContext, tradeMarket);
      return { asset: { ...p, type: "player" as const, value }, value };
    });

  const bundle = pickBundle([...picks, ...youngsters], lo, hi);
  if (!bundle) return null;

  // Prefer a real player as the card headline; fall back to a pick stand-in.
  const headlineAsset = bundle.assets.find((a) => a.type === "player") ?? bundle.assets[0];
  const headline: PlayerLike =
    headlineAsset.type === "player"
      ? (headlineAsset as PlayerLike)
      : ({ id: headlineAsset.id ?? headlineAsset.label, name: headlineAsset.label, position: "PICK" } as PlayerLike);

  return {
    receiveAssets: bundle.assets,
    incomingValue: bundle.total,
    headline,
    lead: `Flip ${elite.p.name} to a contender that needs the upgrade — cash your top asset in for ${bundle.assets.map((a) => assetLabel(a)).join(" + ")} while his value is peaking.`,
  };
}

function buildTierDown(
  myTeam: LeagueTeam,
  leagueTeams: LeagueTeam[],
  strategy: Strategy,
  playerMarketMap: Map<string, PlayerLike>,
  leagueContext: any,
  tradeMarket: any,
): TradeTarget[] {
  const myPhase = phaseOf(myTeam);
  const elites = eliteSellPool(myTeam, playerMarketMap, leagueContext, tradeMarket);
  const out: TradeTarget[] = [];

  for (const elite of elites) {
    for (const partner of leagueTeams) {
      if (partner.rosterId === myTeam.rosterId) continue;

      // Contenders tier down into a near-tier starter + pick. Rebuilders also
      // flip premium studs that have no equal-tier replacement for a haul.
      const deal =
        nearTierDeal(elite, partner, strategy, playerMarketMap, leagueContext, tradeMarket) ??
        (strategy === "rebuilder"
          ? haulDeal(elite, partner, playerMarketMap, leagueContext, tradeMarket)
          : null);
      if (!deal) continue;

      const outgoing = [{ ...elite.p, type: "player" }];
      const ev = evaluateTrade(
        outgoing,
        deal.receiveAssets,
        myPhase,
        phaseOf(partner),
        playerMarketMap,
        leagueContext,
        tradeMarket,
      );

      const rationale = buildTradeRationale({
        ownTeam: myTeam,
        partnerTeam: partner,
        outgoing,
        incoming: deal.receiveAssets,
        leagueContext,
      });

      out.push({
        id: `tier-down:${partner.rosterId}:${elite.p.id}`,
        archetype: "tier-down",
        player: targetPlayerShape(deal.headline),
        owner: toPartnerMatch(partner, deal.headline),
        valueGap: computeValueGap(deal.headline),
        send: [
          {
            type: "player",
            label: assetLabel({ ...elite.p, type: "player" }),
            value: Math.round(elite.value),
            position: elite.p.position,
          },
        ],
        receive: deal.receiveAssets.map(toSendAsset),
        outgoingValue: Math.round(elite.value),
        incomingValue: deal.incomingValue,
        fairnessLabel: ev?.fairnessLabel ?? "Fair",
        rationale: {
          positives: [deal.lead, ...(rationale?.positives || [])],
          concerns: rationale?.concerns || [],
        },
        fitScore: deal.incomingValue + (ev?.teamA?.netValue > 0 ? 6 : 0),
      });
    }
  }

  return rank(out);
}

// ---------------------------------------------------------------------------
// Archetype: Insulation (rebuild)
// ---------------------------------------------------------------------------
// Flip aging, high-scoring vets to contenders for future picks / young talent —
// insulating the rebuild from the vets' coming depreciation.

function buildInsulation(
  myTeam: LeagueTeam,
  leagueTeams: LeagueTeam[],
  playerMarketMap: Map<string, PlayerLike>,
  leagueContext: any,
  tradeMarket: any,
): TradeTarget[] {
  const myPhase = phaseOf(myTeam);

  const vets = (myTeam.tradeablePlayers || [])
    .filter((p) => isAgingVet(p) && num(p.ppg) >= 8 && hasMarketValue(p))
    .map((p) => ({
      p,
      value: getAssetTradeValue({ ...p, type: "player" }, playerMarketMap, leagueContext, tradeMarket),
    }))
    .filter((v) => v.value >= MIN_TARGET_VALUE)
    .sort((a, b) => b.value - a.value);

  const out: TradeTarget[] = [];

  for (const vet of vets) {
    const lo = vet.value * 0.85;
    const hi = vet.value * 1.18;

    for (const partner of leagueTeams) {
      if (partner.rosterId === myTeam.rosterId) continue;
      // Vets insulate a rebuild only if a contender wants them now.
      if (phaseOf(partner) === "rebuild") continue;

      // Future picks first, then ascending young talent.
      const picks = (partner.picks || [])
        .filter((pk) => pk.round <= 2)
        .map((pk) => ({
          asset: { ...pk, type: "pick" as const, ownerPhase: phaseOf(partner) },
          value: pickTradeValue(pk, partner, playerMarketMap, leagueContext, tradeMarket),
        }));
      const youngsters = (partner.targetablePlayers || [])
        .filter((p) => num(p.age, 99) <= 23 && hasMarketValue(p))
        .map((p) => ({
          asset: { ...p, type: "player" as const },
          value: getAssetTradeValue({ ...p, type: "player" }, playerMarketMap, leagueContext, tradeMarket),
        }));

      const incoming = pickBundle([...picks, ...youngsters], lo, hi);
      if (!incoming) continue;

      const ev = evaluateTrade(
        [{ ...vet.p, type: "player" }],
        incoming.assets,
        myPhase,
        phaseOf(partner),
        playerMarketMap,
        leagueContext,
        tradeMarket,
      );

      const headline = incoming.assets[0];
      out.push({
        id: `insulation:${partner.rosterId}:${vet.p.id}`,
        archetype: "insulation",
        player: targetPlayerShape(
          headline.type === "player"
            ? (headline as PlayerLike)
            : ({
                id: headline.id ?? headline.label,
                name: headline.label,
                position: "PICK",
              } as PlayerLike),
        ),
        owner: toPartnerMatch(partner, vet.p),
        valueGap: computeValueGap(vet.p),
        send: [
          {
            type: "player",
            label: assetLabel({ ...vet.p, type: "player" }),
            value: Math.round(vet.value),
            position: vet.p.position,
          },
        ],
        receive: incoming.assets.map(toSendAsset),
        outgoingValue: Math.round(vet.value),
        incomingValue: incoming.total,
        fairnessLabel: ev?.fairnessLabel ?? "Fair",
        rationale: {
          positives: [
            `${vet.p.name} (${num(vet.p.age)}, ${num(vet.p.ppg)} PPG) is at peak sale value — convert him to ${incoming.assets.map((a) => assetLabel(a)).join(" + ")} before the aging curve bites.`,
          ],
          concerns:
            phaseOf(partner) === "contender"
              ? []
              : ["Partner isn't a clear win-now buyer — may need a sweetener."],
        },
        fitScore: incoming.total + (phaseOf(partner) === "contender" ? 10 : 0),
      });
    }
  }

  return rank(out);
}

// ---------------------------------------------------------------------------
// Shared assembly
// ---------------------------------------------------------------------------

/** Acquire an opponent player by assembling a fair package from YOUR assets. */
function buildAcquisition(
  target: PlayerLike,
  targetValue: number,
  partner: LeagueTeam,
  myTeam: LeagueTeam,
  myPhase: TeamPhase | null,
  archetype: TradeArchetypeId,
  playerMarketMap: Map<string, PlayerLike>,
  leagueContext: any,
  tradeMarket: any,
): TradeTarget | null {
  const offer = assembleFairPackage(
    myTeam,
    targetValue,
    partner,
    playerMarketMap,
    leagueContext,
    tradeMarket,
  );
  if (!offer?.assets?.length) return null;

  const targetAsset = { ...target, type: "player" };
  const ev = evaluateTrade(
    offer.assets,
    [targetAsset],
    myPhase,
    phaseOf(partner),
    playerMarketMap,
    leagueContext,
    tradeMarket,
  );
  const rationale = buildTradeRationale({
    ownTeam: myTeam,
    partnerTeam: partner,
    outgoing: offer.assets,
    incoming: [targetAsset],
    leagueContext,
  });

  const gap = computeValueGap(target);
  const fillsNeed = (myTeam.needs || []).includes(target.position);
  const match = toPartnerMatch(partner, target);

  return {
    id: `${archetype}:${partner.rosterId}:${target.id}`,
    archetype,
    player: targetPlayerShape(target),
    owner: match,
    valueGap: gap,
    send: offer.assets.map(toSendAsset),
    receive: [
      {
        type: "player",
        label: assetLabel(targetAsset),
        value: Math.round(targetValue),
        position: target.position,
      },
    ],
    outgoingValue: Math.round(num(offer.outgoingValue)),
    incomingValue: Math.round(targetValue),
    fairnessLabel: ev?.fairnessLabel ?? "Fair",
    rationale: rationale || { positives: [], concerns: [] },
    fitScore:
      targetValue +
      (fillsNeed ? 12 : 0) +
      Math.round(match.matchScore * 0.12) +
      clamp(gap.deltaPct, -10, 15) -
      Math.abs(num(ev?.teamA?.netValue)) * 0.5,
  };
}

/** Greedy pack of assets whose total lands in [lo, hi]; prefers a single asset. */
function pickBundle(
  pool: { asset: any; value: number }[],
  lo: number,
  hi: number,
): { assets: any[]; total: number } | null {
  const usable = pool.filter((a) => a.value > 0);
  if (!usable.length) return null;

  const single = usable
    .filter((a) => a.value >= lo && a.value <= hi)
    .sort((a, b) => a.value - b.value)[0];
  if (single) return { assets: [single.asset], total: Math.round(single.value) };

  const sorted = [...usable].sort((a, b) => b.value - a.value);
  const assets: any[] = [];
  let total = 0;
  for (const a of sorted) {
    if (assets.length >= 3) break;
    if (total + a.value <= hi) {
      assets.push(a.asset);
      total += a.value;
    }
    if (total >= lo) break;
  }
  return assets.length && total >= lo && total <= hi
    ? { assets, total: Math.round(total) }
    : null;
}

function rank(list: TradeTarget[]): TradeTarget[] {
  return list
    .sort((a, b) => b.fitScore - a.fitScore)
    .filter(
      (entry, i, arr) =>
        arr.findIndex(
          (o) => o.owner.rosterId === entry.owner.rosterId && o.player.id === entry.player.id,
        ) === i,
    )
    .slice(0, MAX_PER_LIST);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

const META: Record<TradeArchetypeId, { title: string; blurb: string }> = {
  "buy-low": {
    title: "Buy Low",
    blurb: "Market is discounting these players below their production — pounce before it corrects.",
  },
  "sell-high": {
    title: "Sell High",
    blurb: "Your assets priced above their fundamentals. Cash out before the slide.",
  },
  "tier-down": {
    title: "Tier-Down",
    blurb: "Convert an elite into a near-tier starter plus a pick — or flip a premium stud to a contender for a haul of picks and young talent.",
  },
  insulation: {
    title: "Value Insulation",
    blurb: "Flip aging vets to contenders for picks and young talent.",
  },
};

/** Which archetypes lead for each strategy. */
const PRIMARY: Record<Strategy, TradeArchetypeId[]> = {
  contender: ["buy-low", "tier-down", "sell-high", "insulation"],
  rebuilder: ["insulation", "buy-low", "sell-high", "tier-down"],
};

export function resolveStrategy(phase: TeamPhase | null): Strategy {
  // Retool / unknown defaults to contender framing; the UI lets the user flip it.
  return phase === "rebuild" ? "rebuilder" : "contender";
}

/**
 * Build the full typed model. `strategyOverride` comes from the UI toggle; when
 * absent we infer it from the detected team phase.
 */
export function buildTradeTargetsModel(
  myTeam: LeagueTeam | undefined | null,
  leagueTeams: LeagueTeam[] | undefined | null,
  leagueContext: any,
  tradeMarket: any,
  strategyOverride?: Strategy,
): TradeTargetsModel | null {
  if (!myTeam || !Array.isArray(leagueTeams) || !leagueTeams.length) return null;

  const detectedPhase = phaseOf(myTeam);
  const strategy = strategyOverride ?? resolveStrategy(detectedPhase);
  const playerMarketMap = buildPlayerMarketMap(leagueTeams);

  const buyLow = buildBuyLow(myTeam, leagueTeams, strategy, playerMarketMap, leagueContext, tradeMarket);
  const sellHigh = buildSellHigh(myTeam, strategy);
  const tierDown = buildTierDown(myTeam, leagueTeams, strategy, playerMarketMap, leagueContext, tradeMarket);
  const insulation = buildInsulation(myTeam, leagueTeams, playerMarketMap, leagueContext, tradeMarket);

  const order = PRIMARY[strategy];
  const primaryId = order[0];

  const make = (archetype: TradeArchetypeId, targets: TradeTarget[]): ArchetypeResult => ({
    archetype,
    title: META[archetype].title,
    blurb: META[archetype].blurb,
    primary: archetype === primaryId,
    targets,
  });

  return {
    user: {
      rosterId: myTeam.rosterId,
      label: myTeam.label,
      detectedPhase,
      strategy,
      needs: myTeam.needs || [],
      surplusPositions: myTeam.surplusPositions || [],
    },
    results: {
      "buy-low": make("buy-low", buyLow),
      "sell-high": make("sell-high", sellHigh),
      "tier-down": make("tier-down", tierDown),
      insulation: make("insulation", insulation),
    },
    order,
  };
}
