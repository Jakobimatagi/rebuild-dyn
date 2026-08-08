/**
 * espnApi.js
 * ESPN Fantasy API client + normalization layer that converts ESPN league
 * data into Sleeper-compatible objects for the analysis pipeline.
 *
 * Mirrors fleaflickerApi.js: it must return the exact same contract
 *   { league, myRoster, users, rosters, tradedPicks, transactions, currentDraftComplete }
 * so the rest of the app (buildRosterAnalysis, getLeagueRulesContext, …) is
 * platform-agnostic.
 *
 * Reads go through the /api/espn POST proxy (CORS + private-league cookies).
 */

import { buildPlayerLookup, normalizeName } from "./fleaflickerApi.js";

const ESPN_PROXY = "/api/espn";

// ─── ESPN constant maps (from espn-api's constant.py) ─────

// Lineup slot IDs → Sleeper roster-position tokens. Slot 7 = OP (superflex),
// slot 23 = FLEX (RB/WR/TE). 20 = bench, 21 = IR (handled separately).
const SLOT_TO_SLEEPER = {
  0: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  7: "SUPER_FLEX",
  16: "DEF",
  17: "K",
  23: "FLEX",
  3: "FLEX", // RB/WR
  5: "FLEX", // WR/TE
  // IDP
  8: "DL",
  9: "DL",
  10: "LB",
  11: "DL",
  12: "DB",
  13: "DB",
  14: "DB",
  15: "IDP_FLEX",
};

// defaultPositionId → position string.
const POS_BY_DEFAULT = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DEF",
};

// Scoring statId → Sleeper scoring_settings key. Both 41 and 53 are receptions
// in ESPN's space (53 = "Each reception" is the scoring item; 41 an alias); map
// both. Same for the yardage aliases.
const STAT_TO_SLEEPER = {
  3: "pass_yd",
  22: "pass_yd",
  4: "pass_td",
  20: "pass_int",
  24: "rush_yd",
  40: "rush_yd",
  25: "rush_td",
  41: "rec",
  53: "rec",
  42: "rec_yd",
  61: "rec_yd",
  43: "rec_td",
  72: "fum_lost",
};

const PRO_TEAM_MAP = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
  8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
  15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI",
  22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS",
  29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

// ─── Low-level fetch ──────────────────────────────────────

/**
 * The active ESPN fantasy season. ESPN keys leagues by calendar year, and a
 * returning league's next season goes live in the summer — so the current
 * calendar year is the right default year-round (with a year-1 fallback for
 * leagues that only exist historically). This differs from the Sleeper/FF
 * stats-rollover convention, which lags to the previous year until September.
 */
export function currentEspnSeason() {
  return new Date().getFullYear();
}

/** Preferred season first, then the prior year as a fallback. */
function seasonCandidates(preferred) {
  const p = Number(preferred) || currentEspnSeason();
  return p - 1 === p ? [p] : [p, p - 1];
}

/**
 * Fetch an ESPN league payload with the given views in a single request.
 * ESPN accepts multiple `view` params, so one call returns settings + teams +
 * rosters + draft + transactions together. Throws on a non-OK upstream status.
 */
export async function fetchEspnLeague(leagueId, season, views, creds = {}) {
  const res = await fetch(ESPN_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leagueId: String(leagueId),
      season: String(season),
      views,
      espn_s2: creds.espn_s2 || "",
      swid: creds.swid || "",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || `ESPN API error: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/**
 * Fetch a league, trying the preferred season and then the prior year. Returns
 * { data, season } for the season that resolved. A 404 on the first try just
 * means the league lives in a different season year; anything else (401 auth,
 * 502) is surfaced immediately since retrying the year won't help.
 */
export async function fetchEspnLeagueWithSeason(leagueId, preferredSeason, views, creds = {}) {
  const candidates = seasonCandidates(preferredSeason);
  let lastErr;
  for (const season of candidates) {
    try {
      const data = await fetchEspnLeague(leagueId, season, views, creds);
      return { data, season };
    } catch (e) {
      lastErr = e;
      // Only a 404 is worth retrying against another season year.
      if (e.status !== 404) throw e;
    }
  }
  throw lastErr || new Error("ESPN league not found");
}

/**
 * Fetch just enough of an ESPN league to list its teams for the picker. ESPN
 * has no username→leagues endpoint, so the user supplies a league id and then
 * picks which team is theirs. When the SWID resolves to an owner, that team is
 * flagged `isMine` so the UI can pre-select it.
 *
 * Returns one picker entry per team, each self-contained for handleLeagueSelect.
 */
export async function fetchEspnLeagueTeams(leagueId, season, creds = {}) {
  const { data, season: resolvedSeason } = await fetchEspnLeagueWithSeason(
    leagueId,
    season,
    ["mSettings", "mTeam"],
    creds,
  );
  const settings = data.settings || {};
  const teams = data.teams || [];
  const leagueName = settings.name || `ESPN League ${leagueId}`;
  const seasonStr = String(data.seasonId || resolvedSeason);
  const mySwid = creds.swid ? `{${String(creds.swid).replace(/[{}]/g, "")}}` : "";

  if (!teams.length) {
    throw new Error(
      "No teams found. Check the league ID — and for a private league, your espn_s2 / SWID cookies.",
    );
  }

  return teams.map((t) => ({
    league_id: `espn_${leagueId}_${t.id}`,
    name: leagueName,
    total_rosters: settings.size || teams.length,
    season: seasonStr,
    _platform: "espn",
    _espn_league_id: String(leagueId),
    _espn_team_id: t.id,
    _espn_team_name: espnTeamName(t),
    _espn_is_mine: !!mySwid && (t.owners || []).includes(mySwid),
  }));
}

// ─── Normalization helpers ────────────────────────────────

/** ESPN team display name: newer payloads have `name`, older use location+nickname. */
export function espnTeamName(team) {
  if (team?.name) return team.name;
  const parts = [team?.location, team?.nickname].filter(Boolean);
  return parts.join(" ").trim() || team?.abbrev || `Team ${team?.id}`;
}

/** Strip the braces ESPN wraps SWID member ids in, for a stable user_id. */
function ownerKey(swid) {
  if (!swid) return null;
  return `espn_${String(swid).replace(/[{}]/g, "")}`;
}

/** Build Sleeper roster_positions from ESPN lineupSlotCounts. */
export function buildEspnRosterPositions(settings) {
  const counts = settings?.roster_settings?.lineup_slot_counts
    || settings?.rosterSettings?.lineupSlotCounts
    || {};
  const positions = [];
  let bench = 0;
  let ir = 0;

  for (const [slotId, count] of Object.entries(counts)) {
    const n = Number(count) || 0;
    if (n <= 0) continue;
    const id = Number(slotId);
    if (id === 20) { bench += n; continue; }
    if (id === 21) { ir += n; continue; }
    const token = SLOT_TO_SLEEPER[id];
    if (!token) continue; // skip HC/P/unused slots
    for (let i = 0; i < n; i++) positions.push(token);
  }

  for (let i = 0; i < bench; i++) positions.push("BN");
  for (let i = 0; i < ir; i++) positions.push("IR");
  return positions;
}

/**
 * Build Sleeper scoring_settings from ESPN scoringItems. Also derives a TE
 * reception premium (rec_te) when the reception item carries a per-position
 * override that beats the base — getLeagueRulesContext reads rec_te.
 */
export function buildEspnScoringSettings(settings) {
  const items = settings?.scoring_settings?.scoring_items
    || settings?.scoringSettings?.scoringItems
    || [];
  const s = {};

  for (const item of items) {
    const statId = Number(item.stat_id ?? item.statId);
    const key = STAT_TO_SLEEPER[statId];
    if (!key) continue;
    const pts = Number(item.points ?? 0);
    // Only take the first mapping for a key (avoid alias 41 overwriting 53).
    if (s[key] === undefined) s[key] = pts;

    // TE premium: reception item may carry pointsOverrides keyed by position id
    // (TE = 4) or lineup slot (TE = 6). Take whichever differs from the base.
    if (key === "rec") {
      const ov = item.points_overrides || item.pointsOverrides || {};
      const teOv = ov["4"] ?? ov["6"];
      if (teOv != null && Number(teOv) !== pts) s.rec_te = Number(teOv);
    }
  }
  return s;
}

/**
 * Map an ESPN player object to a Sleeper player_id, minting a synthetic
 * `espn_{id}` entry (distinct from Sleeper ids and Fleaflicker's `ff_`) when no
 * name+position match exists. Mutates sleeperPlayers, matching fleaflicker's
 * shared-db convention.
 */
function resolveEspnPlayerId(player, lookup, sleeperPlayers) {
  if (!player) return null;
  const pos = POS_BY_DEFAULT[player.defaultPositionId] || "NA";
  const fullName = player.fullName
    || [player.firstName, player.lastName].filter(Boolean).join(" ");
  const norm = normalizeName(fullName);

  const byPos = lookup.byNamePos.get(`${norm}__${pos}`);
  if (byPos) return byPos;
  const byName = lookup.byName.get(norm);
  if (byName) return byName;

  const syntheticId = `espn_${player.id}`;
  if (!sleeperPlayers[syntheticId]) {
    sleeperPlayers[syntheticId] = {
      player_id: syntheticId,
      full_name: fullName || "Unknown",
      first_name: player.firstName || "",
      last_name: player.lastName || "",
      position: pos,
      team: PRO_TEAM_MAP[player.proTeamId] || "",
      age: null,
      years_exp: null,
      fantasy_positions: pos !== "NA" ? [pos] : [],
      status: "Active",
    };
  }
  return syntheticId;
}

/** Bucket a roster entry's slot into starters / bench / reserve(IR). */
function bucketForSlot(slotId) {
  if (slotId === 20) return "bench";
  if (slotId === 21) return "reserve";
  return "starters";
}

/**
 * Fetch all ESPN league data and normalize it into Sleeper-compatible objects.
 *
 * @param {string|number} leagueId  ESPN league id
 * @param {string|number} teamId    the user's ESPN team id (may be null → first team)
 * @param {Object} sleeperPlayers   Sleeper player db (mutated with synthetics)
 * @param {{espn_s2?:string, swid?:string, season?:string|number}} creds
 * @returns {{ league, myRoster, users, rosters, tradedPicks, transactions, currentDraftComplete }}
 */
export async function loadEspnLeague(leagueId, teamId, sleeperPlayers, creds = {}) {
  const { data } = await fetchEspnLeagueWithSeason(
    leagueId,
    creds.season || currentEspnSeason(),
    ["mSettings", "mTeam", "mRoster", "mDraftDetail", "mTransactions2", "mMatchup"],
    creds,
  );

  const lookup = buildPlayerLookup(sleeperPlayers);
  const settings = data.settings || {};
  const teams = data.teams || [];
  const members = data.members || [];
  const memberById = new Map(members.map((m) => [m.id, m]));

  const rosterPositions = buildEspnRosterPositions(settings);
  const scoringSettings = buildEspnScoringSettings(settings);

  // ESPN player id → resolved Sleeper id, populated as we walk rosters. Reused
  // by transaction normalization, whose items carry only a playerId (no name).
  const espnIdToSleeperId = new Map();

  // ESPN has no dynasty type; keeper leagues carry a keeperCount. type: 1 =
  // keeper, 0 = redraft (both drive redraft mode in Phase B).
  const keeperCount =
    Number(settings?.draftSettings?.keeperCount ?? settings?.draftSettings?.keeperCountFuture ?? 0);
  const leagueType = keeperCount > 0 ? 1 : 0;

  const playoffStart = settings?.scheduleSettings?.playoffMatchupPeriodStart || 15;

  // ── Regular-season matchup schedule (mMatchup) ──
  // Normalize to { week, home, away } (rosterId = ESPN team id), regular season
  // only. Powers real-schedule power-ranking sims and the weekly matchup view.
  const schedule = [];
  for (const m of data.schedule || []) {
    const week = m.matchupPeriodId;
    const home = m.home?.teamId;
    const away = m.away?.teamId;
    if (week == null || home == null || away == null) continue;
    if (week >= playoffStart) continue; // exclude playoffs/consolation
    schedule.push({ week, home, away });
  }

  // ── Sleeper-format league ──
  const league = {
    league_id: `espn_${leagueId}`,
    name: settings.name || `ESPN League ${leagueId}`,
    total_rosters: settings.size || teams.length || 12,
    roster_positions: rosterPositions,
    scoring_settings: scoringSettings,
    settings: {
      type: leagueType,
      draft_rounds: rosterPositions.filter((p) => p !== "BN" && p !== "IR").length || 15,
      playoff_week_start: playoffStart,
    },
    season: String(data.seasonId || creds.season || currentEspnSeason()),
    previous_league_id: null,
  };

  // ── Users (one per team, keyed by owner SWID) ──
  const users = teams.map((t) => {
    const swid = t.owners?.[0];
    const member = swid ? memberById.get(swid) : null;
    const name = espnTeamName(t);
    const display =
      member?.displayName
      || [member?.firstName, member?.lastName].filter(Boolean).join(" ")
      || name;
    return {
      user_id: ownerKey(swid) || `espn_team_${t.id}`,
      display_name: display,
      metadata: { team_name: name },
      team_name: name,
    };
  });

  // ── Rosters (all teams) ──
  const selectedTeamId = teamId != null ? Number(teamId) : null;
  let myRoster = null;

  const rosters = teams.map((t) => {
    const swid = t.owners?.[0];
    const ownerId = ownerKey(swid) || `espn_team_${t.id}`;
    const starters = [];
    const bench = [];
    const reserve = [];

    for (const entry of t.roster?.entries || []) {
      const player = entry.playerPoolEntry?.player;
      const pid = resolveEspnPlayerId(player, lookup, sleeperPlayers);
      if (!pid) continue;
      if (player?.id != null) espnIdToSleeperId.set(player.id, pid);
      const bucket = bucketForSlot(entry.lineupSlotId);
      if (bucket === "starters") starters.push(pid);
      else if (bucket === "reserve") reserve.push(pid);
      else bench.push(pid);
    }

    const overall = t.record?.overall || {};
    const roster = {
      roster_id: t.id,
      owner_id: ownerId,
      league_id: league.league_id,
      players: [...starters, ...bench, ...reserve],
      starters,
      taxi: [],
      reserve,
      settings: {
        wins: overall.wins || 0,
        losses: overall.losses || 0,
        ties: overall.ties || 0,
        fpts: Math.round((overall.pointsFor || 0) * 100) / 100,
        fpts_against: Math.round((overall.pointsAgainst || 0) * 100) / 100,
        team_name: espnTeamName(t),
      },
    };

    if (selectedTeamId != null && t.id === selectedTeamId) myRoster = roster;
    return roster;
  });

  // Fall back to the first team if the caller didn't pin a team id.
  if (!myRoster) myRoster = rosters[0] || null;

  // ESPN redraft/keeper leagues don't trade future rookie picks like dynasty.
  const tradedPicks = [];

  const transactions = normalizeEspnTransactions(
    data.transactions,
    teams,
    espnIdToSleeperId,
  );

  const currentDraftComplete = !!data.draftDetail?.drafted;

  return {
    league,
    myRoster,
    users,
    rosters,
    tradedPicks,
    transactions,
    currentDraftComplete,
    schedule,
  };
}

/**
 * Best-effort normalize ESPN transactions into Sleeper transaction shape.
 * ESPN's mTransactions2 payload is sparse/variable, so anything unparseable is
 * simply skipped — the Activity tab treats transactions as best-effort.
 */
export function normalizeEspnTransactions(txns, teams, espnIdToSleeperId) {
  if (!Array.isArray(txns)) return [];
  const teamOwner = new Map(
    (teams || []).map((t) => [t.id, ownerKey(t.owners?.[0]) || `espn_team_${t.id}`]),
  );

  const out = [];
  for (const tx of txns) {
    const items = tx.items || [];
    if (!items.length) continue;

    const isTrade = tx.type === "TRADE_ACCEPT" || tx.type === "TRADE";
    const adds = {};
    const drops = {};

    for (const it of items) {
      // Resolve only players we already matched from a roster; ESPN transaction
      // items carry no name, so unknown ids are skipped rather than guessed.
      const pid = it.playerId != null ? espnIdToSleeperId.get(it.playerId) : null;
      if (!pid) continue;
      if (it.type === "ADD" && it.toTeamId != null) {
        adds[pid] = teamOwner.get(it.toTeamId) || it.toTeamId;
      } else if (it.type === "DROP" && it.fromTeamId != null) {
        drops[pid] = teamOwner.get(it.fromTeamId) || it.fromTeamId;
      }
    }

    if (!Object.keys(adds).length && !Object.keys(drops).length) continue;

    out.push({
      type: isTrade ? "trade" : tx.type === "WAIVER" ? "waiver" : "free_agent",
      status: "complete",
      created: Number(tx.proposedDate) || Number(tx.processDate) || Date.now(),
      adds,
      drops,
      draft_picks: [],
    });
  }
  return out.sort((a, b) => (b.created || 0) - (a.created || 0));
}
