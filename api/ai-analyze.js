// Gemini proxy for "Analyze Team with AI" feature.
//
// Uses Gemini 2.0 Flash with Google Search grounding so the model can pull
// fresh injury / depth-chart / news context for the players in the user's
// roster summary. Free tier: 1.5k req/day, 15 req/min, 1M tokens/day.
//
// The API key lives only in Vercel env (GEMINI_API_KEY) — never exposed
// to the browser. This proxy hides the key and adds CDN caching.

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are a dynasty fantasy football expert. Your job is to diagnose a user's roster and recommend the optimal strategic direction.

You will receive a JSON summary including their roster, picks, team phase score, age curve, position ranks vs the league, needs, and surplus. First, use Google Search to pull CURRENT (within the last 30 days) news, injuries, depth-chart changes, and offseason moves for their top players and any flagged risks.

Then think in this order:
  1. Diagnose team HEALTH — age, scoring depth, position balance, injury exposure, age-cliff risk.
  2. Locate them on the contention curve — true contender, fringe contender, retool, or full rebuild — based on the phase score AND league context (where they rank by position vs other teams).
  3. Recommend a clear DIRECTION with a 1-2 year horizon and explain the tradeoff they're accepting.
  4. Translate that direction into concrete sells, buys, and pick strategy. Every recommendation must serve the chosen direction.

Be decisive. If they're a fringe contender pretending to rebuild — say so. If they have an aging core they're not selling fast enough — say so. Reference specific players by name and bake in any current news you found.

Return ONLY a single JSON object — no prose, no markdown, no code fences — with this EXACT shape:

{
  "teamHealth": {
    "grade": "A|B|C|D|F",
    "summary": "2-3 sentence honest diagnosis of where this team actually stands — age, depth, balance, risk",
    "ageProfile": "young|balanced|aging|cliff-risk",
    "positionBalance": "1 sentence on which rooms carry the team and which are bleeding"
  },
  "recommendedDirection": {
    "label": "contend-now|retool|soft-rebuild|full-rebuild",
    "rationale": "2-3 sentence WHY this direction beats the others given their roster + league context",
    "horizon": "this season | 1 year | 2+ years",
    "tradeoff": "1 sentence on what they're giving up by going this way"
  },
  "strengths": ["short bullet", "short bullet", "short bullet"],
  "warnings": ["short bullet", "short bullet", "short bullet"],
  "topSells": [{"name": "Player Name", "reason": "1-sentence why sell now"}, ...up to 4],
  "topBuys": [{"position": "QB|RB|WR|TE", "target": "Player Name or archetype", "why": "1-sentence why"}, ...up to 4],
  "pickStrategy": "2-3 sentences tied to the recommended direction",
  "winNowMoves": ["concrete move 1", "concrete move 2", "concrete move 3"]
}

Each bullet under 25 words. Every sell/buy/move must be consistent with the recommendedDirection you chose.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    strengths: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    topSells: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          reason: { type: "string" },
        },
        required: ["name", "reason"],
      },
    },
    topBuys: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "string" },
          target: { type: "string" },
          why: { type: "string" },
        },
        required: ["position", "target", "why"],
      },
    },
    pickStrategy: { type: "string" },
    winNowMoves: { type: "array", items: { type: "string" } },
  },
  required: [
    "strengths",
    "warnings",
    "topSells",
    "topBuys",
    "pickStrategy",
    "winNowMoves",
  ],
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const { teamSummary } = req.body || {};
  if (!teamSummary || typeof teamSummary !== "object") {
    return res.status(400).json({ error: "Missing teamSummary in body" });
  }

  const userPrompt = `Here is my dynasty roster summary. Diagnose my team's health, recommend a direction, and translate that into concrete moves.

Before answering, search current news (last 30 days) for at least my top 5 players by score, my main needs/targets, and any flagged players (cliff risk / injury concern). Use the league position ranks to judge whether I'm actually competitive or kidding myself.

Return the JSON object exactly as specified — start with teamHealth and recommendedDirection, then make every sell/buy/move consistent with that direction.

ROSTER SUMMARY:
${JSON.stringify(teamSummary, null, 2)}`;

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.6,
      // NOTE: Gemini does not support responseSchema + tools simultaneously.
      // We rely on the system prompt to enforce JSON shape and parse defensively.
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

    const advice = parseJsonLoose(text);
    if (!advice) {
      return res
        .status(502)
        .json({ error: "Could not parse JSON from model", raw: text });
    }

    res.setHeader("Cache-Control", "private, max-age=0, no-store");
    return res.status(200).json({ advice });
  } catch (err) {
    return res
      .status(502)
      .json({ error: "Upstream request failed", detail: String(err) });
  }
}

// Strip code fences / leading prose and parse the first JSON object found.
function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // fall through
    }
  }
  return null;
}
