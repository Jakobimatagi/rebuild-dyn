# src/components — top-level screens

## Overview
Top-level React screens routed by `src/App.jsx`. The app has three primary surfaces: the entry `InputScreen` (username/email capture), `LeaguePickerScreen` (pick a dynasty league to analyze), and `Dashboard` (the main analytical UI — a tab-switcher over a computed `analysis` object built by `src/lib/analysis.js::buildRosterAnalysis`). Two standalone routes, `RookieRankings` (public) and `RookieProspector` (gated admin editor), live outside the main app flow and hit Supabase directly. `Layout` is a chrome wrapper used by App for all screens. `Legal` is a privacy-policy modal body rendered inside Layout's footer modal.

All styling comes from `src/styles.js`; the rookie screens use Tailwind classes instead of the inline `styles` object (and assume Tailwind is configured globally). No React Router — App conditionally renders based on path check at mount plus internal `activeTab`/`screen` state.

## Files

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

## See also
- `./dashboard/feature_claude.md` — tab components, modals, ScoreBar widget.
- `../lib/feature_claude.md` — `analysis.js`, API wrappers, `prospectScoring`, `supabase`.
- `../../api/feature_claude.md` — serverless proxies behind the API wrappers.
