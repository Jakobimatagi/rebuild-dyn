// ORACLE analysis for the Offensive Coordinator Rankings page.
// Receives a season's 32-team OC landscape (coordinator name, scheme tags,
// and PPR PPG fantasy ranks for each position room) and returns a structured
// dynasty fantasy briefing: overview, winners, losers, and scheme watch.
//
// Shares GEMINI_API_KEY with the other AI endpoints — no new secret needed.

const MODEL    = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are ORACLE — a dynasty fantasy football scout writing for dynasty managers. You will receive a single NFL season's 32-team offensive coordinator landscape: team names, coordinator names, coaching scheme tags, PPR PPG for each position room, and each room's rank (1 = best fantasy output, 32 = worst) among all 32 NFL teams.

Your job — DYNASTY fantasy lens only. Be specific, be sharp, avoid fluff.

1. OVERVIEW (3–4 sentences): The macro picture. Which schemes dominated this season? Which teams dramatically upgraded or downgraded their offensive environment? Identify the 1–2 biggest storylines a dynasty manager must know.

2. WINNERS — exactly 4 items. Players or position rooms most likely to benefit from their coordinator situation. Name specific players when you know them (use your knowledge of current rosters). Explain WHY the scheme or coordinator creates fantasy opportunity — cite the rank or PPG if it supports the claim.

3. LOSERS — exactly 4 items. Fade candidates. Players or rooms hurt by a coordinator mismatch, a historically poor OC environment, or a scheme that structurally suppresses fantasy production at that position. Be direct.

4. SCHEME_WATCH — 2 sentences. Which coaching tree produced the most fantasy-relevant rooms this season? Why should dynasty managers track it going forward (player archetype fit, historical OC trends, etc.)?

Return ONLY a single JSON object, no prose, no markdown, no code fences:
{
  "overview": "3–4 sentences",
  "winners": [
    { "name": "Player name or room (e.g. 'KC WR room', 'Bijan Robinson')", "team": "ABBR", "reason": "1–2 sentences" }
  ],
  "losers": [
    { "name": "...", "team": "ABBR", "reason": "..." }
  ],
  "scheme_watch": "2 sentences"
}

winners and losers arrays must each have exactly 4 entries.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const { teams, season } = req.body || {};
  if (!Array.isArray(teams) || teams.length === 0) {
    return res.status(400).json({ error: "Missing teams array in body" });
  }

  const userPrompt = `Season: ${season || "unknown"}

OC Landscape (${teams.length} teams):
${JSON.stringify(teams, null, 2)}

Provide the dynasty fantasy analysis as ORACLE specified.`;

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: "application/json",
    },
  };

  try {
    const upstream = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Gemini upstream error", detail: data });
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim();

    if (!text) {
      return res.status(502).json({ error: "Empty response from Gemini", raw: data });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "Failed to parse Gemini JSON", raw: text });
    }

    return res.status(200).json({ result: parsed });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
