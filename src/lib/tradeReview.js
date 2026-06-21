// tradeReview.js
// Builds a per-trade "Report Card": for every historical trade, value each asset
// each side received and declare a winner. Two value lenses are produced:
//
//   • value NOW  — what every asset is worth today (always available). Picks that
//                  have since been used resolve to the player drafted; unused/future
//                  picks keep their pick value.
//   • value THEN — what the assets were worth at the time of the trade. This is only
//                  knowable if we captured a value snapshot on/around the trade date
//                  (see value_snapshots / api/snapshot-values.js). FantasyCalc and
//                  RosterAudit expose no dated historical endpoint, so trades that
//                  predate our first snapshot are flagged "outside the snapshot frame"
//                  and only carry a value-now verdict.
//
// Every asset and side therefore carries an explicit `source` so the UI can always
// explain where a number came from.

// ---------------------------------------------------------------------------
// Value helpers — kept on the same FC-÷100 trade scale as getAssetTradeValue
// (tradeEngine.js) so a player's value-now here matches the Trade Calculator.
// The scaling is inlined (rather than importing the engine) so this module stays
// pure and unit-testable; the logic mirrors getAssetTradeValue's player + pick
// branches, minus the forward tilt — a report card is a market snapshot, not a
// projection.
// ---------------------------------------------------------------------------

const FC_SCALE = 100;

// Convert a raw FantasyCalc / RosterAudit dollar value (~100-9000) to trade scale.
function scaleDollar(dollars) {
  return Math.max(1, Math.round(Number(dollars) / FC_SCALE));
}

// Value lenses. fc/ra are dollar-scale markets (÷100 → trade scale); 'oracle' is
// Dynasty Oracle's own internal model value, already on a ~0-100 points scale, so
// it is used as-is. Each lens falls back to the others (in order) when its own
// source lacks coverage for a player, and reports which source actually supplied
// the number so the UI can show fallbacks.
const LENS_ORDER = {
  fc: ["fc", "ra"],
  ra: ["ra", "fc"],
  oracle: ["oracle", "fc", "ra"],
};

// Returns { value, source }. `sources` is { fc, ra, oracle } of Maps keyed by
// sleeperId → { value }. `prefer` selects the lens.
function playerValueNow(playerId, sources, prefer = "fc") {
  const id = String(playerId || "");
  if (!id) return { value: 0, source: null };
  for (const src of LENS_ORDER[prefer] || LENS_ORDER.fc) {
    const raw = Number(sources?.[src]?.get(id)?.value || 0);
    if (raw > 0) {
      // Markets are dollar-scale; the oracle lens is already on points scale.
      const value = src === "oracle" ? Math.max(1, Math.round(raw)) : scaleDollar(raw);
      return { value, source: src };
    }
  }
  return { value: 0, source: null };
}

// Dollar value of a draft pick — mirrors pickFcValue's static fallback table
// (FantasyCalc pick prices are format-/year-aware). Used only for unused/future
// picks; picks that were used resolve to the drafted player's real value instead.
function pickDollarValue(pick, leagueContext) {
  const round = Number(pick.round) || 4;
  const currentYear = new Date().getFullYear();
  const yearsOut = Math.max(0, Number(pick.season || currentYear) - currentYear);
  let base;
  if (round === 1) base = 4400;
  else if (round === 2) base = 1200;
  else if (round === 3) base = 500;
  else if (round === 4) base = 200;
  else base = 100;
  if (yearsOut === 1) base *= 0.85;
  else if (yearsOut === 2) base *= 0.7;
  else if (yearsOut >= 3) base *= 0.55;
  if (round === 1 && leagueContext?.isSuperflex) base *= 1.18;
  return base;
}

function pickValueNow(pick, leagueContext) {
  return scaleDollar(pickDollarValue(pick, leagueContext));
}

// ---------------------------------------------------------------------------
// Pick → drafted-player resolution
//
// A traded pick is identified by (season, round, original-owner roster). To find
// the player it became we use the completed draft for that season:
//   1. slot_to_roster_id maps each draft_slot → the roster that originally owned
//      that slot (i.e. the pick's original owner — fixed by draft order, immune to
//      later pick trades).
//   2. find the slot whose original owner is this pick's roster_id.
//   3. find the selection at (round, slot) in that draft's picks.
// ---------------------------------------------------------------------------

function roundOrdinal(round) {
  if (round === 1) return "1st";
  if (round === 2) return "2nd";
  if (round === 3) return "3rd";
  return `${round}th`;
}

export function pickLabel(pick) {
  return `${pick.season} ${roundOrdinal(Number(pick.round))}`;
}

// Build a reusable resolver over the league's completed drafts. Indexing once
// keeps per-pick lookups O(1) and centralizes the season-matching quirks:
//   • Sleeper's draft.season can be the NFL season (2026) OR the prior offseason
//     year (2025), so we match a pick's season against draft.season AND the year
//     the draft actually ran (start_time). This is why "2026 2nd" was falling
//     through to the unused-pick branch even though the draft had happened.
//   • The original-slot owner comes from slot_to_roster_id; if the list endpoint
//     omits it, we reconstruct it from draft_order (user_id→slot) + rosters.
export function buildDraftResolver(sleeperDrafts = [], allDraftPicksMap = {}, rosters = []) {
  const userToRoster = new Map(
    (rosters || []).map((r) => [String(r.owner_id), r.roster_id]),
  );

  const drafts = (sleeperDrafts || [])
    .filter((d) => d.status === "complete")
    .map((d) => {
      const picks = allDraftPicksMap?.[d.draft_id] || [];
      const byRoundSlot = new Map();
      for (const p of picks) byRoundSlot.set(`${p.round}-${p.draft_slot}`, p);

      // slot of each original-owner roster (consistent across rounds)
      const slotByRoster = new Map();
      const s2r = d.slot_to_roster_id || {};
      if (Object.keys(s2r).length) {
        for (const [slot, rid] of Object.entries(s2r)) {
          slotByRoster.set(Number(rid), Number(slot));
        }
      } else if (d.draft_order) {
        for (const [uid, slot] of Object.entries(d.draft_order)) {
          const rid = userToRoster.get(String(uid));
          if (rid != null) slotByRoster.set(Number(rid), Number(slot));
        }
      }

      const startYear = d.start_time
        ? new Date(Number(d.start_time)).getFullYear()
        : null;
      return { season: String(d.season || ""), startYear, byRoundSlot, slotByRoster };
    });

  return function resolve(pick) {
    if (!pick?.season || !pick?.round) return null;
    const seasonStr = String(pick.season);
    const seasonNum = Number(pick.season);
    const draft = drafts.find(
      (d) => d.season === seasonStr || d.startYear === seasonNum,
    );
    if (!draft) return null; // future pick — draft hasn't happened yet

    const slot = draft.slotByRoster.get(Number(pick.roster_id));
    if (slot == null) return null;

    const row = draft.byRoundSlot.get(`${Number(pick.round)}-${slot}`);
    if (!row || !row.player_id) return null;

    const meta = row.metadata || {};
    const name =
      `${meta.first_name || ""} ${meta.last_name || ""}`.trim() ||
      `Player ${row.player_id}`;
    return {
      playerId: String(row.player_id),
      playerName: name,
      position: meta.position || "",
      team: meta.team || "",
      pickNo: row.pick_no,
      draftSlot: row.draft_slot,
    };
  };
}

// Thin wrapper — resolve a single pick (builds an index per call; fine for tests
// and one-offs, buildTradeReview builds the resolver once).
export function resolveTradedPick(pick, sleeperDrafts, allDraftPicksMap, rosters = []) {
  return buildDraftResolver(sleeperDrafts, allDraftPicksMap, rosters)(pick);
}

// Resolve a traded pick against the *in-progress* draft. buildDraftResolver only
// indexes completed drafts, so picks for a live draft (a startup or rookie draft
// happening right now) fall through to the bare "2026 1st" fallback — no seat,
// no owning team. This resolver fills that gap: it maps a pick to its draft slot
// ("spot", e.g. round 2 / slot 5 → "2.05") via the live draft's slot_to_roster_id,
// names the team that owns the seat, and — if that slot is already on the board —
// hands back the drafted player so the pick reads as used. Returns null for picks
// that belong to a different season's draft (let the completed-draft path handle
// those) or when the draft order isn't set yet.
//
// @param {Object} liveDraft        the in-progress Sleeper draft object
// @param {Array}  liveDraftPicks   picks made so far in that draft
// @param {Map}    rosterLabelById  rosterId → team label
export function buildLiveSlotResolver(
  liveDraft,
  liveDraftPicks = [],
  rosterLabelById = new Map(),
) {
  if (!liveDraft) return () => null;

  const slotByRoster = new Map();
  const s2r = liveDraft.slot_to_roster_id || {};
  for (const [slot, rid] of Object.entries(s2r)) {
    if (rid != null) slotByRoster.set(Number(rid), Number(slot));
  }
  if (slotByRoster.size === 0) return () => null;

  const season = String(liveDraft.season || "");
  const startYear = liveDraft.start_time
    ? new Date(Number(liveDraft.start_time)).getFullYear()
    : null;

  // Made picks indexed by round-slot, so a traded pick that's already been used
  // resolves to the player taken at that seat.
  const byRoundSlot = new Map();
  for (const p of liveDraftPicks || []) {
    if (p?.round != null && p?.draft_slot != null) {
      byRoundSlot.set(`${Number(p.round)}-${Number(p.draft_slot)}`, p);
    }
  }

  const ownerLabel = (rid) =>
    rosterLabelById.get(Number(rid)) ||
    rosterLabelById.get(String(rid)) ||
    null;

  return function resolveLive(pick) {
    if (!pick?.season || !pick?.round) return null;
    const seasonNum = Number(pick.season);
    // Only this draft's picks; other seasons fall to the completed-draft path.
    if (String(pick.season) !== season && startYear !== seasonNum) return null;

    const slot = slotByRoster.get(Number(pick.roster_id));
    if (slot == null) return null;

    const round = Number(pick.round);
    const seat = `${round}.${String(slot).padStart(2, "0")}`; // e.g. "2.05"
    const owner = ownerLabel(pick.roster_id);

    const made = byRoundSlot.get(`${round}-${slot}`);
    if (made && made.player_id) {
      const meta = made.metadata || {};
      const name =
        `${meta.first_name || ""} ${meta.last_name || ""}`.trim() ||
        `Player ${made.player_id}`;
      return {
        slot, round, seat, ownerLabel: owner, made: true,
        player: {
          playerId: String(made.player_id),
          playerName: name,
          position: meta.position || "",
          pickNo: made.pick_no,
        },
      };
    }
    return { slot, round, seat, ownerLabel: owner, made: false };
  };
}

// ---------------------------------------------------------------------------
// Snapshot ("value then") lookup
//
// valueSnapshots is the structure returned by fetchTradeValueSnapshots():
//   { earliestDate: 'YYYY-MM-DD' | null,
//     byDatePlayer: Map<`${date}|${sleeperId}`, value>,   // RA/FC dollar scale
//     dates: string[] (ascending) }
// We resolve a trade to the snapshot date on/before the trade date (nearest prior),
// falling back to the nearest snapshot overall when the trade is newer than all
// snapshots. Trades older than the earliest snapshot get no value-then.
// ---------------------------------------------------------------------------

function nearestSnapshotDate(snapshots, tradeDateStr) {
  const dates = snapshots?.dates || [];
  if (!dates.length) return null;
  // dates ascending; find the last date <= tradeDateStr
  let chosen = null;
  for (const d of dates) {
    if (d <= tradeDateStr) chosen = d;
    else break;
  }
  return chosen; // null when trade predates all snapshots
}

function snapshotPlayerValueThen(playerId, snapDate, snapshots) {
  if (!snapDate) return null;
  const raw = snapshots?.byDatePlayer?.get(`${snapDate}|${String(playerId)}`);
  if (raw == null) return null;
  return scaleDollar(raw);
}

// ---------------------------------------------------------------------------
// Build one report card per trade
// ---------------------------------------------------------------------------

function isoDate(ms) {
  return new Date(Number(ms)).toISOString().slice(0, 10);
}

function buildAsset({ kind, pick, playerId, players, resolvePick, resolveLive,
  sources, leagueContext, snapshots, snapDate, prefer = "fc" }) {
  if (kind === "player") {
    const p = players?.[playerId];
    const name =
      p?.full_name ||
      (p?.first_name && `${p.first_name} ${p.last_name}`) ||
      `Player ${playerId}`;
    const now = playerValueNow(playerId, sources, prefer);
    const valueThen = snapshotPlayerValueThen(playerId, snapDate, snapshots);
    return {
      kind: "player",
      playerId: String(playerId),
      label: name,
      position: p?.position || "",
      valueNow: now.value,
      nowSource: now.source, // 'fc' | 'ra' | null
      valueThen,
      thenSource: valueThen != null ? "snapshot" : "outside_frame",
    };
  }

  // pick
  const resolved = resolvePick(pick);
  if (resolved) {
    // Pick was used — value-now is the drafted player's value now.
    const now = playerValueNow(resolved.playerId, sources, prefer);
    const valueThen = snapshotPlayerValueThen(resolved.playerId, snapDate, snapshots);
    return {
      kind: "pick_used",
      label: pickLabel(pick),
      becamePlayerId: resolved.playerId,
      becameLabel: resolved.playerName,
      position: resolved.position,
      pickNo: resolved.pickNo,
      valueNow: now.value,
      nowSource: now.source, // 'fc' | 'ra' | null (of the drafted player)
      valueThen,
      thenSource: valueThen != null ? "snapshot" : "outside_frame",
    };
  }

  // Live in-progress draft: give the pick its seat ("spot", e.g. 2026 2.05) and
  // the team that owns it, even before it's on the clock. If the seat has already
  // been drafted, it reads as a used pick (drafted player's value-now).
  const live = resolveLive ? resolveLive(pick) : null;
  if (live) {
    const seatLabel = `${pick.season} ${live.seat}`;
    if (live.made) {
      const now = playerValueNow(live.player.playerId, sources, prefer);
      const valueThen = snapshotPlayerValueThen(live.player.playerId, snapDate, snapshots);
      return {
        kind: "pick_used",
        label: seatLabel,
        fromTeam: live.ownerLabel,
        becamePlayerId: live.player.playerId,
        becameLabel: live.player.playerName,
        position: live.player.position,
        pickNo: live.player.pickNo,
        valueNow: now.value,
        nowSource: now.source,
        valueThen,
        thenSource: valueThen != null ? "snapshot" : "outside_frame",
      };
    }
    return {
      kind: "pick_future",
      label: seatLabel,
      fromTeam: live.ownerLabel,
      slot: live.slot,
      valueNow: pickValueNow(pick, leagueContext),
      nowSource: "pick_est",
      valueThen: null,
      thenSource: "outside_frame",
    };
  }

  // Future / unused pick — value the pick itself (static estimate, no market feed).
  return {
    kind: "pick_future",
    label: pickLabel(pick),
    valueNow: pickValueNow(pick, leagueContext),
    nowSource: "pick_est",
    valueThen: null, // pick snapshots are tracked separately; future work
    thenSource: "outside_frame",
  };
}

export function buildTradeReview({
  transactions = [],
  rosterLabelById = new Map(),
  players = {},
  fcByPlayerId = new Map(),
  raByPlayerId = new Map(),
  internalByPlayerId = new Map(), // Dynasty Oracle's own model value (points scale)
  leagueContext = {},
  sleeperDrafts = [],
  allDraftPicksMap = {},
  rosters = [],
  valueSnapshots = null,
  liveDraft = null, // in-progress draft, so its traded picks resolve to a seat
  liveDraftPicks = [],
}) {
  const trades = (transactions || []).filter((t) => t.type === "trade");
  const sources = { fc: fcByPlayerId, ra: raByPlayerId, oracle: internalByPlayerId };
  const resolvePick = buildDraftResolver(sleeperDrafts, allDraftPicksMap, rosters);
  const resolveLive = buildLiveSlotResolver(liveDraft, liveDraftPicks, rosterLabelById);
  const label = (rid) =>
    rosterLabelById.get(Number(rid)) ||
    rosterLabelById.get(String(rid)) ||
    `Roster ${rid}`;

  // Build the full per-side breakdown + value-now winner under one source lens.
  // value-then is lens-independent (FC snapshot) so it's identical across lenses.
  function buildView(t, snapDate, prefer) {
    const sidesMap = new Map(); // rosterId → { rosterId, label, assets: [] }
    const ensure = (rid) => {
      const key = String(rid);
      if (!sidesMap.has(key)) {
        sidesMap.set(key, { rosterId: Number(rid), label: label(rid), assets: [] });
      }
      return sidesMap.get(key);
    };

    // Players: adds[pid] = toRoster (the receiver)
    for (const [pid, toRid] of Object.entries(t.adds || {})) {
      if (toRid == null) continue;
      ensure(toRid).assets.push(
        buildAsset({
          kind: "player", playerId: pid, players, resolvePick, resolveLive, sources,
          leagueContext, snapshots: valueSnapshots, snapDate, prefer,
        }),
      );
    }
    // Picks: owner_id is the receiver
    for (const pick of t.draft_picks || []) {
      if (pick.owner_id == null) continue;
      ensure(pick.owner_id).assets.push(
        buildAsset({
          kind: "pick", pick, players, resolvePick, resolveLive, sources, leagueContext,
          snapshots: valueSnapshots, snapDate, prefer,
        }),
      );
    }

    const sides = Array.from(sidesMap.values()).map((s) => {
      const totalNow = s.assets.reduce((sum, a) => sum + (a.valueNow || 0), 0);
      const thenVals = s.assets.map((a) => a.valueThen);
      const hasThen = thenVals.length > 0 && thenVals.every((v) => v != null);
      const totalThen = hasThen
        ? s.assets.reduce((sum, a) => sum + (a.valueThen || 0), 0)
        : null;
      return { ...s, totalNow, totalThen };
    });

    if (sides.length < 2) return null; // malformed / single-sided record

    // Winner by value-now (haul today). Margin = best − second-best.
    const byNow = [...sides].sort((a, b) => b.totalNow - a.totalNow);
    const marginNow = byNow[0].totalNow - byNow[1].totalNow;
    // "Even" when the winner's edge is within 5% of the losing side's haul —
    // measured against the loser (not the whole pot) so a real 10-on-80 edge
    // still reads as a win.
    const loserNow = byNow[1].totalNow;
    const evenNow = loserNow > 0 ? marginNow / loserNow < 0.05 : marginNow === 0;

    // Distinct value-now sources used across the trade, for a compact legend.
    const valueSources = [
      ...new Set(
        sides.flatMap((s) => s.assets.map((a) => a.nowSource)).filter(Boolean),
      ),
    ];

    return {
      sides,
      winnerNowRosterId: evenNow ? null : byNow[0].rosterId,
      marginNow,
      evenNow,
      valueSources, // distinct now-value sources: 'fc' | 'ra' | 'pick_est'
    };
  }

  const cards = [];

  for (const t of trades) {
    const createdMs = Number(t.created || 0);
    const tradeDateStr = createdMs ? isoDate(createdMs) : null;
    const snapDate = tradeDateStr
      ? nearestSnapshotDate(valueSnapshots, tradeDateStr)
      : null;

    const fc = buildView(t, snapDate, "fc");
    if (!fc) continue; // malformed
    const ra = buildView(t, snapDate, "ra");
    const oracle = buildView(t, snapDate, "oracle");

    // value-then is lens-independent; derive its winner once from the fc view.
    const hasThen = fc.sides.every((s) => s.totalThen != null);
    let winnerThenRosterId = null;
    let marginThen = null;
    if (hasThen) {
      const byThen = [...fc.sides].sort((a, b) => b.totalThen - a.totalThen);
      winnerThenRosterId = byThen[0].rosterId;
      marginThen = byThen[0].totalThen - byThen[1].totalThen;
    }
    const provenance = hasThen
      ? "snapshot"
      : snapDate
      ? "partial_snapshot"
      : "outside_frame";

    cards.push({
      id: t.transaction_id || String(createdMs),
      created: createdMs,
      date: createdMs
        ? new Date(createdMs).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          })
        : "",
      year: createdMs ? new Date(createdMs).getFullYear() : null,
      week: t.week || 0,
      views: { fc, ra, oracle }, // per-lens sides + value-now winner
      winnerThenRosterId,
      marginThen,
      snapDate,
      provenance, // 'snapshot' | 'partial_snapshot' | 'outside_frame'
    });
  }

  // Most recent first.
  cards.sort((a, b) => b.created - a.created);

  const years = [...new Set(cards.map((c) => c.year).filter(Boolean))].sort(
    (a, b) => b - a,
  );

  // Keyed by transaction id so the per-team transaction feed can attach each
  // card to the trade it already shows.
  const byId = {};
  for (const c of cards) byId[c.id] = c;

  return {
    cards,
    byId,
    years,
    snapshotCoverage: {
      hasSnapshots: !!(valueSnapshots && valueSnapshots.dates?.length),
      earliestDate: valueSnapshots?.earliestDate || null,
      framedCount: cards.filter((c) => c.provenance === "snapshot").length,
      total: cards.length,
    },
  };
}
