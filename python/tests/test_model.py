"""Unit tests for scoring, shrinkage, and the defense-vs-position adjustment."""

import math

import pandas as pd

from projections.scoring import score_line, score_all
from projections.model import _shrink
from projections.defense import defense_multipliers, get_multiplier


def test_scoring_matches_sleeper_defaults():
    line = {"rec": 5, "rec_yd": 80, "rec_td": 1}
    assert math.isclose(score_line(line, 1.0), 5 + 8 + 6)      # PPR
    assert math.isclose(score_line(line, 0.5), 2.5 + 8 + 6)    # half
    assert math.isclose(score_line(line, 0.0), 0 + 8 + 6)      # std

    qb = {"pass_yd": 300, "pass_td": 2, "pass_int": 1, "rush_yd": 20}
    # 300*.04 + 2*4 - 1 + 20*.1 = 12 + 8 - 1 + 2 = 21
    assert math.isclose(score_line(qb, 1.0), 21.0)
    assert set(score_all(line)) == {"proj_ppr", "proj_half", "proj_std"}


def test_shrinkage_pulls_toward_prior():
    # No sample -> exactly the prior.
    assert _shrink(0.9, 0.5, n=0, k=10) == 0.5
    # Large sample -> close to observed.
    assert _shrink(0.9, 0.5, n=1000, k=10) > 0.88
    # Mid sample sits between.
    mid = _shrink(0.9, 0.5, n=10, k=10)
    assert 0.5 < mid < 0.9


def test_defense_multiplier_direction_and_clamp():
    # WR1 scored 30 on DEN, 5 on SF, over separate weeks. DEN should grade as a
    # softer matchup (mult > 1), SF tougher (mult < 1).
    rows = []
    for wk, (opp, pts) in enumerate([("DEN", 30.0), ("SF", 5.0),
                                     ("DEN", 28.0), ("SF", 4.0)], start=1):
        rows.append({"season": 2024, "week": wk, "opp": opp, "pos": "WR",
                     "pts_ppr": pts, "gp": 1.0})
        # a second WR to give the league average some spread
        rows.append({"season": 2024, "week": wk, "opp": opp, "pos": "WR",
                     "pts_ppr": pts * 0.5, "gp": 1.0})
    df = pd.DataFrame(rows)
    mults = defense_multipliers(df, prior_k=1.0)
    assert mults[("DEN", "WR")] > 1.0
    assert mults[("SF", "WR")] < 1.0
    # Clamped into the allowed band, and unknown matchup is neutral.
    assert all(0.75 <= v <= 1.30 for v in mults.values())
    assert get_multiplier(mults, "UNKNOWN", "WR") == 1.0
    assert get_multiplier(mults, None, "WR") == 1.0
