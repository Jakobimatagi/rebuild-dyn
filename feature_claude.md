# Dynasty OS — root overview

## What this app is
Dynasty OS is a browser-only dynasty fantasy football analysis tool. Users connect their Sleeper or Fleaflicker account, pick a dynasty league, and get a full analytical dashboard: player grades, roster room breakdowns, trade tools, league-wide comparisons, rookie rankings, and a multi-year strategy planner.

## Tech stack
- **React 18 + Vite 6** — SPA, no React Router (App.jsx conditionally renders screens via `step` state). All styling via inline style objects in `src/styles.js` plus Tailwind classes on two standalone admin/public pages.
- **Supabase** — used only for the Rookie Rankings + Prospector admin pages (prospect DB + expert ranking lists). The main analysis pipeline has no backend.
- **Vercel** — hosts the SPA + three serverless functions in `api/` that proxy third-party APIs.
- **localStorage** — all caching; no cookies or server sessions for the main flow.

## Supported platforms
- **Sleeper** (primary) — uses public Sleeper API, no auth. Keyed by `sleeper_username`.
- **Fleaflicker** — uses the `/api/fleaflicker` proxy; normalised to Sleeper-compatible shape by `src/lib/fleaflickerApi.js` before entering the analysis pipeline.

## App flow (`src/App.jsx`)

1. **`step = "input"`** — `InputScreen`: user enters Sleeper username or Fleaflicker email, selects platform.
2. **`step = "leagues"`** — `LeaguePickerScreen`: dynastty leagues fetched and listed for selection.
3. **`step = "loading"` → `"dashboard"`** — parallel fetch of all data, then `buildRosterAnalysis(payload, weights)` runs client-side. On success renders `Dashboard`; on failure clears saved league and returns to `"input"`.

localStorage keys written by App:
- `dynasty_os_platform` (`sleeper` | `fleaflicker`)
- `sleeper_username`, `sleeper_league` (JSON)
- `ff_email`, `ff_league` (JSON)

On reload: App reads these and jumps directly to `step = "loading"`.

## Data fetch (inside `loadDashboard` / `loadFleaflickerDashboard`)

All fetches fire in parallel with `Promise.all`. Sleeper-platform payload:

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

## Analysis computation

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

## Score weights (`DEFAULT_SCORING_WEIGHTS`)
`{ age: 35, prod: 30, avail: 15, trend: 10, situ: 10 }` — the 5 components of the per-player 0–100 dynasty score. Adjustable via `ScoreWeightsModal`. Values are raw integers (not normalised); `normalizeScoringWeights` handles the normalisation internally.

## Player archetypes (from `src/constants.js`)
11 archetypes assigned by `playerGrading.getArchetype()`: `Cornerstone`, `Foundational`, `Productive Vet`, `Mainstay`, `Upside Shot`, `Short Term League Winner`, `Short Term Production`, `Serviceable`, `JAG - Insurance`, `JAG - Developmental`, `Replaceable`.

## Scoring verdict thresholds
- **buy** ≥ 72, **hold** ≥ 52, **sell** ≥ 35, **cut** < 35

## Env vars
| Var | Required | Notes |
|---|---|---|
| `VITE_CFBD_API_KEY` | Server-side only | Set in Vercel project env for the `api/cfbd.js` proxy |
| `VITE_ENABLE_STRATEGY_PLANNER` | Optional | Set to `"true"` to unhide the Strategy Planner tab without the access-code gate |
| `VITE_SUPABASE_URL` | Client | Used by `src/lib/supabase.js` for rookie prospector |
| `VITE_SUPABASE_ANON_KEY` | Client | Supabase anon key |

## Directory map
```
api/                  Vercel serverless proxies (cfbd, fleaflicker, rosteraudit)
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
    strategyPlanner/    Strategy plan engine (see feature_claude.md inside)
  components/
    InputScreen.jsx, LeaguePickerScreen.jsx, Layout.jsx, Legal.jsx
    Dashboard.jsx       Tab router; passes analysis slices to tab components
    RookieRankings.jsx  Public page at /rookie-rankings (Tailwind)
    RookieProspector.jsx Admin at /admin/rookie-prospector (Tailwind + Supabase)
    dashboard/          Tab + modal components (see feature_claude.md inside)
      strategyPlanner/  Strategy planner UI sub-components (see feature_claude.md inside)
docs/
  CALCULATIONS.md     Human-readable math: scoring formula, thresholds, benchmarks
```

## See also
- `api/feature_claude.md` — serverless proxy docs
- `src/lib/feature_claude.md` — engine internals, `analysis` object shape
- `src/lib/strategyPlanner/feature_claude.md` — strategy planner engine
- `src/components/feature_claude.md` — top-level screens
- `src/components/dashboard/feature_claude.md` — tabs + modals
- `src/components/dashboard/strategyPlanner/feature_claude.md` — strategy planner UI
- `docs/CALCULATIONS.md` — scoring math reference
