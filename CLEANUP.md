# Repo Cleanup Punch List

Working doc for the `kobim/cleanup` branch. Each item is independently actionable — pick any in any order. Generated 2026-05-08 from a survey of `main`-merged state.

---

## Tier 1 — Quick wins, do first (low risk, high signal)

### 1. Remove `[draft-debug]` console.logs in App.jsx
- File: [src/App.jsx](src/App.jsx)
- Lines: **255–262** (4 `console.log` calls, all tagged `[draft-debug]`)
- These are the only `console.log`s in `src/` or `api/`. Looks like leftover debugging from the draft-recap work.
- Action: delete the 4 lines (or wrap behind a `DEBUG` flag if you want to keep them for next draft).

### 2. Add `.claude/worktrees/` to `.gitignore`
- File: [.gitignore](.gitignore)
- Currently `.claude/worktrees/` shows as untracked in `git status`. The harness writes worktrees here automatically.
- Action: add a line `.claude/worktrees/` under the existing `.claude/settings.local.json` entry. (The whole `.claude/` directory is intentionally not ignored because you presumably want to track project skills/agents, so a targeted ignore is correct.)

### 3. Stale "three serverless functions" claim in agent docs
- The repo has **7** files in `api/` (`ai-analyze.js`, `ai-oc-analyze.js`, `ai-oracle-board.js`, `ai-vs-evaluate.js`, `fleaflicker.js`, `historical-rosters.js`, `rosteraudit.js`).
- Stale references:
  - [feature_claude.md:9](feature_claude.md) — "three serverless functions in `api/`"
  - [api/feature_claude.md:4](api/feature_claude.md) — "Three Vercel serverless functions… All three take a `path` query parameter…" (only the proxy-style files — `fleaflicker`, `rosteraudit` — match that pattern; the AI/historical handlers don't).
- Action: rewrite both intros to reflect the current 8-handler split (proxy-style vs AI-style vs Supabase-backed).

### 4. README is missing Fleaflicker + admin surfaces
- File: [README.md](README.md)
- Opening line: "Dynasty fantasy football analysis tool **for Sleeper leagues**." — the app actually supports Sleeper *and* Fleaflicker (see `src/lib/fleaflickerApi.js`, `api/fleaflicker.js`).
- The Features list is also missing: rookie rankings, OC rankings, draft recap, cliff calendar, market pulse, league activity grading, strategy planner — all shipped since this README was written (Apr 12).
- Action: rewrite README to match shipped feature surface. Or, if you don't care about README, just delete the stale claim about Sleeper-only.

---

## Tier 2 — Decide a policy, then execute

### 5. `feature_claude.md` files — keep, consolidate, or drop?
Currently **7 tracked copies** scattered through the tree:
- [feature_claude.md](feature_claude.md) (root, 8082 bytes — biggest, gives architectural overview)
- [api/feature_claude.md](api/feature_claude.md)
- [src/components/feature_claude.md](src/components/feature_claude.md)
- [src/components/dashboard/feature_claude.md](src/components/dashboard/feature_claude.md)
- [src/components/dashboard/strategyPlanner/feature_claude.md](src/components/dashboard/strategyPlanner/feature_claude.md)
- [src/lib/feature_claude.md](src/lib/feature_claude.md)
- [src/lib/strategyPlanner/feature_claude.md](src/lib/strategyPlanner/feature_claude.md)

These look like AI-agent context docs. They're useful but they're also a *liability*: every feature change risks leaving them stale (see item #3 above for proof — already drifted). Three options:

- **(A) Keep but enforce.** Move them to `CLAUDE.md` in each directory (the conventional name) and add a note in `CLAUDE.md` at root that says "update sibling docs when you change behavior."
- **(B) Consolidate.** Merge all 7 into a single root `CLAUDE.md` or `docs/ARCHITECTURE.md`. Easier to keep one file in sync than 7.
- **(C) Delete.** If you're not actively re-reading them when starting sessions, they're just bit-rot. The code itself is the source of truth.

Recommendation: **B** — one file, in `docs/`, and rename to `ARCHITECTURE.md` so it doesn't look like a dumping ground. Then delete the 7 scattered copies in the same commit.

### 6. `docs/` folder is half schema, half feature notes
Contents of [docs/](docs/):
- `CALCULATIONS.md` — feature notes
- `historical_players_data.sql`, `historical_players_schema.sql`
- `oc_entries_rls.sql`
- `prospect_seasons_catchable_rate.sql`
- `rookie_draft_plans_schema.sql`

These are five SQL files that look like one-shot Supabase migrations. Question: are any of these meant to be re-runnable, or are they purely historical artifacts of changes you've already applied?
- If purely historical, move them to `docs/migrations/` so it's clear they're frozen.
- If you actually want migration tracking, adopt Supabase's migration CLI (`supabase migration new`) and stop hand-rolling these.

---

## Tier 3 — Code-shape refactors (bigger lifts, optional)

### 7. Files over 1,000 LOC — candidates for split
Six files exceed 1,000 lines:

| Lines | File |
|------:|------|
| 1556 | [src/components/OffensiveCoordinators.jsx](src/components/OffensiveCoordinators.jsx) |
| 1351 | [src/lib/tradeEngine.js](src/lib/tradeEngine.js) |
| 1189 | [src/components/dashboard/TradeTab.jsx](src/components/dashboard/TradeTab.jsx) |
| 1147 | [src/components/dashboard/PlayerDeepDiveModal.jsx](src/components/dashboard/PlayerDeepDiveModal.jsx) |
| 1140 | [src/components/dashboard/RosterTab.jsx](src/components/dashboard/RosterTab.jsx) |
| 1138 | [src/components/RookieProspector.jsx](src/components/RookieProspector.jsx) |

Not strictly cleanup, but each is a maintenance hazard. Two patterns to look for inside them:
- **Sub-components defined inline** that could be lifted to sibling files (you already use this pattern in `src/components/dashboard/` and `src/components/rookieAdmin/`).
- **Logic mixed with rendering** — e.g. `tradeEngine.js` is pure logic but the `*Tab.jsx` and `*Modal.jsx` files probably have computation that wants to live in `lib/`.

Pick one (e.g. `TradeTab.jsx`) and use it as a pattern — don't try to split all six.

### 8. `api/rosteraudit.js` is 23 lines
- File: [api/rosteraudit.js](api/rosteraudit.js)
- It's a thin proxy. Worth a glance to see if it's still used (`src/lib/rosterAuditApi.js` does reference it) and whether the same handler shape now duplicates `fleaflicker.js`. If yes, a shared helper in `api/_lib/proxy.js` would dedupe both.

---

## Tier 4 — Verify before declaring "clean" (housekeeping)

- Run `npm test` — there are three test files (`scoringEngine`, `fleaflickerApi`, `teamFantasyRanks`). Confirm they all still pass before committing any cleanup.
- `dist/` is gitignored ✓ but exists locally (896K). Run `rm -rf dist` before a fresh build if you want to be sure your dev server isn't serving a stale bundle.
- `.env.example` (286 bytes) — verify keys match the actual env vars referenced in `api/*.js` and `src/lib/supabase.js`. Stale `.env.example` is a frequent onboarding paper cut.
- `node_modules/` — only 51 top-level entries. This is fine for the dep tree (`react`, `vite`, `@supabase/supabase-js` + transitives) but if `npm test` or `npm run build` errors with "module not found", run `npm ci` to reset.

---

## Things I checked and ruled out (so you don't redo them)

- **No tracked junk.** `dist/`, `node_modules/`, `.env*`, `.vercel/` are all properly gitignored.
- **No `node_modules` committed.** ✓
- **No TODO/FIXME/HACK/XXX comments** anywhere in `src/` or `api/`.
- **All `src/lib/*.js` files are referenced** from somewhere in the codebase (initially looked like 10 were orphaned — false alarm; my regex didn't account for `.js` import suffixes). Don't delete any lib files without re-checking.
- **No commented-out code blocks** of meaningful size. The only `/*` matches in `src/index.css` are real section headers.
- **No duplicate / dead routes.** All three `/admin/*` and `/rookie-rankings` routes in [src/main.jsx](src/main.jsx) are actively used.

---

## Suggested commit shape

If you do all of Tier 1 + 2 in one branch, keep the commits separate:

1. `chore: remove draft-debug console.logs`
2. `chore: gitignore .claude/worktrees`
3. `docs: refresh README to reflect shipped features + Fleaflicker support`
4. `docs: consolidate scattered feature_claude.md into docs/ARCHITECTURE.md` (or whichever option you pick from #5)
5. `docs: move one-shot SQL files to docs/migrations/`

Tier 3 is its own branch per file.
