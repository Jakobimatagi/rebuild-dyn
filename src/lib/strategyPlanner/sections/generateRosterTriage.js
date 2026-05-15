// Flatten the roster and run each player through the path's triage rules.
// Each player ends up in exactly one bucket, in this priority order:
//   1. buildAround     — path-matched "build around"
//   2. sellNow         — path-matched "sell now"
//   3. holdReassess    — path-matched "hold" (e.g. elite vet past peak)
//   4. stashes         — young upside in a room with space to play
//   5. holdDefault     — fall-through; player doesn't match any rule
//
// holdReassess and holdDefault are kept separate so the path's rationale
// (which assumes the rule matched) only fires for genuinely-matched
// players. The UI renders them as sub-sections of one Hold card.

function flattenRoster(analysis) {
  const byPos = analysis?.byPos || {};
  return ["QB", "RB", "WR", "TE"].flatMap((pos) => byPos[pos] || []);
}

// Neutral rationale for fall-through players. The path's holdReassess
// rationale was written assuming the rule matched, so reusing it for
// fall-throughs produces false claims (e.g. "Elite vet (JAG - Dev)").
function defaultHoldRationale(player) {
  const age = player?.age;
  const arch = player?.archetype;
  const archStr = arch ? `, ${arch}` : "";
  if (age == null) return "Doesn't match this path's profile — reassess at the deadline";
  if (age <= 23) {
    return `Age ${age}${archStr} — young role player, watch usage`;
  }
  if (age <= 27) {
    return `Age ${age}${archStr} — doesn't match this path's buy or sell profile`;
  }
  return `Age ${age}${archStr} — outside this path's window, reassess at the deadline`;
}

// Stash heuristic — young player with an upside signal in a room that
// has space for him to play. Sits between path-matched buckets and the
// raw fall-through: a stash isn't necessarily a path priority, but it's
// more informative than "doesn't fit." Path can opt out via
// `path.disableStashes = true`.
function isStash(player, analysis) {
  if (!player) return false;
  const age = Number(player.age ?? 99);
  if (age > 23) return false;
  const yearsExp = Number(player.yearsExp ?? 99);
  if (yearsExp > 2) return false;
  // Filler archetypes are off the table regardless of room context.
  if (player.archetype === "Replaceable" || player.archetype === "JAG - Insurance") {
    return false;
  }

  const weakRooms = analysis?.weakRooms || analysis?.needs || [];
  const inWeakRoom = weakRooms.includes(player.position);

  // Established starters aren't stashes. If the player IS the room's
  // top scorer with no one else competing, he's not "carving a role"
  // — he is the role. Stash status requires another player ahead of
  // him to overtake or a flagged-weak room where there's open space.
  const byPos = analysis?.byPos || {};
  const room = byPos[player.position] || [];
  const top = room[0];
  const topScore = Number(top?.score ?? 0);
  const playerIsTop = top?.id === player.id;
  const noClearStarter = topScore < 70;
  const roomHasSpace = inWeakRoom || (noClearStarter && !playerIsTop);
  if (!roomHasSpace) return false;

  // In a flagged-weak room, youth + non-filler archetype is the whole
  // signal — the room itself is the opportunity. Outside weak rooms
  // (where the player is just buried behind a non-elite starter),
  // require an explicit upside marker so we don't list every young JAG.
  if (inWeakRoom) return true;

  const score = Number(player.score ?? 0);
  const breakoutProb = Number(player.prediction?.breakoutProb ?? 0);
  const draftRound = player.draftRound != null ? Number(player.draftRound) : null;
  return (
    player.archetype === "Upside Shot" ||
    player.archetype === "Foundational" ||
    player.archetype === "Cornerstone" ||
    player.archetype === "Mainstay" ||
    breakoutProb >= 20 ||
    (draftRound != null && draftRound <= 3) ||
    score >= 60
  );
}

function stashRationale(player, analysis) {
  const reasons = [];
  if (player.archetype === "Upside Shot" || player.archetype === "Foundational") {
    reasons.push(player.archetype);
  }
  const bp = Number(player.prediction?.breakoutProb ?? 0);
  if (bp >= 20) reasons.push(`${Math.round(bp)}% breakout`);
  const draftRound = player.draftRound != null ? Number(player.draftRound) : null;
  if (draftRound != null && draftRound <= 3) {
    reasons.push(`Round ${draftRound} pedigree`);
  }
  const weakRooms = analysis?.weakRooms || analysis?.needs || [];
  const inWeakRoom = weakRooms.includes(player.position);
  const roomNote = inWeakRoom
    ? `${player.position} room is thin`
    : `no clear ${player.position} starter`;
  const head =
    reasons.length > 0
      ? `Age ${player.age}, ${reasons.join(" + ")}`
      : `Age ${player.age}`;
  return `${head} — ${roomNote}, real path to snaps`;
}

export function generateRosterTriage(analysis, path) {
  const players = flattenRoster(analysis);
  const ctx = { analysis };

  const buildAround = [];
  const sellNow = [];
  const holdReassess = [];
  const stashes = [];
  const holdDefault = [];

  const rules = path.triageRules || {};
  const rationales = path.triageRationales || {};
  const stashesEnabled = !path.disableStashes;

  const rationale = (bucket, player) => {
    const fn = rationales[bucket];
    if (typeof fn === "function") {
      try {
        return fn(player, ctx);
      } catch {
        return null;
      }
    }
    return null;
  };

  for (const player of players) {
    if (typeof rules.buildAround === "function" && rules.buildAround(player, ctx)) {
      buildAround.push({ player, rationale: rationale("buildAround", player) });
    } else if (typeof rules.sellNow === "function" && rules.sellNow(player, ctx)) {
      sellNow.push({ player, rationale: rationale("sellNow", player) });
    } else if (
      typeof rules.holdReassess === "function" &&
      rules.holdReassess(player, ctx)
    ) {
      holdReassess.push({
        player,
        rationale: rationale("holdReassess", player),
      });
    } else if (stashesEnabled && isStash(player, analysis)) {
      stashes.push({
        player,
        rationale: stashRationale(player, analysis),
      });
    } else {
      holdDefault.push({
        player,
        rationale: defaultHoldRationale(player),
      });
    }
  }

  const byScoreDesc = (a, b) => (b.player.score || 0) - (a.player.score || 0);
  buildAround.sort(byScoreDesc);
  sellNow.sort(byScoreDesc);
  holdReassess.sort(byScoreDesc);
  stashes.sort(byScoreDesc);
  holdDefault.sort(byScoreDesc);

  return { buildAround, sellNow, holdReassess, stashes, holdDefault };
}
