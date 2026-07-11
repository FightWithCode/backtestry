"""
Single source of truth for the Strategy IR: supported indicator types, the
expression-operator vocabulary, and the built-in refs available without
declaration. Shared by the validator (validate.py), the executor's indicator
computation (indicators.py), and the LLM prompt builder (strategy_extractor.py)
so the prompt and the validator can never drift apart.
"""

# ── Indicator types ──────────────────────────────────────────────────────────
# Each entry: params -> {name: {"required": bool, "default": value, "type": "int"|"float"|"enum",
#                                "choices": [...] (enum only)}}
INDICATOR_TYPES = {
    "SMA": {"params": {"length": {"required": True, "type": "int"}}},
    "EMA": {"params": {"length": {"required": True, "type": "int"}}},
    "RSI": {"params": {"length": {"required": False, "default": 14, "type": "int"}}},
    "MACD": {"params": {
        "fast": {"required": False, "default": 12, "type": "int"},
        "slow": {"required": False, "default": 26, "type": "int"},
        "signal": {"required": False, "default": 9, "type": "int"},
        "component": {"required": False, "default": "macd", "type": "enum",
                      "choices": ["macd", "signal", "hist"]},
    }},
    "BBANDS": {"params": {
        "length": {"required": False, "default": 20, "type": "int"},
        "std": {"required": False, "default": 2.0, "type": "float"},
        "component": {"required": False, "default": "mid", "type": "enum",
                      "choices": ["upper", "mid", "lower"]},
    }},
    "ATR": {"params": {"length": {"required": False, "default": 14, "type": "int"}}},
    "ADX": {"params": {
        "length": {"required": False, "default": 14, "type": "int"},
        "component": {"required": False, "default": "adx", "type": "enum",
                      "choices": ["adx", "dmp", "dmn"]},
    }},
    "STOCH": {"params": {
        "k": {"required": False, "default": 14, "type": "int"},
        "d": {"required": False, "default": 3, "type": "int"},
        "smooth_k": {"required": False, "default": 3, "type": "int"},
        "component": {"required": False, "default": "k", "type": "enum",
                      "choices": ["k", "d"]},
    }},
    "CCI": {"params": {"length": {"required": False, "default": 20, "type": "int"}}},
    "OBV": {"params": {}},
    "SUPERTREND": {"params": {
        "length": {"required": False, "default": 7, "type": "int"},
        "multiplier": {"required": False, "default": 3.0, "type": "float"},
        "component": {"required": False, "default": "trend", "type": "enum",
                      "choices": ["trend", "direction"]},
    }},
    "VWAP": {"params": {}},  # approximation: typical price (H+L+C)/3, NOT session/volume-anchored
    "PATTERN": {"params": {
        "name": {"required": True, "type": "enum",
                 "choices": ["doji", "hammer", "shooting_star", "engulfing_bull",
                             "engulfing_bear", "bullish_candle", "bearish_candle"]},
    }},
    "SWING_HIGH": {"params": {"length": {"required": False, "default": 20, "type": "int"}}},
    "SWING_LOW": {"params": {"length": {"required": False, "default": 20, "type": "int"}}},
}

# ── Expression operator vocabulary ──────────────────────────────────────────
# Comparison / logic ops take a list of exactly 2 operand-expressions (except and/or: N, not: 1).
COMPARISON_OPS = {"gt", "lt", "gte", "lte", "eq", "neq"}
LOGIC_OPS = {"and", "or", "not"}
CROSS_OPS = {"crosses_above", "crosses_below"}
ARITHMETIC_OPS = {"add", "sub", "mul", "div"}
LOOKBACK_OPS = {"prev", "rising", "falling"}  # prev: {"prev": <ref>, "n": <int, default 1>}

ALL_OPS = COMPARISON_OPS | LOGIC_OPS | CROSS_OPS | ARITHMETIC_OPS | LOOKBACK_OPS

# ── Built-in refs always available without declaring an indicator ──────────
OHLCV_REFS = {"open", "high", "low", "close", "volume"}
POSITION_REFS = {"entry_price", "position_avg_price", "position_size", "bars_in_trade"}
BUILTIN_REFS = OHLCV_REFS | POSITION_REFS

# ── Chart display classification ────────────────────────────────────────────
# "overlay" indicators share the price's y-axis (SMA/EMA/BBANDS/...); "oscillator"
# indicators need their own scale (RSI/MACD/...). Used by the IR executor to tag
# chart_data and by the frontend price chart to decide default visibility.
INDICATOR_SCALE = {
    "SMA": "overlay", "EMA": "overlay", "BBANDS": "overlay", "VWAP": "overlay",
    "SWING_HIGH": "overlay", "SWING_LOW": "overlay", "SUPERTREND": "overlay",
    "RSI": "oscillator", "MACD": "oscillator", "ATR": "oscillator",
    "ADX": "oscillator", "STOCH": "oscillator", "CCI": "oscillator",
    "OBV": "oscillator", "PATTERN": "oscillator",
}

# ── Other enums ──────────────────────────────────────────────────────────────
DIRECTIONS = {"long", "short"}
EXIT_TYPES = {"signal", "stop", "target", "time"}
POSITION_SIZING_MODES = {"percent_of_equity"}
STATE_TYPES = {"bool", "number"}
