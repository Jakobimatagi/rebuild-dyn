// Gemini proxy for the share-card "why is this player ranked here" blurbs.
//
// Powers a per-player one-sentence rationale on the Top Players and Rookie
// share cards. Takes a kind ("top-players" | "rookies") and a list of
// player summaries; returns one blurb per id. Shares GEMINI_API_KEY with
// the other AI endpoints — no new secret required.

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const TOP_PLAYERS_SYSTEM = `You are a dynasty fantasy football analyst writing for share-card captions on Twitter. You will receive a ranked list of NFL players. For each player, write ONE short sentence (max 140 characters) explaining WHY they sit at that rank in OUR model. Cite the concrete signal doing the work, not generic praise.

Each row carries these fields (all already blended into "finalScore" 5–100):
  - tier: S/A/B/C/D bucket of the final score
  - internal: our model's score from production + age + situation
  - fc: FantasyCalc market value (normalized 0–100)
  - ra: RosterAudit market value (normalized 0–100)
  - ppg: last NFL season fantasy points per game
  - gp: last NFL season games played
  - careerYears: number of NFL seasons with measurable production
  - ocPct: next-year offensive coordinator scheme adjustment (%)
  - capped: true if under 17 career NFL games (final score capped at 85)
  - age, yearsExp

When the player is unanimous (high internal + high fc + high ra) say so. When markets and our model diverge, name the divergence ("FC has him top-5, our internal model isn't there yet — limited NFL sample"). When a young player has a "capped" flag, mention it. When ocPct is meaningfully off zero (|ocPct| >= 6) and the player is RB/WR/TE, factor that in.

Voice: confident, scout-tone, NO emojis, NO filler hype like "BREAKING" / "RISER". Reference exact numbers when they're load-bearing.

Return ONLY this JSON, no prose, no markdown, no code fences:
{
  "blurbs": [
    { "id": "<exact id from input>", "blurb": "one sentence under 140 chars" }
  ]
}

Length of "blurbs" must equal length of input. Every input id must appear in the output. Each blurb ≤ 140 characters.`;

const ROOKIES_SYSTEM = `You are a dynasty fantasy football pre-draft analyst writing share-card captions on Twitter. You will receive a ranked list of rookie prospects. For each, write ONE short sentence (max 140 characters) explaining WHY they sit at that rank in OUR model. Cite the concrete signal doing the work.

Each row carries:
  - grade: our computeGrade total (0–100) blending production, age, athletic profile, draft capital, and (when set) the user's tier conviction
  - tier: user-assigned or derived tier label (Cornerstone, Foundational, Upside Shot, Mainstay, etc.)
  - capital: NFL draft capital (early_1 > mid_1 > late_1 > early_2 ... > udfa), null if not yet drafted
  - landing: NFL team if assigned
  - comp: user-set comparable NFL player, if any
  - adp: rookie-draft ADP if set
  - school: most recent college
  - recent: last college season stats relevant to position (target share, ypc, completion %, etc.)

Lean on the strongest signal: if a prospect has elite recent stats, name the number. If they fell in capital, mention it. If a comp is set and it adds signal, reference it. If grade outpaces the tier (or vice versa) note the gap. Tier "Cornerstone" / "Foundational" are top-end; "Replaceable" / "JAG" are bottom.

Voice: confident, scout-tone, NO emojis, NO filler hype. Reference exact numbers when they're load-bearing.

Return ONLY this JSON, no prose, no markdown, no code fences:
{
  "blurbs": [
    { "id": "<exact id from input>", "blurb": "one sentence under 140 chars" }
  ]
}

Length of "blurbs" must equal length of input. Every input id must appear in the output. Each blurb ≤ 140 characters.`;

const OC_USAGE_SYSTEM = `You are a dynasty fantasy football analyst writing share-card captions on Twitter, focused on PLAYER USAGE and how offenses deploy talent. You will receive a list of subjects (players, team-seasons, or offensive coordinators) with opportunity metrics. For each, write ONE short sentence (max 140 characters) that turns the usage numbers into a sharp, citable take. Lead with the number that's doing the work.

Subjects can carry any of these fields (only the relevant ones are present):
  - name, team, pos, season, oc (coordinator)
  - snapShare: share of team offensive snaps
  - targetShare: share of team targets
  - carryShare: share of team carries
  - rzTargetShare / rzCarryShare: red-zone target / carry share (goal-line equity)
  - adot: average depth of completion in air yards (air yards per catch; downfield vs quick game). Player reference: ~10+ is a vertical/deep role, ~7-9 intermediate, ~5-6 short, <5 screen/checkdown
  - airYardShare: share of team air yards
  - wopr: Weighted Opportunity Rating (1.5*targetShare + 0.7*airYardShare); ~0.7+ is alpha
  - touches, targets, carries: raw volume
  - passRate: team pass rate (scheme pass/run lean)
  - leadCarryShare / leadTargetShare: the top claimant's share in this offense
  - carryHHI / targetHHI: concentration (high = funnel to one guy, low = committee)
  - teamAdot: scheme depth in air yards per completion. Reference: ~7+ is a downfield/vertical scheme, ~5.5-7 intermediate, <5.5 quick-game/underneath. Do NOT call a scheme "shallow" unless it is genuinely below the rest of the league

Frame usage as opportunity, not production: "commands", "funnel", "bell-cow", "alpha", "committee", "vacated", "downfield role". When a share is elite (target share >28%, carry share >55%, WOPR >0.7) say so plainly. When concentration is low, call it a committee. When red-zone share outstrips overall share, flag the scoring equity. Cite exact percentages.

Voice: confident, scout-tone, NO emojis, NO filler hype like "BREAKING" / "SMASH". Reference exact numbers when they're load-bearing.

Also write ONE ready-to-post tweet (the "tweet" field) that captions this whole card for a dynasty fantasy football audience. Open with a hook, build the take from the single strongest number across these subjects, and keep it ≤ 270 characters. At most one or two relevant hashtags, NO emojis, NO "BREAKING"-style hype. It should read like a take a sharp analyst would post, not a list of stats.

Return ONLY this JSON, no prose, no markdown, no code fences:
{
  "tweet": "ready-to-post caption, ≤ 270 characters",
  "blurbs": [
    { "id": "<exact id from input>", "blurb": "one sentence under 140 chars" }
  ]
}

Length of "blurbs" must equal length of input. Every input id must appear in the output. Each blurb ≤ 140 characters. The "tweet" must be ≤ 270 characters.`;

const HOT_COLD_SYSTEM = `You are a dynasty fantasy football analyst. You will receive one share card's worth of players graded on how their weekly ACTUAL fantasy points compared to their PROJECTED points (PPR). A positive residual means beating the projection (running HOT → sell-high candidate); negative means under-performing the projection (running COLD → buy-low candidate).

Each row carries:
  - name, pos, team
  - streak: current consecutive-week streak (+N = N straight weeks beating projection, -N = N straight weeks missing it, 0 = none)
  - last4: average points above/below projection over the last 4 graded weeks (the momentum number)
  - season: average points above/below projection across the whole season
  - beatRate: fraction of graded weeks that beat projection (0–1)
  - beatCount / weeks: weeks beaten / total graded weeks
  - avgActual / avgProj: average actual vs projected points

The card context tells you what this card is: a HOT (sell-high) leaderboard, a COLD (buy-low) leaderboard, a single team's heat map (mixed hot and cold), or a single-player spotlight. Tailor the framing to that.

Write ONE synopsis — at most 2 sentences, ≤ 240 characters total — that tells a dynasty manager the STORY of this card at a glance: who the standout is, the sell-high or buy-low angle, and the single most load-bearing number. For a team heat map, contrast who's hot vs cold. For a single player, make it a sharp one-liner on how hot/cold they are and the move.

Voice: confident, scout-tone, NO emojis, NO filler hype like "BREAKING" / "SMASH". Cite exact numbers when they're load-bearing.

Return ONLY this JSON, no prose, no markdown, no code fences:
{
  "synopsis": "≤ 240 character read on this card",
  "blurbs": []
}`;

const SYSTEM_BY_KIND = {
  rookies: ROOKIES_SYSTEM,
  "top-players": TOP_PLAYERS_SYSTEM,
  "oc-usage": OC_USAGE_SYSTEM,
  "hot-cold": HOT_COLD_SYSTEM,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  const { kind, players, scope } = req.body || {};
  if (!Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ error: "Missing players in body" });
  }
  const systemPrompt = SYSTEM_BY_KIND[kind];
  if (!systemPrompt) {
    return res.status(400).json({ error: "kind must be 'rookies', 'top-players', 'oc-usage', or 'hot-cold'" });
  }

  const scopeBit = kind === "rookies"
    ? `Rookie class: ${scope?.year ?? "unknown"}. Position scope: ${scope?.position ?? "all"}.`
    : kind === "oc-usage"
    ? `NFL usage data · ${scope?.season ?? "season"}. Card: ${scope?.board ?? "usage"}.`
    : kind === "hot-cold"
    ? `Hot & Cold beat-the-projection board · ${scope?.season ?? "season"}. Card: ${scope?.card ?? "leaderboard"}.`
    : `Top Players board · 12-team SF full-PPR. Position scope: ${scope?.position ?? "all"}.`;

  const userPrompt = `${scopeBit}

Ranked input (one entry per player, ordered by our model's final rank):
${JSON.stringify(players, null, 2)}

Write the blurbs as specified.`;

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.6,
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
    // Card-level kinds (hot-cold) may return only a synopsis; row-level kinds
    // return a blurbs array. Accept either shape.
    const hasBlurbs = Array.isArray(result?.blurbs);
    const hasSynopsis = typeof result?.synopsis === "string";
    if (!result || (!hasBlurbs && !hasSynopsis)) {
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
