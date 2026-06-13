"""Per-player usage shares — a faithful Python port of the share math in
src/lib/ocUtilization.js, so the projector and the OC page agree by construction.

Every share uses the *exact* team denominator from the Sleeper TEAM_{abbr}
aggregate row for that week (not a sum of surfaced individuals), matching
`teamDenominators` / `buildTeamUsage` in ocUtilization.js. A share is null
(NaN here) whenever its denominator is <= 0, exactly like the JS `ratio` helper.

NOTE (carried over from ocUtilization.js): Sleeper's `rec_air_yd` is air yards on
*completed* catches, not intended air yards across all targets. So `adot` here is
"average depth of completion" = rec_air_yd / rec, NOT classic aDOT. Do not divide
by targets — that compresses every offense into a 3-5 band.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

USAGE_POSITIONS = ["QB", "RB", "WR", "TE"]

# (share column, player numerator field, team denominator field)
SHARE_DEFS = [
    ("target_share", "rec_tgt", "rec_tgt"),
    ("carry_share", "rush_att", "rush_att"),
    ("air_yard_share", "rec_air_yd", "rec_air_yd"),
    ("rz_target_share", "rec_rz_tgt", "rec_rz_tgt"),
    ("rz_carry_share", "rush_rz_att", "rush_rz_att"),
]


def _ratio(n: pd.Series, d: pd.Series) -> pd.Series:
    """Mirror ocUtilization.js `ratio`: n/d when d > 0, else null (NaN)."""
    return np.where(d > 0, n / d.where(d != 0, np.nan), np.nan)


def add_usage_shares(player_df: pd.DataFrame, team_df: pd.DataFrame) -> pd.DataFrame:
    """Attach team-normalised usage shares to each player-week row.

    Adds: target_share, carry_share, air_yard_share, rz_target_share,
    rz_carry_share, snap_share, adot, wopr — same definitions as buildTeamUsage.
    """
    if player_df.empty:
        return player_df.copy()

    # Bring the team-week denominators alongside each player row.
    denom = team_df.rename(columns={f: f"tm_{f}" for f in team_df.columns
                                    if f not in ("season", "week", "team")})
    df = player_df.merge(denom, on=["season", "week", "team"], how="left")

    for col, num_f, den_f in SHARE_DEFS:
        df[col] = _ratio(df[num_f], df[f"tm_{den_f}"])

    # Snap share is player-local (off_snp / tm_off_snp on the player row itself).
    df["snap_share"] = _ratio(df["off_snp"], df["tm_off_snp"])

    # Average depth of completion (see module docstring) and WOPR.
    df["adot"] = _ratio(df["rec_air_yd"], df["rec"])
    # WOPR = 1.5*target_share + 0.7*air_yard_share (Hermsmeyer). Null if either is.
    df["wopr"] = 1.5 * df["target_share"] + 0.7 * df["air_yard_share"]

    return df
