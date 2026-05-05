import { pickSlotValueExact } from "./marketValue";

function blendValue(fcVal, raVal) {
  if (fcVal > 0 && raVal > 0) return fcVal * 0.6 + raVal * 0.4;
  return fcVal || raVal || 0;
}

function gradeFromDelta(deltaPerPick) {
  // Absolute delta-per-pick thresholds so grades reflect actual quality,
  // not just relative rank. Breaks in dynasty-dollar terms:
  //   A  ≥ +300/pick  (clear steal every pick)
  //   B  ≥ +50        (slight edge on average)
  //   C  ≥ -150       (roughly fair)
  //   D  ≥ -400       (mild reach pattern)
  //   F  <  -400      (significant overpay)
  if (deltaPerPick >= 300) return "A";
  if (deltaPerPick >= 50)  return "B";
  if (deltaPerPick >= -150) return "C";
  if (deltaPerPick >= -400) return "D";
  return "F";
}

export function buildDraftRecap({
  draft,
  picks,
  rostersById,
  fcByPlayerId,
  raByPlayerId,
  raPickValues,
  leagueContext,
  tradeMarket,
}) {
  if (!draft || !Array.isArray(picks) || picks.length === 0) return null;

  const season = String(draft.season || "");

  // Total slots per round = number of teams in the league
  const totalSlots = picks.reduce((m, p) => Math.max(m, p.draft_slot || 0), 0);

  const enriched = picks.map((p) => {
    const playerId = String(p.player_id || "");
    const fc = fcByPlayerId?.get(playerId);
    const ra = raByPlayerId?.get(playerId);
    const fcVal = Number(fc?.value || 0);
    const raVal = Number(ra?.value || 0);

    // Slot values use RA anchors, so prefer RA for player values too so
    // both sides of the delta are on the same scale. Check raVal directly
    // rather than using a pick-values proxy — the two APIs are independent.
    const playerValue = raVal > 0
      ? raVal                     // RA has this player → pure RA
      : blendValue(fcVal, raVal); // RA missing → FC or 60/40 blend

    // Slot value: interpolate between RA early/mid/late anchors for this
    // exact slot position. Falls back to a static curve when RA is absent.
    const slotValue = pickSlotValueExact(
      p.round,
      p.draft_slot,
      totalSlots,
      leagueContext,
      raPickValues,
      season,
    );

    const owner = rostersById?.get(p.roster_id);
    const meta = p.metadata || {};
    const playerName =
      `${meta.first_name || ""} ${meta.last_name || ""}`.trim() ||
      (playerId ? `Player ${playerId}` : "Unknown");

    return {
      pickNo: p.pick_no,
      round: p.round,
      slot: p.draft_slot,
      playerId,
      playerName,
      position: meta.position || "",
      team: meta.team || "",
      rosterId: p.roster_id,
      ownerLabel: owner?.label || `Roster ${p.roster_id}`,
      playerValue,
      slotValue,
      delta: playerValue - slotValue,
      hasValue: playerValue > 0 || slotValue > 0,
    };
  });

  const byTeam = new Map();
  for (const p of enriched) {
    const t =
      byTeam.get(p.rosterId) || {
        rosterId: p.rosterId,
        label: p.ownerLabel,
        picks: [],
        totalDelta: 0,
        totalPlayerValue: 0,
        totalSlotValue: 0,
      };
    t.picks.push(p);
    t.totalDelta += p.delta;
    t.totalPlayerValue += p.playerValue;
    t.totalSlotValue += p.slotValue;
    byTeam.set(p.rosterId, t);
  }

  const GRADE_RANK = { A: 5, B: 4, C: 3, D: 2, F: 1 };

  const teams = Array.from(byTeam.values());
  // Assign grades before sorting so we can sort by grade letter first.
  teams.forEach((t) => {
    const deltaPerPick = t.picks.length > 0 ? t.totalDelta / t.picks.length : 0;
    t.grade = gradeFromDelta(deltaPerPick);
    t.deltaPerPick = Math.round(deltaPerPick);
  });
  teams.sort((a, b) => {
    const gDiff = (GRADE_RANK[b.grade] ?? 0) - (GRADE_RANK[a.grade] ?? 0);
    return gDiff !== 0 ? gDiff : b.totalDelta - a.totalDelta;
  });
  teams.forEach((t, i) => { t.rank = i + 1; });

  const sortedByDelta = [...enriched]
    .filter((p) => p.hasValue)
    .sort((a, b) => b.delta - a.delta);
  const topSteals = sortedByDelta.slice(0, 3);
  const topReaches = sortedByDelta.slice(-3).reverse();

  const maxRound = enriched.reduce((m, p) => Math.max(m, p.round || 0), 0);
  const maxSlot = enriched.reduce((m, p) => Math.max(m, p.slot || 0), 0);
  const board = Array.from({ length: maxRound }, () =>
    Array(maxSlot).fill(null),
  );
  for (const p of enriched) {
    if (p.round >= 1 && p.slot >= 1 && board[p.round - 1]) {
      board[p.round - 1][p.slot - 1] = p;
    }
  }

  return {
    draftId: draft.draft_id,
    season,
    type: draft.type || "snake",
    startTime: draft.start_time || null,
    rounds: maxRound,
    slots: maxSlot,
    board,
    teams,
    picks: enriched,
    topSteals,
    topReaches,
  };
}
