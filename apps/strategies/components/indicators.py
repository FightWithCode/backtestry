import logging

import pandas as pd
import pandas_ta as ta

log = logging.getLogger(__name__)


def _wilder_rsi(series: pd.Series, period: int) -> pd.Series:
    """
    RSI using Wilder's smoothing: SMA seed for the first value,
    then recursive avg = (prev_avg*(n-1) + current) / n.
    More accurate than EMA-based RSI for short periods like RSI-5.
    """
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)

    avg_gain = gain.rolling(window=period, min_periods=period).mean().copy()
    avg_loss = loss.rolling(window=period, min_periods=period).mean().copy()

    for i in range(period, len(series)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (period - 1) + gain.iloc[i]) / period
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (period - 1) + loss.iloc[i]) / period

    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def compute_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute all common technical indicators and append them to the DataFrame.
    Handles both lowercase (close, high, low, open, volume) and
    Title Case (Close, High, Low, Open, Volume) OHLCV column names.
    OHLCV columns are never renamed — all indicator columns use their standard names.
    """
    df = df.copy()
    log.info("compute_all_indicators — input bars=%d", len(df))

    # Detect column case
    if "Close" in df.columns:
        close_col, high_col, low_col, open_col, vol_col = "Close", "High", "Low", "Open", "Volume"
    else:
        close_col, high_col, low_col, open_col, vol_col = "close", "high", "low", "open", "volume"

    close  = df[close_col]
    high   = df[high_col]
    low    = df[low_col]
    open_  = df[open_col]
    volume = df[vol_col]

    # ── SMA ───────────────────────────────────────────────────────────────
    for period in [10, 20, 50, 100, 200]:
        df[f"SMA_{period}"] = ta.sma(close, length=period)

    # ── EMA ───────────────────────────────────────────────────────────────
    for period in [9, 12, 21, 26, 50, 200]:
        df[f"EMA_{period}"] = ta.ema(close, length=period)

    # ── RSI ───────────────────────────────────────────────────────────────
    df["RSI_5"]  = _wilder_rsi(close, 5)   # Wilder's smoothing for mean-reversion
    df["RSI_14"] = ta.rsi(close, length=14)

    # ── MACD ──────────────────────────────────────────────────────────────
    macd = ta.macd(close, fast=12, slow=26, signal=9)
    if macd is not None and not macd.empty:
        for col in macd.columns:
            df[col] = macd[col]

    # ── Bollinger Bands ───────────────────────────────────────────────────
    bb = ta.bbands(close, length=20, std=2.0)
    if bb is not None and not bb.empty:
        for col in bb.columns:
            df[col] = bb[col]
        # pandas_ta appends std twice (e.g. BBL_20_2.0_2.0) — normalise to BBL_20_2.0
        for suffix in ["L", "M", "U", "B", "P"]:
            old = f"BB{suffix}_20_2.0_2.0"
            new = f"BB{suffix}_20_2.0"
            if old in df.columns:
                df.rename(columns={old: new}, inplace=True)

    # ── ATR ───────────────────────────────────────────────────────────────
    atr = ta.atr(high, low, close, length=14)
    if atr is not None:
        df["ATRr_14"] = atr

    # ── SuperTrend ────────────────────────────────────────────────────────
    st = ta.supertrend(high, low, close, length=7, multiplier=3.0)
    if st is not None and not st.empty:
        for col in st.columns:
            df[col] = st[col]

    # ── Stochastic ────────────────────────────────────────────────────────
    stoch = ta.stoch(high, low, close, k=14, d=3, smooth_k=3)
    if stoch is not None and not stoch.empty:
        for col in stoch.columns:
            df[col] = stoch[col]

    # ── ADX ───────────────────────────────────────────────────────────────
    adx = ta.adx(high, low, close, length=14)
    if adx is not None and not adx.empty:
        for col in adx.columns:
            df[col] = adx[col]

    # ── CCI ───────────────────────────────────────────────────────────────
    cci = ta.cci(high, low, close, length=20)
    if cci is not None:
        df["CCI_20_0.015"] = cci

    # ── OBV ───────────────────────────────────────────────────────────────
    obv = ta.obv(close, volume)
    if obv is not None:
        df["OBV"] = obv

    # ── VWAP approximation (typical price — valid for daily/weekly bars) ──
    df["VWAP"] = (high + low + close) / 3

    # ── Candlestick pattern columns ───────────────────────────────────────
    body        = (close - open_).abs()
    total_range = (high - low).replace(0, 0.0001)
    lower_wick  = df[[close_col, open_col]].min(axis=1) - low
    upper_wick  = high - df[[close_col, open_col]].max(axis=1)

    # Doji: body < 10% of total range
    df["CDL_DOJI"] = (body / total_range < 0.10).astype(int)

    # Hammer: long lower wick (≥2× body), tiny upper wick, small body
    df["CDL_HAMMER"] = (
        (lower_wick >= 2 * body) &
        (upper_wick <= body) &
        (body / total_range < 0.35)
    ).astype(int)

    # Shooting Star: long upper wick (≥2× body), tiny lower wick, small body
    df["CDL_SHOOTING_STAR"] = (
        (upper_wick >= 2 * body) &
        (lower_wick <= body) &
        (body / total_range < 0.35)
    ).astype(int)

    # Engulfing patterns
    prev_open  = open_.shift(1)
    prev_close = close.shift(1)
    df["CDL_ENGULFING_BULL"] = (
        (prev_close < prev_open) &      # previous bar was bearish
        (close > open_) &               # current bar is bullish
        (open_ < prev_close) &          # opens below previous close
        (close > prev_open)             # closes above previous open
    ).astype(int)
    df["CDL_ENGULFING_BEAR"] = (
        (prev_close > prev_open) &
        (close < open_) &
        (open_ > prev_close) &
        (close < prev_open)
    ).astype(int)

    # General directional candles
    df["CDL_BULLISH"] = (close > open_).astype(int)
    df["CDL_BEARISH"] = (close < open_).astype(int)

    # ── Swing High / Low (shifted 1 bar to avoid lookahead bias) ─────────
    df["SWING_HIGH_20"] = high.rolling(20).max().shift(1)
    df["SWING_LOW_20"]  = low.rolling(20).min().shift(1)

    # ── Dtype coercion: pandas_ta occasionally returns object columns ─────
    price_cols = {close_col, high_col, low_col, open_col, vol_col}
    coerced = []
    for col in df.columns:
        if col not in price_cols and df[col].dtype == object:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            coerced.append(col)
    if coerced:
        log.debug("Dtype coercion applied to: %s", coerced)

    added = [c for c in df.columns if c not in price_cols]
    log.info("compute_all_indicators — done, %d indicator columns added", len(added))
    return df


def compute_indicator(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """
    Backward-compatible per-indicator API used by JSON config strategies.
    Ensures all standard indicators are present via compute_all_indicators,
    then handles special types (GAP, GAP_PCT) that are not part of the standard set.
    """
    # Avoid recomputing if already done (RSI_14 is the sentinel)
    if "RSI_14" not in df.columns:
        df = compute_all_indicators(df)

    kind = config.get("type", "").upper()
    close_col = "Close" if "Close" in df.columns else "close"
    open_col  = "Open"  if "Open"  in df.columns else "open"

    if kind == "GAP":
        col = config.get("col", "gap")
        df[col] = df[open_col] - df[close_col].shift(1)

    elif kind == "GAP_PCT":
        col = config.get("col", "gap_pct")
        df[col] = (df[open_col] / df[close_col].shift(1) - 1) * 100

    return df
