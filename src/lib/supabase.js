import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Whether this page load came from a password-reset email link. Captured at
// module load — BEFORE createClient's async URL handling consumes and strips
// the hash — so the UI can prompt for a new password instead of auto-navigating
// the (now recovery-authenticated) user straight to their teams.
export const isRecoveryRedirect =
  typeof window !== "undefined" && /\btype=recovery\b/.test(window.location.hash || "");

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

// ── App accounts (email + password) ─────────────────────────────────────────
// Plain Supabase Auth: sign up / sign in with email + password, with optional
// TOTP two-factor (MFA). Sessions persist in localStorage, so getAccount()
// restores the signed-in user on reload and signOutAccount() ends the session.
// Accounts are optional — the no-login browse flow still works.

// Create an account. If "Confirm email" is ON in the Supabase dashboard, no
// session is returned until the user clicks the confirmation link, so callers
// should check whether `session` came back to know if they're signed in.
export async function signUpEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

// Sign in with email + password. Returns the user. If the account has 2FA
// enabled, the session comes back at AAL1 — call getAal()/challengeTotp() next
// to step up to AAL2 before treating the user as fully signed in.
export async function signInEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOutAccount() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Returns the current Supabase user (or null) without throwing.
export async function getAccount() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

// Returns the current session's access token (or null). Used to authenticate
// calls to admin-gated serverless endpoints (Authorization: Bearer <token>).
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// The Sleeper username linked to an account is stored in user_metadata so a
// returning user jumps straight to their teams. Read it off a user object.
export function getSleeperUsername(user) {
  return user?.user_metadata?.sleeper_username || null;
}

// Admin status lives in the user's app_metadata (set server-side / by the head
// admin — NOT user-editable, so it can't be self-granted from the client). Read
// it off a user object; defaults to false.
export function getIsAdmin(user) {
  return user?.app_metadata?.is_admin === true;
}

// Convenience: is the currently signed-in user an admin?
export async function isAdmin() {
  return getIsAdmin(await getAccount());
}

// Shape a Supabase auth user into the { id, username, role } object the admin
// pages expect. id is the auth uid — which (post-merge) equals the expert id in
// public.users, so expert_rankings key correctly off session.user.id.
export function adminUserShape(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.user_metadata?.display_name || u.email,
    role: "admin",
  };
}

// Restore an admin session on mount: shaped admin user, or null if not signed
// in / not an admin.
export async function restoreAdmin() {
  const u = await getAccount();
  return getIsAdmin(u) ? adminUserShape(u) : null;
}

// Sign in and require admin. Throws on bad credentials or a non-admin account
// (and signs that non-admin back out). Returns the shaped admin user.
export async function adminSignIn(email, password) {
  const u = await signInEmail(email, password);
  if (!getIsAdmin(u)) {
    await signOutAccount().catch(() => {});
    throw new Error("This account doesn't have admin access.");
  }
  return adminUserShape(u);
}

// ── Admin management (invite / list / revoke other admins) ──────────────────
// Calls the service-role api/admin-users endpoint, authenticated with the
// caller's access token. The server re-verifies the caller is an admin.
async function adminApi(action, payload) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  const res = await fetch("/api/admin-users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export async function listAdmins() {
  return (await adminApi("list")).admins || [];
}
export function inviteAdmin(email) {
  return adminApi("invite", { email });
}
export function revokeAdmin(userId) {
  return adminApi("revoke", { userId });
}

// Persist the Sleeper username on the signed-in account.
export async function setSleeperUsername(username) {
  const { error } = await supabase.auth.updateUser({
    data: { sleeper_username: username },
  });
  if (error) throw error;
}

// Subscribe to auth state changes (sign in / out / token refresh).
// Returns an unsubscribe function.
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

// ── Password reset ───────────────────────────────────────────────────────────
// Email the user a reset link. Clicking it returns them to the app with a
// short-lived recovery session and fires a PASSWORD_RECOVERY auth event
// (see onPasswordRecovery) so the UI can prompt for a new password.
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

// Set a new password for the current session (recovery or normal sign-in).
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Update editable profile fields stored in user_metadata. Pass only the keys
// that change. Returns the updated user.
export async function updateProfileInfo({ displayName, sleeperUsername }) {
  const data = {};
  if (displayName !== undefined) data.display_name = displayName;
  if (sleeperUsername !== undefined) data.sleeper_username = sleeperUsername;
  const { data: res, error } = await supabase.auth.updateUser({ data });
  if (error) throw error;
  return res.user;
}

// Change the account email. With email-change confirmation on (Supabase default)
// the new address must be confirmed via an emailed link before it takes effect.
export async function updateEmail(email) {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw error;
}

// Fire cb() when the user lands via a password-reset link. Returns unsubscribe.
export function onPasswordRecovery(cb) {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") cb();
  });
  return () => data.subscription.unsubscribe();
}

// ── MFA (TOTP / authenticator app) ──────────────────────────────────────────
// Assurance levels: a fresh password sign-in is AAL1; once a TOTP challenge is
// verified the session is AAL2. If currentLevel is "aal1" but nextLevel is
// "aal2", the user has 2FA enabled and still needs to pass a challenge.
export async function getAal() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data; // { currentLevel, nextLevel, currentAuthenticationMethods }
}

// All TOTP factors on the account. `verified` ones gate sign-in; an `unverified`
// one is a half-finished enrollment that should be cleaned up.
export async function listTotpFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data?.totp ?? [];
}

// True when the signed-in user has a fully verified TOTP factor.
export async function hasMfaEnabled() {
  const totp = await listTotpFactors();
  return totp.some((f) => f.status === "verified");
}

// Begin TOTP enrollment. Returns the factorId plus an SVG QR code (data URI),
// the raw secret, and the otpauth:// URI for manual entry. Not active until
// verifyEnrollTotp() confirms a code from the user's authenticator app.
export async function enrollTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error) throw error;
  return {
    factorId: data.id,
    qr: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

// Finish enrollment by verifying a 6-digit code against the pending factor.
// On success the factor becomes "verified" and the session steps up to AAL2.
export async function verifyEnrollTotp(factorId, code) {
  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
  if (chErr) throw chErr;
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: ch.id,
    code: String(code).trim(),
  });
  if (error) throw error;
}

// Pass a login-time challenge: steps an AAL1 session up to AAL2.
export async function challengeTotp(factorId, code) {
  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
  if (chErr) throw chErr;
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: ch.id,
    code: String(code).trim(),
  });
  if (error) throw error;
}

// Remove a factor (disable 2FA, or clean up an abandoned enrollment).
export async function unenrollFactor(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

// ── Sleeper-verified login (SMS/email one-time code) ────────────────────────────
// Public hCaptcha sitekey Sleeper uses on their own login page. The code-send
// step requires a token generated against THIS key so Sleeper accepts it.
export const SLEEPER_HCAPTCHA_SITEKEY = "3bb6d565-5eb0-425f-acf8-64374f8bbc7b";

async function sleeperAuth(payload) {
  const res = await fetch("/api/sleeper-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Step 1: ask Sleeper to send the one-time code to the account's contact.
// `captchaToken` comes from the hCaptcha widget (Sleeper's sitekey above).
export async function requestSleeperCode(email, captchaToken) {
  return sleeperAuth({ action: "request-code", email, captcha: captchaToken });
}

// Step 2: verify the code. On success the server mints a Supabase magic-link
// token, which we exchange here for a real session — leaving the user signed in.
// Returns the linked Sleeper profile ({ user_id, username, display_name, avatar }).
export async function verifySleeperCode(email, code) {
  const { token_hash, sleeper } = await sleeperAuth({ action: "verify-code", email, code });
  const { error } = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
  if (error) throw error;
  return sleeper;
}

// ── Prospects ─────────────────────────────────────────────────────────────────

// Supabase caps every select at 1000 rows by default, and a plain .select()
// silently truncates past that — prospect_seasons (~1.5k) and
// historical_players (~1.1k) are already over the cap, which made freshly
// added prospects come back with no seasons. Page through .range(), ordered
// by primary key so pages can't overlap or skip rows. Exported for the other
// over-cap readers (player_projections, startup_adp); `applyFilters` receives
// the query builder to add .eq() clauses before the order/range.
export async function fetchAllRows(table, columns = "*", orderCols = ["id"], applyFilters) {
  const pageSize = 1000;
  const out = [];
  for (let from = 0; ; from += pageSize) {
    let q = supabase.from(table).select(columns);
    if (applyFilters) q = applyFilters(q);
    for (const c of orderCols) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

export async function fetchAllData() {
  const [pros, seas, anns] = await Promise.all([
    fetchAllRows("prospects"),
    fetchAllRows("prospect_seasons"),
    fetchAllRows("prospect_annotations", "*", ["prospect_id"]),
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
    catchable_rate_pct: str(s.catchable_rate_pct),
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
  const { error: eDel } = await supabase.from("prospect_seasons").delete().eq("prospect_id", prospect.id);
  if (eDel) throw eDel;

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
      catchable_rate_pct:  parseFloat(s.catchable_rate_pct) || null,
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
  return fetchAllRows("expert_rankings", "*", ["rank_order", "user_id", "prospect_id"]);
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
    _historicalCache = await fetchAllRows(
      "historical_players",
      "name, position, draft_year, draft_capital, draft_round, draft_pick, forty_time, ras, ten_plus_ppg_seasons, avg_top_finish, metrics",
    );
    return _historicalCache;
  })();
  return _historicalPromise;
}

// ── Public rankings page data ─────────────────────────────────────────────────
// Fetches everything needed without requiring auth
export async function fetchPublicRankingsData() {
  const [pros, seas, anns, rankings, experts, historical] = await Promise.all([
    fetchAllRows("prospects", "id, name, position, projected_draft_year, draft_capital, comparable_player, athletic"),
    fetchAllRows("prospect_seasons"),
    fetchAllRows("prospect_annotations", "*", ["prospect_id"]),
    fetchAllRows("expert_rankings", "*", ["rank_order", "user_id", "prospect_id"]),
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

// ── Value snapshots (trade "value then") ───────────────────────────────────────
// Dated FantasyCalc value snapshots captured daily by api/snapshot-values.js.
// We fetch only the players involved in the league's trades and reshape into the
// lookup buildTradeReview expects:
//   { dates: string[] asc, byDatePlayer: Map<`${date}|${sleeperId}`, value>,
//     earliestDate: string | null }
export async function fetchTradeValueSnapshots(sleeperIds = []) {
  const ids = [...new Set((sleeperIds || []).map(String).filter(Boolean))];
  const empty = { dates: [], byDatePlayer: new Map(), earliestDate: null };
  if (ids.length === 0) return empty;

  // Supabase caps .in() lists; chunk to stay well under URL limits.
  const CHUNK = 200;
  const rows = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const data = await fetchAllRows(
      "value_snapshots",
      "snap_date, sleeper_id, value",
      ["snap_date", "sleeper_id"],
      (q) => q.eq("source", "fc").in("sleeper_id", slice),
    );
    rows.push(...data);
  }

  const byDatePlayer = new Map();
  const dateSet = new Set();
  for (const r of rows) {
    const d = String(r.snap_date).slice(0, 10);
    byDatePlayer.set(`${d}|${String(r.sleeper_id)}`, Number(r.value || 0));
    dateSet.add(d);
  }
  const dates = [...dateSet].sort();
  return {
    dates,
    byDatePlayer,
    earliestDate: dates.length ? dates[0] : null,
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

// ── DC Entries ────────────────────────────────────────────────────────────────
// Read/write the `dc_entries` table — the defensive-coordinator twin of
// oc_entries, same shape and semantics. See docs/migrations/dc_entries_schema.sql.

export async function fetchDcEntries() {
  const { data, error } = await supabase
    .from("dc_entries")
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
export async function upsertDcEntry(season, team, entry) {
  if (!entry || !entry.name?.trim()) {
    const { error } = await supabase
      .from("dc_entries")
      .delete()
      .eq("season", season)
      .eq("team", team);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("dc_entries").upsert({
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
 * Upsert a whole season of DC entries in one request — used by the editor's
 * Advance Season button, which copies ~32 rows at once. Entries without a
 * name are skipped (upsertDcEntry handles single-row deletes).
 */
export async function bulkUpsertDcEntries(season, entriesByTeam) {
  const rows = Object.entries(entriesByTeam || {})
    .filter(([, e]) => e?.name?.trim())
    .map(([team, e]) => ({
      season,
      team,
      name:       e.name.trim(),
      partial:    e.partial    || false,
      playcaller: e.playcaller || null,
      note:       e.note       || null,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("dc_entries")
    .upsert(rows, { onConflict: "season,team" });
  if (error) throw error;
}

/**
 * Ensure a season exists in the DB (used when adding a new year in the editor).
 * Same sentinel-row trick as initOcYear.
 */
export async function initDcYear(season) {
  const { error } = await supabase.from("dc_entries").upsert(
    [{ season, team: "__init__", name: "" }],
    { onConflict: "season,team", ignoreDuplicates: true }
  );
  // Ignore errors on the sentinel row; it's just a year marker.
  void error;
}

// ── Rookie Draft Plans ────────────────────────────────────────────────────────
// One plan per (user_id, league_id, season). `picks` stores
// { [pickKey]: prospectId } and `prospect_snapshot` freezes the prospect's
// plan-time grade so retrospective grading isn't disrupted by later edits.

export async function fetchDraftPlans(userId, leagueId) {
  const { data, error } = await supabase
    .from("rookie_draft_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("league_id", leagueId)
    .order("season", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchDraftPlan(userId, leagueId, season) {
  const { data, error } = await supabase
    .from("rookie_draft_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("league_id", leagueId)
    .eq("season", Number(season))
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function upsertDraftPlan(plan) {
  const { error } = await supabase.from("rookie_draft_plans").upsert({
    user_id:           plan.userId,
    league_id:         plan.leagueId,
    league_name:       plan.leagueName  || null,
    team_name:         plan.teamName    || null,
    roster_id:         plan.rosterId    ?? null,
    season:            Number(plan.season),
    picks:             plan.picks             || {},
    prospect_snapshot: plan.prospectSnapshot  || {},
    notes:             plan.notes ?? null,
  }, { onConflict: "user_id,league_id,season" });
  if (error) throw error;
}

export async function deleteDraftPlan(userId, leagueId, season) {
  const { error } = await supabase
    .from("rookie_draft_plans")
    .delete()
    .eq("user_id", userId)
    .eq("league_id", leagueId)
    .eq("season", Number(season));
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

// ── Tier Maker boards ─────────────────────────────────────────────────────────
// One board per (user_id, position_scope). `tiers` stores
// { S: [sleeperPlayerId, ...], A: [...], ..., E: [...] } with array order =
// display order within the tier row. Schema:
// docs/migrations/player_tier_rankings_schema.sql

export async function fetchTierRankings(userId) {
  const { data, error } = await supabase
    .from("player_tier_rankings")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return data || [];
}

export async function upsertTierRanking({ userId, positionScope, title, tiers }) {
  const { error } = await supabase.from("player_tier_rankings").upsert(
    {
      user_id:        userId,
      position_scope: positionScope,
      title:          title || null,
      tiers:          tiers || {},
    },
    { onConflict: "user_id,position_scope" },
  );
  if (error) throw error;
}

export async function deleteTierRanking(userId, positionScope) {
  const { error } = await supabase
    .from("player_tier_rankings")
    .delete()
    .eq("user_id", userId)
    .eq("position_scope", positionScope);
  if (error) throw error;
}

// ── Trade Tinder ──────────────────────────────────────────────────────────────
// Swipes are anonymous — keyed by a random session UUID stored in localStorage,
// not tied to any Sleeper identity. Swiped hashes are also cached locally so
// the queue can filter them client-side without a round-trip.

export function getTinderSessionId() {
  let id = localStorage.getItem("tinder_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("tinder_session_id", id);
  }
  return id;
}

export function getSwipedHashes(leagueId) {
  try {
    return new Set(
      JSON.parse(localStorage.getItem(`tinder_swiped_${leagueId}`) || "[]"),
    );
  } catch {
    return new Set();
  }
}

function persistSwipedHash(leagueId, hash) {
  const key = `tinder_swiped_${leagueId}`;
  const current = getSwipedHashes(leagueId);
  current.add(hash);
  localStorage.setItem(key, JSON.stringify([...current]));
}

export async function recordSwipe({
  leagueId,
  tradeHash,
  teamAId,
  teamBId,
  assetsA,
  assetsB,
  engineVerdict,
  engineNet,
  userVerdict,
}) {
  persistSwipedHash(leagueId, tradeHash);
  const { error } = await supabase.from("trade_swipes").upsert(
    {
      league_id: leagueId,
      session_id: getTinderSessionId(),
      trade_hash: tradeHash,
      team_a_id: String(teamAId),
      team_b_id: String(teamBId),
      assets_a: assetsA,
      assets_b: assetsB,
      engine_verdict: engineVerdict,
      engine_net: engineNet,
      user_verdict: userVerdict,
    },
    { onConflict: "league_id,session_id,trade_hash" },
  );
  if (error) throw error;
}

export function getSwipedSentimentHashes(leagueId) {
  try {
    return new Set(
      JSON.parse(localStorage.getItem(`sentiment_swiped_${leagueId}`) || "[]"),
    );
  } catch {
    return new Set();
  }
}

function persistSentimentHash(leagueId, hash) {
  const key = `sentiment_swiped_${leagueId}`;
  const current = getSwipedSentimentHashes(leagueId);
  current.add(hash);
  localStorage.setItem(key, JSON.stringify([...current]));
}

export async function recordPlayerSentiment({
  leagueId,
  playerId,
  playerName,
  position,
  age,
  value,
  verdict, // "buy" | "sell" | "ignore"
}) {
  const cardHash = `sentiment-${playerId}`;
  persistSentimentHash(leagueId, cardHash);
  const { error } = await supabase.from("player_sentiment_swipes").upsert(
    {
      league_id: leagueId,
      session_id: getTinderSessionId(),
      player_id: playerId,
      player_name: playerName,
      position,
      age,
      value,
      verdict,
    },
    { onConflict: "league_id,session_id,player_id" },
  );
  if (error) throw error;
}

export async function fetchPerceptionSwipes(leagueId) {
  const { data, error } = await supabase
    .from("trade_swipes")
    .select("assets_a, assets_b, engine_verdict, user_verdict, team_a_id, team_b_id")
    .eq("league_id", leagueId);
  if (error) throw error;
  return data || [];
}

// Community-wide perception: every league's swipes aggregated. Powers the
// no-login Explore view, where there is no single league to scope to.
export async function fetchGlobalPerceptionSwipes() {
  const { data, error } = await supabase
    .from("trade_swipes")
    .select("assets_a, assets_b, engine_verdict, user_verdict, team_a_id, team_b_id");
  if (error) throw error;
  return data || [];
}
