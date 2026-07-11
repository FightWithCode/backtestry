import pandas as pd


def compute_patterns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute all supported candle patterns and attach boolean columns prefixed pat_.
    Handles both lowercase (close/open/high/low) and Title Case (Close/Open/High/Low).
    """
    if "Close" in df.columns:
        close_col, open_col, high_col, low_col = "Close", "Open", "High", "Low"
    else:
        close_col, open_col, high_col, low_col = "close", "open", "high", "low"

    close = df[close_col]
    open_ = df[open_col]
    high  = df[high_col]
    low   = df[low_col]

    body        = (close - open_).abs()
    total_range = (high - low).replace(0, 0.0001)   # old-engine precision fix
    upper_wick  = high - df[[close_col, open_col]].max(axis=1)
    lower_wick  = df[[close_col, open_col]].min(axis=1) - low
    bullish     = close > open_
    bearish     = close < open_

    # ── Upgraded patterns (old-engine definitions) ────────────────────────

    # Doji: body < 10% of total range
    df["pat_doji"] = body / total_range < 0.10

    # Hammer: long lower wick (≥2× body), tiny upper wick, small body proportion
    df["pat_hammer"] = (
        (lower_wick >= 2 * body) &
        (upper_wick <= body) &
        (body / total_range < 0.35)
    )

    # Shooting Star: long upper wick (≥2× body), tiny lower wick, small body proportion
    df["pat_shooting_star"] = (
        (upper_wick >= 2 * body) &
        (lower_wick <= body) &
        (body / total_range < 0.35)
    )

    # Bullish Engulfing: 4-condition version from old engine
    prev_close = close.shift(1)
    prev_open  = open_.shift(1)
    df["pat_bullish_engulfing"] = (
        (prev_close < prev_open) &      # previous bar was bearish
        bullish &                        # current bar is bullish
        (open_ < prev_close) &           # opens below previous close
        (close > prev_open)              # closes above previous open
    )

    # Bearish Engulfing: mirror of bull engulfing
    df["pat_bearish_engulfing"] = (
        (prev_close > prev_open) &
        bearish &
        (open_ > prev_close) &
        (close < prev_open)
    )

    # New: general directional candles
    df["pat_bullish"] = bullish
    df["pat_bearish"] = bearish

    # ── Unchanged patterns from original patterns.py ──────────────────────

    df["pat_inverted_hammer"] = (upper_wick > 2 * body) & (lower_wick < body) & bullish
    df["pat_marubozu"]        = body > 0.9 * total_range

    df["pat_morning_star"] = (
        bearish.shift(2)
        & (body.shift(1) < body.shift(2) * 0.3)
        & bullish
        & (close > (open_.shift(2) + close.shift(2)) / 2)
    )
    df["pat_evening_star"] = (
        bullish.shift(2)
        & (body.shift(1) < body.shift(2) * 0.3)
        & bearish
        & (close < (open_.shift(2) + close.shift(2)) / 2)
    )
    df["pat_three_white_soldiers"] = (
        bullish & bullish.shift(1) & bullish.shift(2)
        & (close > close.shift(1))
        & (close.shift(1) > close.shift(2))
        & (open_ > open_.shift(1))
        & (open_.shift(1) > open_.shift(2))
    )
    df["pat_three_black_crows"] = (
        bearish & bearish.shift(1) & bearish.shift(2)
        & (close < close.shift(1))
        & (close.shift(1) < close.shift(2))
        & (open_ < open_.shift(1))
        & (open_.shift(1) < open_.shift(2))
    )
    df["pat_spinning_top"] = (
        (body / total_range < 0.3)
        & (upper_wick > body)
        & (lower_wick > body)
    )
    df["pat_bullish_harami"] = (
        bearish.shift(1)
        & bullish
        & (open_ > close.shift(1))
        & (close < open_.shift(1))
    )
    df["pat_bearish_harami"] = (
        bullish.shift(1)
        & bearish
        & (open_ < close.shift(1))
        & (close > open_.shift(1))
    )

    return df
