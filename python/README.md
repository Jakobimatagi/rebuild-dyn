# Weekly Projection Engine (Python)

Offline data-science pipeline that projects **weekly fantasy points** (PPR /
half / std, with floor & ceiling) for every NFL QB/RB/WR/TE, then publishes them
to Supabase for the React app to read. All inputs are free, unauthenticated
Sleeper endpoints.

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
_Latest walk-forward backtest — season 2024, weeks 5-17 (best Sleeper blend alpha = 0.9):_

Lower MAE is better; higher ρ (Spearman rank correlation) is better. **shipped** = our model ensembled with Sleeper; **model** = our model standalone.

| set | shipped MAE | shipped ρ | model MAE | Sleeper MAE | naive MAE | coverage |
|---|---|---|---|---|---|---|
| overall | 3.768 | 0.773 | 4.008 | 3.773 | 3.985 | 0.829 |
| QB | 5.409 | 0.579 | 5.997 | 5.479 | 6.075 | 0.688 |
| RB | 3.77 | 0.791 | 4.054 | 3.76 | 4.156 | 0.826 |
| WR | 4.042 | 0.722 | 4.173 | 4.05 | 4.115 | 0.837 |
| TE | 2.705 | 0.711 | 2.945 | 2.695 | 2.819 | 0.874 |
<!-- BACKTEST:END -->

## Usage

```bash
cd python
pip install -r requirements.txt          # or: pip install -e .

# Validate accuracy (writes the table above):
python -m projections backtest --season 2024 --write-readme

python -m projections project --season 2024 --week 6           # spot-check a week
python -m projections publish --season 2025 --week auto        # write to Supabase
pytest                                                          # unit tests
```

`publish` needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `python/.env`
(copy `python/.env.example`). The schema lives in `docs/sql/projections.sql`.
