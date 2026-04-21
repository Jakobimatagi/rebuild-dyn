# src/components/dashboard — tabs, modals, and widgets

## Overview
Every file here is mounted by `Dashboard.jsx` based on the `activeTab` string state. Each tab consumes a slice of the `analysis` object produced by `src/lib/analysis.js::buildRosterAnalysis` and passed through `Dashboard`. Modals (`GradeKeyModal`, `ScoreWeightsModal`, `PlayerDeepDiveModal`) are triggered from tab components via setState props hoisted to App. The `strategyPlanner/` subdirectory holds sub-components of `StrategyPlannerTab` and is NOT documented here.

## Tab routing
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

## Files

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
- localStorage: handled inside `savePlan`/`loadPlan`/`clearPlan` (keys scoped to `leagueId` + `rosterId` — see `src/lib/strategyPlanner.js`).
- Mounts: `./strategyPlanner/TeamStateBadge`, `./strategyPlanner/PathSelector`, `./strategyPlanner/PlanView` (all in the `strategyPlanner/` subdir, not documented here).
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

## See also
- `./strategyPlanner/` — subcomponents of `StrategyPlannerTab` (TeamStateBadge, PathSelector, PlanView, TradeTargetList, RiskFlagList, etc.). Not covered by this file.
- `../feature_claude.md` — top-level screens (`Dashboard.jsx`, `InputScreen.jsx`, etc.).
- `../../lib/feature_claude.md` — `analysis.js` (source of the `analysis` object), `tradeEngine`, `marketValue`, `activityEngine`, `strategyPlanner`, `prospectScoring`.
- `../../../api/feature_claude.md` — serverless proxies that feed `rosterAuditSource` and related fields.
