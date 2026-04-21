# src/components/dashboard/strategyPlanner — strategy planner UI

## Overview
Sub-components of `StrategyPlannerTab.jsx` that render the generated strategy plan. Each component maps ~1:1 to a `plan.sections.*` key. They receive their section data as a prop and render it as a styled card — no state, no engine calls, no direct `analysis` reads (the plan is pre-computed before these mount).

## Parent
`StrategyPlannerTab.jsx` (at `src/components/dashboard/StrategyPlannerTab.jsx`) orchestrates the entire flow:
1. Renders `TeamStateBadge` (classification + override controls)
2. Renders `PathSelector` (path picker)
3. When a plan exists, renders `PlanView` which mounts all section components in order

## Rendering order inside `PlanView`
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

## Files

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

## See also
- `../StrategyPlannerTab.jsx` — the parent that orchestrates classification, path selection, plan generation, and save/load
- `../../../lib/strategyPlanner/feature_claude.md` — engine that produces all plan data these components consume
- `../feature_claude.md` — all other dashboard tab components
