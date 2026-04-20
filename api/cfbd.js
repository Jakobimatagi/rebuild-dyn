const ALLOWED = new Set(["player/usage", "stats/player/season"]);

export default async function handler(req, res) {
  const { path, ...params } = req.query;
  if (!path || !ALLOWED.has(path)) {
    return res.status(403).json({ error: "Endpoint not allowed" });
  }

  const key = process.env.VITE_CFBD_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "CFBD key not configured on server" });
  }

  const year = Number(params.year);
  const currentYear = new Date().getFullYear();
  const isPast = Number.isFinite(year) && year < currentYear;
  const maxAge = isPast ? 2592000 : 86400;
  const swr = isPast ? 5184000 : 172800;

  const query = new URLSearchParams(params);
  const url = `https://api.collegefootballdata.com/${path}?${query}`;

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await upstream.text();
    res.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=${swr}`);
    res.setHeader("Content-Type", "application/json");
    return res.status(upstream.status).send(text);
  } catch (err) {
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
