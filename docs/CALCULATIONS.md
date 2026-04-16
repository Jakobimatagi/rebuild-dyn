# How We Score Dynasty Players — The Math Behind the Grades

## Table of Contents

- [Dynasty Score (Per Player)](#dynasty-score-per-player)
  - [Age Component](#age-component)
  - [Production Component](#production-component)
  - [Availability Component](#availability-component)
  - [Trend Component](#trend-component)
  - [Situation Component](#situation-component)
- [FantasyCalc Market Blending](#fantasycalc-market-blending)
- [RosterAudit Market Blending](#rosteraudit-market-blending)
- [Verdicts & Grades](#verdicts--grades)
- [Player Archetypes](#player-archetypes)
- [Market Value (Trade Currency)](#market-value-trade-currency)
- [3-Year Projections](#3-year-projections)
- [Breakout & Bust Probabilities](#breakout--bust-probabilities)
- [Trade Engine](#trade-engine)
- [Team Phase Classification](#team-phase-classification)
- [League Activity Score](#league-activity-score)
- [Data Sources & Attribution](#data-sources--attribution)

---

## Dynasty Score (Per Player)

Every player receives a **composite dynasty score from 0 to 100**, built from five weighted components:

| Component       | Default Weight | What It Measures                                        |
| --------------- | -------------- | ------------------------------------------------------- |
| **Age**         | 35%            | Where the player sits on their position's age curve     |
| **Production**  | 30%            | PPG percentile rank, blended with draft capital         |
| **Availability**| 15%            | Games played out of 17, with injury status penalties    |
| **Trend**       | 10%            | Year-over-year PPG improvement or regression            |
| **Situation**   | 10%            | Depth chart position (starter, backup, free agent)      |

**Formula:**

```
Dynasty Score = Age × w_age + Production × w_prod + Availability × w_avail + Trend × w_trend + Situation × w_situ
```

All components are scored 0–100. Weights are normalized so they always sum to 100%.

---

### Age Component

Each position has a defined career arc with three key thresholds:

| Position | Peak Age | Decline Age | Cliff Age |
| -------- | -------- | ----------- | --------- |
| QB       | 27       | 33          | 38        |
| RB       | 24       | 27          | 30        |
| WR       | 26       | 30          | 33        |
| TE       | 27       | 31          | 34        |

**Scoring rules:**

- **At or before peak:** 95 points
- **Between peak and decline:** Slides from 95 down to 30, linearly
- **Between decline and cliff:** Slides from 30 down to 10, linearly
- **Past cliff:** 12 points

When historical data is available (8+ player-seasons per age bucket), the system builds real age curves from median PPG values across 11 seasons of data. The fallback thresholds above are used when data is insufficient.

---

### Production Component

Production blends two signals — how a player actually performs (percentile rank) and their draft pedigree (draft capital). Draft capital influence **decays over time**:

| Years of Experience | Draft Capital Weight |
| ------------------- | -------------------- |
| Rookie (0)          | 60%                  |
| 1 year              | 45%                  |
| 2 years             | 30%                  |
| 3+ years            | 15%                  |

```
Production = Percentile × (1 − DC_weight) + Draft_Capital_Score × DC_weight
```

**Draft Capital Scores:**

| Draft Round | Slot       | Score |
| ----------- | ---------- | ----- |
| Round 1     | Picks 1–10 | 95    |
| Round 1     | Picks 11–20| 85    |
| Round 1     | Picks 21+  | 78    |
| Round 2     | Any        | 62    |
| Round 3     | Any        | 45    |
| Round 4     | Any        | 32    |
| Round 5+    | Any        | 18    |

**PAR-Adjusted Percentile:** Production percentiles are adjusted above replacement level. The bonus (up to +8) rewards players who meaningfully outperform the last starter at their position:

```
PAR Bonus = min(8, round((PPG − Replacement_PPG) / Replacement_PPG × 12))
```

Replacement level is calculated per position per season based on your league's roster configuration (starting slots, flex distribution, team count).

---

### Availability Component

```
Availability = max(0, min(100, (Games_Played / 17) × 100 − Injury_Penalty))
```

| Injury Status | Penalty |
| ------------- | ------- |
| IR            | −20     |
| PUP           | −15     |
| Out           | −10     |
| Doubtful      | −5      |
| Questionable  | −2      |
| Healthy       | 0       |

---

### Trend Component

Measures whether a player is improving or declining.

**Multi-year players (4+ games in current season):**

```
Trend = clamp(60 + ((PPG_current − PPG_prior) / PPG_prior) × 100, 0, 100)
```

**Rookies / single-season players:**

```
Trend = clamp(60 + ((PPG_current − 10) / 10) × 100, 0, 100)
```

Compares against a 10 PPG baseline. Strong rookies score above 60, weak ones below.

**Insufficient data (< 4 games):** Defaults to 50.

---

### Situation Component

Based on depth chart order:

| Depth Chart Position | Score |
| -------------------- | ----- |
| Starter (#1)         | 90    |
| Backup (#2)          | 55    |
| Free agent / no team | 20    |
| Other                | 30    |

---

## FantasyCalc Market Blending

The internal dynasty score is blended with external market data from FantasyCalc to produce the final score:

```
Final Score = Internal × (1 − FC_weight) + FC_Normalized × FC_weight
```

### How FantasyCalc Values Are Normalized (0–100)

Three signals are combined:

| Signal            | Weight | Source                              |
| ----------------- | ------ | ----------------------------------- |
| Rank Score        | 55%    | Overall dynasty rank (inverted)     |
| Value Percentile  | 45%    | Where the raw value sits among all  |
| Trend Adjustment  | ±7%    | 30-day value trend (±1500 = ±7%)    |

### How Much Weight Does the Market Get?

The FC weight ranges from **0.20 to 0.65**, controlled by two factors:

**1. Data Certainty** (more data = trust the market more):

```
Season Certainty = min(1, Games_Played / 14)
Experience Certainty = min(1, Years_Exp / 4)
Composite = Season × 0.6 + Experience × 0.4
```

**2. Custom Weight Deviation** (custom scoring weights = trust internal model more):

```
FC_weight = clamp(0.5 + certainty × 0.15 − deviation × 0.35, 0.20, 0.65)
```

**In plain English:**
- A veteran with 14+ games and default weights → FC gets ~65% influence
- A rookie with custom weights → FC gets ~20% influence (trust internal model more)

---

## RosterAudit Market Blending

In addition to FantasyCalc, the system pulls dynasty player rankings and draft pick values from [RosterAudit](https://rosteraudit.com) — an independent dynasty valuation source. This gives us a second market opinion for cross-referencing.

### What We Pull from RosterAudit

| Field             | Description                                          |
| ----------------- | ---------------------------------------------------- |
| **Value**         | RA's dynasty dollar value for the player             |
| **Position Rank** | RA's positional ranking (e.g., WR12)                 |
| **Overall Rank**  | RA's overall dynasty ranking                         |
| **Tier**          | RA's tier classification (1 = elite, higher = lower) |
| **30-Day Trend**  | Value change over 30 days (positive = rising)        |
| **7-Day Trend**   | Value change over 7 days                             |
| **Buy Low**       | RA flags this player as a buy-low candidate          |
| **Sell High**     | RA flags this player as a sell-high candidate         |
| **Breakout**      | RA flags this player as a breakout candidate          |
| **Pick Values**   | Per-round, per-slot dynasty pick values (SF & 1QB)   |

### Blended Dynasty Market Value

When both FantasyCalc (FC) and RosterAudit (RA) have a value for a player, the system blends them into a single **Dynasty Market Value** used across the trade engine and strategy planner:

```
Dynasty Market Value = (FC_Value + RA_Value) / 2
```

If only one source has a value, that source is used alone. This averaging smooths out source-specific biases and gives more stable trade valuations.

### RA Signals in Archetype Classification

RosterAudit tier and positional rank feed into archetype logic as tiebreakers:

- **RA Elite** = tier ≤ 2 OR positional rank ≤ 5
- For undrafted rookies without Sleeper draft metadata: RA Elite counts alongside FC Elite for **Foundational** classification
- For young/prime starters with solid (but not high) production: RA Elite promotes **Mainstay → Foundational**

### RA Signals in Player Tags

| RA Signal       | Tag Added             | Condition                     |
| --------------- | --------------------- | ----------------------------- |
| Buy Low flag    | **Buy Low**           | RA marks player as buy-low    |
| Sell High flag  | **Sell High**         | RA marks player as sell-high  |
| Breakout flag   | **Breakout Candidate**| RA marks player as breakout   |
| 30-day trend    | **Ascending**         | RA trend ≥ +5 (supplements internal trend score) |
| 30-day trend    | **Declining**         | RA trend ≤ −5 (supplements internal trend score) |

---

## Verdicts & Grades

### Player Verdicts

| Score Range | Verdict  | Color  |
| ----------- | -------- | ------ |
| ≥ 72        | **Buy**  | Green  |
| ≥ 52        | **Hold** | Yellow |
| ≥ 35        | **Sell** | Orange |
| < 35        | **Cut**  | Red    |

### Position Room Grades

Each position group gets a letter grade:

| Criteria                                      | Grade | Label       |
| --------------------------------------------- | ----- | ----------- |
| ≥ 50% buy verdicts AND avg score ≥ 70         | **A** | Elite Core  |
| ≥ 30% buy verdicts AND avg score ≥ 58         | **B** | Good Shape  |
| Average score ≥ 45                            | **C** | Mixed Bag   |
| Otherwise                                     | **D** | Needs Work  |
| No players                                    | **F** | Empty       |

### Confidence Score (0–100)

How much data we have to trust the score:

```
Confidence = clamp(GP/17 × 0.5 + YearsExp/5 × 0.3 + Trend/100 × 0.2, 0, 1) × 100
```

---

## Player Archetypes

Every player is classified into one of 11 tiers based on their age, production, draft pedigree, and role:

| Archetype                     | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| **Cornerstone**               | Proven elite + starter + not old                     |
| **Foundational**              | Young/prime + starter + high production, elite draft pick with role, OR RA elite consensus with solid production |
| **Mainstay**                  | Young/prime + moderately productive                  |
| **Upside Shot**               | Young + has a role + hasn't broken out yet            |
| **Short Term League Winner**  | Old but proven elite                                 |
| **Productive Vet**            | Vet/old + solid production + has a role              |
| **Short Term Production**     | Currently productive but old or declining            |
| **Serviceable**               | Moderately productive + score ≥ 38                   |
| **JAG – Developmental**       | Young or high draft capital but unproven             |
| **JAG – Insurance**           | Low score but has some value as depth (score ≥ 28)   |
| **Replaceable**               | Default / waiver wire level                          |

### Player Tags

Players also receive diagnostic tags:

- **Undervalued / Overvalued:** Internal vs blended score gap ≥ 8
- **Ascending / Declining:** Trend score ≥ 60 or ≤ 40 (also triggered by RosterAudit 30-day trend ≥ +5 or ≤ −5)
- **Buy Low / Sell High:** RosterAudit consensus flags
- **Breakout Candidate:** RosterAudit breakout flag
- **Fragile Role:** Situation score < 55
- **Injury Risk:** Availability score < 60
- **Volatile Profile:** Peak percentile − current percentile ≥ 35
- **Elite Ceiling:** Peak percentile ≥ 90
- **Untapped Upside:** Young + high draft capital + hasn't produced yet
- **Capped Ceiling:** Peak < 75th percentile after 4+ years of experience

---

## Market Value (Trade Currency)

Market value is the dynasty score adjusted for trade context — what a player is actually "worth" in a deal:

```
Market Value = Base Score
  + Position Premium
  + Youth Premium
  + Draft Capital Bonus
  + Archetype Bonus
  + Production Bonus
  − Penalties
```

Minimum value: 10.

### Position Premiums (League-Dependent)

| Condition                      | Premium                        |
| ------------------------------ | ------------------------------ |
| Superflex league               | QB gets +24 (+ more per extra QB slot) |
| 3+ WR or 2+ flex slots         | WR gets +4                     |
| 2+ RB starting slots           | RB gets +2                     |
| TE premium scoring             | TE gets +10 (+ more per extra TE slot) |

### Youth Premium

| Age     | Bonus                              |
| ------- | ---------------------------------- |
| 20–26   | Up to +10 (QB) or +8 (others), scales down as age rises toward 27 |
| 27–28   | 0                                  |
| 29+     | −14 (RB) or −7 (others)           |

### Draft Capital Bonus

| Draft Position       | Bonus |
| -------------------- | ----- |
| Round 1, Pick 1–12   | +8    |
| Round 1, Pick 13+    | +5    |
| Round 2              | +2    |

### Archetype Bonus

| Archetype                    | Bonus |
| ---------------------------- | ----- |
| Cornerstone                  | +18   |
| Foundational                 | +13   |
| Upside Shot                  | +10   |
| Mainstay                     | +8    |
| Short Term League Winner     | +6    |
| Productive Vet               | +4    |
| Short Term Production        | +3    |
| Serviceable                  | 0     |
| JAG – Developmental          | +2    |
| JAG – Insurance              | −6    |
| Replaceable                  | −14   |

*(Archetype bonuses are applied at 70% of the listed value)*

### Production Bonus

- Above 55th percentile: `+(currentPctile − 55) × 0.18`
- Peak bonus: `+(peakPctile − 75) × 0.10`

### Penalties

- < 4 games played: −4 (round 1) or −10 (others)
- Rookie below 45th percentile: −3 (round 1) or −8 (others)
- RB rookie with score < 65: −7
- Non-QB Upside Shot with score < 62: −5

### Draft Pick Values

Picks are valued using draft capital scores with adjustments:

- **Superflex round 1:** +8
- **TE premium round 1:** +2
- **1 year out:** −4
- **2+ years out:** −10
- **Not your own pick:** +3 (likely earlier)

A market multiplier from recent trade history is applied on top.

---

## 3-Year Projections

For each of the next 3 seasons, the system projects a future dynasty score:

```
Projected(n) = Score × AgeFactor(n) × TrendCarry(n) × (1 − Regression(n)) + 50 × Regression(n) + CompAdj
```

### Age Factor

The ratio of historical median PPG at the future age vs current age for that position. If no historical data exists, a mathematical curve is used based on peak/decline/cliff thresholds.

### Trend Carry (decays each year)

```
TrendMultiplier = 0.85 + (Trend / 100) × 0.30
TrendCarry(n) = (0.70)^(n−1)
EffectiveTrend = 1 + (TrendMultiplier − 1) × TrendCarry(n)
```

A hot streak has 100% effect in year 1, 70% in year 2, 49% in year 3.

### Regression to the Mean

Increases by 5% per year. Everyone slowly gravitates toward a score of 50:

```
Regression(n) = (n − 1) × 0.05
```

### Comparable Player Adjustment

The system finds the 5 most similar historical player-seasons (same position, age ±2, similar percentile and draft capital) and checks what actually happened to them. Their outcomes shift the projection by up to ±5 points.

**Similarity scoring:**

```
Similarity = 100 − AgeDiff × 15 − PctileDiff × 0.5 − DraftDiff × 8
```

---

## Breakout & Bust Probabilities

### Breakout Probability

Chance of a ≥15 percentile point jump within 2 seasons.

**Base rate:** 22% (or empirical rate if 3+ comparable players exist)

| Adjustment                         | Effect   |
| ---------------------------------- | -------- |
| Strong trend (> 65)                | +12%     |
| Moderate trend (55–65)             | +6%      |
| Weak trend (< 40)                  | −8%      |
| Round 1 pick                       | +10%     |
| Round 2 pick                       | +5%      |
| Round 4+ or undrafted              | −5%      |
| In breakout age window             | +5%      |
| Outside breakout window            | −5%      |
| Already elite (> 75th pctile)      | −12%     |
| Young + low production + in window | +4%      |
| Poor role (situation < 50)         | −8%      |

**Final probability capped at 92%.**

### Bust / Cliff Risk

Chance of a ≥20 percentile point drop within 2 seasons.

**Base risk by distance to cliff age:**

| Distance to Cliff | Base Risk |
| ------------------ | --------- |
| Already past cliff | 78%       |
| 1 year away        | 58%       |
| 2 years away       | 38%       |
| 3 years away       | 20%       |
| 4+ years away      | 10%       |

| Adjustment                  | Effect  |
| --------------------------- | ------- |
| Sharp decline (trend < 35)  | +15%    |
| Moderate decline (trend < 45)| +7%    |
| Strong trend (> 65)         | −8%     |
| Poor health (avail < 40)    | +10%    |
| RB age ≥ 28                 | +12%    |

**Final risk capped at 95%.** If 3+ comps exist, the comp-based rate is blended 50/50 with the baseline.

### Trajectory Labels

| Condition                              | Label               |
| -------------------------------------- | ------------------- |
| Breakout probability > 42%            | Breakout Candidate  |
| Bust risk > 55%                       | Cliff Risk          |
| Year 1 change ≥ +8                    | Rising              |
| Year 1 change ≥ +3                    | Trending Up         |
| Year 1 change ≤ −10 or bust risk > 40%| Declining           |
| Year 1 change ≤ −5                    | Fading              |
| Year 3 − Year 0 ≥ +6                 | Late Bloomer        |
| Otherwise                             | Stable              |

### Dynasty Outlook Labels

| Condition                                                    | Label                  |
| ------------------------------------------------------------ | ---------------------- |
| Score ≥ 65 + at/before peak + avg projection ≥ 60           | Franchise Cornerstone  |
| Score ≥ 70 + before decline + avg projection ≥ 62           | Dynasty Asset          |
| Breakout > 42% + round 1–2                                   | Breakout Candidate     |
| Breakout > 32%                                               | Upside Play            |
| Bust > 58%                                                   | Sell Now               |
| Bust > 38%                                                   | Trade Window Closing   |
| Score ≥ 55 + avg projection ≥ 50                            | Reliable Contributor   |
| Score ≥ 55 + avg projection < 46                            | Sell High              |
| Young + score < 45                                           | Developmental          |
| Otherwise                                                    | Depth Piece            |

---

## Trade Engine

### How Trades Are Valued

Each side of a trade is summed up:

```
Side Value = Σ(player market values) + Σ(pick values)
```

### Phase-Based Adjustments

The system adjusts perceived value based on your team's competitive phase:

| Receiving Asset Type  | Rebuilder | Retooler | Contender |
| --------------------- | --------- | -------- | --------- |
| Draft picks           | +8 each   | +4 each  | 0         |
| Young players (≤ 23)  | +5 each   | +2 each  | 0         |
| Aging veterans        | −5 each   | −2 each  | +5 each   |
| Cornerstones          | +4        | +2       | +4        |

### Fairness Rating

| Value Gap | Rating      |
| --------- | ----------- |
| ≤ 5       | Fair        |
| ≤ 12      | Slight Edge |
| ≤ 20      | Uneven      |
| > 20      | Lopsided    |

### Trade Package Rules

Rules scale by the target's tier:

| Target Class                          | Min Assets | Anchor Required | Pick-Only OK | Max Overpay | Underpay Tolerance |
| ------------------------------------- | ---------- | --------------- | ------------ | ----------- | ------------------ |
| Premium QB (SF, value ≥ 88, young)    | 2          | Yes             | No           | +6          | 0                  |
| Young Premium WR (≤ 24, value ≥ 82)   | 2          | Yes             | No           | +8          | +1                 |
| Premium TE (TE prem, value ≥ 78)      | 2          | Yes             | No           | +8          | +2                 |
| Elite Asset (value ≥ 86)              | 2          | Yes             | No           | +10         | +2                 |
| Core Asset (value ≥ 72)               | 1          | No              | Yes          | +10         | +2                 |
| Starter Asset (value < 72)            | 1          | No              | Yes          | +8          | +3                 |

### Trade Suggestion Tiers

| Condition                                  | Tier         |
| ------------------------------------------ | ------------ |
| Premium QB/WR target, gap ≤ 3              | Blockbuster  |
| Target value ≥ 80, gap ≤ 4                 | Aggressive   |
| Target value ≥ 68, gap ≤ 5                 | Balanced     |
| Otherwise                                  | Balanced     |

---

## Team Phase Classification

Your team is classified as **Contender**, **Retool**, or **Rebuild** using a composite competitive score (0–100) built from 7 factors:

| Factor                       | Weight | What It Measures                              |
| ---------------------------- | ------ | --------------------------------------------- |
| Starter PPG percentile       | 25%    | Projected weekly output vs league             |
| Points For percentile        | 20%    | Actual season scoring vs league               |
| Win percentage               | 10%    | Current record                                |
| Dynasty score percentile     | 15%    | Average roster score vs league                |
| Elite player count           | 10%    | Number of Cornerstone/Foundational players    |
| Roster completeness          | 10%    | Penalty for weak position rooms               |
| Age window bonus             | 10%    | Bonus if core is in prime age range (24–28)   |

| Composite Score | Phase         |
| --------------- | ------------- |
| ≥ 60            | **Contender** |
| 40–59           | **Retool**    |
| < 40            | **Rebuild**   |

**Safety overrides:**
- Starter PPG below 25th percentile → can't be Contender (forced to Retool)
- Starter PPG in top 3 → can't be Rebuild (bumped to Retool)

### Roster Needs

A position is flagged as a **need** if any of:
- Fewer than 2 players at the position
- No players scoring ≥ 65
- Average score below 48
- Significantly under-weighted relative to the rest of the roster

### Surplus Positions

A position is **surplus** if any of:
- More players than your keep count
- Enough quality players (score ≥ 55) beyond starters
- Significantly over-weighted relative to the rest of the roster

---

## League Activity Score

Measures how active and engaged your dynasty league is on a 0–100 scale:

| Component                    | Weight | Elite Benchmark                  |
| ---------------------------- | ------ | -------------------------------- |
| **Trade Velocity**           | 30%    | 6 trades per team per season     |
| **Roster Management**        | 25%    | 15 FA/waiver adds per team/season|
| **Trade Breadth**            | 20%    | 90%+ of teams participate        |
| **Dynasty Engagement**       | 15%    | 50% of trades include future picks|
| **Consistency**              | 10%    | Trades spread evenly across weeks|

### Per-Team Activity Score

Each team also gets an individual activity score:

| Component                    | Weight |
| ---------------------------- | ------ |
| Trade activity               | 40%    |
| FA activity                  | 25%    |
| Future pick trade rate       | 20%    |
| Partner diversity            | 15%    |

**Trade activity** blends absolute rate (vs 6/season benchmark) and relative rate (vs league average), 50/50.

**Consistency** uses the Herfindahl-Hirschman Index (HHI) to measure concentration — a league where all trades happen in one week scores low; evenly spread trades score high.

---

## Data Sources & Attribution

This tool would not be possible without the following external data sources:

### [FantasyCalc](https://fantasycalc.com)

Dynasty trade values, player rankings, and 30-day trend data. FantasyCalc aggregates real user trade activity to produce consensus dynasty market values — providing the market-side signal that balances our internal scoring model. Used for market blending, trade valuations, and pick calibration.

### [RosterAudit](https://rosteraudit.com)

Independent dynasty player rankings, tier classifications, pick values, and buy-low/sell-high/breakout flags. RosterAudit provides a second expert-driven valuation lens that cross-references FantasyCalc's crowd-sourced values. Used for blended dynasty market values, archetype tiebreakers, player tags, and the Rankings tab.

### [Sleeper](https://sleeper.com)

League data, rosters, draft history, player metadata, depth charts, injury status, and transaction history. Sleeper is the platform that powers the dynasty leagues this tool analyzes.

**All data from these sources is used with respect and appreciation. We do not claim ownership of any external data — we simply blend multiple expert opinions to help dynasty managers make better decisions.**
