# src/lib/strategyPlanner — strategy plan engine

## Overview
Generates a multi-section, personalised strategy plan for a dynasty team. Operates on the `analysis` object produced by `buildRosterAnalysis` but is NOT called from `analysis.js` — it is imported directly by `StrategyPlannerTab.jsx`. The pipeline is: classify team state → user selects a path → `generatePlan(analysis, pathKey)` runs all section generators → returns a rich plan object. Plans persist in localStorage, scoped per league+roster.

## Architecture
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

## Plan shape (return of `generatePlan`)
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

## Files

### index.js — public entry
Re-exports everything callers need:
- `generatePlan` from `./generatePlan`
- `classifyForPlanner`, `classToPhase`, `PLANNER_CLASSES` from `./classifyForPlanner`
- `PATHS`, `PATH_ORDER`, `getPath`, `getPathsForClass` from `./pathDefinitions`
- `savePlan`, `loadPlan`, `clearPlan` from `./persistPlan`

### classifyForPlanner.js — team state to planner class
- Exports: `classifyForPlanner(analysis, userOverride)`, `classToPhase(cls)`, `PLANNER_CLASSES`.
- Thin adapter: maps `analysis.teamPhase.phase` (`contender`→`contender`, `retool`→`retooler`, `rebuild`→`rebuilder`).
- `userOverride` (string or null) — if provided and different from `derivedClass`, sets the active class.
- Returns `{ class, derivedClass, confidence, reasoning: string[], userOverride: boolean }`.
- `PLANNER_CLASSES = ["rebuilder", "retooler", "contender"]`.

### pathDefinitions.js — strategy path catalog
- Exports: `PATHS` (object keyed by pathKey), `PATH_ORDER` (array of keys in display order), `getPathsForClass(cls)`, `getPath(pathKey)`.
- `getPathsForClass(cls)`: returns all path objects whose `.class === cls`, in PATH_ORDER order.
- Each path object has: `key`, `name`, `subtitle?`, `class`, `tagline`, `risk`, `timeToContend`, `bestFor`, `mechanic`, `triageRules: { buildAround(player), sellNow(player), holdReassess(player) }`, `triageRationales`, plus optional extra configs used by specific section generators.

### generatePlan.js — plan assembly
- Exports: `generatePlan(analysis, pathKey, opts = {})`.
- Calls each section generator in order, passes `analysis` + path to each, then assembles and returns the plan object.
- `opts.override` is passed to `classifyForPlanner` as `userOverride`.
- Throws `Error` if `pathKey` is not found in `PATHS`.

### persistPlan.js — localStorage persistence
- Exports: `savePlan(leagueId, rosterId, plan)`, `loadPlan(leagueId, rosterId)`, `clearPlan(leagueId, rosterId)`.
- Storage key: `dyn:strategy-plan:{leagueId}:{rosterId}`.
- Silently ignores quota errors and parse errors.
- Plans have no TTL — they persist until explicitly cleared or the league/roster changes (StrategyPlannerTab clears on league/roster switch).

## Paths catalog

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

### Path triageRules pattern
Each path defines `triageRules.buildAround(player)`, `sellNow(player)`, `holdReassess(player)` as predicates on the enriched player object. `generateRosterTriage` runs all players through these rules to produce three lists.

- `positionalArbitrage` passes `(player, ctx)` — its predicates reference `ctx.analysis` to check `leagueContext.positionPremiums`.
- `surgicalUpgrade` has a `biggestHole(analysis)` helper that identifies the weakest position room.

## Section generators

### generateRosterTriage.js
- Exports: `generateRosterTriage(analysis, path)`.
- Runs every player in `analysis.enriched` through `path.triageRules.buildAround/sellNow/holdReassess`.
- Returns `{ buildAround: Player[], sellNow: Player[], holdReassess: Player[], rationales: Map<id, string> }`.
- Players not matching any rule fall through (not included in any bucket).

### generateTradeTargets.js
- Exports: `generateTradeTargets(analysis, path)`.
- Looks at `analysis.leagueTeams` to find players on other teams that match the path's acquisition profile.
- Returns `TradeTarget[]`, each: `{ player, fromTeam, rationale, priority }`.

### generateMarqueeMoves.js
- Exports: `generateMarqueeMoves(analysis, path)`, `valueOfPlayer(player)`, `passesRealismGates(sellPlayer, recvPlayer)`.
- Marquee moves are realistic trades: one named asset for one named asset that substantially improves the team along the chosen path.
- `passesRealismGates`: checks value floors so generated trades aren't obviously lopsided.
- Returns `MarqueeMove[]`, each: `{ give: Player|Pick, receive: Player|Pick, fromTeam, rationale, netValueDelta }`.

### generateBombshellMoves.js
- Exports: `generateBombshellMoves(analysis, path)`.
- High-upside, higher-risk moves: multi-asset packages for elite players, firesales, or "win-now" acquisitions depending on path.
- Returns `BombshellMove[]`.

### generateHaulTrades.js
- Exports: `generateHaulTrades(analysis, path)`.
- Sell-for-haul ideas: offering one high-value asset for a multi-asset package (picks + young players).
- Returns `HaulTrade[]`.

### generateTierMoves.js
- Exports: `generateTierMoves(analysis, path)`.
- Tier-up or tier-down trades: lateral value swaps that shift the roster's age/phase profile rather than raw value.
- Returns `TierMove[]`.

### generateRookieStrategy.js
- Exports: `generateRookieStrategy(analysis, path)`.
- Computes how aggressively to participate in the next rookie draft, how many picks to target, which positions to prioritise based on path + current room quality.
- Returns `{ draftStrategy, targetCount, positionPriority: string[], rationale: string[] }`.

### generateRoadmap.js
- Exports: `generateRoadmap(analysis, path, { tradeTargets, marqueeMoves, bombshellMoves, rookieStrategy })`.
- Synthesises the other sections into a timeline: immediate actions (now), mid-term (this offseason), long-term (next 2 years).
- Returns `Roadmap`: `{ now: Step[], offseason: Step[], longTerm: Step[] }` — each `Step` has `{ action, rationale, priority }`.

### generateRiskFlags.js
- Exports: `generateRiskFlags(analysis, path)`.
- Short list of warnings: age cliffs, pick-light inventory, overweight in a declining position, etc.
- Returns `RiskFlag[]`, each: `{ flag, severity: 'high'|'medium'|'low', detail }`.

## See also
- `../feature_claude.md` — analysis engine; `analysis` object shape consumed by section generators
- `../../components/dashboard/StrategyPlannerTab.jsx` — the UI caller
- `../../components/dashboard/strategyPlanner/feature_claude.md` — UI components that render plan sections
- `../../feature_claude.md` — root overview; Strategy tab feature-flag info
