export default async function handler(req, res) {
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
