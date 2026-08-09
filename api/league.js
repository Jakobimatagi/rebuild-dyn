/**
 * External-league read proxy — ESPN and Fleaflicker in one serverless function
 * (they were split, but Vercel's Hobby plan caps deployments at 12 functions).
 * Dispatch is by method:
 *   • POST → ESPN. Sensitive cookies (espn_s2 / SWID) travel in the request body
 *     so they never land in a URL or log; forwarded to ESPN, never persisted.
 *   • GET  → Fleaflicker. Path-allowlisted passthrough.
 */
export default async function handler(req, res) {
  if (req.method === "POST") return handleEspn(req, res);
  return handleFleaflicker(req, res);
}

// ─── ESPN (POST) ──────────────────────────────────────────────────────────
// Body: { leagueId, season, views?: string[], espn_s2?, swid? }
async function handleEspn(req, res) {
  const body = req.body || {};
  const leagueId = String(body.leagueId || "").trim();
  const season = String(body.season || new Date().getFullYear()).trim();
  const views = Array.isArray(body.views) ? body.views : [];

  if (!/^\d+$/.test(leagueId)) {
    return res.status(400).json({ error: "Invalid or missing leagueId" });
  }
  if (!/^\d{4}$/.test(season)) {
    return res.status(400).json({ error: "Invalid season" });
  }

  // Allowlist of read-only views to keep this from being a general open proxy.
  const ALLOWED_VIEWS = new Set([
    "mTeam",
    "mRoster",
    "mSettings",
    "mMatchup",
    "mMatchupScore",
    "mStandings",
    "mTransactions2",
    "mDraftDetail",
    "mNav",
    "kona_player_info",
  ]);
  const safeViews = views.filter((v) => ALLOWED_VIEWS.has(v));

  const params = new URLSearchParams();
  for (const v of safeViews) params.append("view", v);

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}` +
    `/segments/0/leagues/${leagueId}` +
    (params.toString() ? `?${params}` : "");

  // Build the Cookie header for private leagues. SWID must be brace-wrapped;
  // users routinely paste it with or without the braces, so normalize.
  const headers = { Accept: "application/json" };
  const s2 = typeof body.espn_s2 === "string" ? body.espn_s2.trim() : "";
  let swid = typeof body.swid === "string" ? body.swid.trim() : "";
  if (swid && !swid.startsWith("{")) swid = `{${swid.replace(/[{}]/g, "")}}`;
  if (s2 && swid) {
    headers.Cookie = `espn_s2=${s2}; SWID=${swid}`;
  }

  try {
    const upstream = await fetch(url, { headers });
    if (upstream.status === 401) {
      return res.status(401).json({
        error:
          "ESPN denied access. For a private league, double-check your espn_s2 and SWID cookies.",
      });
    }
    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: `ESPN request failed (${upstream.status})` });
    }
    const data = await upstream.json();
    // Private-league responses are user-specific — don't let a shared CDN cache
    // them. Public-league reads are cheap enough to re-fetch.
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: "Upstream request failed" });
  }
}

// ─── Fleaflicker (GET) ────────────────────────────────────────────────────
// Query: ?path=<endpoint>&<params>
async function handleFleaflicker(req, res) {
  const { path, ...params } = req.query;
  if (!path) {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  // Allowlist of valid Fleaflicker endpoints to prevent open-proxy abuse
  const ALLOWED = new Set([
    "FetchUserLeagues",
    "FetchLeagueRosters",
    "FetchRoster",
    "FetchLeagueRules",
    "FetchLeagueStandings",
    "FetchTeamPicks",
    "FetchTrades",
    "FetchLeagueTransactions",
  ]);

  if (!ALLOWED.has(path)) {
    return res.status(403).json({ error: "Endpoint not allowed" });
  }

  const query = new URLSearchParams({ sport: "NFL", ...params });
  const url = `https://www.fleaflicker.com/api/${path}?${query}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
