/**
 * fleaflickerApi.js
 * Fleaflicker API client + normalization layer that converts Fleaflicker
 * data into Sleeper-compatible format for the analysis pipeline.
 */

const FF_BASE_URL = import.meta.env.DEV
  ? "/fleaflicker"
  : "https://www.fleaflicker.com/api";

/** Convert camelCase keys to snake_case (deep). Values are untouched. */
function camelToSnakeKeys(obj) {
  if (Array.isArray(obj)) return obj.map(camelToSnakeKeys);
  if (obj !== null && typeof obj === "object" && obj.constructor === Object) {
    return Object.fromEntries(
      Object.entries(obj).map(([key, val]) => [
        key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
        camelToSnakeKeys(val),
      ]),
    );
  }
  return obj;
}

async function fetchFF(endpoint, params = {}) {
  const query = new URLSearchParams({ sport: "NFL", ...params });
  const res = await fetch(`${FF_BASE_URL}/${endpoint}?${query}`);
  if (!res.ok) throw new Error(`Fleaflicker API error: ${res.status}`);
  const json = await res.json();
  return camelToSnakeKeys(json);
}

// ─── Public API Functions ─────────────────────────────────

export async function fetchFFUserLeagues(email) {
  return fetchFF("FetchUserLeagues", { email });
}

export async function fetchFFLeagueRosters(leagueId) {
  return fetchFF("FetchLeagueRosters", { league_id: leagueId });
}

export async function fetchFFRoster(leagueId, teamId) {
  return fetchFF("FetchRoster", { league_id: leagueId, team_id: teamId });
}

export async function fetchFFLeagueRules(leagueId) {
  return fetchFF("FetchLeagueRules", { league_id: leagueId });
}

export async function fetchFFLeagueStandings(leagueId) {
  return fetchFF("FetchLeagueStandings", { league_id: leagueId });
}

export async function fetchFFTeamPicks(leagueId, teamId) {
  return fetchFF("FetchTeamPicks", { league_id: leagueId, team_id: teamId });
}

export async function fetchFFTrades(leagueId) {
  return fetchFF("FetchTrades", {
    league_id: leagueId,
    filter: "TRADES_COMPLETED",
  });
}

export async function fetchFFLeagueTransactions(leagueId, resultOffset = 0) {
  return fetchFF("FetchLeagueTransactions", {
    league_id: leagueId,
    result_offset: resultOffset,
  });
}

// ─── Player Name Matching ─────────────────────────────────

function normalizeName(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[.'\-]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .trim();
}

function buildPlayerLookup(sleeperPlayers) {
  const byNamePos = new Map();
  const byName = new Map();

  for (const [id, p] of Object.entries(sleeperPlayers)) {
    if (!p.full_name || !p.position) continue;
    const norm = normalizeName(p.full_name);
    const posKey = `${norm}__${p.position}`;

    if (!byNamePos.has(posKey) || p.active) {
      byNamePos.set(posKey, id);
    }
    if (!byName.has(norm) || p.active) {
      byName.set(norm, id);
    }
  }

  return { byNamePos, byName };
}

function matchPlayer(ffProPlayer, lookup) {
  if (!ffProPlayer?.name_full) return null;
  const norm = normalizeName(ffProPlayer.name_full);

  if (ffProPlayer.position) {
    const match = lookup.byNamePos.get(`${norm}__${ffProPlayer.position}`);
    if (match) return match;
  }

  return lookup.byName.get(norm) || null;
}

/** Match or create a synthetic Sleeper player entry */
function resolvePlayerId(ffProPlayer, lookup, sleeperPlayers) {
  const id = matchPlayer(ffProPlayer, lookup);
  if (id) return id;

  const syntheticId = `ff_${ffProPlayer.id}`;
  if (!sleeperPlayers[syntheticId]) {
    sleeperPlayers[syntheticId] = {
      player_id: syntheticId,
      full_name: ffProPlayer.name_full || "Unknown",
      first_name: ffProPlayer.name_first || "",
      last_name: ffProPlayer.name_last || "",
      position: ffProPlayer.position || "NA",
      team: ffProPlayer.pro_team_abbreviation || "",
      age: null,
      years_exp: null,
      fantasy_positions: ffProPlayer.position ? [ffProPlayer.position] : [],
      status: "Active",
    };
  }
  return syntheticId;
}

// ─── Normalization Helpers ────────────────────────────────

function mapSlotToSleeperPos(pos) {
  const elig = pos.eligibility || [];
  const label = pos.label;

  if (elig.length > 1) {
    if (elig.includes("QB")) return "SUPER_FLEX";
    if (
      elig.includes("RB") &&
      elig.includes("WR") &&
      elig.includes("TE")
    )
      return "FLEX";
    if (elig.includes("RB") && elig.includes("WR")) return "FLEX";
    if (elig.includes("K") && elig.includes("D/ST")) return "K";
  }

  const map = {
    QB: "QB",
    RB: "RB",
    WR: "WR",
    TE: "TE",
    K: "K",
    "D/ST": "DEF",
    DST: "DEF",
    DL: "DL",
    LB: "LB",
    DB: "DB",
    EDR: "DL",
  };
  return map[label] || label;
}

function buildSleeperRosterPositions(rules) {
  const positions = [];

  for (const pos of rules.roster_positions || []) {
    if (pos.group === "START") {
      const count = pos.start || 0;
      if (count > 0) {
        const sp = mapSlotToSleeperPos(pos);
        for (let i = 0; i < count; i++) positions.push(sp);
      }
    }
  }

  const benchCount = rules.num_bench || 6;
  for (let i = 0; i < benchCount; i++) positions.push("BN");

  return positions;
}

function buildSleeperScoringSettings(rules) {
  const s = {};
  for (const group of rules.groups || []) {
    for (const rule of group.scoring_rules || []) {
      const abbr = (rule.category?.abbreviation || "").toLowerCase();
      const pts = rule.points_per?.value || 0;

      if (abbr === "rec") s.rec = pts;
      else if (abbr === "rec yd" || abbr === "rec yds") s.rec_yd = pts;
      else if (abbr === "rush yd" || abbr === "rush yds") s.rush_yd = pts;
      else if (abbr === "pass yd" || abbr === "pass yds") s.pass_yd = pts;
      else if (abbr === "rec td") s.rec_td = pts;
      else if (abbr === "rush td") s.rush_td = pts;
      else if (abbr === "pass td") s.pass_td = pts;
      else if (abbr === "int") s.pass_int = pts;
      else if (abbr === "fum lost" || abbr === "fl") s.fum_lost = pts;
    }
  }
  return s;
}

// ─── Main Data Loading + Normalization ────────────────────

/**
 * Fetch FetchTeamPicks for every team and build Sleeper-format tradedPicks.
 * Each entry: { roster_id (original slot), owner_id (current holder), season, round }
 */
async function buildFFTradedPicks(leagueId, teamIds) {
  const allPickResponses = await Promise.all(
    teamIds.map((tid) => fetchFFTeamPicks(leagueId, tid).catch(() => ({ picks: [] }))),
  );

  const seen = new Set();
  const tradedPicks = [];

  for (const resp of allPickResponses) {
    for (const pick of resp.picks || []) {
      const ownedBy = pick.owned_by?.id;
      const originalOwner = pick.original_owner?.id;
      if (!ownedBy || !originalOwner || ownedBy === originalOwner) continue;

      const round = pick.slot?.round || 1;
      const key = `${originalOwner}_${pick.season}_${round}`;
      if (seen.has(key)) continue;
      seen.add(key);

      tradedPicks.push({
        roster_id: originalOwner,
        owner_id: ownedBy,
        season: String(pick.season),
        round,
      });
    }
  }

  return tradedPicks;
}

/**
 * Normalize FetchTrades (TRADES_COMPLETED) into Sleeper transaction format.
 */
function normalizeFFCompletedTrades(trades, lookup, sleeperPlayers) {
  return (trades || []).map((trade) => {
    const adds = {};
    const drops = {};
    const draftPicks = [];

    for (const tradeTeam of trade.teams || []) {
      const teamId = tradeTeam.team?.id;
      if (!teamId) continue;

      for (const lp of tradeTeam.players_obtained || []) {
        if (lp.pro_player) {
          adds[resolvePlayerId(lp.pro_player, lookup, sleeperPlayers)] = teamId;
        }
      }

      for (const lp of tradeTeam.players_released || []) {
        if (lp.pro_player) {
          drops[resolvePlayerId(lp.pro_player, lookup, sleeperPlayers)] = teamId;
        }
      }

      for (const pick of tradeTeam.picks_obtained || []) {
        let previousOwnerId = pick.original_owner?.id || null;
        if (trade.teams.length === 2) {
          const other = trade.teams.find((tt) => tt.team?.id !== teamId);
          if (other) previousOwnerId = other.team.id;
        }

        draftPicks.push({
          season: String(pick.season),
          round: pick.slot?.round || 1,
          owner_id: teamId,
          previous_owner_id: previousOwnerId,
        });
      }
    }

    return {
      type: "trade",
      status: "complete",
      created:
        Number(trade.approved_on) ||
        Number(trade.tentative_execution_time) ||
        Date.now(),
      adds,
      drops,
      draft_picks: draftPicks,
    };
  });
}

/**
 * Normalize FetchLeagueTransactions items (non-trade moves) into Sleeper format.
 */
function normalizeFFMoveTransactions(items, lookup, sleeperPlayers) {
  const transactions = [];

  for (const item of items) {
    const tx = item.transaction;
    if (!tx || tx.type === "TRANSACTION_TRADE") continue;

    const teamId = tx.team?.id;
    if (!teamId) continue;

    const timestamp = Number(item.time_epoch_milli) || Date.now();

    if (tx.type === "TRANSACTION_ADD" || tx.type === "TRANSACTION_CLAIM") {
      const adds = {};
      if (tx.player?.pro_player) {
        adds[resolvePlayerId(tx.player.pro_player, lookup, sleeperPlayers)] =
          teamId;
      }
      transactions.push({
        type: tx.type === "TRANSACTION_CLAIM" ? "waiver" : "free_agent",
        status: "complete",
        created: timestamp,
        adds,
        drops: {},
        draft_picks: [],
      });
    } else if (tx.type === "TRANSACTION_DROP") {
      const drops = {};
      if (tx.player?.pro_player) {
        drops[resolvePlayerId(tx.player.pro_player, lookup, sleeperPlayers)] =
          teamId;
      }
      transactions.push({
        type: "free_agent",
        status: "complete",
        created: timestamp,
        adds: {},
        drops,
        draft_picks: [],
      });
    }
  }

  return transactions;
}

/**
 * Fetches all Fleaflicker league data and normalizes it into
 * Sleeper-compatible objects for the analysis pipeline.
 *
 * @param {number} leagueId    Fleaflicker league ID
 * @param {number} teamId      Fleaflicker team ID (the user's team)
 * @param {Object} sleeperPlayers  Sleeper player database (will be mutated
 *                                 with synthetic entries for unmatched players)
 * @returns {{ league, myRoster, users, rosters, tradedPicks }}
 */
export async function loadFleaflickerLeague(leagueId, teamId, sleeperPlayers) {
  const lookup = buildPlayerLookup(sleeperPlayers);

  // Phase 1: Fetch core data + trade/transaction data in parallel
  const [rostersResp, myRosterResp, rulesResp, standingsResp, tradesResp, txnResp] =
    await Promise.all([
      fetchFFLeagueRosters(leagueId),
      fetchFFRoster(leagueId, teamId),
      fetchFFLeagueRules(leagueId),
      fetchFFLeagueStandings(leagueId),
      fetchFFTrades(leagueId).catch(() => ({ trades: [] })),
      fetchFFLeagueTransactions(leagueId).catch(() => ({ items: [] })),
    ]);

  const allTeams =
    standingsResp.divisions?.flatMap((d) => d.teams) || [];
  const teamIds = allTeams.map((t) => t.id).filter(Boolean);
  const rosterPositions = buildSleeperRosterPositions(rulesResp);
  const scoringSettings = buildSleeperScoringSettings(rulesResp);

  // ── Sleeper-format league ──
  const league = {
    league_id: `ff_${leagueId}`,
    name: standingsResp.league?.name || `Fleaflicker League ${leagueId}`,
    total_rosters: allTeams.length || rostersResp.rosters?.length || 12,
    roster_positions: rosterPositions,
    scoring_settings: scoringSettings,
    settings: { type: 2, draft_rounds: 4, playoff_week_start: 15 },
    season: String(standingsResp.season || new Date().getFullYear()),
    previous_league_id: null,
  };

  // ── Sleeper-format users ──
  const users = allTeams.map((t) => ({
    user_id: `ff_${t.owners?.[0]?.id || t.id}`,
    display_name: t.owners?.[0]?.display_name || t.name,
    metadata: { team_name: t.name },
    team_name: t.name,
  }));

  // ── Parse my detailed roster (starters / bench / taxi) ──
  const starters = [];
  const bench = [];
  const taxi = [];
  const reserve = [];

  for (const group of myRosterResp.groups || []) {
    const bucket =
      group.group === "START"
        ? starters
        : group.group === "TAXI"
          ? taxi
          : group.group === "INJURED"
            ? reserve
            : bench;

    for (const slot of group.slots || []) {
      const pro = slot.league_player?.pro_player;
      if (!pro) continue;
      bucket.push(resolvePlayerId(pro, lookup, sleeperPlayers));
    }
  }

  const myTeam = allTeams.find((t) => t.id === teamId) || {};
  const myOwner = myTeam.owners?.[0];

  const myRoster = {
    roster_id: teamId,
    owner_id: `ff_${myOwner?.id || teamId}`,
    league_id: league.league_id,
    players: [...starters, ...bench, ...taxi, ...reserve],
    starters,
    taxi,
    reserve,
    settings: {
      wins: myTeam.record_overall?.wins || 0,
      losses: myTeam.record_overall?.losses || 0,
      ties: myTeam.record_overall?.ties || 0,
      fpts: Math.round((myTeam.points_for?.value || 0) * 100) / 100,
      fpts_against:
        Math.round((myTeam.points_against?.value || 0) * 100) / 100,
      team_name: myTeam.name || "",
    },
  };

  // ── All rosters (from FetchLeagueRosters) ──
  const rosters = (rostersResp.rosters || []).map((r) => {
    if (r.team?.id === teamId) return myRoster;

    const t = r.team;
    const owner = t?.owners?.[0];
    const playerIds = (r.players || [])
      .filter((lp) => lp.pro_player)
      .map((lp) => resolvePlayerId(lp.pro_player, lookup, sleeperPlayers));

    return {
      roster_id: t?.id,
      owner_id: `ff_${owner?.id || t?.id}`,
      league_id: league.league_id,
      players: playerIds,
      starters: [],
      taxi: [],
      reserve: [],
      settings: {
        wins: t?.record_overall?.wins || 0,
        losses: t?.record_overall?.losses || 0,
        ties: t?.record_overall?.ties || 0,
        fpts: Math.round((t?.points_for?.value || 0) * 100) / 100,
        fpts_against:
          Math.round((t?.points_against?.value || 0) * 100) / 100,
        team_name: t?.name || "",
      },
    };
  });

  // Ensure my team is in the rosters array
  if (!rosters.find((r) => r.roster_id === teamId)) {
    rosters.push(myRoster);
  }

  // Phase 2: Fetch all team picks for traded picks data
  const tradedPicks = await buildFFTradedPicks(leagueId, teamIds);

  // Normalize transactions
  const tradeTransactions = normalizeFFCompletedTrades(
    tradesResp.trades,
    lookup,
    sleeperPlayers,
  );
  const moveTransactions = normalizeFFMoveTransactions(
    txnResp.items,
    lookup,
    sleeperPlayers,
  );
  const transactions = [...tradeTransactions, ...moveTransactions].sort(
    (a, b) => (b.created || 0) - (a.created || 0),
  );

  return { league, myRoster, users, rosters, tradedPicks, transactions };
}
