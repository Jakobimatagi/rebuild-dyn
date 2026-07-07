// Trade Blueprint Impact — what a proposed trade does to a team's blueprint
// identity. Pure logic, no UI.
//
// Two jobs:
//   1. buildBlueprintImpact({...}) — classify the roster before and after the
//      trade (reusing projectRosterAfterTrade + classifyDraftBlueprint) and
//      report how the team's archetype identity moves.
//   2. classifyMoveType({...}) — name the *shape* of the move (consolidation,
//      pick accumulation, win-now push, ...) from the assets alone.
//
// This is deliberately an identity layer on top of the trade verdict, not a
// value adjustment — evaluateTrade's market math stays untouched.

import {
  DRAFT_BLUEPRINTS,
  classifyDraftBlueprint,
  alignPlayerToBlueprint,
} from "./draftBlueprints.js";
import { projectRosterAfterTrade } from "./tradeEngine.js";
import { classifyTradeType, isNflBackupQb } from "./tradeTypes.js";

// Re-exported for existing consumers (tradePackages, tests).
export { isNflBackupQb };

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// A fit swing this large on the team's current identity is meaningful — one
// player among ~25 only moves roster-level signals a few points.
const FIT_DELTA_MEANINGFUL = 3;

const VERDICT_COLORS = {
  strengthens: "#00f5a0",
  breaks: "#ff6b35",
  shifts: "#ffd84d",
  neutral: "#94a3b8",
};

// A player's forward value (1–130) with graceful fallbacks, mirroring
// draftBlueprints' pVal — used to seat rookies who have no PPG yet.
const pVal = (p) =>
  num(p?.dynastyValue?.value, num(p?.marketValue, num(p?.score, num(p?.value, 0))));


/**
 * Assign every rostered player a lineup role: which starting slot he'd claim
 * (QB1, RB2, FLEX, SF) or his bench depth (QB3). Mirrors calcStarterPPG's
 * allocation exactly — dedicated slots first, then regular flex (non-QB),
 * then superflex — ranked by current PPG with grade as the tiebreak, so a
 * backup QB behind two healthy starters reads as bench even in superflex.
 *
 * @returns {Map<string, { starter: boolean, slot: string }>}
 */
export function computeLineupRoles(enriched, leagueContext) {
  const { starterCounts = {}, flexCount = 0, isSuperflex } = leagueContext || {};
  const roles = new Map();
  const metric = (p) => {
    // An NFL backup QB produces nothing going forward, whatever his trailing
    // PPG says (spot starts inflate it) — never seat him over a real player.
    if (isNflBackupQb(p)) return pVal(p) / 100;
    const ppg = parseFloat(p.ppg);
    if (Number.isFinite(ppg) && ppg > 0) return ppg;
    // No production yet (rookies, lost seasons): seat by forward value on a
    // pseudo-PPG scale so a blue-chip rookie isn't buried behind JAG vets.
    return pVal(p) / 10;
  };
  const pool = [...(enriched || [])].sort(
    (a, b) => metric(b) - metric(a) || num(b.score) - num(a.score),
  );
  const used = new Set();

  // Dedicated position slots.
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    let filled = 0;
    const needed = num(starterCounts[pos]);
    for (const p of pool) {
      if (filled >= needed) break;
      if (used.has(p.id) || p.position !== pos) continue;
      used.add(p.id);
      filled += 1;
      roles.set(String(p.id), { starter: true, slot: `${pos}${filled}` });
    }
  }

  // Regular flex (RB/WR/TE), then superflex (any position).
  const superflexSlots = isSuperflex ? 1 : 0;
  let flexFilled = 0;
  for (const p of pool) {
    if (flexFilled >= flexCount - superflexSlots) break;
    if (used.has(p.id) || p.position === "QB") continue;
    used.add(p.id);
    flexFilled += 1;
    roles.set(String(p.id), { starter: true, slot: "FLEX" });
  }
  let sfFilled = 0;
  for (const p of pool) {
    if (sfFilled >= superflexSlots) break;
    if (used.has(p.id)) continue;
    used.add(p.id);
    sfFilled += 1;
    roles.set(String(p.id), { starter: true, slot: "SF" });
  }

  // Everyone else: bench, labeled with positional depth (QB3, RB4, ...).
  const depth = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of pool) {
    if (depth[p.position] == null) continue;
    depth[p.position] += 1;
    if (used.has(p.id)) continue;
    roles.set(String(p.id), { starter: false, slot: `${p.position}${depth[p.position]}` });
  }
  return roles;
}

/**
 * Name the shape of the move from the assets alone. Delegates to the full
 * dynasty trade-type taxonomy (tradeTypes.js); blueprint verdicts are layered
 * on separately in buildBlueprintImpact.
 * @returns {{ id, label, detail }}
 */
export function classifyMoveType({ outgoing = [], incoming = [], phase = null, team = null }) {
  const typed = classifyTradeType({ outgoing, incoming, team });
  // Phase-flavor the rebuild liquidation detail.
  if ((typed.id === "vetForPick" || typed.id === "pickAccumulation") && phase === "rebuild") {
    return { ...typed, detail: "Stockpiling draft capital for the rebuild" };
  }
  return typed;
}

/**
 * Full blueprint-identity impact of a trade for one team.
 *
 * @param {object} args
 * @param {object} args.team        league team object (valid classifier input)
 * @param {Array}  args.outgoing    assets this team SENDS
 * @param {Array}  args.incoming    assets this team RECEIVES
 * @param {object} args.leagueContext
 * @param {Map}    args.playerMarketMap  sleeperId -> enriched player
 * @returns {null | object} see fields below; null when there's nothing to say.
 */
/**
 * Compare the two sides' blueprint-fit deltas into a single "who does this
 * move fit better" reading — the archetype counterpart to the market
 * fairness label. Lean is on [-1, 1]: positive favors team A, negative
 * favors team B; ±1 means one build clearly wins the identity trade.
 *
 * @param {object|null} impactA  buildBlueprintImpact result for team A
 * @param {object|null} impactB  buildBlueprintImpact result for team B
 * @returns {null | { deltaA, deltaB, diff, lean, tilt: "A"|"B"|"even", strength: "even"|"leans"|"strong" }}
 */
export function compareBuildFit(impactA, impactB) {
  if (!impactA && !impactB) return null;
  const deltaA = num(impactA?.fitDelta);
  const deltaB = num(impactB?.fitDelta);
  const diff = deltaA - deltaB;
  // 12 fit points of separation = full tilt (a whole-identity swing).
  const lean = Math.max(-1, Math.min(1, diff / 12));
  const abs = Math.abs(diff);
  const strength = abs <= 2 ? "even" : abs <= 6 ? "leans" : "strong";
  const tilt = strength === "even" ? "even" : diff > 0 ? "A" : "B";
  return { deltaA, deltaB, diff, lean, tilt, strength };
}

// A top-archetype flip only counts as a real identity shift when the new
// archetype clearly beats the old identity's post-trade fit — near-tie
// reshuffles read as "leaning", not a shift.
const IDENTITY_SHIFT_MARGIN = 5;

// Below this net (trade points, phase-adjusted) a fit gain is beside the
// point — you're losing the value war.
const VALUE_CAUTION_NET = -15;

export function buildBlueprintImpact({
  team,
  outgoing = [],
  incoming = [],
  leagueContext,
  playerMarketMap,
  netValue = null,
}) {
  if (!team?.enriched?.length) return null;
  if (!outgoing.length && !incoming.length) return null;

  const before = classifyDraftBlueprint(team, leagueContext);
  if (!before.top) return null;

  const market = playerMarketMap || new Map();
  const projected = projectRosterAfterTrade(
    team,
    outgoing,
    incoming,
    leagueContext || {},
    market,
  );
  const after = classifyDraftBlueprint(projected, leagueContext);
  if (!after.top) return null;

  // The delta is measured on the PRE-trade identity: "what does this do to the
  // build I'm running today?"
  const beforeIdAfter = after.matches.find((m) => m.id === before.top.id);
  const fitDelta = num(beforeIdAfter?.fit) - before.top.fit;
  const topFlipped = after.top.id !== before.top.id;
  const archetypeChanged =
    topFlipped && after.top.fit - num(beforeIdAfter?.fit) >= IDENTITY_SHIFT_MARGIN;
  const newTop = archetypeChanged ? after.top : null;
  // Near-tie flip: the ranking reshuffled but the old identity is still live.
  const leaningToward = topFlipped && !archetypeChanged ? after.top : null;
  const avgAgeDelta = +(num(projected.avgAge) - num(team.avgAge)).toFixed(1);

  // Signal churn on the same identity, before vs after.
  const beforeSignals = before.top.signals || [];
  const afterSignals = beforeIdAfter?.signals || [];
  const signalsGained = afterSignals.filter((s) => !beforeSignals.includes(s));
  const signalsLost = beforeSignals.filter((s) => !afterSignals.includes(s));

  // Lineup roles: does each incoming piece actually crack the receiver's
  // post-trade lineup, and was each outgoing piece a starter here? An RB2
  // still scores every week; a backup QB means nothing until a spot opens.
  const rolesBefore = computeLineupRoles(team.enriched, leagueContext);
  const rolesAfter = computeLineupRoles(projected.enriched, leagueContext);

  // Tag each incoming player against the team's CURRENT top blueprint.
  const blueprint = DRAFT_BLUEPRINTS[before.top.id];
  const incomingAlignment = incoming
    .filter((a) => a.type === "player")
    .map((a) => {
      const full = market.get(String(a.id)) || a;
      const { tag, reason } = alignPlayerToBlueprint(full, blueprint);
      const role = rolesAfter.get(String(a.id)) || { starter: false, slot: full.position };
      // NFL depth chart trumps fantasy slot: a backup QB means nothing even in
      // your superflex until his starter goes down or he wins the job.
      const nflBackup = isNflBackupQb(full);
      const isRookie = num(full.yearsExp, 0) === 0;
      let roleNote;
      if (nflBackup) {
        const where = full.team && full.team !== "FA" ? ` on ${full.team}` : "";
        roleNote = `NFL backup${where} (depth chart) — no points unless the starter goes down or he wins the job`;
      } else if (role.starter) {
        roleNote = `starts as ${role.slot}`;
      } else if (isRookie) {
        // Rookies have no PPG track record — don't declare them dead weight.
        roleNote = `rookie ${role.slot} — lineup role settles in camp`;
      } else {
        roleNote = `bench ${role.slot} — no weekly points unless a spot opens`;
      }
      return {
        player: full,
        tag,
        reason,
        role,
        nflBackup,
        roleNote,
        roleTone: !nflBackup && role.starter ? "good" : "warn",
        // A bench piece doesn't fill a lineup need today, whatever the capital math says.
        fillsNeed: role.starter && !nflBackup && (team.needs || []).includes(full.position),
      };
    });

  // Losing an NFL backup's fantasy slot isn't losing production — even if he
  // technically occupied a lineup spot, he doesn't count as a departing starter.
  const outgoingStarters = outgoing
    .filter((a) => a.type === "player")
    .map((a) => ({ player: market.get(String(a.id)) || a, role: rolesBefore.get(String(a.id)) }))
    .filter((x) => x.role?.starter && !isNflBackupQb(x.player))
    .map((x) => ({ ...x, roleNote: `was starting as ${x.role.slot}` }));

  // Blueprint verdict overlays the move shape.
  const shape = classifyMoveType({
    outgoing,
    incoming,
    phase: team.teamPhase?.phase || null,
    team,
  });
  let verdict = "neutral";
  let verdictText = shape.detail;
  if (archetypeChanged) {
    verdict = "shifts";
    verdictText = `Tilts you from ${before.top.label} toward ${after.top.label}`;
  } else if (fitDelta >= FIT_DELTA_MEANINGFUL) {
    verdict = "strengthens";
    verdictText = `Pushes you further into ${before.top.label}`;
  } else if (fitDelta <= -FIT_DELTA_MEANINGFUL) {
    verdict = "breaks";
    verdictText = `Cuts against your ${before.top.label} build`;
  }

  // Fit is not value: a green identity arrow on a deal you're clearly losing
  // reads as endorsement, so mute the praise and say the quiet part.
  const valueCaution = Number.isFinite(Number(netValue)) && Number(netValue) <= VALUE_CAUTION_NET;
  let verdictColor = VERDICT_COLORS[verdict];
  if (valueCaution && verdict === "strengthens") {
    verdictText += " — but you're losing the value war";
    verdictColor = VERDICT_COLORS.shifts;
  }

  return {
    before,
    after,
    projected,
    fitDelta,
    archetypeChanged,
    newTop,
    leaningToward,
    avgAgeDelta,
    signalsGained,
    signalsLost,
    incomingAlignment,
    outgoingStarters,
    moveType: {
      id: shape.id,
      label: shape.label,
      detail: verdictText,
      verdict,
      valueCaution,
      color: verdictColor,
    },
  };
}
