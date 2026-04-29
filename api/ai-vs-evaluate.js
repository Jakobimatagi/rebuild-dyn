// Gemini proxy for the VS-tab "Analyze with AI" admin feature.
//
// Takes a ranked list of college prospects (the current VS comparison view)
// and asks the model to (a) explain the overall ranking logic in 2–3 sentences
// and (b) generate a tweet-ready blurb for each of the top 10 players.
//
// API key lives only in Vercel env (GEMINI_API_KEY). Free Gemini quota is
// shared, so the client also caches by ranked-list fingerprint.

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are a dynasty fantasy football scout writing for an audience of dynasty managers on Twitter. You will receive a ranked list of college prospects from a VS comparison view. Each row includes the model's grade, the user's tier conviction, the prospect's tier label, and key recent-season stats.

Your job:

1. OVERVIEW (2–3 sentences): explain the dominant signal separating the top of the list from the middle, and call out any prospect whose rank doesn't match the obvious "elite school + draft hype" priors. Be specific — reference at least one stat or component that's doing the work.

2. For each of the TOP 10 players, write:
   - tweet: a tweet-ready blurb under 250 characters (leaves room for hashtags). Lead with the rank ("WR1:", "QB3:", etc. — use the player's POSITION rank within the list, not the overall rank). Cite ONE concrete stat or component. Reference tier/comp ONLY when it adds signal. No emojis unless they earn their spot. No "🚨 BREAKING" or "🚀 RISER" filler. Voice should be confident and scout-like, not hypey.
   - reasoning: ONE plain sentence (admin reference only, not for posting) summarizing why the model placed them here — what stat or component drove it.

Return ONLY a single JSON object, no prose, no markdown, no code fences:

{
  "overview": "2-3 sentence explanation of the ranking logic",
  "tweets": [
    {
      "rank": 1,
      "name": "Player Name",
      "tweet": "tweet text",
      "reasoning": "1 sentence why ranked here"
    }
  ]
}

Tweets array length must equal min(10, list length). Each tweet must be ≤ 250 characters. Names must match the input exactly.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const { rankedList, classes } = req.body || {};
  if (!Array.isArray(rankedList) || rankedList.length === 0) {
    return res.status(400).json({ error: "Missing rankedList in body" });
  }

  const userPrompt = `VS comparison: ${classes?.a ?? "?"} class vs ${classes?.b ?? "?"} class. Grades shown are RAW production grades (capital and market signal excluded so cross-class comparisons are fair).

Ranked list:
${JSON.stringify(rankedList, null, 2)}

Write the overview and the top-10 tweets as specified. Position-rank the tweets within the list (count only that position when assigning "WR1, WR2..." etc).`;

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
      return res
        .status(upstream.status)
        .json({ error: "Gemini upstream error", detail: data });
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim();

    if (!text) {
      return res
        .status(502)
        .json({ error: "Empty response from Gemini", raw: data });
    }

    const result = parseJsonLoose(text);
    if (!result || !Array.isArray(result.tweets)) {
      return res
        .status(502)
        .json({ error: "Could not parse JSON from model", raw: text });
    }

    res.setHeader("Cache-Control", "private, max-age=0, no-store");
    return res.status(200).json({ result });
  } catch (err) {
    return res
      .status(502)
      .json({ error: "Upstream request failed", detail: String(err) });
  }
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}
