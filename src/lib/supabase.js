import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, key);

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function verifyLogin(username, passkey) {
  const { data, error } = await supabase.rpc("verify_login", {
    p_username: username,
    p_passkey:  passkey,
  });
  if (error) throw error;
  return data; // { ok, id, username, role } or { ok: false }
}

// ── Prospects ─────────────────────────────────────────────────────────────────

export async function fetchAllData() {
  const [{ data: pros, error: e1 }, { data: seas, error: e2 }, { data: anns, error: e3 }] =
    await Promise.all([
      supabase.from("prospects").select("*"),
      supabase.from("prospect_seasons").select("*"),
      supabase.from("prospect_annotations").select("*"),
    ]);
  if (e1 || e2 || e3) throw e1 || e2 || e3;

  const seasonsByProspect = {};
  (seas || []).forEach((s) => {
    (seasonsByProspect[s.prospect_id] ??= []).push(s);
  });

  const annotationsMap = {};
  (anns || []).forEach((a) => {
    annotationsMap[a.prospect_id] = {
      tier:           a.tier             || "",
      draftCapital:   a.draft_capital    || "",
      landingSpot:    a.landing_spot     || "",
      declared:       a.declared         || false,
      rookieDraftAdp: a.rookie_draft_adp || "",
    };
  });

  const prospects = (pros || []).map((p) => ({
    id:                  p.id,
    name:                p.name,
    position:            p.position,
    projectedDraftYear:  p.projected_draft_year,
    draftCapital:        p.draft_capital        || "",
    comparablePlayer:    p.comparable_player    || "",
    athletic:            p.athletic             || {},
    seasons: (seasonsByProspect[p.id] || [])
      .sort((a, b) => (a.season_year ?? 0) - (b.season_year ?? 0))
      .map(dbSeasonToApp),
  }));

  return { prospects, annotations: annotationsMap };
}

function dbSeasonToApp(s) {
  const str = (v) => (v == null ? "" : String(v));
  return {
    season_year:        str(s.season_year),
    age:                str(s.age),
    school:             s.school             ?? "",
    games:              str(s.games),
    completions:        str(s.completions),
    pass_attempts:      str(s.pass_attempts),
    passing_yards:      str(s.passing_yards),
    yards_per_attempt:  str(s.yards_per_attempt),
    completion_pct:     str(s.completion_pct),
    passer_rating:      str(s.passer_rating),
    passing_tds:        str(s.passing_tds),
    interceptions:      str(s.interceptions),
    sacks:              str(s.sacks),
    rushing_yards:      str(s.rushing_yards),
    rushing_tds:        str(s.rushing_tds),
    rush_attempts:      str(s.rush_attempts),
    yards_per_carry:    str(s.yards_per_carry),
    longest_rush:       str(s.longest_rush),
    total_tds:          str(s.total_tds),
    targets:            str(s.targets),
    receptions:         str(s.receptions),
    receiving_yards:    str(s.receiving_yards),
    yards_per_reception:str(s.yards_per_reception),
    target_share_pct:   str(s.target_share_pct),
    catch_rate_pct:     str(s.catch_rate_pct),
    receiving_tds:      str(s.receiving_tds),
    longest_reception:  str(s.longest_reception),
    special_teams_yards:str(s.special_teams_yards),
    fumbles_lost:       str(s.fumbles_lost),
  };
}

export async function upsertProspect(prospect) {
  const { error: e1 } = await supabase.from("prospects").upsert({
    id:                  prospect.id,
    name:                prospect.name,
    position:            prospect.position,
    projected_draft_year: prospect.projectedDraftYear || null,
    draft_capital:       prospect.draftCapital        || "",
    comparable_player:   prospect.comparablePlayer    || "",
    athletic:            prospect.athletic             || {},
  });
  if (e1) throw e1;

  // Replace seasons: delete existing then bulk insert
  await supabase.from("prospect_seasons").delete().eq("prospect_id", prospect.id);

  const seasonRows = prospect.seasons
    .filter((s) => s.season_year)
    .map((s) => ({
      prospect_id:         prospect.id,
      season_year:         parseInt(s.season_year)       || null,
      age:                 parseFloat(s.age)              || null,
      school:              s.school                       || "",
      games:               parseFloat(s.games)            || null,
      completions:         parseFloat(s.completions)      || null,
      pass_attempts:       parseFloat(s.pass_attempts)    || null,
      passing_yards:       parseFloat(s.passing_yards)    || null,
      yards_per_attempt:   parseFloat(s.yards_per_attempt)|| null,
      completion_pct:      parseFloat(s.completion_pct)   || null,
      passer_rating:       parseFloat(s.passer_rating)    || null,
      passing_tds:         parseFloat(s.passing_tds)      || null,
      interceptions:       parseFloat(s.interceptions)    || null,
      sacks:               parseFloat(s.sacks)            || null,
      rushing_yards:       parseFloat(s.rushing_yards)    || null,
      rushing_tds:         parseFloat(s.rushing_tds)      || null,
      rush_attempts:       parseFloat(s.rush_attempts)    || null,
      yards_per_carry:     parseFloat(s.yards_per_carry)  || null,
      longest_rush:        parseFloat(s.longest_rush)     || null,
      total_tds:           parseFloat(s.total_tds)        || null,
      targets:             parseFloat(s.targets)          || null,
      receptions:          parseFloat(s.receptions)       || null,
      receiving_yards:     parseFloat(s.receiving_yards)  || null,
      yards_per_reception: parseFloat(s.yards_per_reception) || null,
      target_share_pct:    parseFloat(s.target_share_pct) || null,
      catch_rate_pct:      parseFloat(s.catch_rate_pct)   || null,
      receiving_tds:       parseFloat(s.receiving_tds)    || null,
      longest_reception:   parseFloat(s.longest_reception) || null,
      special_teams_yards: parseFloat(s.special_teams_yards) || null,
      fumbles_lost:        parseFloat(s.fumbles_lost)     || null,
    }));

  if (seasonRows.length > 0) {
    const { error: e2 } = await supabase.from("prospect_seasons").insert(seasonRows);
    if (e2) throw e2;
  }
}

export async function deleteProspect(id) {
  const { error } = await supabase.from("prospects").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertAnnotation(prospectId, ann) {
  const { error } = await supabase.from("prospect_annotations").upsert({
    prospect_id:      prospectId,
    tier:             ann.tier           || "",
    draft_capital:    ann.draftCapital   || "",
    landing_spot:     ann.landingSpot    || "",
    declared:         ann.declared       || false,
    rookie_draft_adp: ann.rookieDraftAdp || "",
  });
  if (error) throw error;
}

// ── Expert rankings ───────────────────────────────────────────────────────────

export async function getExperts() {
  const { data, error } = await supabase.rpc("get_experts");
  if (error) throw error;
  return data || [];
}

export async function fetchExpertRankings() {
  const { data, error } = await supabase
    .from("expert_rankings")
    .select("*")
    .order("rank_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertExpertRanking(userId, prospectId, rankOrder, tier = "", notes = "") {
  const { error } = await supabase.from("expert_rankings").upsert({
    user_id:     userId,
    prospect_id: prospectId,
    rank_order:  rankOrder,
    tier,
    notes,
  }, { onConflict: "user_id,prospect_id" });
  if (error) throw error;
}

export async function fetchMyRankings(userId) {
  const { data, error } = await supabase
    .from("expert_rankings").select("*").eq("user_id", userId);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => { map[r.prospect_id] = { rankOrder: r.rank_order, tier: r.tier || "", notes: r.notes || "" }; });
  return map;
}

export async function deleteExpertRanking(userId, prospectId) {
  const { error } = await supabase.from("expert_rankings")
    .delete()
    .eq("user_id", userId)
    .eq("prospect_id", prospectId);
  if (error) throw error;
}

// ── Historical comps (drafted WR/RB profiles + NFL outcomes, 2011-2026) ─────

let _historicalCache = null;
let _historicalPromise = null;

// Fetch historical_players once and memoize. The dataset is small (~1.1k rows)
// and changes once a year, so a process-lifetime cache is fine.
export async function fetchHistoricalPlayers() {
  if (_historicalCache) return _historicalCache;
  if (_historicalPromise) return _historicalPromise;
  _historicalPromise = (async () => {
    const { data, error } = await supabase
      .from("historical_players")
      .select("name, position, draft_year, draft_capital, draft_round, draft_pick, forty_time, ras, ten_plus_ppg_seasons, avg_top_finish, metrics");
    if (error) throw error;
    _historicalCache = data || [];
    return _historicalCache;
  })();
  return _historicalPromise;
}

// ── Public rankings page data ─────────────────────────────────────────────────
// Fetches everything needed without requiring auth
export async function fetchPublicRankingsData() {
  const [{ data: pros }, { data: seas }, { data: anns }, { data: rankings }, experts, historical] = await Promise.all([
    supabase.from("prospects").select("id, name, position, projected_draft_year, draft_capital, comparable_player, athletic"),
    supabase.from("prospect_seasons").select("*"),
    supabase.from("prospect_annotations").select("*"),
    supabase.from("expert_rankings").select("*").order("rank_order", { ascending: true }),
    getExperts(),
    fetchHistoricalPlayers().catch(() => []),
  ]);

  const seasonsByProspect = {};
  (seas || []).forEach((s) => {
    (seasonsByProspect[s.prospect_id] ??= []).push(s);
  });

  const annotationsMap = {};
  (anns || []).forEach((a) => {
    annotationsMap[a.prospect_id] = {
      tier:           a.tier             || "",
      draftCapital:   a.draft_capital    || "",
      landingSpot:    a.landing_spot     || "",
      declared:       a.declared         || false,
      rookieDraftAdp: a.rookie_draft_adp || "",
    };
  });

  const prospects = (pros || []).map((p) => ({
    ...p,
    seasons: (seasonsByProspect[p.id] || [])
      .sort((a, b) => (a.season_year ?? 0) - (b.season_year ?? 0))
      .map(dbSeasonToApp),
  }));

  // Group rankings by prospect
  const byProspect = {};
  (rankings || []).forEach((r) => {
    (byProspect[r.prospect_id] ??= []).push(r);
  });

  // Build consensus: average rank per prospect
  const consensusMap = {};
  Object.entries(byProspect).forEach(([pid, rows]) => {
    const avg = rows.reduce((s, r) => s + r.rank_order, 0) / rows.length;
    consensusMap[pid] = { avgRank: Math.round(avg * 10) / 10, count: rows.length };
  });

  return {
    prospects,
    annotations: annotationsMap,
    rankings: rankings || [],
    byProspect,
    consensusMap,
    experts,
    historicalPlayers: historical || [],
  };
}

// ── OC Entries ────────────────────────────────────────────────────────────────
// Read/write the `oc_entries` table. Shape per row:
//   { season, team, name, partial?, playcaller?, note? }
// Reads return a nested object { [season]: { [team]: entry } } matching OC_DATA.

export async function fetchOcEntries() {
  const { data, error } = await supabase
    .from("oc_entries")
    .select("season, team, name, partial, playcaller, note");
  if (error) throw error;
  const result = {};
  for (const row of data || []) {
    if (!result[row.season]) result[row.season] = {};
    const entry = { name: row.name };
    if (row.partial)   entry.partial   = true;
    if (row.playcaller) entry.playcaller = row.playcaller;
    if (row.note)      entry.note      = row.note;
    result[row.season][row.team] = entry;
  }
  return result;
}

/**
 * Upsert a single team-season entry. Pass `null` as `entry` to delete the row.
 */
export async function upsertOcEntry(season, team, entry) {
  if (!entry || !entry.name?.trim()) {
    const { error } = await supabase
      .from("oc_entries")
      .delete()
      .eq("season", season)
      .eq("team", team);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("oc_entries").upsert({
    season,
    team,
    name:       entry.name.trim(),
    partial:    entry.partial    || false,
    playcaller: entry.playcaller || null,
    note:       entry.note       || null,
  }, { onConflict: "season,team" });
  if (error) throw error;
}

/**
 * Ensure a season row exists for every NFL team (used when adding a new year).
 * Only inserts teams that don't already have a DB row.
 */
export async function initOcYear(season) {
  const { error } = await supabase.from("oc_entries").upsert(
    [{ season, team: "__init__", name: "" }],
    { onConflict: "season,team", ignoreDuplicates: true }
  );
  // Ignore errors on the sentinel row; it's just a year marker.
  void error;
}
