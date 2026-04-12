# Dynasty Advisor

Dynasty fantasy football analysis tool for Sleeper leagues. Connect your Sleeper username, pick a league, and get a full breakdown of your roster — grades, trade suggestions, pick strategy, and league-wide rankings.

## Features

- **Roster Grading** — Every player scored 0–100 across age, production, availability, trend, and situation. Each position room graded A+ through F.
- **Player Archetypes** — Cornerstone, Foundational, Productive Vet, Upside Shot, and more. At-a-glance understanding of each asset's dynasty role.
- **Trade Suggestions** — Phase-aware trade ideas based on your team's contender / retool / rebuild classification. Targets calibrated to your league's actual trade market.
- **Trade Calculator** — Evaluate any proposed trade between two teams with phase-adjusted values.
- **League Rankings** — See every team's dynasty score, team phase, and roster composition side by side.
- **League Activity** — Recent trades and transactions across the league, graded for value.
- **Draft Pick Tracker** — All future picks with estimated values based on league context.
- **Adjustable Weights** — Customize how much age, production, availability, trend, and situation matter to your scoring model.

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

Open [http://localhost:5173](http://localhost:5173), enter your Sleeper username, and select a dynasty league.

## Tech Stack

- React + Vite
- Sleeper API (public, no auth required)
- FantasyCalc API for market value blending
- No backend — runs entirely in the browser

## Data Sources

- **Sleeper API** — rosters, players, stats, transactions, traded picks
- **FantasyCalc** — consensus dynasty trade values for market calibration

All data is cached in localStorage to minimize API calls.
