"""Defense-vs-position strength.

For each defense and each fantasy position, measure the PPR points it allows to
that position per game, relative to the league average, and turn it into a
multiplier (1.12 = this defense gives up 12% more than average to that position;
0.90 = a tough matchup). Shrunk toward 1.0 by games played so a defense that has
only faced one strong opponent doesn't get an extreme rating.

Only data passed in is used, so a walk-forward backtest stays honest: the caller
hands us rows strictly before the target week.
"""

from __future__ import annotations

import pandas as pd

from .usage import USAGE_POSITIONS

# Pseudo-count (in "defense-games") pulling each rating toward the league mean.
# ~4 games of prior weight: a defense needs a real sample before it moves much.
DEFAULT_PRIOR_K = 4.0
# Clamp so a tiny sample / blowout can't produce an absurd matchup swing.
MIN_MULT, MAX_MULT = 0.75, 1.30


def defense_multipliers(player_df: pd.DataFrame, prior_k: float = DEFAULT_PRIOR_K
                        ) -> dict[tuple[str, str], float]:
    """Return {(defense_team, position): multiplier}.

    Points "allowed" by defense D to position P in week W = sum of PPR points
    scored that week by all P players whose opponent was D. Averaged over the
    weeks D played, compared to the league per-game average for P.
    """
    if player_df.empty:
        return {}

    df = player_df[player_df["pos"].isin(USAGE_POSITIONS)].copy()
    df = df[df["opp"].notna() & (df["gp"] > 0)]
    if df.empty:
        return {}

    # Points each defense allowed to each position, per week.
    weekly = (df.groupby(["season", "week", "opp", "pos"])["pts_ppr"]
                .sum().reset_index()
                .rename(columns={"opp": "defense", "pts_ppr": "allowed"}))

    # Per defense-position: mean weekly allowed and the sample size (games).
    by_def = (weekly.groupby(["defense", "pos"])["allowed"]
                     .agg(["mean", "count"]).reset_index())

    # League average per-game allowed to each position.
    league_avg = weekly.groupby("pos")["allowed"].mean().to_dict()

    out: dict[tuple[str, str], float] = {}
    for _, r in by_def.iterrows():
        pos = r["pos"]
        lg = league_avg.get(pos, 0.0)
        if lg <= 0:
            continue
        n = r["count"]
        # Bayesian shrinkage of the observed mean toward the league average.
        shrunk = (n * r["mean"] + prior_k * lg) / (n + prior_k)
        mult = shrunk / lg
        out[(r["defense"], pos)] = min(MAX_MULT, max(MIN_MULT, mult))
    return out


def get_multiplier(mults: dict[tuple[str, str], float], opp: str | None, pos: str) -> float:
    """Lookup with a neutral 1.0 default (unknown opponent / no sample yet)."""
    if not opp:
        return 1.0
    return mults.get((opp, pos), 1.0)
