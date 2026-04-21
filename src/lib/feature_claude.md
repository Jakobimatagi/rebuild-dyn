# src/lib — analysis engine

## Overview
Pure JavaScript analysis engine — no React, no side effects beyond localStorage caching. `App.jsx` fetches raw data and passes a payload to `buildRosterAnalysis()` from `analysis.js`; the returned `analysis` object is the single data contract consumed by every dashboard tab. Sub-engines are imported by `analysis.js` (or by `rosterBuilder.js` which `analysis.js` calls) and are not used by UI components directly.

Exception: `strategyPlanner/` is imported directly by `StrategyPlannerTab.jsx` and is not called from `analysis.js`. See `src/lib/strategyPlanner/feature_claude.md`.

## Data flow diagram
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

## The `analysis` object shape
`buildRosterAnalysis` returns `{ ...myTeam, ...extras }` where `myTeam` is the user's roster snapshot and `extras` is the league-wide context.

### From `myTeam` (via `buildRosterSnapshot`)
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

### Added by `buildRosterAnalysis`
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

### Enriched Player shape
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

### Pick shape
```
{ season: string, round: number, isOwn: boolean, label: string,
  originalRosterId?: number, fromTeam?: string }  // acquired picks only
```

## Files

### analysis.js — top-level orchestrator
- Exports: `buildRosterAnalysis(...)` (primary), `DEFAULT_SCORING_WEIGHTS`, plus re-exports from sub-engines: `classifyLeagueTeams`, `evaluateTrade`, `getVerdict`, `getColor`, `computeRoomQuality`, `assignPositionRanks`, `rankLabel`, `getArchetype`, `getArchetypeTags`, `getConfidence`, `draftTierLabel`.
- Signature: `(myRoster, players, league, tradedPicks, stats24, stats23, stats22, transactions, fantasyCalcValues, users, rosters, historicalStats, scoringWeights, lastSeasonYear, rosterAuditValues, rosterAuditPicks, sleeperDrafts)`
- All args default-safe (most default to `[]` or `{}`).
- Does NOT export per-player score functions directly — import those from `scoringEngine`/`playerGrading` if needed.

### sleeperApi.js — Sleeper client + caching
- Exports: `fetchSleeper(path)`, `fetchHistoricalStats(year)`, `fetchDeepHistoricalStats(year)`, `fetchLeagueTransactions(league, maxSeasons, fallbackMaxWeek)`.
- `fetchSleeper`: plain fetch to `https://api.sleeper.app/v1` in prod, `/sleeper` proxy in dev. No caching — callers cache if needed.
- `fetchHistoricalStats(year)`: fetches `/stats/nfl/regular/${year}`, caches in `sleeper_stats_${year}` for **7 days**.
- `fetchDeepHistoricalStats(year)`: same but uses `sleeper_stats_deep_${year}` key cached **30 days**. Intended for 2014–2017 (fully settled seasons).
- `fetchLeagueTransactions`: walks the `previous_league_id` chain up to `maxSeasons` (default 8), fetching all weeks (max of `fallbackMaxWeek=18` and `playoff_week_start+2`). De-duplicates by `transaction_id`. Returns sorted oldest-first.

### fantasyCalcApi.js — FantasyCalc values
- Exports: `fetchFantasyCalcValues(league)`.
- Derives format params from `league.roster_positions` and `league.scoring_settings.rec`: `isDynasty=true`, `numQbs` (1 or 2), `numTeams`, `ppr` (0/0.5/1).
- Cache key: `fantasycalc_values_${isDynasty}_${numQbs}_${numTeams}_${ppr}`. TTL: **24h**.
- Returns array of FC player objects; consumed by `fantasyCalcBlend.js`.

### fantasyCalcBlend.js — value normalisation + blending
- Exports: `buildFantasyCalcContext(fantasyCalcValues)`, `normalizeFantasyCalcValue(entry, context)`, `normalizeRosterAuditValue(raEntry, raContext)`, `computeBlendedScore(internalScore, fcEntry, fcContext, raEntry, raContext)`.
- `buildFantasyCalcContext`: builds a `bySleeperId` Map from the FC array. Returns `{ bySleeperId, totalPlayers, p10, p50, p90 }` (percentile anchors for normalisation).
- `computeBlendedScore`: applies a 3-way weighted blend — internal engine score, FC normalised (0–100), RA normalised (0–100). If FC or RA is absent for a player, only the present sources blend. Exact weights are in the function body.

### rosterAuditApi.js — RosterAudit values + picks
- Exports: `fetchRosterAuditValues(league)`, `fetchRosterAuditPicks()`, `buildRosterAuditContext(raValues, raPicks, format)`, `rosterAuditPickValue(pick, ownerPhase, raContext)`.
- `fetchRosterAuditValues`: paginates `/api/rosteraudit?path=rankings` (100/page). Passes `format` (sf/1qb), `league_size`, `position=all`.
- `fetchRosterAuditPicks`: hits `/api/rosteraudit?path=picks`.
- `buildRosterAuditContext`: builds `bySleeperId` Map from RA array, normalises `value` field. `pickValues` holds the pick map. Returns `{ bySleeperId, pickValues }`.
- `rosterAuditPickValue`: looks up a pick by `season-round-slot` or `season-round-phaseSlot`. Returns a numeric value or null.

### fleaflickerApi.js — Fleaflicker normalisation
- Exports: `fetchFFUserLeagues(email)`, `fetchFFLeagueRosters(leagueId)`, `fetchFFRoster(leagueId, teamId)`, `fetchFFLeagueRules(leagueId)`, `fetchFFLeagueStandings(leagueId)`, `fetchFFTeamPicks(leagueId, teamId)`, `fetchFFTrades(leagueId)`, `fetchFFTransactions(leagueId)`, `loadFleaflickerLeague(leagueId, teamId, sleeperPlayers)`.
- All internal `fetchFF(endpoint, params)` calls go to `/fleaflicker` (dev) or `/api/fleaflicker?path=` (prod). Responses are deep-snake_cased before return.
- `loadFleaflickerLeague`: the key normalisation entry point. Fetches rules, rosters, standings, picks, trades, transactions in parallel; converts FF player objects into synthetic Sleeper-compatible player entries (mutates the passed `sleeperPlayers` map with `ff_${id}` keys); builds a Sleeper-shaped `league`, `myRoster`, `tradedPicks`, `transactions`, `users`, `rosters` payload.

### marketValue.js — league rules context + pick/player values
- Exports: `getLeagueRulesContext(league)`, `buildPlayerMarketValue(player, leagueContext, fcEntry)`, `getKeepCount(pos, isSuperflex)`, `estimatePickValue(pick, leagueContext, tradeMarket)`, `pickSlotLabel(round, ownerPhase)`, `valueOfPickPhase(pick, ownerPhase, leagueContext)`, `pickFcValue(pick, context)`, `trendDelta(player, mode)`.
- `getLeagueRulesContext`: parses `league.roster_positions`, `scoring_settings`, `settings` into a normalised `leagueContext`: `{ isSuperflex, isTEP, scoringType, ppr, starterCounts: {QB,RB,WR,TE}, flexCount, formatLabel, positionPremiums, ... }`.
- `getKeepCount(pos, isSuperflex)`: returns how many players at a position count as "starters" for room-quality calculations.
- `estimatePickValue`: translates a pick round + estimated draft slot (from owner's phase) into an approximate 0–100 value. Falls back gracefully when no trade market data.
- `trendDelta(player, mode)`: computes the trend signal used in `OverviewTab` and `TradeTab` — difference in percentile between seasons.

### scoringEngine.js — stat benchmarks + per-player score calculation
- Exports: `DEFAULT_SCORING_WEIGHTS`, `normalizeScoringWeights`, `getWeightDeviationRatio`, `AGE_CURVES_FALLBACK`, `buildAgeCurves`, `buildBenchmarks`, `getPctileRank`, `playerPctiles`, `draftCapitalScore`, `draftTierLabel`, `ageComponent`, `availComponent`, `trendComponent`, `situComponent`, `calcScore`, `clamp`.
- `buildBenchmarks(players, stats22, stats23, stats24, leagueContext, historicalStats, lastSeasonYear)`: computes position-level PPG distributions (sorted arrays) and age curves from multi-year stats. Returns `{ sorted: {QB,RB,WR,TE}, ageCurves }`.
- `calcScore(playerData, s24, s23, currentPctile, ageCurves, weights)`: returns `{ score: 0–100, components: {age, prod, avail, trend, situ} }`. Each component is 0–100; score is the weighted sum after `normalizeScoringWeights`.
- `playerPctiles(s24, s23, s22, pos, benchmarks, lastSeasonYear)`: returns `{ current, peak, pLast, pPrev, pOlder }` — percentile ranks against positional benchmarks.
- `draftTierLabel(round, slot)`: returns a short string like `"1.01"`, `"2.07"`, `"3rd+"`.
- See `docs/CALCULATIONS.md` for full formula breakdown.

### playerGrading.js — verdicts, room grades, archetypes, ranks
- Exports: `getVerdict(score)`, `getColor(verdict)`, `computeRoomQuality(players, pos, isSuperflex)`, `computePositionGrade(players, pos, isSuperflex)`, `assignPositionRanks(leagueTeams, isSuperflex)`, `rankLabel(rank)`, `getArchetype(player)`, `getArchetypeTags(player)`, `getConfidence(player)`.
- `getVerdict`: buy ≥ 72, hold ≥ 52, sell ≥ 35, cut < 35.
- `computeRoomQuality(players, pos, isSuperflex)`: production-tilted quality metric for a position room. Formula: for each player `i` in starters pool, `blended = 0.3×dynastyScore + 0.7×currentPctile`, `weight = 1 − 0.08×i`. Returns weighted average. Returns null for empty rooms (sorts last).
- `computePositionGrade(players, pos, isSuperflex)`: maps `computeRoomQuality` result onto a 1–10 scale with position-specific thresholds.
- `assignPositionRanks(leagueTeams, isSuperflex)`: runs across all teams in the league, computes quality for each position, sorts teams, assigns `rank` (1=best), and writes `{ rank, of, color, grade }` into `team.posRanks[pos]`.
- `getArchetype(player)`: pure classification using `player.score`, `player.age`, `player.currentPctile`, `player.peakPctile`, `player.draftRound`, `player.yearsExp`, `player.depthOrder`. Returns one of 11 archetype strings.
- `getArchetypeTags(player)`: returns descriptive signal tags (e.g., `['Ascending', 'Buy Window', 'Injury Risk', 'Depth Chart Risk']`) from player fields.
- `getConfidence(player)`: `'High'|'Medium'|'Low'` based on data completeness.

### rosterBuilder.js — roster snapshot + league classification
- Exports: `buildRosterPicks`, `getRosterNeeds`, `getRosterSurplusPositions`, `calcStarterPPG`, `classifyLeagueTeams`, `assignDraftSlots`, `buildRosterSnapshot`.
- `buildRosterSnapshot(roster, players, league, ...)`: iterates `roster.players`, filters to `POSITION_PRIORITY` positions, enriches each player, sorts rooms by score, builds picks list, computes needs/surplus, builds `tradeablePlayers`/`targetablePlayers`. Returns the full team snapshot (see analysis object shape above).
- `classifyLeagueTeams(leagueTeams, leagueContext)`: ranks all teams by a composite score, assigns `teamPhase.phase` + `teamPhase.score` + `teamPhase.signals`. Also populates `teamPhase` on each `leagueTeam` (mutates in place).
- `assignDraftSlots(leagueTeams, knownSlots)`: if Sleeper draft order is available, uses exact slots. Otherwise projects from `teamPhase.score` (worst = pick 1.01). Mutates `team.picks` with `slot` fields.

### tradeEngine.js — trade market + suggestions + evaluator
- Exports: `buildTradeMarket(transactions, leagueTeams, leagueContext)`, `evaluateTrade(sideA, sideB, phaseA, phaseB, playerMarketMap, leagueContext, tradeMarket)`, `buildTradeSuggestions(myTeam, leagueTeams, leagueContext, tradeMarket)`.
- `buildTradeMarket`: scans completed trade transactions, identifies position premiums actually paid in this league, returns calibration object. `sampleCount` may be low in quiet leagues.
- `evaluateTrade(sideA, sideB, ...)`: evaluates a proposed trade. Each side is an array of `{ type: 'player'|'pick', ...fields }`. Returns `{ verdict, sideAValue, sideBValue, delta, fairnessLabel, adjustments, phaseBonus }`. Phase-adjustments are applied: rebuilders get a bonus for receiving picks, contenders get a bonus for receiving win-now players.
- `buildTradeSuggestions`: generates phase-appropriate trade ideas. Currently accepted by Dashboard but the rendering block in TradeTab is commented out.

### predictionEngine.js — age curves, comps, 3-yr projections
- Exports: `POS_CAREER`, `buildDetailedAgeCurves`, `buildHistoricalSnapshots`, `buildPredictionContext`, `buildPlayerPrediction`.
- `buildPredictionContext(allStatYears, players, ageCurves)`: consumes all historical stat years (2014–2024), builds empirical per-position age decline curves and a historical snapshot DB for comp matching. Expensive — called once per analysis.
- `buildPlayerPrediction(player, predictionContext)`: for a single player, produces `{ dynastyOutlook, breakoutPct, cliffRisk, projectedScores: [y1, y2, y3], comps: [...], insights: string[] }`.
- `POS_CAREER`: typical career peak age by position — used as fallback when empirical data is sparse.

### activityEngine.js — transaction grading + league health
- Exports: `scoreToGrade(score)`, `buildLeagueActivity(transactions, rosters, users, players)`.
- `scoreToGrade(score)`: maps 0–100 to letter grade + color (like player verdicts but for activity).
- `buildLeagueActivity`: analyses the full transaction history. Returns `{ overallScore, overallGrade, components: {tradeVelocity, rosterMgmt, tradeBreadth, dynastyEngagement, consistency}, stats, teams: [...], summaryText }`. Each `component` has `{label, score, weight, statLine, description}`. Each `team` has `{rosterId, label, grade, teamActivityScore, tradeCount, faAdds, uniquePartners, futurePickTrades, transactions, feedYears}`.

### prospectScoring.js — rookie prospect grade system
- Exports: `BLUE_BLOOD_TEAMS`, `P5_TEAMS`, `CAPITAL_PROD_SCORES`, `CONFERENCE_SCORES`, `TIER_RANK`, `deriveSchool`, `computeGrade`, `deriveTier`, `dynastyScore`.
- Used by: `RookieRankings.jsx`, `RookieRankingsTab.jsx`, `RookieProspector.jsx` — not part of the main analysis pipeline.
- `computeGrade(prospect, sleeperRank, capitalOverride)`: combines college, conference tier, draft capital signals into a 0–100 grade.
- `deriveTier(grade, capitalKey)`: maps grade + capital into one of 7 tiers (T1 = elite, T7 = flier).
- `dynastyScore(grade, position, seasons)`: converts grade to projected dynasty value for sorting.

### supabase.js — Supabase client
- Exports: `supabase` (the client instance created from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`).
- Also exports: `fetchPublicRankingsData()` — used by `RookieRankings.jsx` and `RookieRankingsTab.jsx` to pull prospect data; `verifyLogin(username, passkey)` — used by `RookieProspector.jsx`; and mutation helpers (`upsertProspect`, `upsertAnnotation`, `upsertExpertRanking`, `deleteExpertRanking`).
- Not used by the main Sleeper/Fleaflicker analysis flow at all.

## Caching summary
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

## See also
- `./strategyPlanner/feature_claude.md` — strategy plan engine (not called from analysis.js)
- `../components/dashboard/feature_claude.md` — consumers of `analysis`
- `../../api/feature_claude.md` — serverless proxies for FantasyCalc, RosterAudit, Fleaflicker, CFBD
- `../../docs/CALCULATIONS.md` — scoring formula math reference
- `../../feature_claude.md` — root overview, App flow, env vars
