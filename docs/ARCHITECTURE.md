# Dynasty Oracle — Architecture Reference

Single source of truth for how this app is structured. Replaces the seven scattered `feature_claude.md` files that previously lived alongside the code.

## Table of contents

- [Root overview](#root-overview)
  - [What this app is](#what-this-app-is)
  - [Tech stack](#tech-stack)
  - [Supported platforms](#supported-platforms)
  - [App flow](#app-flow)
  - [Data fetch](#data-fetch)
  - [Analysis computation](#analysis-computation)
  - [Score weights](#score-weights)
  - [Player archetypes](#player-archetypes)
  - [Scoring verdict thresholds](#scoring-verdict-thresholds)
  - [Env vars](#env-vars)
  - [Directory map](#directory-map)
- [API layer (`api/`)](#api-layer-api)
  - [Proxies: fleaflicker, rosteraudit](#proxies)
  - [Gemini AI endpoints](#gemini-ai-endpoints)
  - [Historical data](#historical-data)
  - [Security notes](#security-notes)
- [Analysis engine (`src/lib/`)](#analysis-engine-srclib)
  - [Data flow diagram](#data-flow-diagram)
  - [The `analysis` object shape](#the-analysis-object-shape)
  - [Engine files](#engine-files)
  - [Caching summary](#caching-summary)
- [Strategy planner engine (`src/lib/strategyPlanner/`)](#strategy-planner-engine-srclibstrategyplanner)
  - [Plan shape](#plan-shape)
  - [Engine files](#strategy-planner-engine-files)
  - [Paths catalog](#paths-catalog)
  - [Section generators](#section-generators)
- [Top-level screens (`src/components/`)](#top-level-screens-srccomponents)
- [Dashboard tabs and modals (`src/components/dashboard/`)](#dashboard-tabs-and-modals-srccomponentsdashboard)
- [Strategy planner UI (`src/components/dashboard/strategyPlanner/`)](#strategy-planner-ui-srccomponentsdashboardstrategyplanner)

---

## Root overview

### What this app is
Dynasty Oracle is a browser-only dynasty fantasy football analysis tool. Users connect their Sleeper or Fleaflicker account, pick a dynasty league, and get a full analytical dashboard: player grades, roster room breakdowns, trade tools, league-wide comparisons, rookie rankings, and a multi-year strategy planner.

### Tech stack
- **React 18 + Vite 6** — SPA, no React Router (App.jsx conditionally renders screens via `step` state). All styling via inline style objects in `src/styles.js` plus Tailwind classes on two standalone admin/public pages.
- **Supabase** — used only for the Rookie Rankings + Prospector admin pages (prospect DB + expert ranking lists). The main analysis pipeline has no backend.
- **Vercel** — hosts the SPA + 7 serverless functions in `api/`: third-party data proxies (`fleaflicker`, `rosteraudit`), Gemini-backed AI endpoints (`ai-analyze`, `ai-oc-analyze`, `ai-oracle-board`, `ai-vs-evaluate`), and an nflverse historical-roster fetcher (`historical-rosters`).
- **localStorage** — all caching; no cookies or server sessions for the main flow.

### Supported platforms
- **Sleeper** (primary) — uses public Sleeper API, no auth. Keyed by `sleeper_username`.
- **Fleaflicker** — uses the `/api/fleaflicker` proxy; normalised to Sleeper-compatible shape by `src/lib/fleaflickerApi.js` before entering the analysis pipeline.

### App flow
Driven by `src/App.jsx`:

1. **`step = "input"`** — `InputScreen`: user enters Sleeper username or Fleaflicker email, selects platform.
2. **`step = "leagues"`** — `LeaguePickerScreen`: dynasty leagues fetched and listed for selection.
3. **`step = "loading"` → `"dashboard"`** — parallel fetch of all data, then `buildRosterAnalysis(payload, weights)` runs client-side. On success renders `Dashboard`; on failure clears saved league and returns to `"input"`.

localStorage keys written by App:
- `dynasty_os_platform` (`sleeper` | `fleaflicker`)
- `sleeper_username`, `sleeper_league` (JSON)
- `ff_email`, `ff_league` (JSON)

On reload: App reads these and jumps directly to `step = "loading"`.

### Data fetch
Inside `loadDashboard` / `loadFleaflickerDashboard`, all fetches fire in parallel with `Promise.all`. Sleeper-platform payload:

| Field | Source | Notes |
|---|---|---|
| `users` | Sleeper `/league/:id/users` | display names + metadata |
| `rosters` | Sleeper `/league/:id/rosters` | owner_id, player lists, settings, fpts |
| `players` | Sleeper `/players/nfl` | full player DB keyed by player_id; cached 24h |
| `tradedPicks` | Sleeper `/league/:id/traded_picks` | current-season traded pick objects |
| `stats24/23/22` | Sleeper `/stats/nfl/regular/:year` | season totals; not cached |
| `transactions` | `fetchLeagueTransactions(league)` | walks `previous_league_id` chain up to 8 seasons, deduplicates |
| `fantasyCalcValues` | FantasyCalc API (via `fantasyCalcApi.js`) | keyed by Sleeper ID; cached 24h per format params |
| `historicalStats` (2014–2021) | Sleeper stats | 2018–2021 cached 7d; 2014–2017 cached 30d |
| `rosterAuditValues` | `/api/rosteraudit?path=rankings` | paginated; not cached (proxy caches 1h) |
| `rosterAuditPicks` | `/api/rosteraudit?path=picks` | not cached |
| `sleeperDrafts` | Sleeper `/league/:id/drafts` | used to extract `draft_order` for pick slot assignment |

Fleaflicker adds a Phase 2 between parallel fetch and analysis: `loadFleaflickerLeague(ffLeagueId, ffTeamId, players)` normalises the Fleaflicker response into `{ league, myRoster, tradedPicks, transactions, users, rosters }` matching the Sleeper shape.

### Analysis computation
`buildRosterAnalysis(payload, scoringWeights)` in `src/lib/analysis.js` is the single entry point that:
1. Builds stat benchmarks (`scoringEngine.buildBenchmarks`)
2. Builds blended value contexts from FantasyCalc + RosterAudit
3. Builds the prediction context from all historical seasons
4. Calls `buildRosterSnapshot` for every roster in the league → array of `leagueTeams`
5. Runs `classifyLeagueTeams` to assign `teamPhase` to each
6. Assigns draft slots and league-wide position ranks
7. Builds trade market + suggestions + league activity for the user's team
8. Returns: `{ ...myTeam, leagueTeams, leagueContext, tradeMarket, tradeSuggestions, tradeBlock, leagueActivity, fantasyCalcSource, rosterAuditSource, scoringWeights, ... }`

Recompute on weight change: App calls `computeAnalysis(analysisPayload, nextWeights)` — same payload, new weights. A 120ms delay prevents UI jank.

### Score weights
`DEFAULT_SCORING_WEIGHTS = { age: 35, prod: 30, avail: 15, trend: 10, situ: 10 }` — the 5 components of the per-player 0–100 dynasty score. Adjustable via `ScoreWeightsModal`. Values are raw integers (not normalised); `normalizeScoringWeights` handles the normalisation internally.

### Player archetypes
From `src/constants.js` — 11 archetypes assigned by `playerGrading.getArchetype()`: `Cornerstone`, `Foundational`, `Productive Vet`, `Mainstay`, `Upside Shot`, `Short Term League Winner`, `Short Term Production`, `Serviceable`, `JAG - Insurance`, `JAG - Developmental`, `Replaceable`.

### Scoring verdict thresholds
- **buy** ≥ 72, **hold** ≥ 52, **sell** ≥ 35, **cut** < 35

### Env vars
| Var | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Server-side only | Used by all four `api/ai-*.js` handlers |
| `VITE_ENABLE_STRATEGY_PLANNER` | Optional | Set to `"true"` to unhide the Strategy Planner tab without the access-code gate |
| `VITE_SUPABASE_URL` | Client | Used by `src/lib/supabase.js` for rookie prospector |
| `VITE_SUPABASE_ANON_KEY` | Client | Supabase anon key |

### Directory map
```
api/                  Vercel serverless functions: data proxies (fleaflicker, rosteraudit), Gemini AI endpoints (ai-*), nflverse history (historical-rosters)
src/
  App.jsx             Orchestrator: step state, data fetching, weight recalc
  constants.js        POSITION_PRIORITY, IDEAL_PROPORTION, ARCHETYPE_META/DESC
  styles.js           Shared inline style objects
  main.jsx            ReactDOM.createRoot + path-based screen routing (rookie-rankings, admin)
  lib/                Analysis engine (no React)
    analysis.js         Top-level orchestrator, re-exports from sub-engines
    sleeperApi.js       Sleeper fetch + historical stat caching
    fantasyCalcApi.js   FantasyCalc client + 24h cache
    fantasyCalcBlend.js FC + RA blending into a single normalised score
    rosterAuditApi.js   RosterAudit client + context builder
    fleaflickerApi.js   FF normalisation layer
    marketValue.js      League rules context, pick values, keep counts
    scoringEngine.js    Weight constants, stat benchmarks, age curves, per-player score calc
    playerGrading.js    Verdicts, room quality, archetypes, position ranks
    rosterBuilder.js    Per-roster enrichment, snapshot, team classification
    tradeEngine.js      Trade market calibration, suggestions, evaluateTrade
    predictionEngine.js Age-curve models, historical comps, 3-yr projections
    activityEngine.js   Transaction grading, league-wide activity scores
    prospectScoring.js  Rookie grade/tier/dynasty-score math
    supabase.js         Supabase client (rookie pages only)
    strategyPlanner/    Strategy plan engine
  components/
    InputScreen.jsx, LeaguePickerScreen.jsx, Layout.jsx, Legal.jsx
    Dashboard.jsx       Tab router; passes analysis slices to tab components
    RookieRankings.jsx  Public page at /rookie-rankings (Tailwind)
    RookieProspector.jsx Admin at /admin/rookie-prospector (Tailwind + Supabase)
    dashboard/          Tab + modal components
      strategyPlanner/  Strategy planner UI sub-components
docs/
  ARCHITECTURE.md     This file
  CALCULATIONS.md     Human-readable math: scoring formula, thresholds, benchmarks
```

---

## API layer (`api/`)

Seven Vercel serverless functions, split across three handler styles:

1. **Path-allowlist proxies** — `fleaflicker.js`, `rosteraudit.js`. Take a `path` query parameter selecting the upstream route from a hard-coded whitelist; remaining params are forwarded verbatim. Keep secrets server-side, enforce allowlists (prevent open-proxy abuse), set edge cache headers.
2. **Gemini-backed AI endpoints** — `ai-analyze.js`, `ai-oc-analyze.js`, `ai-oracle-board.js`, `ai-vs-evaluate.js`. POST handlers that wrap a Gemini 2.5 Flash call with a feature-specific system prompt. All four share `GEMINI_API_KEY`. Used by the AI-assisted features in the dashboard and admin pages.
3. **Specific-upstream data fetcher** — `historical-rosters.js`. Pulls nflverse-data's `roster_{year}.csv` release from GitHub and collapses it to `{ sleeper_id: { team, position, name } }` for historical room analysis.

Every handler uses the default Node runtime export signature `(req, res)`. Method is not validated by the proxies (upstreams reject non-GET); the AI endpoints are POST-only by upstream contract.

Client-side wrappers:
- Proxies: `src/lib/fleaflickerApi.js`, `src/lib/rosterAuditApi.js`.
- AI: `src/lib/aiAdviceApi.js` (→ `ai-analyze`), `src/lib/aiOcAnalyzeApi.js`, `src/lib/aiOracleBoardApi.js`, `src/lib/aiVsEvaluateApi.js`.
- Historical: `src/lib/historicalRostersApi.js`.

### Proxies

#### fleaflicker.js — Fleaflicker API proxy
Proxies `https://www.fleaflicker.com/api/<path>`. No auth required upstream; the endpoint is public but CORS-blocked from the browser, hence the proxy.

- Allowlist: `FetchUserLeagues`, `FetchLeagueRosters`, `FetchRoster`, `FetchLeagueRules`, `FetchLeagueStandings`, `FetchTeamPicks`, `FetchTrades`, `FetchLeagueTransactions`.
- Injects `sport=NFL` into the querystring automatically (can be overridden by caller but typically isn't).
- Query params: all non-`path` keys are forwarded. Common ones are `email`, `league_id`, `team_id`, `season`, `result_offset`.
- Response: parsed as JSON and re-emitted via `res.status(upstream.status).json(data)`. Fetch failure returns 502 `{ error: "Upstream request failed" }`.
- Caching: `s-maxage=60, stale-while-revalidate=300`. Short TTL because roster/transaction data changes frequently.
- Env vars: none.
- CORS: none set.

#### rosteraudit.js — RosterAudit WordPress REST proxy
Proxies `https://rosteraudit.com/wp-json/ra/v1/<path>` for dynasty market rankings and pick values.

- Allowlist: `rankings`, `picks`.
- Query params: forwarded as-is. `rankings` typically takes `format` (sf/1qb) and/or `scoring`; `picks` takes `format` and `season`.
- Response: JSON passthrough. The `rankings` endpoint returns a big player array consumed by `RankingsTab`; `picks` returns a pick-value map keyed `season-round-slot` consumed by `RosterTab`/`PicksTab`.
- Caching: `s-maxage=3600, stale-while-revalidate=7200` (1h / 2h) — rankings update at most daily.
- Env vars: none.
- Errors: 400 `{ error: "Missing path parameter" }` when `path` is absent; 403 when off-allowlist; 502 on upstream fetch failure.
- CORS: none set.

### Gemini AI endpoints

All four POST handlers share the same shape: pull a JSON payload from `req.body`, send it to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` with a feature-specific `SYSTEM_PROMPT`, parse the model's JSON response, and return it. Errors surface as 4xx/5xx with `{ error }`. Some use Google Search grounding for fresh news context.

- **ai-analyze.js** — "Analyze Team with AI" on the dashboard. Receives a roster summary; returns `{ teamHealth, recommendedDirection, strengths, ... }`. Uses Search grounding for fresh injury/depth-chart news.
- **ai-oc-analyze.js** — ORACLE briefing for the OC Rankings page. Receives a season's 32-team OC landscape; returns `{ overview, winners, losers, schemeWatch }`.
- **ai-oracle-board.js** — "ASK ORACLE" on the Prospect Board (rookie evaluator).
- **ai-vs-evaluate.js** — Head-to-head/versus-style evaluation feature.

Env vars: all four require `GEMINI_API_KEY` (server-only). Free tier is 1.5k req/day, 15 req/min.

### Historical data

**historical-rosters.js** — pulls `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{year}.csv` and collapses per-week records to a single primary-team-per-player map (`{ sleeper_id: { team, position, name } }`) using the team the player spent the most weeks on. Validates `year` is 2009–2030. Past seasons cache aggressively; current season caches a day. No env vars; nflverse releases are public.

### Security notes
- The two proxy endpoints enforce a hard allowlist so attackers cannot pivot them into open proxies.
- Secrets handled: `GEMINI_API_KEY` (all four ai-*). Set in Vercel project env; local dev reads from `.env.local`.
- None of the proxy handlers validate HTTP method — a mutating verb would still be forwarded. Upstreams all reject non-GET.

---

## Analysis engine (`src/lib/`)

Pure JavaScript analysis engine — no React, no side effects beyond localStorage caching. `App.jsx` fetches raw data and passes a payload to `buildRosterAnalysis()` from `analysis.js`; the returned `analysis` object is the single data contract consumed by every dashboard tab. Sub-engines are imported by `analysis.js` (or by `rosterBuilder.js` which `analysis.js` calls) and are not used by UI components directly.

Exception: `strategyPlanner/` is imported directly by `StrategyPlannerTab.jsx` and is not called from `analysis.js`. See [Strategy planner engine](#strategy-planner-engine-srclibstrategyplanner).

### Data flow diagram
```
App.jsx
  ├── fetchSleeper (sleeperApi.js)         → users, rosters, players, tradedPicks, stats, drafts
  ├── fetchLeagueTransactions (sleeperApi) → transactions (multi-season walk)
  ├── fetchFantasyCalcValues (fantasyCalcApi.js) → FC trade values
  ├── fetchRosterAuditValues/Picks (rosterAuditApi.js) → RA values + pick values
  └── loadFleaflickerLeague (fleaflickerApi.js) → normalised FF payload [FF only]
         ↓
  buildRosterAnalysis(payload, scoringWeights)   [analysis.js]
    ├── getLeagueRulesContext()                  [marketValue.js]
    ├── buildBenchmarks()                        [scoringEngine.js]
    ├── buildFantasyCalcContext()                [fantasyCalcBlend.js]
    ├── buildRosterAuditContext()                [rosterAuditApi.js]
    ├── buildPredictionContext()                 [predictionEngine.js]
    ├── buildRosterSnapshot() × N rosters        [rosterBuilder.js]
    │     ├── buildRosterPicks()
    │     ├── playerPctiles() + calcScore()      [scoringEngine.js]
    │     ├── computeBlendedScore()              [fantasyCalcBlend.js]
    │     ├── getVerdict(), getArchetype(), getArchetypeTags(), getConfidence() [playerGrading.js]
    │     ├── buildPlayerMarketValue()           [marketValue.js]
    │     ├── buildPlayerPrediction()            [predictionEngine.js]
    │     └── getRosterNeeds(), getRosterSurplusPositions()
    ├── classifyLeagueTeams()                    [rosterBuilder.js]
    ├── assignDraftSlots()                       [rosterBuilder.js]
    ├── assignPositionRanks()                    [playerGrading.js]
    ├── buildTradeMarket() + buildTradeSuggestions() [tradeEngine.js]
    └── buildLeagueActivity()                    [activityEngine.js]
         ↓
  `analysis` object → Dashboard.jsx → tab components
```

### The `analysis` object shape
`buildRosterAnalysis` returns `{ ...myTeam, ...extras }` where `myTeam` is the user's roster snapshot and `extras` is the league-wide context.

#### From `myTeam` (via `buildRosterSnapshot`)
- `rosterId` — Sleeper roster_id for the user's team
- `ownerId` — Sleeper user_id
- `label` — display name (team name or username)
- `enriched` — `Player[]` — all rostered players with full enrichment (see player shape below)
- `byPos` — `{ QB: Player[], RB: Player[], WR: Player[], TE: Player[] }` — players split by primary position, sorted by score descending
- `sells` — `Player[]` — players with verdict `"sell"` or `"cut"`, sorted by score
- `buys` — `Player[]` — players with verdict `"buy"`
- `holds` — `Player[]` — players with verdict `"hold"`
- `avgAge` — string; weighted average age of starters
- `avgScore` — number 0–100; average dynasty score
- `picksByYear` — `{ [year]: Pick[] }` — all owned picks grouped by season year
- `picks` — `Pick[]` — flat sorted array of all owned picks
- `weakRooms` — `string[]` — position keys where room quality is below threshold
- `proportions` — `{ QB, RB, WR, TE }` — actual % of roster value by position
- `needs` — `string[]` — positions underweight vs `IDEAL_PROPORTION`
- `surplusPositions` — `string[]` — positions overweight vs `IDEAL_PROPORTION`
- `tradeablePlayers` — `Player[]` — candidates to offer in trades (score 40–75 range, sorted)
- `targetablePlayers` — `Player[]` — players on other teams to target
- `wins`, `losses`, `ties`, `pointsFor`, `pointsAgainst` — record from Sleeper settings
- `teamPhase` — `{ phase: 'contender'|'retool'|'rebuild', score: 0–100, signals: string[] }` — set by `classifyLeagueTeams()` after all snapshots; null until then

#### Added by `buildRosterAnalysis`
- `isSuperflex` — boolean
- `myTeamLabel` — same as `label`, aliased for template use
- `leagueTeams` — `RosterSnapshot[]` — all teams in the league (same shape as myTeam)
- `leagueContext` — see marketValue section below
- `posRanks` — `{ QB: {rank, of, color, grade}, ... }` — league-wide position room ranks; populated by `assignPositionRanks`
- `tradeMarket` — `{ sampleCount, positionMultipliers, ... }` — calibrated from recent transactions
- `tradeSuggestions` — `TradeSuggestion[]` — phase-aware trade ideas (currently not rendered)
- `tradeBlock` — `Player[]` — first 8 of `myTeam.tradeablePlayers`
- `leagueActivity` — see activityEngine section below
- `fantasyCalcSource` — `{ enabled, totalPlayers, attribution, url }`
- `rosterAuditSource` — `{ enabled, totalPlayers, pickValues, rankings, attribution, url }`
- `scoringWeights` — the weights used for this analysis pass
- `aiAdvice` — present only if a previously computed value was attached; not generated by the engine (leftover field from a past feature, destructured in Dashboard.jsx but usually undefined)

#### Enriched Player shape
Every player in `enriched`/`byPos`/`sells` etc.:
```
{
  id, name, position, team, age, yearsExp,
  draftRound, draftSlot, draftYear, draftTier,   // draft capital info
  score,               // blended dynasty score 0–100 (FC+RA+internal)
  internalScore,       // purely engine-computed score pre-blend
  fantasyCalcNormalized, rosterAuditNormalized,   // normalised market values 0–100
  components: { age, prod, avail, trend, situ },  // raw score components 0–100 each
  verdict,             // 'buy'|'hold'|'sell'|'cut'
  archetype,           // one of 11 archetype strings
  tags: string[],      // e.g. ['Ascending', 'Buy Window', 'Injury Risk']
  confidence,          // 'High'|'Medium'|'Low'
  ppg,                 // PPR PPG last season (string or null)
  gp24,                // games played last season
  peakPctile, currentPctile, pctileLast, pctilePrev, pctileOlder, // production percentiles 0–100
  rushAttPg, rushYdPg, targetsPg, receptionsPg, rzTargets,        // per-game usage (null if <4 GP)
  bmi, weightLbs,      // physical measurables from Sleeper
  marketValue,         // object from buildPlayerMarketValue
  injuryStatus,        // Sleeper string or null
  depthOrder,          // depth chart order (1 = starter)
  lastSeasonYear,      // year of stats24
  // RA-enriched fields (only if RA data present):
  rosterAuditValue, rosterAuditPosRank, rosterAuditTrend,
  rosterAuditTier, rosterAuditBuyLow, rosterAuditSellHigh, rosterAuditBreakout,
  // Prediction (from predictionEngine):
  prediction: { dynastyOutlook, breakoutPct, cliffRisk, projectedScores: [yr1,yr2,yr3], comps, insights }
}
```

#### Pick shape
```
{ season: string, round: number, isOwn: boolean, label: string,
  originalRosterId?: number, fromTeam?: string }  // acquired picks only
```

### Engine files

#### analysis.js — top-level orchestrator
- Exports: `buildRosterAnalysis(...)` (primary), `DEFAULT_SCORING_WEIGHTS`, plus re-exports from sub-engines: `classifyLeagueTeams`, `evaluateTrade`, `getVerdict`, `getColor`, `computeRoomQuality`, `assignPositionRanks`, `rankLabel`, `getArchetype`, `getArchetypeTags`, `getConfidence`, `draftTierLabel`.
- Signature: `(myRoster, players, league, tradedPicks, stats24, stats23, stats22, transactions, fantasyCalcValues, users, rosters, historicalStats, scoringWeights, lastSeasonYear, rosterAuditValues, rosterAuditPicks, sleeperDrafts)`
- All args default-safe (most default to `[]` or `{}`).
- Does NOT export per-player score functions directly — import those from `scoringEngine`/`playerGrading` if needed.

#### sleeperApi.js — Sleeper client + caching
- Exports: `fetchSleeper(path)`, `fetchHistoricalStats(year)`, `fetchDeepHistoricalStats(year)`, `fetchLeagueTransactions(league, maxSeasons, fallbackMaxWeek)`.
- `fetchSleeper`: plain fetch to `https://api.sleeper.app/v1` in prod, `/sleeper` proxy in dev. No caching — callers cache if needed.
- `fetchHistoricalStats(year)`: fetches `/stats/nfl/regular/${year}`, caches in `sleeper_stats_${year}` for **7 days**.
- `fetchDeepHistoricalStats(year)`: same but uses `sleeper_stats_deep_${year}` key cached **30 days**. Intended for 2014–2017 (fully settled seasons).
- `fetchLeagueTransactions`: walks the `previous_league_id` chain up to `maxSeasons` (default 8), fetching all weeks (max of `fallbackMaxWeek=18` and `playoff_week_start+2`). De-duplicates by `transaction_id`. Returns sorted oldest-first.

#### fantasyCalcApi.js — FantasyCalc values
- Exports: `fetchFantasyCalcValues(league)`.
- Derives format params from `league.roster_positions` and `league.scoring_settings.rec`: `isDynasty=true`, `numQbs` (1 or 2), `numTeams`, `ppr` (0/0.5/1).
- Cache key: `fantasycalc_values_${isDynasty}_${numQbs}_${numTeams}_${ppr}`. TTL: **24h**.
- Returns array of FC player objects; consumed by `fantasyCalcBlend.js`.

#### fantasyCalcBlend.js — value normalisation + blending
- Exports: `buildFantasyCalcContext(fantasyCalcValues)`, `normalizeFantasyCalcValue(entry, context)`, `normalizeRosterAuditValue(raEntry, raContext)`, `computeBlendedScore(internalScore, fcEntry, fcContext, raEntry, raContext)`.
- `buildFantasyCalcContext`: builds a `bySleeperId` Map from the FC array. Returns `{ bySleeperId, totalPlayers, p10, p50, p90 }` (percentile anchors for normalisation).
- `computeBlendedScore`: applies a 3-way weighted blend — internal engine score, FC normalised (0–100), RA normalised (0–100). If FC or RA is absent for a player, only the present sources blend. Exact weights are in the function body.

#### rosterAuditApi.js — RosterAudit values + picks
- Exports: `fetchRosterAuditValues(league)`, `fetchRosterAuditPicks()`, `buildRosterAuditContext(raValues, raPicks, format)`, `rosterAuditPickValue(pick, ownerPhase, raContext)`.
- `fetchRosterAuditValues`: paginates `/api/rosteraudit?path=rankings` (100/page). Passes `format` (sf/1qb), `league_size`, `position=all`.
- `fetchRosterAuditPicks`: hits `/api/rosteraudit?path=picks`.
- `buildRosterAuditContext`: builds `bySleeperId` Map from RA array, normalises `value` field. `pickValues` holds the pick map. Returns `{ bySleeperId, pickValues }`.
- `rosterAuditPickValue`: looks up a pick by `season-round-slot` or `season-round-phaseSlot`. Returns a numeric value or null.

#### fleaflickerApi.js — Fleaflicker normalisation
- Exports: `fetchFFUserLeagues(email)`, `fetchFFLeagueRosters(leagueId)`, `fetchFFRoster(leagueId, teamId)`, `fetchFFLeagueRules(leagueId)`, `fetchFFLeagueStandings(leagueId)`, `fetchFFTeamPicks(leagueId, teamId)`, `fetchFFTrades(leagueId)`, `fetchFFTransactions(leagueId)`, `loadFleaflickerLeague(leagueId, teamId, sleeperPlayers)`.
- All internal `fetchFF(endpoint, params)` calls go to `/fleaflicker` (dev) or `/api/fleaflicker?path=` (prod). Responses are deep-snake_cased before return.
- `loadFleaflickerLeague`: the key normalisation entry point. Fetches rules, rosters, standings, picks, trades, transactions in parallel; converts FF player objects into synthetic Sleeper-compatible player entries (mutates the passed `sleeperPlayers` map with `ff_${id}` keys); builds a Sleeper-shaped `league`, `myRoster`, `tradedPicks`, `transactions`, `users`, `rosters` payload.

#### marketValue.js — league rules context + pick/player values
- Exports: `getLeagueRulesContext(league)`, `buildPlayerMarketValue(player, leagueContext, fcEntry)`, `getKeepCount(pos, isSuperflex)`, `estimatePickValue(pick, leagueContext, tradeMarket)`, `pickSlotLabel(round, ownerPhase)`, `valueOfPickPhase(pick, ownerPhase, leagueContext)`, `pickFcValue(pick, context)`, `trendDelta(player, mode)`.
- `getLeagueRulesContext`: parses `league.roster_positions`, `scoring_settings`, `settings` into a normalised `leagueContext`: `{ isSuperflex, isTEP, scoringType, ppr, starterCounts: {QB,RB,WR,TE}, flexCount, formatLabel, positionPremiums, ... }`.
- `getKeepCount(pos, isSuperflex)`: returns how many players at a position count as "starters" for room-quality calculations.
- `estimatePickValue`: translates a pick round + estimated draft slot (from owner's phase) into an approximate 0–100 value. Falls back gracefully when no trade market data.
- `trendDelta(player, mode)`: computes the trend signal used in `OverviewTab` and `TradeTab` — difference in percentile between seasons.

#### scoringEngine.js — stat benchmarks + per-player score calculation
- Exports: `DEFAULT_SCORING_WEIGHTS`, `normalizeScoringWeights`, `getWeightDeviationRatio`, `AGE_CURVES_FALLBACK`, `buildAgeCurves`, `buildBenchmarks`, `getPctileRank`, `playerPctiles`, `draftCapitalScore`, `draftTierLabel`, `ageComponent`, `availComponent`, `trendComponent`, `situComponent`, `calcScore`, `clamp`.
- `buildBenchmarks(players, stats22, stats23, stats24, leagueContext, historicalStats, lastSeasonYear)`: computes position-level PPG distributions (sorted arrays) and age curves from multi-year stats. Returns `{ sorted: {QB,RB,WR,TE}, ageCurves }`.
- `calcScore(playerData, s24, s23, currentPctile, ageCurves, weights)`: returns `{ score: 0–100, components: {age, prod, avail, trend, situ} }`. Each component is 0–100; score is the weighted sum after `normalizeScoringWeights`.
- `playerPctiles(s24, s23, s22, pos, benchmarks, lastSeasonYear)`: returns `{ current, peak, pLast, pPrev, pOlder }` — percentile ranks against positional benchmarks.
- `draftTierLabel(round, slot)`: returns a short string like `"1.01"`, `"2.07"`, `"3rd+"`.
- See `docs/CALCULATIONS.md` for full formula breakdown.

#### playerGrading.js — verdicts, room grades, archetypes, ranks
- Exports: `getVerdict(score)`, `getColor(verdict)`, `computeRoomQuality(players, pos, isSuperflex)`, `computePositionGrade(players, pos, isSuperflex)`, `assignPositionRanks(leagueTeams, isSuperflex)`, `rankLabel(rank)`, `getArchetype(player)`, `getArchetypeTags(player)`, `getConfidence(player)`.
- `getVerdict`: buy ≥ 72, hold ≥ 52, sell ≥ 35, cut < 35.
- `computeRoomQuality(players, pos, isSuperflex)`: production-tilted quality metric for a position room. Formula: for each player `i` in starters pool, `blended = 0.3×dynastyScore + 0.7×currentPctile`, `weight = 1 − 0.08×i`. Returns weighted average. Returns null for empty rooms (sorts last).
- `computePositionGrade(players, pos, isSuperflex)`: maps `computeRoomQuality` result onto a 1–10 scale with position-specific thresholds.
- `assignPositionRanks(leagueTeams, isSuperflex)`: runs across all teams in the league, computes quality for each position, sorts teams, assigns `rank` (1=best), and writes `{ rank, of, color, grade }` into `team.posRanks[pos]`.
- `getArchetype(player)`: pure classification using `player.score`, `player.age`, `player.currentPctile`, `player.peakPctile`, `player.draftRound`, `player.yearsExp`, `player.depthOrder`. Returns one of 11 archetype strings.
- `getArchetypeTags(player)`: returns descriptive signal tags (e.g., `['Ascending', 'Buy Window', 'Injury Risk', 'Depth Chart Risk']`) from player fields.
- `getConfidence(player)`: `'High'|'Medium'|'Low'` based on data completeness.

#### rosterBuilder.js — roster snapshot + league classification
- Exports: `buildRosterPicks`, `getRosterNeeds`, `getRosterSurplusPositions`, `calcStarterPPG`, `classifyLeagueTeams`, `assignDraftSlots`, `buildRosterSnapshot`.
- `buildRosterSnapshot(roster, players, league, ...)`: iterates `roster.players`, filters to `POSITION_PRIORITY` positions, enriches each player, sorts rooms by score, builds picks list, computes needs/surplus, builds `tradeablePlayers`/`targetablePlayers`. Returns the full team snapshot (see analysis object shape above).
- `classifyLeagueTeams(leagueTeams, leagueContext)`: ranks all teams by a composite score, assigns `teamPhase.phase` + `teamPhase.score` + `teamPhase.signals`. Also populates `teamPhase` on each `leagueTeam` (mutates in place).
- `assignDraftSlots(leagueTeams, knownSlots)`: if Sleeper draft order is available, uses exact slots. Otherwise projects from `teamPhase.score` (worst = pick 1.01). Mutates `team.picks` with `slot` fields.

#### tradeEngine.js — trade market + suggestions + evaluator
- Exports: `buildTradeMarket(transactions, leagueTeams, leagueContext)`, `evaluateTrade(sideA, sideB, phaseA, phaseB, playerMarketMap, leagueContext, tradeMarket)`, `buildTradeSuggestions(myTeam, leagueTeams, leagueContext, tradeMarket)`.
- `buildTradeMarket`: scans completed trade transactions, identifies position premiums actually paid in this league, returns calibration object. `sampleCount` may be low in quiet leagues.
- `evaluateTrade(sideA, sideB, ...)`: evaluates a proposed trade. Each side is an array of `{ type: 'player'|'pick', ...fields }`. Returns `{ verdict, sideAValue, sideBValue, delta, fairnessLabel, adjustments, phaseBonus }`. Phase-adjustments are applied: rebuilders get a bonus for receiving picks, contenders get a bonus for receiving win-now players.
- `buildTradeSuggestions`: generates phase-appropriate trade ideas. Currently accepted by Dashboard but the rendering block in TradeTab is commented out.

#### predictionEngine.js — age curves, comps, 3-yr projections
- Exports: `POS_CAREER`, `buildDetailedAgeCurves`, `buildHistoricalSnapshots`, `buildPredictionContext`, `buildPlayerPrediction`.
- `buildPredictionContext(allStatYears, players, ageCurves)`: consumes all historical stat years (2014–2024), builds empirical per-position age decline curves and a historical snapshot DB for comp matching. Expensive — called once per analysis.
- `buildPlayerPrediction(player, predictionContext)`: for a single player, produces `{ dynastyOutlook, breakoutPct, cliffRisk, projectedScores: [y1, y2, y3], comps: [...], insights: string[] }`.
- `POS_CAREER`: typical career peak age by position — used as fallback when empirical data is sparse.

#### activityEngine.js — transaction grading + league health
- Exports: `scoreToGrade(score)`, `buildLeagueActivity(transactions, rosters, users, players)`.
- `scoreToGrade(score)`: maps 0–100 to letter grade + color (like player verdicts but for activity).
- `buildLeagueActivity`: analyses the full transaction history. Returns `{ overallScore, overallGrade, components: {tradeVelocity, rosterMgmt, tradeBreadth, dynastyEngagement, consistency}, stats, teams: [...], summaryText }`. Each `component` has `{label, score, weight, statLine, description}`. Each `team` has `{rosterId, label, grade, teamActivityScore, tradeCount, faAdds, uniquePartners, futurePickTrades, transactions, feedYears}`.

#### prospectScoring.js — rookie prospect grade system
- Exports: `BLUE_BLOOD_TEAMS`, `P5_TEAMS`, `CAPITAL_PROD_SCORES`, `CONFERENCE_SCORES`, `TIER_RANK`, `deriveSchool`, `computeGrade`, `deriveTier`, `dynastyScore`.
- Used by: `RookieRankings.jsx`, `RookieRankingsTab.jsx`, `RookieProspector.jsx` — not part of the main analysis pipeline.
- `computeGrade(prospect, sleeperRank, capitalOverride)`: combines college, conference tier, draft capital signals into a 0–100 grade.
- `deriveTier(grade, capitalKey)`: maps grade + capital into one of 7 tiers (T1 = elite, T7 = flier).
- `dynastyScore(grade, position, seasons)`: converts grade to projected dynasty value for sorting.

#### supabase.js — Supabase client
- Exports: `supabase` (the client instance created from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`).
- Also exports: `fetchPublicRankingsData()` — used by `RookieRankings.jsx` and `RookieRankingsTab.jsx` to pull prospect data; `verifyLogin(username, passkey)` — used by `RookieProspector.jsx`; and mutation helpers (`upsertProspect`, `upsertAnnotation`, `upsertExpertRanking`, `deleteExpertRanking`).
- Not used by the main Sleeper/Fleaflicker analysis flow at all.

### Caching summary
| Key pattern | TTL | Content |
|---|---|---|
| `fantasycalc_values_*` | 24h | FantasyCalc player array per format |
| `sleeper_stats_{year}` | 7 days | Sleeper season stats 2018–2021 |
| `sleeper_stats_deep_{year}` | 30 days | Sleeper season stats 2014–2017 |
| `sleeper_username` | persistent | Last used Sleeper username |
| `sleeper_league` | persistent | Last selected league JSON |
| `dynasty_os_platform` | persistent | `sleeper` or `fleaflicker` |
| `ff_email`, `ff_league` | persistent | Fleaflicker credentials |
| `dyn:strategy-plan:{leagueId}:{rosterId}` | persistent | Saved strategy plan JSON |

RosterAudit values and picks are not locally cached — the proxy caches them at the CDN edge for 1h.

---

## Strategy planner engine (`src/lib/strategyPlanner/`)

Generates a multi-section, personalised strategy plan for a dynasty team. Operates on the `analysis` object produced by `buildRosterAnalysis` but is NOT called from `analysis.js` — it is imported directly by `StrategyPlannerTab.jsx`. The pipeline is: classify team state → user selects a path → `generatePlan(analysis, pathKey)` runs all section generators → returns a rich plan object. Plans persist in localStorage, scoped per league+roster.

```
StrategyPlannerTab.jsx
  ├── classifyForPlanner(analysis, userOverride)  → classification
  ├── [user selects path from PathSelector]
  └── generatePlan(analysis, pathKey, opts)       → plan
        ├── getPath(pathKey)                       [pathDefinitions.js]
        ├── classifyForPlanner()
        ├── generateRosterTriage(analysis, path)   [sections/]
        ├── generateTradeTargets(analysis, path)
        ├── generateMarqueeMoves(analysis, path)
        ├── generateBombshellMoves(analysis, path)
        ├── generateHaulTrades(analysis, path)
        ├── generateTierMoves(analysis, path)
        ├── generateRookieStrategy(analysis, path)
        ├── generateRoadmap(analysis, path, { tradeTargets, marqueeMoves, ... })
        └── generateRiskFlags(analysis, path)
              ↓
        plan object → PlanView → sub-components
```

### Plan shape
Return value of `generatePlan`:

```
{
  pathKey: string,
  pathName: string,
  pathSubtitle: string | null,
  pathTagline: string,
  pathRisk: string,           // 'Low'|'Medium'|'Medium-High'|'High'
  pathTimeToContend: string,
  pathMechanic: string,
  generatedAt: number,        // Date.now()
  classification: {
    class: 'rebuilder'|'retooler'|'contender',
    derivedClass: same,
    confidence: 0–100,
    reasoning: string[],
    userOverride: boolean
  },
  rosterAuditSource: object | null,
  sections: {
    triage: RosterTriageResult,
    tradeTargets: TradeTarget[],
    marqueeMoves: MarqueeMove[],
    bombshellMoves: BombshellMove[],
    haulTrades: HaulTrade[],
    tierMoves: TierMove[],
    rookieStrategy: RookieStrategyResult,
    roadmap: Roadmap,
    risks: RiskFlag[]
  }
}
```

### Strategy planner engine files

#### index.js — public entry
Re-exports everything callers need:
- `generatePlan` from `./generatePlan`
- `classifyForPlanner`, `classToPhase`, `PLANNER_CLASSES` from `./classifyForPlanner`
- `PATHS`, `PATH_ORDER`, `getPath`, `getPathsForClass` from `./pathDefinitions`
- `savePlan`, `loadPlan`, `clearPlan` from `./persistPlan`

#### classifyForPlanner.js — team state to planner class
- Exports: `classifyForPlanner(analysis, userOverride)`, `classToPhase(cls)`, `PLANNER_CLASSES`.
- Thin adapter: maps `analysis.teamPhase.phase` (`contender`→`contender`, `retool`→`retooler`, `rebuild`→`rebuilder`).
- `userOverride` (string or null) — if provided and different from `derivedClass`, sets the active class.
- Returns `{ class, derivedClass, confidence, reasoning: string[], userOverride: boolean }`.
- `PLANNER_CLASSES = ["rebuilder", "retooler", "contender"]`.

#### pathDefinitions.js — strategy path catalog
- Exports: `PATHS` (object keyed by pathKey), `PATH_ORDER` (array of keys in display order), `getPathsForClass(cls)`, `getPath(pathKey)`.
- `getPathsForClass(cls)`: returns all path objects whose `.class === cls`, in PATH_ORDER order.
- Each path object has: `key`, `name`, `subtitle?`, `class`, `tagline`, `risk`, `timeToContend`, `bestFor`, `mechanic`, `triageRules: { buildAround(player), sellNow(player), holdReassess(player) }`, `triageRationales`, plus optional extra configs used by specific section generators.

#### generatePlan.js — plan assembly
- Exports: `generatePlan(analysis, pathKey, opts = {})`.
- Calls each section generator in order, passes `analysis` + path to each, then assembles and returns the plan object.
- `opts.override` is passed to `classifyForPlanner` as `userOverride`.
- Throws `Error` if `pathKey` is not found in `PATHS`.

#### persistPlan.js — localStorage persistence
- Exports: `savePlan(leagueId, rosterId, plan)`, `loadPlan(leagueId, rosterId)`, `clearPlan(leagueId, rosterId)`.
- Storage key: `dyn:strategy-plan:{leagueId}:{rosterId}`.
- Silently ignores quota errors and parse errors.
- Plans have no TTL — they persist until explicitly cleared or the league/roster changes (StrategyPlannerTab clears on league/roster switch).

### Paths catalog

| Key | Class | Risk | Time | Mechanic |
|---|---|---|---|---|
| `fullTeardown` | rebuilder | High | 2-3 years | Sell every player 26+, stockpile 1st-round picks |
| `retoolRebuild` | rebuilder | Medium | 1-2 years | Keep young core, sell aging depth for Year 2 breakouts + 2nds |
| `positionalArbitrage` | rebuilder | Medium | 1-2 years | Exploit league position premiums — sell overvalued, buy undervalued |
| `veteranPivot` | retooler | Medium | 1 year | Sell aging name-value vets for prime Year 3-4 players |
| `youthInjection` | retooler | Low | Now + extended | Sell future picks + depth vets for ascending Year 2 contributors |
| `consolidationPlay` | retooler | Medium-High | 1 year | 2-for-1 / 3-for-1 trades for difference-makers |
| `allIn` | contender | High | This year only | Mortgage future 1sts/2nds + young bench for proven vet upgrades |
| `surgicalUpgrade` | contender | Low | This year + sustained | Fix the one weak starting spot; use late picks only |
| `softLanding` | contender | Low | This year + next | Win-now using only vets + late picks; quietly buy Year 2 players |

#### Path triageRules pattern
Each path defines `triageRules.buildAround(player)`, `sellNow(player)`, `holdReassess(player)` as predicates on the enriched player object. `generateRosterTriage` runs all players through these rules to produce three lists.

- `positionalArbitrage` passes `(player, ctx)` — its predicates reference `ctx.analysis` to check `leagueContext.positionPremiums`.
- `surgicalUpgrade` has a `biggestHole(analysis)` helper that identifies the weakest position room.

### Section generators

#### generateRosterTriage.js
- Exports: `generateRosterTriage(analysis, path)`.
- Runs every player in `analysis.enriched` through `path.triageRules.buildAround/sellNow/holdReassess`.
- Returns `{ buildAround: Player[], sellNow: Player[], holdReassess: Player[], rationales: Map<id, string> }`.
- Players not matching any rule fall through (not included in any bucket).

#### generateTradeTargets.js
- Exports: `generateTradeTargets(analysis, path)`.
- Looks at `analysis.leagueTeams` to find players on other teams that match the path's acquisition profile.
- Returns `TradeTarget[]`, each: `{ player, fromTeam, rationale, priority }`.

#### generateMarqueeMoves.js
- Exports: `generateMarqueeMoves(analysis, path)`, `valueOfPlayer(player)`, `passesRealismGates(sellPlayer, recvPlayer)`.
- Marquee moves are realistic trades: one named asset for one named asset that substantially improves the team along the chosen path.
- `passesRealismGates`: checks value floors so generated trades aren't obviously lopsided.
- Returns `MarqueeMove[]`, each: `{ give: Player|Pick, receive: Player|Pick, fromTeam, rationale, netValueDelta }`.

#### generateBombshellMoves.js
- Exports: `generateBombshellMoves(analysis, path)`.
- High-upside, higher-risk moves: multi-asset packages for elite players, firesales, or "win-now" acquisitions depending on path.
- Returns `BombshellMove[]`.

#### generateHaulTrades.js
- Exports: `generateHaulTrades(analysis, path)`.
- Sell-for-haul ideas: offering one high-value asset for a multi-asset package (picks + young players).
- Returns `HaulTrade[]`.

#### generateTierMoves.js
- Exports: `generateTierMoves(analysis, path)`.
- Tier-up or tier-down trades: lateral value swaps that shift the roster's age/phase profile rather than raw value.
- Returns `TierMove[]`.

#### generateRookieStrategy.js
- Exports: `generateRookieStrategy(analysis, path)`.
- Computes how aggressively to participate in the next rookie draft, how many picks to target, which positions to prioritise based on path + current room quality.
- Returns `{ draftStrategy, targetCount, positionPriority: string[], rationale: string[] }`.

#### generateRoadmap.js
- Exports: `generateRoadmap(analysis, path, { tradeTargets, marqueeMoves, bombshellMoves, rookieStrategy })`.
- Synthesises the other sections into a timeline: immediate actions (now), mid-term (this offseason), long-term (next 2 years).
- Returns `Roadmap`: `{ now: Step[], offseason: Step[], longTerm: Step[] }` — each `Step` has `{ action, rationale, priority }`.

#### generateRiskFlags.js
- Exports: `generateRiskFlags(analysis, path)`.
- Short list of warnings: age cliffs, pick-light inventory, overweight in a declining position, etc.
- Returns `RiskFlag[]`, each: `{ flag, severity: 'high'|'medium'|'low', detail }`.

---

## Top-level screens (`src/components/`)

Top-level React screens routed by `src/App.jsx`. The app has three primary surfaces: the entry `InputScreen` (username/email capture), `LeaguePickerScreen` (pick a dynasty league to analyze), and `Dashboard` (the main analytical UI — a tab-switcher over a computed `analysis` object built by `src/lib/analysis.js::buildRosterAnalysis`). Two standalone routes, `RookieRankings` (public) and `RookieProspector` (gated admin editor), live outside the main app flow and hit Supabase directly. `Layout` is a chrome wrapper used by App for all screens. `Legal` is a privacy-policy modal body rendered inside Layout's footer modal.

All styling comes from `src/styles.js`; the rookie screens use Tailwind classes instead of the inline `styles` object (and assume Tailwind is configured globally). No React Router — App conditionally renders based on path check at mount plus internal `activeTab`/`screen` state.

### InputScreen.jsx — platform + credential entry
Purpose-built landing/marketing page that also takes the username or email.

- Props: `{ username, setUsername, onSubmit, loading, error, platform, onSetPlatform, ffEmail, setFfEmail }`.
- Renders: header, platform toggle (Sleeper / Fleaflicker), a single input whose binding swaps based on `platform`, submit button, plus static marketing sections (features grid, how-it-works, FAQ, about).
- State owned: none (fully controlled by App).
- localStorage: none directly — App persists `username`, `ffEmail`, `platform` after submit.
- Mounts: nothing.
- Gotchas: button is disabled based on which platform is active; Enter key triggers `onSubmit`. Uses inline style constants defined at file-bottom (not `styles`).

### LeaguePickerScreen.jsx — league selector
- Props: `{ leagues, onSelectLeague, loading, selectedLeague, error }`.
- Renders: a list of buttons — one per dynasty league. Shows name, team count, season, and for Fleaflicker the `_ff_team_name` owner label. If a league is currently loading, a "Loading..." chip appears on that row.
- State owned: none.
- Gotchas: empty-state message appears only when `!leagues.length && !loading`. Fleaflicker-specific `_ff_team_name` is a synthetic field set by `fleaflickerApi` so we know which roster is the user's.

### Layout.jsx — chrome wrapper with footer + privacy modal
- Props: `{ children }`.
- Renders: full-bleed `styles.app` grid background, content container, footer with links (Rookie Rankings → `/rookie-rankings`, Privacy, copyright, Admin → `/admin/rookie-prospector`).
- State owned: `showPrivacy` boolean.
- Mounts: children; `PrivacyPolicy` (aka `Legal.jsx`) inside a full-screen modal overlay when privacy link is clicked.
- Gotchas: footer links use plain `<a href>` (full page reload) rather than client routing. Modal closes on backdrop click (stopPropagation on inner content).

### Legal.jsx — privacy policy body
- Props: `{ onBack }` (unused in current render but kept for modal parity).
- Renders: 8 sections (Overview, Info We Collect, AdSense/Cookies, Third-Party Services, Cookies, Children, Changes, Contact). Pure content — no state, no interactions.
- Gotchas: Date is hard-coded "Last updated: April 2025" in the subtitle.

### Dashboard.jsx — main analytical UI (tabbed)
The orchestrator for all dashboard tabs. Destructures the big `analysis` object and routes to the appropriate tab component based on `activeTab`.

- Props: `{ analysis, selectedLeague, activeTab, setActiveTab, showGradeKey, setShowGradeKey, collapsedRooms, expandedBars, onToggleRoom, onToggleBars, onSwitchLeague, onLogout, showScoreWeights, setShowScoreWeights, onConfirmScoreWeights, recalculating }`.
- Reads (from `analysis`): `byPos`, `sells`, `avgAge`, `avgScore`, `picksByYear`, `weakRooms`, `aiAdvice`, `picks`, `proportions`, `surplusPositions`, `needs`, `tradeSuggestions`, `tradeBlock`, `leagueContext`, `tradeMarket`, `fantasyCalcSource`, `rosterAuditSource`, plus `isSuperflex`, `scoringWeights`, `teamPhase`, `posRanks`, `leagueTeams`, `rosterId`, `myTeamLabel`, `leagueActivity`.
- State owned: `strategyUnlocked` (access-code gate for the strategy tab when `VITE_ENABLE_STRATEGY_PLANNER !== "true"`), `unlockInput` (password text, case-sensitive match against literal `"LetMeIn!"`).
- Mounts: `GradeKeyModal` (when `showGradeKey`), `ScoreWeightsModal` (when `showScoreWeights`), and exactly one of `OverviewTab`, `RosterTab`, `TradeTab`, `StrategyPlannerTab`, `RankingsTab`, `RookieRankingsTab`, `LeagueTab`, `LeagueActivityTab`, `DocumentationTab` based on `activeTab`.
- Tab keys: `overview | roster | trades | strategy | rankings | rookies | league | activity | docs`.
- Header shows: league name, Switch-League / Adjust-Weights / Log-out buttons, recalculating spinner, and a subtitle summarizing `avgAge`, `avgScore`, pick count, `isSuperflex`, and the active `scoringWeights` as A/P/V/T/S.
- Gotchas: the `strategy` tab has a coming-soon gate; it becomes visible when the `VITE_ENABLE_STRATEGY_PLANNER` env flag is truthy OR the user unlocks with `"LetMeIn!"`. The unlock state is in-memory only (not persisted).

### RookieRankings.jsx — public rookie rankings page (Tailwind)
Standalone page mounted at `/rookie-rankings`. Shows a single-column ranked list of rookie prospects with position/year filters.

- Props: none.
- State owned: `data` (from Supabase), `loading`, `error`, `posFilter` object, `yearFilter` string (defaults to current year; tabs show +0/+1/+2 years).
- Effect: on mount calls `fetchPublicRankingsData()` from `src/lib/supabase.js` — returns `{ prospects, annotations }`.
- Reads (derived): tier via `deriveTier`/annotation, grade via `computeGrade`, sort key `dynastyScore` — all from `src/lib/prospectScoring.js`. `TIER_RANK` used to sort by tier then by `ds`.
- Renders: sticky header with year, back-to-app link, filter row (position pills + year tabs + count), prospect list cards with rank, name, position pill, tier badge, comp, NFL capital, landing spot, rookie ADP chip.
- localStorage: none.
- Mounts: no subcomponents.
- Gotchas: position colors use Tailwind classes (`bg-rose-500/15` etc.) — requires Tailwind build pipeline. Filters out prospects whose `projected_draft_year` doesn't match `yearFilter` (defaults to current year if unset).

### RookieProspector.jsx — admin editor for the prospect database (Tailwind)
Standalone page mounted at `/admin/rookie-prospector`. Gated by username+passkey via `verifyLogin` (Supabase). Lets logged-in experts add/edit prospects, set tiers, rank, declare players, and maintain their personal ranking list.

- Props: `{ rosterData: rosterDataProp, onLogout }`.
- State owned: one big `state` object (`unlocked`, `initLoading`, `user`, `usernameInput`, `passInput`, `gateError`, `dbLoading`, `tab`, `filters`, `yearFilter`, `prospects`, `sleeperByName`, `sleeperLoading`, `sleeperError`, `annotations`, `expertRankings`, `page`, `listSearch`, `search`, `rosterJson`, `rosterData`, `rosterParseError`) plus separate `addForm`, `addFormError`, `addFormSaving`.
- localStorage keys: `rp_session` — serialized `{ id, username, role }`. Restored on mount; cleared on logout. The `loadSession`/`saveSession`/`clearSession` helpers live at the top of the file.
- Sub-tabs: `add` (add/edit player form), `upcoming` (declared players sorted by tier→dynasty value), `board` (all prospects sorted by grade), `value` (expert's personal ranked list with ▲▼ reorder buttons), `archive` (declared prospects for past draft years).
- Effects: on mount, tries to restore session via `loadSession` and auto-fetches `fetchAllData` + `fetchMyRankings`. While unlocked, it fetches `https://api.sleeper.app/v1/players/nfl` once and builds a `sleeperByName` map keyed on normalized name, keeping only rookies (`years_exp === 0` or null + no team).
- Supabase mutations: `upsertProspect`, `upsertAnnotation`, `upsertExpertRanking`, `deleteExpertRanking` — all fire-and-forget on state change with error logging.
- Mounts: `AddPlayerSeasonRow`, `Pill`, `GradeBadge`, `TierSelect`, `CapitalSelect`, `StatBar`, `ProspectStats`, `Pagination`, `ProspectCard`, `CellInput`, `ProspectEditorTab` — all defined in-file.
- Gotchas: adding a new prospect kicks off a sync into every other expert's ranking list, inserting at the correct tier-then-dynasty-score slot and bumping subsequent `rank_order` values. This is a lot of Supabase writes in one action. The "declared" concept means the prospect has opted into a specific draft year; Sleeper-matched rookies are auto-declared for current year ("Sleeper" badge).

---

## Dashboard tabs and modals (`src/components/dashboard/`)

Every file here is mounted by `Dashboard.jsx` based on the `activeTab` string state. Each tab consumes a slice of the `analysis` object produced by `src/lib/analysis.js::buildRosterAnalysis` and passed through `Dashboard`. Modals (`GradeKeyModal`, `ScoreWeightsModal`, `PlayerDeepDiveModal`) are triggered from tab components via setState props hoisted to App. The `strategyPlanner/` subdirectory holds sub-components of `StrategyPlannerTab` — see [Strategy planner UI](#strategy-planner-ui-srccomponentsdashboardstrategyplanner).

### Tab routing
`Dashboard.jsx` renders exactly one tab at a time based on `activeTab`:
- `overview` → `OverviewTab`
- `roster` → `RosterTab`
- `trades` → `TradeTab`
- `strategy` → `StrategyPlannerTab` (gated — requires `VITE_ENABLE_STRATEGY_PLANNER=true` env flag or in-memory unlock with access code `"LetMeIn!"`; otherwise a coming-soon pane is shown)
- `rankings` → `RankingsTab`
- `rookies` → `RookieRankingsTab`
- `league` → `LeagueTab`
- `activity` → `LeagueActivityTab`
- `docs` → `DocumentationTab`

`AdviceTab.jsx` is still present but NOT currently wired into the tab switch — it expects `{ aiAdvice, aiLoading, onGetAIAdvice }` props. The AI verdict currently appears inline on `OverviewTab` via `analysis.aiAdvice`.

### OverviewTab.jsx — landing tab: room rankings, sells, phase, AI verdict
- Props: `{ byPos, sells, weakRooms, proportions, aiAdvice, teamPhase, posRanks, onOpenGradeKey, leagueTeams, myNeeds, mySurplus, myRosterId }`.
- Reads: `analysis.byPos`, `analysis.sells`, `analysis.weakRooms`, `analysis.proportions`, `analysis.aiAdvice`, `analysis.teamPhase`, `analysis.posRanks`, `analysis.leagueTeams`, `analysis.needs` (as `myNeeds`), `analysis.surplusPositions` (as `mySurplus`), `analysis.rosterId`.
- Renders (top → bottom): a 4-up position ranks grid (QB/RB/WR/TE) using `posRanks[pos].rank`/`of`/`color`/`grade`; two side-by-side cards (Sell Now → `sells.slice(0,4)`, Weak Rooms to Address → merged `weakRooms` + any bottom-third from `posRanks`); Roster Value Balance bar chart (actual vs. ideal % per position via `proportions`); a "Trade Conversation Starters" section that computes partner fit scores by cross-referencing `myNeeds`/`mySurplus` with each other team's `needs`/`surplusPositions`/`targetablePlayers`; Team Phase card (phase label + score/100 + signal bullets); AI Verdict card if `aiAdvice` present (shows `overallVerdict`, `rebuildScore`/10, `timelineToContend`).
- Interactions: `onOpenGradeKey` triggers `GradeKeyModal` (hoisted to Dashboard).
- Modals: none direct — only triggers GradeKeyModal via prop.
- Gotchas: "Trade Conversation Starters" filters out trivial partners (no mutual fit, no `score >= 55` assets). Partner fit score formula is ad-hoc: needs×3 + surplus×3 + top-asset bonus. `myEarlyPicks` is computed from `leagueTeams.find(t.rosterId === myRosterId).picks` filtered to round ≤ 2.

### RosterTab.jsx — per-position roster view with room reports + pick capital
Very dense — largest tab at ~1100 lines.

- Props: `{ byPos, collapsedRooms, expandedBars, onToggleRoom, onToggleBars, positionPriority, scoringWeights, picksByYear, picks, leagueContext, tradeMarket, leagueTeams, myRosterId, raPickValues, posRanks, isSuperflex }`.
- Reads: `analysis.byPos`, `analysis.scoringWeights`, `analysis.picksByYear`, `analysis.picks`, `analysis.leagueContext`, `analysis.tradeMarket`, `analysis.leagueTeams`, `analysis.rosterId`, `analysis.rosterAuditSource.pickValues` (as `raPickValues`), `analysis.posRanks`, `analysis.leagueContext.isSuperflex`.
- State owned: `deepDivePlayer` (player object or null — triggers `PlayerDeepDiveModal`).
- Renders: one room per position (QB/RB/WR/TE), each collapsible via `collapsedRooms[pos]` + `onToggleRoom`. Per player: score circle, name, team/age/experience, ppg, peak/previous-season percentiles, draft tier, trajectory badge, archetype tag, verdict tag, Deep Dive button, expand-bars button. When expanded, shows 5 `ScoreBar`s (age/prod/avail/trend/situ using `p.components.*`) plus a predictive-model block: dynasty outlook chip, breakout %, cliff risk, 3-yr score projection cards, key insights bullets, and 3 historical comps with Y+1 delta colors.
- Below positions: `FlexRoom` (in-file subcomponent) computes a pseudo-room from the leftovers past each position's starter count — uses `leagueContext.starterCounts`, `leagueContext.flexCount`. Grades it with a rubric (8-10 "Cheat code", 5-7 "Playable", 1-4 "Hole"). `PositionGradeStrip` renders the "Room Report" summary (grade/10, tier label, rubric dots, 3 bullet signals) via the file-local `getGradeSignals(players, pos, isSuperflex)` heuristic.
- Draft Capital section at bottom: groups `picksByYear` by year, colors by round (1st green, 2nd yellow, 3rd+ grey), shows pick slot label from `pickSlotLabel` (using owner team phase), pick value from `getPickValue` which prefers `raPickValues[season-round-slot]` (exact) or `raPickValues[season-round-phaseSlot]` (early/mid/late) before falling back to `estimatePickValue` from `src/lib/marketValue.js`. Also renders a "Capital Summary" card with total value per year.
- Modals: `PlayerDeepDiveModal` (via local state `deepDivePlayer`).
- Gotchas: pick-value source badge — RA values show without a tilde and in green; estimates show prefixed with `~` in grey. `PHASE_TO_SLOT` maps rebuild→early, retool→mid, contender→late. `getPickValue` and `formatValue` are duplicated between `RosterTab` and `PicksTab`.

### TradeTab.jsx — trade calculator + market context + need/surplus/trade-chip cards
- Props: `{ tradeSuggestions, weakRooms, surplusPositions, tradeBlock, picks, leagueContext, tradeMarket, fantasyCalcSource, leagueTeams, teamPhase, posRanks, myRosterId }`.
- Reads: `analysis.tradeSuggestions` (currently unrendered — whole render block is commented out), `analysis.weakRooms`, `analysis.surplusPositions`, `analysis.tradeBlock`, `analysis.picks`, `analysis.leagueContext`, `analysis.tradeMarket`, `analysis.fantasyCalcSource`, `analysis.leagueTeams`, `analysis.teamPhase`, `analysis.posRanks`, `analysis.rosterId`.
- In-file subcomponents: `TradeCalculator` (state `teamAId`, `teamBId`, `sideA`, `sideB`; calls `evaluateTrade` from `src/lib/tradeEngine` with both teams' phases, a `playerMarketMap` built from all `leagueTeams.enriched`, plus `leagueContext` and `tradeMarket`); `TradeCalcKey` (hover tooltip explaining value/fit/market terminology); `PickChip`.
- Sections rendered: Trade Calculator card (two team selects → asset pickers → verdict panel with fairness label, adjusted values per side, phase-adjustment bonuses); League Market Context card (shows `leagueContext.formatLabel`, `tradeMarket.sampleCount`, per-position multipliers, FantasyCalc link if `fantasyCalcSource.enabled`); Need Rooms card (merges `weakRooms` + bottom-third `posRanks`); Move From Strength card (shows top 3 players from `myTeam.enriched` per surplus position); Best Trade Chips card (`tradeBlock` list plus "Flexible Picks" chip row).
- Modals: none.
- Gotchas: `TradeCalculator` adds assets keyed by either `asset.id` (players) or `asset.label` (picks) to prevent dupes. Picks shown in the asset picker are capped to round ≤ 4. The large "Suggested Trade Paths" rendering block is entirely commented out at the bottom of the file — `tradeSuggestions` is accepted but unused.

### PicksTab.jsx — pick inventory (not currently in tab switch, but still present)
- Props: `{ picksByYear, picks, leagueContext, tradeMarket, leagueTeams, myRosterId, raPickValues }`.
- Reads: `analysis.picksByYear`, `analysis.picks`, `analysis.leagueContext`, `analysis.tradeMarket`, `analysis.leagueTeams`, `analysis.rosterId`, `analysis.rosterAuditSource.pickValues`.
- Renders: year-grouped pick chips (same format as the Draft Capital section in RosterTab), empty state, Capital Summary with per-year totals, and a static "Pick Strategy Guide" card at the bottom.
- State: none.
- Modals: none.
- Gotchas: not currently referenced by `Dashboard.jsx` — Draft Capital is shown inside `RosterTab` instead. Retained as a stand-alone view; likely legacy.

### RankingsTab.jsx — RosterAudit dynasty rankings table
- Props: `{ rosterAuditSource }`.
- Reads: `analysis.rosterAuditSource` (object with `enabled`, `rankings`, `totalPlayers`, `url`, `attribution`).
- State owned: `posFilter` string (`ALL | QB | RB | WR | TE`).
- Renders: position filter pills, then a table capped at top 200 rows showing rank_overall, name, position, team, age, tier (colored T1–T7), value (toLocaleString), pos rank (e.g., RB12), 7d/30d trend arrows, and badge flags for `buy_low`/`sell_high`/`breakout` (values are string `"1"`).
- Modals: none.
- Gotchas: shows empty state if RosterAudit data is disabled or missing. Tier colors are hard-coded 1–7 in `TIER_COLORS`. The `filtered.slice(0, 200)` cap is applied per position filter.

### LeagueTab.jsx — league-wide team standings and rosters
- Props: `{ leagueTeams, myTeamLabel, isSuperflex }`.
- Reads: `analysis.leagueTeams` (each team has `rosterId`, `label`, `avgScore`, `avgAge`, `byPos`, `picks`, `posRanks`, `teamPhase`, `wins`, `losses`, `ties`, `pointsFor`, `enriched`), `analysis.myTeamLabel`, `analysis.isSuperflex`.
- State owned: `expandedTeam` (rosterId or null).
- Renders: teams sorted by `teamPhase.score` desc. Each row: rank, team name (highlighted if yours), 4-up `PositionGrades` strip (uses `posRanks[pos].color` + `rankLabel(r.rank)` from `lib/analysis`), avg score, expand arrow. Below that: phase tag, record, PF, starter PPG, avg age, pick count. When expanded, shows `TeamRoster` (top 5 per position with verdict dot, name, age, archetype, score) and `TeamPicks` (year-grouped chips for their picks; rounds colored; future years marked "Projected").
- Modals: none.

### LeagueActivityTab.jsx — league trade/waiver health scorecard
- Props: `{ leagueActivity, myTeamLabel }`.
- Reads: `analysis.leagueActivity` (shape: `overallScore`, `overallGrade {grade, color, label}`, `components {tradeVelocity, rosterMgmt, tradeBreadth, dynastyEngagement, consistency}` — each `{label, score, weight, statLine, description}`, `stats {totalTrades, tradesPerTeamPerSeason, activeTraderCount, numTeams, effectiveSeasons}`, `teams [{rosterId, label, grade, teamActivityScore, tradeCount, faAdds, uniquePartners, futurePickTrades, transactions, feedYears}]`, `summaryText`), `analysis.myTeamLabel`.
- State owned: `expandedTeam` rosterId; `TransactionFeed` has internal `yearFilter`, `typeFilter` (`all | trade | fa`).
- Renders: hero card (big grade badge + score/100 + summary + 4 stat tiles); 5-column component breakdown grid (each `ComponentCard` with score bar, weight %, stat line, description); per-team expandable rows that reveal a `TransactionFeed` with year/type pill filters. Trades render differently for 2-team vs multi-team (multi-team shows per-leg breakdown).
- Helper: `scoreToGrade` from `src/lib/activityEngine`.
- Modals: none.
- Gotchas: returns a "no activity data available" stub if `leagueActivity` is null.

### RookieRankingsTab.jsx — in-dashboard rookie rankings view
- Props: none.
- Reads: Supabase via `fetchPublicRankingsData()` from `src/lib/supabase` — returns `{ prospects, annotations, byProspect, consensusMap, experts }`. Does NOT read from the main `analysis` object.
- State owned: `data`, `loading`, `error`, `view` (string — `"consensus"` or an expert user id), `posFilter {QB,RB,WR,TE}`, `yearFilter` string (current year by default).
- Renders: view toggle (Consensus + button per expert), position filters, year tabs (+0/+1/+2), prospect rows with rank, name, position pill, tier badge, comp chip, NFL capital, landing spot, rookie ADP, and (in consensus view) analyst count.
- Sort logic: consensus view sorts by `avgRank` (ranked first), then tier via `TIER_RANK`, then `dynastyScore`. Expert view filters to prospects the expert has ranked and sorts by their `rank_order`.
- Modals: none.
- Gotchas: very similar to the standalone `RookieRankings.jsx` page — the two share helpers from `src/lib/prospectScoring.js` but differ in the expert/consensus toggle.

### AdviceTab.jsx — legacy AI advice view (not wired)
- Props: `{ aiAdvice, aiLoading, onGetAIAdvice }`.
- Reads: would read `analysis.aiAdvice` if mounted. Currently NOT routed by `Dashboard.jsx` — AI output is shown inline on `OverviewTab`.
- State owned: none.
- Renders: if `aiAdvice` absent, a CTA with `onGetAIAdvice`; otherwise strengths/warnings grid, top sells list, buy targets list, pick strategy paragraph, and a numbered Win-Now Moves list.
- Gotchas: kept for possible reuse. Dead code from the tab-switch perspective.

### StrategyPlannerTab.jsx — multi-year planner (feature-flagged)
- Props: `{ analysis, selectedLeague }`.
- Reads: full `analysis` object plus `selectedLeague.league_id`.
- State owned: `classOverride`, `selectedPathKey`, `plan`, `saved`, `showAllPaths`.
- Delegates to: `generatePlan`, `classifyForPlanner`, `savePlan`, `loadPlan`, `clearPlan` — all from `src/lib/strategyPlanner`.
- localStorage: handled inside `savePlan`/`loadPlan`/`clearPlan` (keys scoped to `leagueId` + `rosterId`).
- Mounts: `./strategyPlanner/TeamStateBadge`, `./strategyPlanner/PathSelector`, `./strategyPlanner/PlanView`.
- Gotchas: on league or roster change, resets all local state and rehydrates saved plan from localStorage. `handleOverrideClass` toggles — passing the same class as the currently derived one clears the override. Plan is cleared whenever the user overrides class and a previous plan exists (forces re-selection).

### DocumentationTab.jsx — static calculation docs
- Props: none.
- Reads: nothing — pure static content defined in the local `SECTIONS` array at the top of the file.
- State owned: likely an `openSection` for accordion behavior (file is ~730 lines of content).
- Renders: sections explaining Dynasty Score, Age/Production/Availability/Trend/Situation components, production thresholds, draft capital weighting by years of experience, formula text blocks, and reference tables. No interactions with `analysis`.
- Gotchas: When the scoring algorithm changes in `src/lib/analysis.js`, the tables here must be hand-edited to match.

### GradeKeyModal.jsx — archetype + verdict legend modal
- Props: `{ onClose }`.
- Renders: a modal overlay explaining the archetype categories (`ARCHETYPE_DESC`, `ARCHETYPE_META` from `src/constants`) and verdict tags (buy/hold/sell/cut).
- Listeners: Escape key calls `onClose` (cleaned up on unmount).
- Triggered by: `OverviewTab`'s "?" button (via `setShowGradeKey(true)` hoisted to Dashboard).
- Gotchas: backdrop click closes the modal; inner click is `stopPropagation`-guarded.

### ScoreWeightsModal.jsx — scoring weight slider modal
- Props: `{ initialWeights = DEFAULT_SCORING_WEIGHTS, onClose, onConfirm, isConfirming }`.
- State owned: `draft` object with `{age, prod, avail, trend, situ}` numbers.
- Derived: `total` (raw sum), `normalized` (each scaled so they sum to 100).
- Renders: one slider per component (0–100 step 1), showing both raw % and applied %; Reset button (snaps to `DEFAULT_SCORING_WEIGHTS`); Confirm button (calls `onConfirm(draft)` — the parent normalizes and re-runs `buildRosterAnalysis`).
- Listeners: Escape closes (disabled while `isConfirming`).
- Triggered by: Dashboard's "Adjust Weights" header button.
- Gotchas: `onConfirm` receives raw (non-normalized) values — App/analysis code normalizes internally. `isConfirming` prevents backdrop-click and button spam during recalc.

### PlayerDeepDiveModal.jsx — per-player deep dive (grade breakdown + comps)
- Props: `{ player, scoringWeights, onClose }`.
- Reads: the full `player` object (as passed by RosterTab's `deepDivePlayer` state). Uses `ARCHETYPE_DESC`, `ARCHETYPE_META` from `src/constants` and `getColor`, `getVerdict` from `lib/analysis`.
- Renders: ~800 lines. Shows per-component explanation blocks (age/prod/avail/trend/situ) with position-aware plain-English rationale (`ageExplanation`, `prodExplanation`, etc.), MiniBars for component scores, and archetype / peak percentile context.
- Listeners: likely Escape key + backdrop click (pattern matches other modals).
- Triggered by: `RosterTab`'s per-player "Deep Dive" button (via local state `setDeepDivePlayer`).
- Gotchas: age/decline/cliff thresholds are hard-coded again here (QB 27/33/37, RB 24/27/30, WR 26/30/33, TE 27/31/34). If the scoring algorithm's thresholds change in `lib/analysis`, these must be updated in parallel.

### ScoreBar.jsx — tiny score-component bar widget
Single-purpose 35-line component. Props: `{ label, value, color }`. Renders a label/value row plus a fixed-height background bar with a colored fill at `width: ${value}%`. Used by `RosterTab` inside the per-player expand block to render age/prod/avail/trend/situ. No state, no interactions.

---

## Strategy planner UI (`src/components/dashboard/strategyPlanner/`)

Sub-components of `StrategyPlannerTab.jsx` that render the generated strategy plan. Each component maps ~1:1 to a `plan.sections.*` key. They receive their section data as a prop and render it as a styled card — no state, no engine calls, no direct `analysis` reads (the plan is pre-computed before these mount).

### Parent
`StrategyPlannerTab.jsx` (in `src/components/dashboard/`) orchestrates the entire flow:
1. Renders `TeamStateBadge` (classification + override controls)
2. Renders `PathSelector` (path picker)
3. When a plan exists, renders `PlanView` which mounts all section components in order

### Rendering order inside `PlanView`
```
PlanView
  ├─ plan header card (name, subtitle, tagline, mechanic, save/regen/clear buttons, timestamp)
  ├─ RosterTriageGrid     → plan.sections.triage
  ├─ TradeTargetList      → plan.sections.tradeTargets
  ├─ MarqueeMovesList     → plan.sections.marqueeMoves
  ├─ BombshellMovesList   → plan.sections.bombshellMoves
  ├─ HaulTradesList       → plan.sections.haulTrades
  ├─ TierMovesList        → plan.sections.tierMoves
  ├─ RookieStrategyTimeline → plan.sections.rookieStrategy
  ├─ RoadmapTimeline      → plan.sections.roadmap
  ├─ RiskFlagList         → plan.sections.risks
  └─ RosterAudit attribution footer
```

### TeamStateBadge.jsx — team classification badge + class override
- Props: `{ classification, onOverrideClass }`.
- `classification` shape: `{ class, derivedClass, confidence, reasoning: string[], userOverride: boolean }`.
- State owned: `expanded` boolean (toggles reasoning bullets).
- Renders: colored class badge (Contender=green, Retooler=yellow, Rebuilder=orange), confidence bar, expand arrow to reveal reasoning bullets. Three class pills (rebuilder/retooler/contender) let the user override — clicking the currently active class clears the override.
- `onOverrideClass(cls)` is passed up to `StrategyPlannerTab` which calls `classifyForPlanner(analysis, cls)` and clears any existing plan.
- Colors: `contender=#00f5a0`, `retooler=#ffd84d`, `rebuilder=#ff6b35`.

### PathSelector.jsx — strategy path selection grid
- Props: `{ classification, selectedPathKey, onSelectPath, showAllPaths, onToggleShowAll }`.
- Reads: `getPathsForClass(classification.class)` and `PATHS` from `src/lib/strategyPlanner`.
- By default shows only paths matching the current class. "Show all paths" toggle reveals the full `PATHS` catalog.
- Each path renders as a `PathCard` button showing: class label (colour-coded), path name, tagline, risk level (colour-coded Low=green, Medium=yellow, Medium-High=orange, High=red), time to contend, bestFor, mechanic.
- Selected path gets a green border + light green background.
- `onSelectPath(pathKey)` is passed up to `StrategyPlannerTab` which calls `generatePlan(analysis, pathKey)` and sets the plan state.

### PlanView.jsx — plan container + section orchestrator
- Props: `{ plan, saved, onSave, onRegenerate, onClear }`.
- Renders: plan header card (name, subtitle, tagline, mechanic, generated timestamp, save/saved status), then all section sub-components in order (see Rendering order above).
- Buttons: `onSave` → `savePlan(leagueId, rosterId, plan)`, `onRegenerate` → re-calls `generatePlan` with same pathKey, `onClear` → `clearPlan` + reset state.
- Shows an attribution footer when `plan.rosterAuditSource.enabled` is true.
- No state. Pure render.

### RosterTriageGrid.jsx — build/sell/hold buckets
- Props: `{ triage }`.
- `triage` shape: `{ buildAround: Player[], sellNow: Player[], holdReassess: Player[], rationales: Map<id,string> }`.
- Renders three column cards: "Build Around" (green), "Sell Now" (orange), "Hold / Reassess" (yellow).
- Each player entry: verdict color dot (`getColor` from `lib/analysis`), name, position, age, score, archetype, rationale text (from `triage.rationales`).
- Empty columns are not rendered.

### TradeTargetList.jsx — players on other teams to acquire
- Props: `{ tradeTargets }`.
- `tradeTargets` shape: `TradeTarget[]` — each `{ player, fromTeam, rationale, priority }`.
- Renders: section header, then one card per target showing player name, position, team, age, score, archetype, source team, priority badge, rationale.
- Empty / null renders nothing (returns null).

### MarqueeMovesList.jsx — realistic 1-for-1 key trades
- Props: `{ marqueeMoves }`.
- `marqueeMoves` shape: `MarqueeMove[]` — each `{ give, receive, fromTeam, rationale, netValueDelta }`.
- Renders: "Marquee Moves" header, then trade cards showing: send (asset name/score), receive (asset name/score), team name, value delta (colour-coded), rationale.
- Both sides of a move can be a player or a pick.

### BombshellMovesList.jsx — high-impact / high-risk moves
- Props: `{ bombshellMoves }`.
- Same structure as `MarqueeMovesList` but styled with a more aggressive color (orange/red accents).
- "Bombshell Moves" header. Each card shows the bold trade package.

### HaulTradesList.jsx — sell for a multi-asset haul
- Props: `{ haulTrades }`.
- `haulTrades` shape: `HaulTrade[]` — each has one give asset and multiple receive assets.
- Renders: "Haul Trades" header, each trade showing the single give asset prominently, then 2–4 receive chips (players + picks), plus rationale.

### TierMovesList.jsx — lateral tier-shift trades
- Props: `{ tierMoves }`.
- `tierMoves` shape: `TierMove[]`.
- Renders: "Tier Moves" header — swaps that exchange assets of similar value but shift age/phase profile (e.g., sell a 28-year-old for a 24-year-old of equal market value).
- Each card shows give/receive names, why the swap improves the team's trajectory.

### RookieStrategyTimeline.jsx — draft participation plan
- Props: `{ rookieStrategy }`.
- `rookieStrategy` shape: `{ draftStrategy: string, targetCount: number, positionPriority: string[], rationale: string[] }`.
- Renders: "Rookie Draft Strategy" header, draft posture label (e.g., "Aggressive — target 3+ picks"), position priority pills (ordered), and bulleted rationale lines.

### RoadmapTimeline.jsx — phased action plan
- Props: `{ roadmap }`.
- `roadmap` shape: `{ now: Step[], offseason: Step[], longTerm: Step[] }` — each `Step` has `{ action, rationale, priority }`.
- Renders: three timeline columns (Immediate, This Offseason, 2-Year Horizon) with step cards. Priority levels (`high`, `medium`, `low`) get different accent colors. Action text is bold; rationale is dimmed.

### RiskFlagList.jsx — warnings + cautions
- Props: `{ risks }`.
- `risks` shape: `RiskFlag[]` — each `{ flag, severity: 'high'|'medium'|'low', detail }`.
- Renders: "Risk Flags" section header. Each flag as a row with severity icon/color, flag name, and detail text. High severity = red, medium = yellow, low = grey.
- Returns null if empty.

### TrendBadge.jsx — tiny trend indicator
- Props: `{ trend }` (a string or direction indicator).
- 30-line utility. Used inside list items that show a player's recent trend (ascending/declining). Renders a small colored chip.
