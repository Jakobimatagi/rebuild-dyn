"""Weekly NFL fantasy points projection engine for Dynasty Oracle.

A transparent, component-decomposed statistical model:

    projected points = volume x efficiency, adjusted for opponent defense and
    team game environment, with Bayesian shrinkage on every noisy quantity.

Everything is built from free, unauthenticated Sleeper data. See README.md for
the model write-up and the latest walk-forward backtest metrics.
"""

MODEL_VERSION = "v1"
USAGE_POSITIONS = ("QB", "RB", "WR", "TE")
