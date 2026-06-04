// Live draft tracking for in-progress Sleeper drafts (startup, rookie, or
// in-season). Turns the raw Sleeper draft object + picks feed into a view model:
// who is on the clock, each team's roster as it fills out, and the running board.
//
// Everything here is pure so it can be unit-tested and re-run cheaply on every
// poll. The component owns the polling; this module owns the math.

// Which drafted positions can fill which lineup slot.
const SLOT_ELIGIBILITY = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  WRRB_WT: ["RB", "WR"],
  WRTE_FLEX: ["WR", "TE"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  IDP_FLEX: ["DL", "LB", "DB"],
  DL: ["DL"],
  LB: ["LB"],
  DB: ["DB"],
};

// Slots that aren't part of the starting lineup — everything else is a starter.
const NON_STARTER_SLOTS = new Set(["BN", "IR", "TAXI"]);

// Canonical display order for position grades.
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"];

/**
 * The positions worth grading for this league, derived from which positions its
 * lineup slots can actually start (so a 1QB league won't show a QB hole the same
 * way a Superflex one does, and IDP leagues surface their positions).
 */
function relevantPositionsFor(rosterPositions) {
  const found = new Set();
  for (const slot of rosterPositions || []) {
    if (NON_STARTER_SLOTS.has(slot)) continue;
    for (const pos of SLOT_ELIGIBILITY[slot] || []) found.add(pos);
  }
  const ordered = POSITION_ORDER.filter((p) => found.has(p));
  // Append any eligible positions we don't have an explicit order for.
  for (const p of found) if (!ordered.includes(p)) ordered.push(p);
  return ordered;
}

// Human label for a lineup slot code.
export function slotDisplayLabel(slot) {
  switch (slot) {
    case "SUPER_FLEX":
      return "SF";
    case "WRRB_FLEX":
    case "WRRB_WT":
      return "W/R";
    case "WRTE_FLEX":
    case "REC_FLEX":
      return "W/T";
    case "FLEX":
      return "FLEX";
    case "IDP_FLEX":
      return "IDP";
    default:
      return slot;
  }
}

/**
 * Resolve the draft-slot count (teams per round). Falls back across the several
 * places Sleeper exposes it so we work even on sparse pre-draft payloads.
 */
function resolveSlotCount(draft, picks) {
  const fromSettings = Number(draft?.settings?.teams || 0);
  if (fromSettings > 0) return fromSettings;
  const fromMap = draft?.slot_to_roster_id
    ? Object.keys(draft.slot_to_roster_id).length
    : 0;
  if (fromMap > 0) return fromMap;
  return picks.reduce((m, p) => Math.max(m, p.draft_slot || 0), 0);
}

/**
 * Map a 1-indexed overall pick number to its draft slot, honoring snake vs
 * linear ordering. Auction/unknown types fall back to linear.
 */
export function slotForPickNo(pickNo, slotCount, type = "snake") {
  if (slotCount <= 0) return 0;
  const idxInRound = (pickNo - 1) % slotCount; // 0-indexed within the round
  const round = Math.floor((pickNo - 1) / slotCount) + 1;
  const isSnake = type === "snake";
  if (isSnake && round % 2 === 0) {
    return slotCount - idxInRound; // even rounds reverse
  }
  return idxInRound + 1;
}

function roundForPickNo(pickNo, slotCount) {
  if (slotCount <= 0) return 1;
  return Math.floor((pickNo - 1) / slotCount) + 1;
}

/**
 * Assign a team's drafted players into the league's lineup slots, filling exact
 * position slots before flex slots so the "needs" that show up as empty slots
 * are real. Anything left over lands on the bench.
 */
export function assignRosterSlots(players, rosterPositions) {
  const starterDefs = (rosterPositions || []).filter(
    (slot) => !NON_STARTER_SLOTS.has(slot),
  );
  const starters = starterDefs.map((slot, i) => ({
    key: `${slot}-${i}`,
    slot,
    label: slotDisplayLabel(slot),
    eligible: SLOT_ELIGIBILITY[slot] || [],
    player: null,
  }));

  const bench = [];
  // Players already arrive in pick order; place each into its best open slot.
  // Rank candidate slots so an exact-position slot is always preferred over a
  // flex slot (fewer eligible positions === more specific === ranked first).
  for (const player of players) {
    const pos = player.position;
    const candidates = starters
      .filter((s) => !s.player && s.eligible.includes(pos))
      .sort((a, b) => a.eligible.length - b.eligible.length);
    if (candidates.length > 0) {
      candidates[0].player = player;
    } else {
      bench.push(player);
    }
  }

  return { starters, bench };
}

function positionCounts(players) {
  const counts = {};
  for (const p of players) {
    counts[p.position] = (counts[p.position] || 0) + 1;
  }
  return counts;
}

/**
 * Normalize a raw Sleeper pick into the shape the UI consumes. Picks are
 * self-describing (metadata carries name/position/team) so no players map is
 * required.
 */
function normalizePick(p, valueBySleeperId = {}, ppgBySleeperId = {}) {
  const meta = p.metadata || {};
  const playerId = String(p.player_id || "");
  const name =
    `${meta.first_name || ""} ${meta.last_name || ""}`.trim() ||
    (playerId ? `Player ${playerId}` : "Unknown");
  return {
    pickNo: p.pick_no,
    round: p.round,
    slot: p.draft_slot,
    rosterId: p.roster_id,
    playerId,
    name,
    position: (meta.position || "").toUpperCase(),
    team: meta.team || "",
    value: Number(valueBySleeperId[playerId] || 0),
    ppg: Number(ppgBySleeperId[playerId] || 0),
  };
}

// Roster grade from a team's value-per-pick relative to the league average.
// Relative (not absolute) so it stays meaningful at any point in the draft and
// for any roster size.
function gradeFromRatio(ratio) {
  if (ratio >= 1.15) return "A";
  if (ratio >= 1.04) return "B";
  if (ratio >= 0.92) return "C";
  if (ratio >= 0.8) return "D";
  return "F";
}

/**
 * Build the full live-draft view model from the draft object + picks feed.
 *
 * @param {Object}   args.draft           Raw Sleeper draft object
 * @param {Array}    args.picks           Raw picks from /draft/{id}/picks
 * @param {Array}    args.teams           [{ rosterId, label, avatar, ownerId }]
 * @param {Array}    args.rosterPositions league.roster_positions
 * @param {number}   args.myRosterId      viewer's roster id
 */
export function buildLiveDraftState({
  draft,
  picks = [],
  teams = [],
  rosterPositions = [],
  myRosterId,
  valueBySleeperId = {},
  ppgBySleeperId = {},
}) {
  if (!draft) return null;

  const hasValues = Object.keys(valueBySleeperId).length > 0;

  const type = draft.type || "snake";
  const slotCount = resolveSlotCount(draft, picks);
  const totalRounds = Number(draft.settings?.rounds || 0);
  const totalPicks = slotCount * totalRounds;

  const teamByRosterId = new Map(teams.map((t) => [t.rosterId, t]));
  const teamLabel = (rosterId) =>
    teamByRosterId.get(rosterId)?.label || `Roster ${rosterId}`;

  // slot → rosterId (Sleeper provides this directly once the order is set).
  const slotToRoster = new Map();
  if (draft.slot_to_roster_id) {
    for (const [slot, rosterId] of Object.entries(draft.slot_to_roster_id)) {
      if (rosterId != null) slotToRoster.set(Number(slot), Number(rosterId));
    }
  }
  const rosterForSlot = (slot) => slotToRoster.get(slot) ?? null;

  const made = picks
    .map((p) => normalizePick(p, valueBySleeperId, ppgBySleeperId))
    .sort((a, b) => (a.pickNo || 0) - (b.pickNo || 0));
  const lastPickNo = made.reduce((m, p) => Math.max(m, p.pickNo || 0), 0);

  // Group picks per roster, preserving pick order for clean lineup filling.
  const picksByRoster = new Map();
  for (const p of made) {
    if (!picksByRoster.has(p.rosterId)) picksByRoster.set(p.rosterId, []);
    picksByRoster.get(p.rosterId).push(p);
  }

  // Per-team roster build-out.
  const rosterTeams = teams.map((t) => {
    const teamPicks = picksByRoster.get(t.rosterId) || [];
    const { starters, bench } = assignRosterSlots(teamPicks, rosterPositions);
    const totalValue = teamPicks.reduce((s, p) => s + (p.value || 0), 0);
    // Expected PPG = projected points from the *starting lineup* only (that's
    // what a team actually scores each week), summed from filled starter slots.
    const expectedPpg = starters.reduce(
      (s, slot) => s + (slot.player?.ppg || 0),
      0,
    );
    return {
      rosterId: t.rosterId,
      label: t.label,
      avatar: t.avatar || null,
      isMe: t.rosterId === myRosterId,
      picks: teamPicks,
      starters,
      bench,
      counts: positionCounts(teamPicks),
      totalDrafted: teamPicks.length,
      totalValue,
      avgValue: teamPicks.length > 0 ? totalValue / teamPicks.length : 0,
      expectedPpg,
    };
  });

  // Live roster grades + power rankings, when we have a value source. Grade is
  // value-per-pick vs the league average; power rank is by total roster value.
  let powerRankings = null;
  if (hasValues && made.length > 0) {
    const totalPickVal = rosterTeams.reduce((s, t) => s + t.totalValue, 0);
    const totalPickCount = rosterTeams.reduce((s, t) => s + t.totalDrafted, 0);
    const leagueAvgPerPick = totalPickCount > 0 ? totalPickVal / totalPickCount : 0;
    rosterTeams.forEach((t) => {
      const ratio =
        leagueAvgPerPick > 0 && t.totalDrafted > 0
          ? t.avgValue / leagueAvgPerPick
          : 0;
      t.grade = t.totalDrafted > 0 ? gradeFromRatio(ratio) : null;
    });

    // Per-position grades so weak spots are obvious. Each position is graded on
    // the team's total value there vs the league average for that position, so
    // an empty position grades F — an instant hole flag.
    const relevantPositions = relevantPositionsFor(rosterPositions);
    const leaguePosTotal = {};
    rosterTeams.forEach((t) => {
      t.posValue = {};
      t.posCount = {};
      for (const p of t.picks) {
        if (!p.position) continue;
        t.posValue[p.position] = (t.posValue[p.position] || 0) + (p.value || 0);
        t.posCount[p.position] = (t.posCount[p.position] || 0) + 1;
        leaguePosTotal[p.position] =
          (leaguePosTotal[p.position] || 0) + (p.value || 0);
      }
    });
    const numTeams = rosterTeams.length || 1;
    rosterTeams.forEach((t) => {
      t.positionGrades = relevantPositions.map((pos) => {
        const leagueAvg = (leaguePosTotal[pos] || 0) / numTeams;
        const val = t.posValue[pos] || 0;
        const ratio = leagueAvg > 0 ? val / leagueAvg : 0;
        return {
          pos,
          value: Math.round(val),
          count: t.posCount[pos] || 0,
          // Ungradeable until at least one such player exists league-wide.
          grade: leagueAvg > 0 ? gradeFromRatio(ratio) : null,
        };
      });
    });
    // Rank by grade (value-per-pick), not total value — so the best-drafting
    // team leads regardless of how many picks it happens to have made. avgValue
    // is the metric the grade is derived from, so this yields a clean A→F order.
    powerRankings = [...rosterTeams]
      .filter((t) => t.totalDrafted > 0)
      .sort((a, b) => b.avgValue - a.avgValue)
      .map((t, i) => {
        t.powerRank = i + 1;
        return {
          rosterId: t.rosterId,
          label: t.label,
          isMe: t.isMe,
          rank: i + 1,
          grade: t.grade,
          totalValue: Math.round(t.totalValue),
          avgValue: Math.round(t.avgValue),
          totalDrafted: t.totalDrafted,
          expectedPpg: t.expectedPpg,
          positionGrades: t.positionGrades,
        };
      });
  }

  // My team first, then by pick count (most active drafters surface).
  rosterTeams.sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    return b.totalDrafted - a.totalDrafted;
  });

  // On the clock + upcoming picks.
  const complete = draft.status === "complete";
  const started = draft.status === "drafting" || draft.status === "paused" || lastPickNo > 0;
  const nextPickNo = lastPickNo + 1;
  const draftOver = totalPicks > 0 && nextPickNo > totalPicks;

  let onTheClock = null;
  if (!complete && !draftOver && started && slotToRoster.size > 0) {
    const slot = slotForPickNo(nextPickNo, slotCount, type);
    const rosterId = rosterForSlot(slot);
    if (rosterId != null) {
      onTheClock = {
        pickNo: nextPickNo,
        round: roundForPickNo(nextPickNo, slotCount),
        slot,
        rosterId,
        label: teamLabel(rosterId),
        isMe: rosterId === myRosterId,
      };
    }
  }

  // The viewer's next few upcoming picks (helps plan the build-out).
  const myUpcoming = [];
  if (slotToRoster.size > 0 && totalPicks > 0 && myRosterId != null) {
    for (let pn = nextPickNo; pn <= totalPicks && myUpcoming.length < 4; pn++) {
      const slot = slotForPickNo(pn, slotCount, type);
      if (rosterForSlot(slot) === myRosterId) {
        myUpcoming.push({
          pickNo: pn,
          round: roundForPickNo(pn, slotCount),
          slot,
          fromNow: pn - nextPickNo,
        });
      }
    }
  }

  // Running board: rounds × slots grid of picks for the all-teams view.
  const boardRounds = Math.max(
    totalRounds,
    made.reduce((m, p) => Math.max(m, p.round || 0), 0),
  );
  const board = Array.from({ length: boardRounds }, () =>
    Array(slotCount).fill(null),
  );
  for (const p of made) {
    if (p.round >= 1 && p.slot >= 1 && board[p.round - 1]) {
      board[p.round - 1][p.slot - 1] = p;
    }
  }

  return {
    draftId: draft.draft_id,
    season: String(draft.season || ""),
    name: draft.metadata?.name || "",
    type,
    status: draft.status,
    complete,
    started,
    slotCount,
    totalRounds: boardRounds,
    totalPicks,
    madeCount: made.length,
    onTheClock,
    myUpcoming,
    teams: rosterTeams,
    powerRankings,
    draftedIds: new Set(made.map((p) => p.playerId).filter(Boolean)),
    board,
    picks: made,
    slotToRoster,
  };
}
