"""Standard fantasy scoring of a projected box line.

Defaults match Sleeper's default scoring (so a projected line scored here is
directly comparable to the `pts_ppr` ground truth Sleeper reports):
  passing : 0.04/yd, 4/TD, -1/INT, 2/2pt
  rushing : 0.1/yd, 6/TD, 2/2pt
  receiving: PPR/reception, 0.1/yd, 6/TD, 2/2pt
  fumbles lost: -2

PPR weight is parameterised so the same projected box line yields PPR (1.0),
half-PPR (0.5), or standard (0.0). The React layer can re-score the stored box
line against a league's exact scoring_settings; this is the sane default.
"""

from __future__ import annotations


def score_line(line: dict, ppr: float = 1.0) -> float:
    g = lambda k: float(line.get(k, 0.0) or 0.0)
    return (
        g("pass_yd") * 0.04 + g("pass_td") * 4 - g("pass_int") * 1 + g("pass_2pt") * 2
        + g("rush_yd") * 0.1 + g("rush_td") * 6 + g("rush_2pt") * 2
        + g("rec") * ppr + g("rec_yd") * 0.1 + g("rec_td") * 6 + g("rec_2pt") * 2
        - g("fum_lost") * 2
    )


def score_all(line: dict) -> dict:
    """Return {proj_ppr, proj_half, proj_std} for one projected box line."""
    return {
        "proj_ppr": round(score_line(line, 1.0), 2),
        "proj_half": round(score_line(line, 0.5), 2),
        "proj_std": round(score_line(line, 0.0), 2),
    }
