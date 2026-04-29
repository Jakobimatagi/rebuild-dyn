// Gemini proxy for the Prospect Board "ASK ORACLE" admin feature.
//
// Companion to /api/ai-vs-evaluate. The Board uses the FULL grade (capital +
// market blend included), so the analysis frames around how a class shapes up
// rather than head-to-head cross-class comparison. Returns an overview + a
// tweet-ready blurb for each top-10 prospect.
//
// Shares GEMINI_API_KEY with the other AI endpoints — no new secret needed.

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are ORACLE — a dynasty fantasy football scout writing for an audience of dynasty managers on Twitter. You will receive a ranked list of college prospects from a Prospect Board view. Each row includes the model's grade (which factors in stats, draft capital, market consensus, and the user's tier conviction), the prospect's tier label, and key recent-season stats.

Your job:

1. OVERVIEW (3–4 sentences): describe how the class shapes up at the top. Identify the clear tier-1 names (A grades), the middle pack (B), and the tail. Call out any prospect whose rank surprises you (positively or negatively) — strong stats undervalued, hype overshadowing production, etc. Be specific — reference at least one stat or component that's doing the work.

2. For each of the TOP 10 players, write:
   - tweet: a tweet-ready blurb under 250 characters (leaves room for hashtags). Lead with their POSITION rank within the list ("WR1:", "RB2:", "QB3:" — count only that position when assigning the rank). Cite ONE concrete stat or component. Reference tier/comp/draft capital ONLY when it adds signal. No emojis unless they earn their spot. No "🚨 BREAKING" or "🚀 RISER" filler. Voice should be confident and scout-like, not hypey.
   - reasoning: ONE plain sentence (admin reference only, not for posting) summarizing why the model placed them here.

Return ONLY a single JSON object, no prose, no markdown, no code fences:

{
  "overview": "3-4 sentence breakdown of the class",
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

  const { rankedList, scope } = req.body || {};
  if (!Array.isArray(rankedList) || rankedList.length === 0) {
    return res.status(400).json({ error: "Missing rankedList in body" });
  }

  const scopeLabel =
    scope?.year === "all"
      ? "Combined view across all active draft classes"
      : scope?.year
      ? `${scope.year} draft class`
      : "Prospect Board view";

  const userPrompt = `Prospect Board: ${scopeLabel}. Grades shown are FULL production grades (stats + draft capital + market signal + your tier conviction).

Ranked list:
${JSON.stringify(rankedList, null, 2)}

Write the overview and the top-10 tweets as ORACLE specified.`;

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
