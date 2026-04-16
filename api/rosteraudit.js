export default async function handler(req, res) {
  const { path, ...params } = req.query;
  if (!path) {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  const ALLOWED = new Set(["rankings", "picks"]);
  if (!ALLOWED.has(path)) {
    return res.status(403).json({ error: "Endpoint not allowed" });
  }

  const query = new URLSearchParams(params);
  const url = `https://rosteraudit.com/wp-json/ra/v1/${path}?${query}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
