"""
Computes exactly the indicators an IR declares, with the declared params,
instead of a fixed hardcoded period list (apps/strategies/components/indicators.py's
compute_all_indicators only precomputes a handful of hardcoded periods — an
IR asking for "EMA 34" would silently fail to resolve there). Returns a
dict[indicator_id -> pd.Series] keyed exactly by the IR's declared ids, which
apps/strategies/ir/expr.py resolves refs against directly.
"""
import pandas as pd
import pandas_ta as ta

from apps.strategies.ir.schema import INDICATOR_TYPES


def ohlcv_series(df: pd.DataFrame):
    """Returns (open, high, low, close, volume) Series, tolerant of either column casing."""
    if "Close" in df.columns:
        return df["Open"], df["High"], df["Low"], df["Close"], df["Volume"]
    return df["open"], df["high"], df["low"], df["close"], df["volume"]


def _params_with_defaults(ind_type: str, params: dict) -> dict:
    spec = INDICATOR_TYPES[ind_type]["params"]
    resolved = dict(params or {})
    for name, meta in spec.items():
        if name not in resolved:
            if meta.get("required"):
                raise ValueError(f"{ind_type}: missing required param '{name}'")
            resolved[name] = meta.get("default")
    return resolved


def _candlestick_pattern(name: str, open_, high, low, close) -> pd.Series:
    body = (close - open_).abs()
    total_range = (high - low).replace(0, 0.0001)
    lower_wick = pd.concat([close, open_], axis=1).min(axis=1) - low
    upper_wick = high - pd.concat([close, open_], axis=1).max(axis=1)

    if name == "doji":
        return (body / total_range < 0.10)
    if name == "hammer":
        return (lower_wick >= 2 * body) & (upper_wick <= body) & (body / total_range < 0.35)
    if name == "shooting_star":
        return (upper_wick >= 2 * body) & (lower_wick <= body) & (body / total_range < 0.35)
    if name == "engulfing_bull":
        prev_open, prev_close = open_.shift(1), close.shift(1)
        return (prev_close < prev_open) & (close > open_) & (open_ < prev_close) & (close > prev_open)
    if name == "engulfing_bear":
        prev_open, prev_close = open_.shift(1), close.shift(1)
        return (prev_close > prev_open) & (close < open_) & (open_ > prev_close) & (close < prev_open)
    if name == "bullish_candle":
        return close > open_
    if name == "bearish_candle":
        return close < open_
    raise ValueError(f"Unknown candlestick pattern '{name}'")


def _compute_one(ind_type: str, params: dict, open_, high, low, close, volume) -> pd.Series:
    p = _params_with_defaults(ind_type, params)

    if ind_type == "SMA":
        return ta.sma(close, length=p["length"])
    if ind_type == "EMA":
        return ta.ema(close, length=p["length"])
    if ind_type == "RSI":
        return ta.rsi(close, length=p["length"])
    if ind_type == "MACD":
        out = ta.macd(close, fast=p["fast"], slow=p["slow"], signal=p["signal"])
        col = {"macd": 0, "signal": 1, "hist": 2}[p["component"]]
        return out.iloc[:, col]
    if ind_type == "BBANDS":
        out = ta.bbands(close, length=p["length"], std=p["std"])
        col = {"lower": 0, "mid": 1, "upper": 2}[p["component"]]
        return out.iloc[:, col]
    if ind_type == "ATR":
        return ta.atr(high, low, close, length=p["length"])
    if ind_type == "ADX":
        out = ta.adx(high, low, close, length=p["length"])
        col = {"adx": 0, "dmp": 1, "dmn": 2}[p["component"]]
        return out.iloc[:, col]
    if ind_type == "STOCH":
        out = ta.stoch(high, low, close, k=p["k"], d=p["d"], smooth_k=p["smooth_k"])
        col = {"k": 0, "d": 1}[p["component"]]
        return out.iloc[:, col]
    if ind_type == "CCI":
        return ta.cci(high, low, close, length=p["length"])
    if ind_type == "OBV":
        return ta.obv(close, volume)
    if ind_type == "SUPERTREND":
        out = ta.supertrend(high, low, close, length=p["length"], multiplier=p["multiplier"])
        # supertrend columns: [SUPERT_, SUPERTd_ (direction), SUPERTl_, SUPERTs_]
        col = 1 if p["component"] == "direction" else 0
        return out.iloc[:, col]
    if ind_type == "VWAP":
        return (high + low + close) / 3  # approximation: typical price, not session/volume-anchored
    if ind_type == "PATTERN":
        return _candlestick_pattern(p["name"], open_, high, low, close).astype(int)
    if ind_type == "SWING_HIGH":
        return high.rolling(p["length"]).max().shift(1)
    if ind_type == "SWING_LOW":
        return low.rolling(p["length"]).min().shift(1)

    raise ValueError(f"Unsupported indicator type '{ind_type}'")


def compute_ir_indicators(df: pd.DataFrame, ir_indicators: list) -> dict:
    """Returns {indicator_id: pd.Series}, one entry per IR-declared indicator."""
    open_, high, low, close, volume = ohlcv_series(df)
    series_by_id = {}
    for decl in ir_indicators:
        ind_id = decl["id"]
        ind_type = decl["type"]
        if ind_type not in INDICATOR_TYPES:
            raise ValueError(f"Unsupported indicator type '{ind_type}' for id '{ind_id}'")
        series = _compute_one(ind_type, decl.get("params", {}), open_, high, low, close, volume)
        series_by_id[ind_id] = pd.to_numeric(series, errors="coerce")
    return series_by_id
