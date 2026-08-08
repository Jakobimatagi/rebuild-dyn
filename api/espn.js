/**
 * ESPN Fantasy read proxy.
 *
 * ESPN's fantasy read API (lm-api-reads.fantasy.espn.com) does not send
 * permissive CORS headers and, for private leagues, requires the user's
 * `espn_s2` + `SWID` cookies on the upstream request. The browser can't set a
 * cross-origin Cookie header, so all ESPN reads funnel through this function.
 *
 * POST (not GET) so the sensitive cookies travel in the request body and never
 * land in a URL, query string, or access log. The cookies are forwarded to
 * ESPN and never persisted server-side.
 *
 * Body: { leagueId, season, views?: string[], espn_s2?, swid? }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
