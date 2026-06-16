# Weekly Projection Engine (Python)

Offline data-science pipeline that projects **weekly fantasy points** (PPR /
half / std, with floor & ceiling) for every NFL QB/RB/WR/TE, then publishes them
to Supabase for the React app to read. All inputs are free and unauthenticated:
Sleeper endpoints for the box score, plus nflverse release data for advanced
metrics (see the nflverse section below).

This package is intentionally isolated from the JS app — Python never runs in the
Vercel request path. It runs locally or on a weekly GitHub Actions schedule.

## The model

A transparent, component-decomposed statistical model — not a black box:

```
projected box line = volume x efficiency
points             = score(box line) x opponent_defense_multiplier
```

- **Volume** — recency-weighted usage *shares* (target/carry/snap/air-yard/red-zone),
  ported verbatim from `src/lib/ocUtilization.js` so the projector and the OC page
  agree, multiplied by the **projected team pie** (EWMA team volume + a light
  game-script nudge from recent scoring margin). See `usage.py`, `environment.py`.
- **Efficiency** — yards/target, catch rate, yards/carry, TD rates, QB ypa/td/int
  rate. Each is an EWMA shrunk toward a position prior by its own sample size
  (targets, carries, attempts). **TD rates carry the heaviest priors** — they are
  the noisiest, least week-to-week-predictable quantity. See `model.py`.
- **Opponent** — each defense's PPR points allowed to each position vs league
  average, shrunk by games played, clamped to a sane band. See `defense.py`.
- **Distribution** — floor (p15) / ceiling (p85) from a per-position residual CV;
  band coverage is reported by the backtest.
- **Optional Sleeper blend** — the backtest searches for the model↔Sleeper weight
  that minimises pooled MAE; use it via `--blend`.

Every projection stores its `components` (shares, efficiencies, defense multiplier,
projected box line) so the UI can explain each number.

## Preseason / week 1 (before the season starts)

There's no current-season data before week 1, so the projector backfills:

- **History** = the prior 1–2 seasons (recency-weighted with a flatter half-life
  so a whole season counts), anchoring each returning player on real production.
- **Team** = the player's *current* roster team from the live Sleeper feed, so
  offseason movers get the right matchup and team volume.
- **Rookies / deep movers** with no usable history come straight from Sleeper's
  preseason projection (`include_sleeper_only`), so the slate is complete.

Validated by projecting a held-out week 1 from prior seasons: 2024 week 1 scored
**MAE ≈ 3.63, Spearman ≈ 0.79** — beating a naive prior-season-PPG baseline
(≈ 4.05) and matching Sleeper. With no in-season form yet the ensemble leans on
Sleeper's offseason-informed numbers; the structural usage/efficiency signal
takes over once games are played. Run it with
`python -m projections project --season 2025 --week 1`.

## Honesty: walk-forward backtest

`backtest.py` rebuilds every prior/rate/defense rating using **only weeks before**
the target week, projects it, and scores against actual `pts_ppr`. Reported per
position and overall vs two benchmarks (naive season-to-date PPG, and Sleeper's own
projection): MAE, RMSE, Pearson & Spearman, and band coverage.

**Acceptance bar:** beat naive on MAE *and* rank-correlation across all four
positions, and land within ~5% of Sleeper's MAE.

<!-- BACKTEST:START -->
_Latest walk-forward backtest — season 2024, weeks 5-17 (best Sleeper blend alpha = 0.8):_

Lower MAE is better; higher ρ (Spearman rank correlation) is better. **shipped** = our model ensembled with Sleeper; **model** = our model standalone.

| set | shipped MAE | shipped ρ | model MAE | Sleeper MAE | naive MAE | coverage |
|---|---|---|---|---|---|---|
| overall | 3.761 | 0.775 | 3.972 | 3.773 | 3.985 | 0.819 |
| QB | 5.371 | 0.583 | 6.008 | 5.479 | 6.075 | 0.679 |
| RB | 3.776 | 0.791 | 4.009 | 3.76 | 4.156 | 0.815 |
| WR | 4.026 | 0.724 | 4.131 | 4.05 | 4.115 | 0.826 |
| TE | 2.713 | 0.712 | 2.909 | 2.695 | 2.819 | 0.863 |
<!-- BACKTEST:END -->

## Usage

```bash
cd python
pip install -r requirements.txt          # or: pip install -e .

# Validate accuracy (writes the table above):
python -m projections backtest --season 2024 --write-readme

python -m projections project --season 2024 --week 6           # spot-check a week
python -m projections publish --season 2025 --week auto        # write to Supabase
python -m projections nflverse-check --season 2024             # self-test the nflverse connection
python -m projections scheme-check --season 2023               # self-test pbp scheme + coach aggregation
python -m projections publish-oc --start 2016                  # build + publish OC history to Supabase
pytest                                                          # unit tests
```

## nflverse data layer

`nflverse.py` + `advanced.py` pull free nflverse-data release assets (advanced
weekly stats, Next Gen Stats, snap counts, play-by-play) and key them back to
Sleeper player ids via the roster crosswalk (sleeper → gsis/pfr). `nflverse-check`
prints crosswalk + per-column coverage.

**In the model:** a recency-weighted **snap-share opportunity nudge**
(`PROJ_NFLV_SNAP_ADJ`, default `0.3`) scales projected volume by how locked-in a
player's role is — the model is otherwise snap-blind. Validated by the walk-forward
backtest: it improves the standalone model at every position, lifts the shipped
blend (overall MAE 3.768 → 3.761), and shifts the optimal Sleeper alpha 0.9 → 0.8
(the model now carries more orthogonal signal). nflverse target share was tested
too but left **off** — it's redundant with Sleeper's (already true-denominator).

The other advanced metrics (separation, CPOE, rush-yards-over-expected, EPA) are
fetched and ID-mapped but not yet wired into the model — they're the next seam.
nflverse enrichment is fail-safe: any upstream hiccup falls back to the Sleeper-only
pipeline. Disable entirely with `PROJ_USE_NFLVERSE=0`.

## OC history from play-by-play (`scheme.py`)

`scheme.py` aggregates nflfastR pbp (1999+) into three Supabase tables for the OC
tool (`docs/migrations/oc_history_schema.sql`):

- **team_scheme_seasons** — per (season, team) offensive identity: pass rate,
  pass-rate-over-expected (PROE), true aDOT (intended air yards, not Sleeper's
  completed-only), deep rate, shotgun/no-huddle tempo, EPA/play, success rate,
  CPOE, plus the head coach (from pbp `home_coach`/`away_coach`).
- **coach_seasons** — every (season, team, head_coach) stint + `is_primary`; the
  spine of the coach-tree lineage.
- **player_utilization_seasons** — true per-player usage shares (target/carry/
  air-yard/red-zone), keyed by gsis id with sleeper_id linked when available.
  Reaches back to 1999, far past the OC page's Sleeper-based 2009+ window.

Publish with `python -m projections publish-oc --start 2016` (pbp is heavy; widen
the range for deeper history). Validated by `scheme-check`: 2023 PROE/EPA/coaches
match the eye test (SF best EPA, KC=Reid), and 2005 utilization surfaces Steve
Smith's league-leading target share.

`publish` needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `python/.env`
(copy `python/.env.example`). The schema lives in `docs/sql/projections.sql`.
