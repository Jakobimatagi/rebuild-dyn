"""Validate the usage-share port reproduces ocUtilization.js exactly."""

import math

import numpy as np
import pandas as pd

from projections.usage import add_usage_shares


def _fixtures():
    # One team-week. Team had 40 targets, 25 carries, 300 completed air yards,
    # 6 RZ targets, 4 RZ carries. Two players share it.
    team_df = pd.DataFrame([{
        "season": 2024, "week": 1, "team": "KC",
        "rec_tgt": 40.0, "rush_att": 25.0, "rec_air_yd": 300.0,
        "rec_rz_tgt": 6.0, "rush_rz_att": 4.0, "pass_att": 38.0, "pass_cmp": 26.0,
        "pass_yd": 0.0, "rush_yd": 0.0, "off_yd": 0.0, "pts_ppr": 0.0, "gp": 1.0,
    }])
    player_df = pd.DataFrame([
        {"season": 2024, "week": 1, "team": "KC", "player_id": "wr1", "pos": "WR",
         "rec_tgt": 10.0, "rush_att": 0.0, "rec_air_yd": 90.0, "rec_rz_tgt": 2.0,
         "rush_rz_att": 0.0, "off_snp": 50.0, "tm_off_snp": 60.0, "rec": 8.0},
        {"season": 2024, "week": 1, "team": "KC", "player_id": "rb1", "pos": "RB",
         "rec_tgt": 0.0, "rush_att": 15.0, "rec_air_yd": 0.0, "rec_rz_tgt": 0.0,
         "rush_rz_att": 3.0, "off_snp": 40.0, "tm_off_snp": 60.0, "rec": 0.0},
    ])
    return player_df, team_df


def test_shares_match_oc_formulas():
    pdf, tdf = _fixtures()
    out = add_usage_shares(pdf, tdf).set_index("player_id")

    wr = out.loc["wr1"]
    assert math.isclose(wr["target_share"], 10 / 40)          # rec_tgt / tm_rec_tgt
    assert math.isclose(wr["air_yard_share"], 90 / 300)
    assert math.isclose(wr["rz_target_share"], 2 / 6)
    assert math.isclose(wr["snap_share"], 50 / 60)            # player-local off_snp/tm_off_snp
    assert math.isclose(wr["adot"], 90 / 8)                   # air yds / completions, NOT targets
    # WOPR = 1.5*target_share + 0.7*air_yard_share
    assert math.isclose(wr["wopr"], 1.5 * (10 / 40) + 0.7 * (90 / 300))

    rb = out.loc["rb1"]
    assert math.isclose(rb["carry_share"], 15 / 25)
    assert math.isclose(rb["rz_carry_share"], 3 / 4)


def test_zero_denominator_is_null():
    pdf, tdf = _fixtures()
    tdf.loc[0, "rec_tgt"] = 0.0  # no team targets -> target_share undefined
    out = add_usage_shares(pdf, tdf).set_index("player_id")
    assert np.isnan(out.loc["wr1"]["target_share"])
    # rb1 has no targets and no completions -> adot null too
    assert np.isnan(out.loc["rb1"]["adot"])
