"""Team environment: project how much *volume* an offense will generate next
week — the denominators that a player's usage shares get multiplied back into.

Shares answer "what fraction of the pie does this player get"; the environment
answers "how big is the pie". We EWMA each team's recent aggregate volume
(targets, carries, air yards, red-zone looks) and apply a light game-script nudge:
projected underdogs pass a little more, favorites lean run. Game script is proxied
by recent scoring margin (no Vegas lines are available for free), so it is a gentle
adjustment, not a strong prior.
"""

from __future__ import annotations

import pandas as pd

# Volume fields we project forward (these are the share denominators in usage.py
# plus pass_att for QB volume).
VOLUME_FIELDS = ["rec_tgt", "rush_att", "rec_air_yd", "rec_rz_tgt", "rush_rz_att",
                 "pass_att", "pass_cmp"]

EWMA_HALFLIFE = 4.0       # weeks; recent volume weighted more
GAME_SCRIPT_MAX = 0.06    # at most +/-6% shift between pass and rush volume


def _ewma_last(series: pd.Series, halflife: float) -> float:
    if series.empty:
        return 0.0
    return float(series.ewm(halflife=halflife).mean().iloc[-1])


def team_volume(team_df: pd.DataFrame, halflife: float = EWMA_HALFLIFE
                ) -> dict[str, dict[str, float]]:
    """{team: {field: projected_volume}} from an EWMA of played weeks."""
    if team_df.empty:
        return {}
    out: dict[str, dict[str, float]] = {}
    for team, grp in team_df.sort_values("week").groupby("team"):
        out[team] = {f: _ewma_last(grp[f], halflife) for f in VOLUME_FIELDS if f in grp}
    return out


def _scoring_margins(team_df: pd.DataFrame, halflife: float) -> dict[str, float]:
    """Recent points-scored EWMA per team, centered on the league mean. Positive
    = team has been scoring above average (likely favorite => more rushing)."""
    if team_df.empty or "pts_ppr" not in team_df:
        return {}
    scored = {t: _ewma_last(g.sort_values("week")["pts_ppr"], halflife)
              for t, g in team_df.groupby("team")}
    if not scored:
        return {}
    mean = sum(scored.values()) / len(scored)
    return {t: v - mean for t, v in scored.items()}


def projected_denominators(team_df: pd.DataFrame,
                           opp_map: dict[str, str],
                           halflife: float = EWMA_HALFLIFE
                           ) -> dict[str, dict[str, float]]:
    """Team share-denominators for the upcoming week, EWMA volume nudged by a
    recent-scoring-margin game-script proxy against the scheduled opponent.

    opp_map: team -> opponent (from sleeper.opponent_map for the target week).
    """
    base = team_volume(team_df, halflife)
    margins = _scoring_margins(team_df, halflife)
    if not margins:
        return base

    # Spread of margins -> normalise so the nudge is bounded by GAME_SCRIPT_MAX.
    span = max(1e-6, max(margins.values()) - min(margins.values()))

    out: dict[str, dict[str, float]] = {}
    for team, vol in base.items():
        opp = opp_map.get(team)
        rel = margins.get(team, 0.0) - margins.get(opp, 0.0) if opp else 0.0
        # Favored (rel > 0) => lean run; underdog (rel < 0) => lean pass.
        nudge = GAME_SCRIPT_MAX * max(-1.0, min(1.0, rel / span))
        adj = dict(vol)
        for f in ("rec_tgt", "rec_air_yd", "pass_att", "pass_cmp"):
            if f in adj:
                adj[f] = adj[f] * (1.0 - nudge)
        for f in ("rush_att", "rush_rz_att"):
            if f in adj:
                adj[f] = adj[f] * (1.0 + nudge)
        out[team] = adj
    return out
