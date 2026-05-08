# Dynasty OS

Browser-only dynasty fantasy football analysis tool. Connect your Sleeper or Fleaflicker account, pick a dynasty league, and get a full analytical dashboard — roster grades, trade tools, league-wide rankings, rookie scouting, and a multi-year strategy planner.

## Features

- **Roster Grading** — Every player scored 0–100 across age, production, availability, trend, and situation. Each position room graded A+ through F.
- **Player Archetypes** — 11 archetypes from Cornerstone to Replaceable. At-a-glance understanding of each asset's dynasty role.
- **Conviction-Aware Verdicts** — buy / hold / sell / cut calls with confidence scoring.
- **Trade Suggestions** — Phase-aware ideas based on your team's contender / retool / rebuild classification, calibrated to your league's actual trade market.
- **Trade Calculator** — Evaluate any proposed trade between two teams with phase-adjusted values.
- **Cliff Calendar** — Forward-looking age-cliff and contract-risk timeline for your roster.
- **Market Pulse** — Live snapshot of which players the league is moving on.
- **League Rankings** — Every team's dynasty score, team phase, and roster composition side by side.
- **League Activity** — Recent trades and transactions, graded for value, blended with team activity score.
- **Draft Pick Tracker** — All future picks with estimated values from the league context.
- **Draft Recap** — Per-pick gain/loss breakdown after a completed draft.
- **Rookie Rankings & Prospector** — Public consensus rookie board plus an admin editor for the prospect database (Supabase-backed).
- **Offensive Coordinator Rankings** — 32-team OC landscape with scheme tags and ORACLE AI briefings.
- **AI Team Analysis** — Gemini-backed team diagnosis with current-news grounding (injuries, depth-chart changes).
- **Adjustable Scoring Weights** — Customize how much age, production, availability, trend, and situation matter to your model.

## Supported Platforms

- **Sleeper** — public API, no auth. Keyed by username.
- **Fleaflicker** — keyed by email; normalised server-side to a Sleeper-compatible shape.

## Supported Formats

- 1QB and Superflex
- PPR, Half-PPR, Standard
- TEP (Tight End Premium)
- Any roster size

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), enter your Sleeper username (or Fleaflicker email), and select a dynasty league.

## Tech Stack

- **React 18 + Vite 6** — SPA, no router (App.jsx switches screens via `step` state).
- **Vercel serverless** — proxies for Fleaflicker / RosterAudit / nflverse, plus Gemini-backed AI endpoints.
- **Supabase** — only for the Rookie Rankings + Prospector admin pages.
- **localStorage** — all caching for the main flow; no cookies or server sessions.

## Data Sources

- **Sleeper API** — rosters, players, stats, transactions, traded picks, drafts.
- **Fleaflicker API** — same data shape, normalised by `src/lib/fleaflickerApi.js`.
- **FantasyCalc + RosterAudit** — consensus dynasty trade values, blended for market calibration.
- **nflverse-data** — historical per-season roster CSVs (sleeper_id ↔ team mapping for past years).
- **CollegeFootballData** — prospect college usage and stats.
- **Gemini 2.5 Flash** — AI team analysis, ORACLE OC briefing, prospect board QA.
