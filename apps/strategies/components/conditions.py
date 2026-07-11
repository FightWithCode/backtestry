"""
Condition evaluation for the strategy rule engine.

Two APIs:
  1. evaluate_conditions(df, conditions) — structured JSON condition dicts
  2. parse_rules_to_signals(df, entry_rules, exit_rules) — plain English rule strings
"""
import re
import logging

import pandas as pd

log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# PART A — Structured JSON condition evaluator
# ═══════════════════════════════════════════════════════════════════════════

def _resolve(df: pd.DataFrame, ref: str) -> pd.Series:
    """Return a Series for a column name or a numeric literal.
    Column lookup is case-insensitive so configs using 'sma_10' match 'SMA_10'.
    """
    try:
        return pd.Series(float(ref), index=df.index)
    except (TypeError, ValueError):
        # Exact match first
        if ref in df.columns:
            return df[ref]
        # Case-insensitive fallback (e.g. 'sma_10' → 'SMA_10')
        ref_lower = ref.lower()
        for col in df.columns:
            if col.lower() == ref_lower:
                return df[col]
        raise KeyError(f"Column '{ref}' not found. Available: {list(df.columns)}")


def evaluate_conditions(df: pd.DataFrame, conditions: list) -> pd.Series:
    """
    Evaluate a list of condition dicts and return a boolean Series (True = all met).

    Supported condition types:
      above          : col > value
      below          : col < value
      crosses_above  : col crossed above value (prev <= value, cur > value)
      crosses_below  : col crossed below value (prev >= value, cur < value)
      between        : lower <= col <= upper
      increasing     : col > col.shift(1)
      decreasing     : col < col.shift(1)
      equals         : col == value
      not_equals     : col != value
      threshold      : indicator op value  (op: lt/gt/lte/gte)
      comparison     : left op right       (op: lt/gt/lte/gte)
      pattern        : pat_<name> is True
      bullish_candle : close > open
      bearish_candle : close < open
      volume_spike   : volume > multiplier * volume.shift(1)
      price_above_ma : close > <ma_col>
      price_below_ma : close < <ma_col>
    """
    mask = pd.Series(True, index=df.index)

    for cond in conditions:
        ctype = cond.get("type", "")

        if ctype == "above":
            col = _resolve(df, cond["col"])
            val = _resolve(df, str(cond["value"]))
            mask &= col > val

        elif ctype == "below":
            col = _resolve(df, cond["col"])
            val = _resolve(df, str(cond["value"]))
            mask &= col < val

        elif ctype == "crosses_above":
            col = _resolve(df, cond["col"])
            val = _resolve(df, str(cond["value"]))
            mask &= (col.shift(1) <= val) & (col > val)

        elif ctype == "crosses_below":
            col = _resolve(df, cond["col"])
            val = _resolve(df, str(cond["value"]))
            mask &= (col.shift(1) >= val) & (col < val)

        elif ctype == "between":
            col = _resolve(df, cond["col"])
            lower = float(cond["lower"])
            upper = float(cond["upper"])
            mask &= (col >= lower) & (col <= upper)

        elif ctype == "increasing":
            col = _resolve(df, cond["col"])
            mask &= col > col.shift(1)

        elif ctype == "decreasing":
            col = _resolve(df, cond["col"])
            mask &= col < col.shift(1)

        elif ctype == "equals":
            col = _resolve(df, cond["col"])
            val = _resolve(df, str(cond["value"]))
            mask &= col == val

        elif ctype == "not_equals":
            col = _resolve(df, cond["col"])
            val = _resolve(df, str(cond["value"]))
            mask &= col != val

        elif ctype == "threshold":
            # {"type": "threshold", "indicator": "RSI_14", "operator": "lt", "value": 30}
            series = df[cond["indicator"]]
            op  = cond["operator"]
            val = float(cond["value"])
            ops = {"lt": series < val, "gt": series > val,
                   "lte": series <= val, "gte": series >= val}
            result = ops.get(op)
            if result is not None:
                mask &= result

        elif ctype == "comparison":
            # {"type": "comparison", "left": "EMA_9", "right": "EMA_21", "operator": "gt"}
            left  = df[cond["left"]]
            right = df[cond["right"]]
            op    = cond["operator"]
            ops = {"lt": left < right, "gt": left > right,
                   "lte": left <= right, "gte": left >= right}
            result = ops.get(op)
            if result is not None:
                mask &= result

        elif ctype == "pattern":
            pat_col = f"pat_{cond['name']}"
            if pat_col not in df.columns:
                raise KeyError(f"Pattern column '{pat_col}' not found")
            mask &= df[pat_col].fillna(False)

        elif ctype == "bullish_candle":
            close_col = "Close" if "Close" in df.columns else "close"
            open_col  = "Open"  if "Open"  in df.columns else "open"
            mask &= df[close_col] > df[open_col]

        elif ctype == "bearish_candle":
            close_col = "Close" if "Close" in df.columns else "close"
            open_col  = "Open"  if "Open"  in df.columns else "open"
            mask &= df[close_col] < df[open_col]

        elif ctype == "volume_spike":
            multiplier = float(cond.get("multiplier", 1.5))
            vol_col = "Volume" if "Volume" in df.columns else "volume"
            mask &= df[vol_col] > multiplier * df[vol_col].shift(1)

        elif ctype == "price_above_ma":
            ma_col    = cond["ma_col"]
            close_col = "Close" if "Close" in df.columns else "close"
            if ma_col not in df.columns:
                raise KeyError(f"MA column '{ma_col}' not found")
            mask &= df[close_col] > df[ma_col]

        elif ctype == "price_below_ma":
            ma_col    = cond["ma_col"]
            close_col = "Close" if "Close" in df.columns else "close"
            if ma_col not in df.columns:
                raise KeyError(f"MA column '{ma_col}' not found")
            mask &= df[close_col] < df[ma_col]

        else:
            raise ValueError(f"Unknown condition type: '{ctype}'")

    return mask.fillna(False)


# ═══════════════════════════════════════════════════════════════════════════
# PART B — Natural language rule engine (ported from rule_engine.py)
# ═══════════════════════════════════════════════════════════════════════════
# All internal helpers assume Title Case columns (Close, High, Low, Open, Volume)
# plus indicator columns produced by compute_all_indicators (RSI_14, EMA_21, etc.).
# parse_rules_to_signals() normalises lowercase OHLCV to Title Case before
# passing the df into the engine.

# Text fragment → exact DataFrame column name
_COL_MAP = {
    # Price
    "close": "Close", "closing price": "Close", "price": "Close",
    "open": "Open", "opening price": "Open",
    "high": "High", "low": "Low", "volume": "Volume",
    # SMA
    "sma 10": "SMA_10",  "sma10": "SMA_10",  "10-period sma": "SMA_10",  "10 sma": "SMA_10",
    "sma 20": "SMA_20",  "sma20": "SMA_20",  "20-period sma": "SMA_20",  "20 sma": "SMA_20",
    "sma 50": "SMA_50",  "sma50": "SMA_50",  "50-period sma": "SMA_50",  "50 sma": "SMA_50",
    "sma 100": "SMA_100","sma100": "SMA_100","100-period sma": "SMA_100","100 sma": "SMA_100",
    "sma 200": "SMA_200","sma200": "SMA_200","200-period sma": "SMA_200","200 sma": "SMA_200",
    # EMA
    "ema 9": "EMA_9",   "ema9": "EMA_9",   "9 ema": "EMA_9",   "9-period ema": "EMA_9",
    "ema 12": "EMA_12", "ema12": "EMA_12", "12 ema": "EMA_12",
    "ema 21": "EMA_21", "ema21": "EMA_21", "21 ema": "EMA_21",
    "ema 26": "EMA_26", "ema26": "EMA_26", "26 ema": "EMA_26",
    "ema 50": "EMA_50", "ema50": "EMA_50", "50 ema": "EMA_50",
    "ema 200": "EMA_200", "ema200": "EMA_200", "200 ema": "EMA_200",
    # RSI
    "rsi": "RSI_14", "rsi 14": "RSI_14", "rsi(14)": "RSI_14",
    "relative strength index": "RSI_14",
    "rsi 5": "RSI_5", "rsi(5)": "RSI_5",
    # MACD
    "macd line": "MACD_12_26_9", "macd": "MACD_12_26_9",
    "macd histogram": "MACDh_12_26_9", "macd hist": "MACDh_12_26_9",
    "macd signal line": "MACDs_12_26_9", "macd signal": "MACDs_12_26_9",
    # Bollinger Bands
    "upper bollinger band": "BBU_20_2.0", "upper band": "BBU_20_2.0",
    "bollinger upper": "BBU_20_2.0",      "bb upper": "BBU_20_2.0",
    "lower bollinger band": "BBL_20_2.0", "lower band": "BBL_20_2.0",
    "bollinger lower": "BBL_20_2.0",      "bb lower": "BBL_20_2.0",
    "middle bollinger band": "BBM_20_2.0","middle band": "BBM_20_2.0",
    "bollinger middle": "BBM_20_2.0",     "bb middle": "BBM_20_2.0",
    # ATR / ADX / Stochastic / CCI / OBV
    "atr": "ATRr_14", "average true range": "ATRr_14",
    "adx": "ADX_14",  "average directional index": "ADX_14",
    "di+": "DMP_14",  "dmi+": "DMP_14", "positive directional indicator": "DMP_14",
    "di-": "DMN_14",  "dmi-": "DMN_14", "negative directional indicator": "DMN_14",
    "stochastic k": "STOCHk_14_3_3", "stoch k": "STOCHk_14_3_3", "stochastic %k": "STOCHk_14_3_3",
    "stochastic d": "STOCHd_14_3_3", "stoch d": "STOCHd_14_3_3", "stochastic %d": "STOCHd_14_3_3",
    "stochastic": "STOCHk_14_3_3",
    "cci": "CCI_20_0.015", "commodity channel index": "CCI_20_0.015",
    "obv": "OBV", "on-balance volume": "OBV", "on balance volume": "OBV",
    # Candlestick patterns
    "doji": "CDL_DOJI", "doji candle": "CDL_DOJI",
    "hammer": "CDL_HAMMER", "hammer candle": "CDL_HAMMER",
    "shooting star": "CDL_SHOOTING_STAR", "shooting star candle": "CDL_SHOOTING_STAR",
    "bullish engulfing": "CDL_ENGULFING_BULL", "engulfing bull": "CDL_ENGULFING_BULL",
    "bearish engulfing": "CDL_ENGULFING_BEAR", "engulfing bear": "CDL_ENGULFING_BEAR",
    "bullish candle": "CDL_BULLISH", "green candle": "CDL_BULLISH", "up candle": "CDL_BULLISH",
    "bearish candle": "CDL_BEARISH", "red candle": "CDL_BEARISH", "down candle": "CDL_BEARISH",
    # Swing / Resistance / Support
    "swing high": "SWING_HIGH_20", "resistance": "SWING_HIGH_20", "recent high": "SWING_HIGH_20",
    "swing low": "SWING_LOW_20",   "support": "SWING_LOW_20",     "recent low": "SWING_LOW_20",
    # Bare indicator names without period → sensible defaults
    "ema": "EMA_21", "ema line": "EMA_21", "the ema": "EMA_21",
    "sma": "SMA_20", "sma line": "SMA_20", "the sma": "SMA_20",
    "moving average": "SMA_20", "ma": "SMA_20", "ma line": "SMA_20",
    # MACD colour aliases
    "macd blue line": "MACD_12_26_9",  "blue line": "MACD_12_26_9",
    "macd red line":  "MACDs_12_26_9", "red line":  "MACDs_12_26_9",
    # VWAP
    "vwap": "VWAP", "vwap line": "VWAP", "volume weighted average price": "VWAP",
}


def _get_or_compute_ma(period: int, df: pd.DataFrame) -> pd.Series | None:
    """Return an MA series for the given period, from df columns or computed on the fly."""
    for prefix in ("SMA", "EMA"):
        col = f"{prefix}_{period}"
        if col in df.columns:
            return df[col]
    if "Close" in df.columns:
        return df["Close"].rolling(period).mean()
    return None


# TP/SL keywords — handled by the simulator, not the rule engine
_TPSL_RE = re.compile(
    r'\b('
    r'take[\s-]profit|profit[\s-]target|profit\s+level|'
    r'stop[\s-]loss|stop\s+loss|trailing\s+stop|'
    r'potential\s+upside|downside\s+risk|'
    r'(?:risk|downside)\s+(?:is\s+)?capped|'
    r'upside\s+is\s+at\s+least|'
    r'reaches?\s+(?:a\s+)?(?:\d[\d\s\-]*%\s+)?profit|'
    r'drops?\s+\d[\d\s\-]*%\s+below|falls?\s+\d[\d\s\-]*%\s+below|'
    r'r:r|risk[\s-]reward|risk.reward|reward[\s-]to[\s-]risk|reward.to.risk|'
    r'\d+:\d+\s*(?:r/?r|reward|risk|target)'
    r')\b',
    re.IGNORECASE,
)

# Position / frequency management — not computable from OHLCV bars
_POSITION_MGMT_RE = re.compile(
    r'\b('
    r'(?:monthly|weekly|daily)\s+trade\s+(?:count|limit|frequency)|'
    r'trade\s+(?:count|limit|frequency)|'
    r'(?:max|maximum)\s+(?:trades?|positions?)\s+(?:per|a)|'
    r'position\s+(?:limit|sizing?|count)|'
    r'portfolio\s+(?:allocation|exposure|weight)'
    r')\b',
    re.IGNORECASE,
)

# Fundamental screening — not computable from OHLCV data
_FUNDAMENTAL_RE = re.compile(
    r'\b(market[\s-]?cap|earnings|p/?e\s+ratio|book\s+value|revenue|dividend|eps|float\s+shares?)\b',
    re.IGNORECASE,
)

# Indicators we don't compute — skip gracefully
_NOT_COMPUTED_RE = re.compile(
    r'\b(ichimoku|parabolic\s+sar|vortex\s+indicator)\b',
    re.IGNORECASE,
)


def _is_number(text: str) -> bool:
    try:
        float(text.strip())
        return True
    except ValueError:
        return False


def _resolve_col(text: str, df: pd.DataFrame) -> str | None:
    """Map a text fragment to a DataFrame column name (rule engine version)."""
    text = re.sub(r'\b(the|a|an)\b', '', text.strip(), flags=re.IGNORECASE).strip()
    lo = text.lower()

    # Exact column match
    for col in df.columns:
        if col.lower() == lo:
            return col

    # Alias map
    if lo in _COL_MAP and _COL_MAP[lo] in df.columns:
        return _COL_MAP[lo]

    # Dynamic SMA_N / EMA_N  e.g. "SMA 50", "ema(21)", "200-day EMA"
    for prefix in ("sma", "ema"):
        if prefix in lo:
            nums = re.findall(r'\d+', lo)
            if nums:
                col = f"{prefix.upper()}_{nums[0]}"
                if col in df.columns:
                    return col

    # Dynamic "N-period moving average" / "N-bar MA"
    if re.search(r'(?:moving\s+average|[-\s]period\s+(?:moving\s+average|ma)\b)', lo):
        nums = re.findall(r'\d+', lo)
        if nums:
            for prefix in ("SMA", "EMA"):
                col = f"{prefix}_{nums[0]}"
                if col in df.columns:
                    return col

    # Partial alias fallback (longest match wins)
    best = None
    for alias, col in _COL_MAP.items():
        if alias in lo and col in df.columns:
            if best is None or len(alias) > len(best[0]):
                best = (alias, col)
    if best:
        return best[1]

    return None


# Condition verbs — a rule must contain one to be worth parsing
_CONDITION_VERBS = re.compile(
    r'\b(cross(?:es|ed|over|under|ing)?|above|below|over|under|greater|less|exceed|'
    r'break(?:out)?s?|breakout|trade[sd]?|trading|positive|negative|bullish|bearish|'
    r'overbought|oversold|turn(?:s|ed)?|rising|falling|increase|decrease|spike[sd]?|'
    r'reach(?:es)?|hit[s]?|touch(?:es)?|form(?:s|ed)?|change[sd]?)\b',
    re.IGNORECASE,
)

# Candlestick keyword → column (longest match first)
_PATTERNS = [
    ("bullish engulfing", "CDL_ENGULFING_BULL"),
    ("bearish engulfing", "CDL_ENGULFING_BEAR"),
    ("engulfing",         "CDL_ENGULFING_BULL"),
    ("shooting star",     "CDL_SHOOTING_STAR"),
    ("hammer",            "CDL_HAMMER"),
    ("doji",              "CDL_DOJI"),
    ("bullish candle",    "CDL_BULLISH"),
    ("green candle",      "CDL_BULLISH"),
    ("bearish candle",    "CDL_BEARISH"),
    ("red candle",        "CDL_BEARISH"),
]

_RESIST_WORDS = ["resistance", "swing high", "recent high", "prior high", "previous high"]
_SUPPORT_WORDS = ["support", "swing low", "recent low", "prior low", "previous low"]


def _parse_rule(rule: str, df: pd.DataFrame) -> pd.Series | None:
    """Parse one rule string into a boolean Series, or None if unrecognised."""
    parts = re.split(r'\s+AND\s+', rule, flags=re.IGNORECASE)
    if len(parts) > 1:
        subs = []
        for part in parts:
            try:
                s = _parse_rule_inner(part.strip(), df)
            except TypeError as exc:
                log.warning("  TypeError in sub-rule '%s': %s", part.strip(), exc)
                s = None
            if s is not None:
                subs.append(s.fillna(False))
        if not subs:
            return None
        result = subs[0]
        for s in subs[1:]:
            result = result & s
        return result
    try:
        return _parse_rule_inner(rule, df)
    except TypeError as exc:
        log.warning("  TypeError while evaluating rule '%s': %s", rule, exc)
        return None


def _parse_rule_inner(rule: str, df: pd.DataFrame) -> pd.Series | None:  # noqa: C901
    text = rule.lower().strip()

    # ── Take-profit / stop-loss (handled by simulator) ────────────────────
    if _TPSL_RE.search(text) and not re.match(r'^\s*entry\b', text, re.IGNORECASE):
        log.info("  rule delegated to simulator (TP/SL): '%s'", rule)
        return None

    # ── Fundamental screening ──────────────────────────────────────────────
    if _FUNDAMENTAL_RE.search(text):
        log.info("  rule skipped (fundamental data): '%s'", rule)
        return None

    # ── Position / frequency management ───────────────────────────────────
    if _POSITION_MGMT_RE.search(text):
        log.info("  rule skipped (position management): '%s'", rule)
        return None

    # ── Uncomputed indicators ──────────────────────────────────────────────
    if _NOT_COMPUTED_RE.search(text):
        log.info("  rule skipped (indicator not computed): '%s'", rule)
        return None

    # ── Optional rules ─────────────────────────────────────────────────────
    if re.match(r'^\s*optional\b', text):
        log.info("  rule skipped (optional): '%s'", rule)
        return None

    # ── Time / session-based exits ─────────────────────────────────────────
    if re.search(r'\b(end\s+of\s+(?:the\s+)?(?:intraday|session|day|trading)|'
                 r'market\s+close|eod|session\s+(?:end|close)|intraday\s+session)\b', text):
        log.info("  rule skipped (time/session-based): '%s'", rule)
        return None

    # ── VWAP cross / cross-back ────────────────────────────────────────────
    if "vwap" in text and "VWAP" in df.columns:
        f, v = df["Close"], df["VWAP"]
        if re.search(r'cross(?:es)?\s+back|cross(?:es)?\s+(?:over|above)', text):
            log.debug("  VWAP crossover → Close crosses above VWAP")
            return (f > v) & (f.shift(1) <= v.shift(1))
        if re.search(r'cross(?:es)?\s+(?:under|below)', text):
            log.debug("  VWAP crossunder → Close crosses below VWAP")
            return (f < v) & (f.shift(1) >= v.shift(1))
        if re.search(r'cross(?:es|ed|ing)?', text):
            log.debug("  VWAP cross (bidirectional)")
            return ((f > v) & (f.shift(1) <= v.shift(1))) | ((f < v) & (f.shift(1) >= v.shift(1)))

    # ── Volume spike ───────────────────────────────────────────────────────
    if re.search(r'\bvolume\s+spike|significant\s+volume|high\s+(?:relative\s+)?volume\b', text):
        vol_ma = df["Volume"].rolling(20, min_periods=1).mean()
        log.debug("  volume spike → Volume > 20-bar avg * 1.5")
        return df["Volume"] > vol_ma * 1.5

    # ── Breakout with high volume ──────────────────────────────────────────
    if re.search(r'\bbreakout\b', text) and "SWING_HIGH_20" in df.columns:
        vol_ma = df["Volume"].rolling(20, min_periods=1).mean()
        log.debug("  breakout → Close > SWING_HIGH_20 & Volume > avg")
        return (df["Close"] > df["SWING_HIGH_20"]) & (df["Volume"] > vol_ma)

    # ── Dollar volume: "Price * Volume > N" ───────────────────────────────
    if re.search(r'price\s*[\*x]\s*volume|dollar\s+volume', text):
        m = re.search(r'>\s*([\d,]+)', text)
        if m:
            threshold = float(m.group(1).replace(',', ''))
            log.debug("  dollar volume > %.0f", threshold)
            return df["Close"] * df["Volume"] > threshold

    # ── Compact operator: "A > B" or "A < B" ──────────────────────────────
    for op, cmp in (('>', lambda a, b: a > b), ('<', lambda a, b: a < b)):
        m = re.search(rf'^(.+?)\s*{re.escape(op)}\s*(.+)$', text)
        if not m:
            continue
        left_raw, right_raw = m.group(1).strip(), m.group(2).strip()
        if any(c in left_raw for c in ('*', '/', '+', '-')):
            continue
        right_clean = right_raw.replace(',', '')
        if _is_number(right_clean):
            col = _resolve_col(left_raw, df)
            if col:
                log.debug("  compact %s %s %s", col, op, right_clean)
                return cmp(df[col], float(right_clean))
        else:
            left_col  = _resolve_col(left_raw, df)
            right_col = _resolve_col(right_raw, df)
            if left_col and right_col:
                log.debug("  compact %s %s %s", left_col, op, right_col)
                return cmp(df[left_col], df[right_col])

    # ── Previous-bar breakout ──────────────────────────────────────────────
    if re.search(r'breaks?\s+(?:and\s+closes?\s+)?above\s+(?:the\s+)?(?:high|mother)', text):
        log.debug("  prev-bar breakout → Close > High.shift(1)")
        return df["Close"] > df["High"].shift(1)

    if re.search(r'breaks?\s+(?:and\s+closes?\s+)?below\s+(?:the\s+)?(?:low|mother)', text):
        log.debug("  prev-bar breakdown → Close < Low.shift(1)")
        return df["Close"] < df["Low"].shift(1)

    # ── Candlestick patterns (before condition-verb gate) ─────────────────
    for keyword, col in _PATTERNS:
        if keyword in text and col in df.columns:
            log.debug("  pattern '%s' → %s == 1", keyword, col)
            return df[col] == 1

    # ── MA cluster convergence ─────────────────────────────────────────────
    if re.search(r'\b(converg(?:ed|ing)?|cluster(?:ed)?|tightly\s+(?:together|grouped))\b', text):
        nums = sorted(set(int(n) for n in re.findall(r'\d+', text) if int(n) <= 500))
        periods = nums if len(nums) >= 2 else [3, 5, 8, 13, 21]
        ma_list = [_get_or_compute_ma(p, df) for p in periods]
        ma_list = [s for s in ma_list if s is not None]
        if len(ma_list) >= 2:
            ma_df = pd.concat(ma_list, axis=1)
            spread = (ma_df.max(axis=1) - ma_df.min(axis=1)) / df["Close"].replace(0, 1e-9)
            log.debug("  MA convergence %s → spread < 1%%", periods)
            return spread < 0.01

    # ── "Above / below the cluster" ────────────────────────────────────────
    if "cluster" in text:
        guppy = [3, 5, 8, 13, 21]
        ma_list = [_get_or_compute_ma(p, df) for p in guppy]
        ma_list = [s for s in ma_list if s is not None]
        if ma_list:
            ma_df = pd.concat(ma_list, axis=1)
            if re.search(r'\b(above|over|breaks?\s+above|close[sd]?\s+above)\b', text):
                log.debug("  above cluster → Close > max(Guppy MAs)")
                return df["Close"] > ma_df.max(axis=1)
            if re.search(r'\b(below|under|breaks?\s+below|close[sd]?\s+below)\b', text):
                log.debug("  below cluster → Close < min(Guppy MAs)")
                return df["Close"] < ma_df.min(axis=1)

    # ── Gap open ───────────────────────────────────────────────────────────
    if re.search(r'\bgap(?:s|ped|ping)?\b|opens?\s+with\s+a\s+gap', text):
        gap_pct = (df["Open"] - df["Close"].shift(1)).abs() / df["Close"].shift(1).replace(0, 1e-9)
        log.debug("  gap open → |Open − prev Close| / prev Close > 0.1%%")
        return gap_pct > 0.001

    # ── Move toward indicator ──────────────────────────────────────────────
    if re.search(r'\b(?:move?s?|moving|coming?|pull(?:back)?|return|head(?:ing)?)\s+'
                 r'(?:back\s+)?toward(?:s)?\b', text):
        col = _resolve_col(text, df)
        if col is None and "ema" in text:
            col = _resolve_col("ema", df)
        if col is None and "sma" in text:
            col = _resolve_col("sma", df)
        if col and col in df.columns:
            dist_now  = (df["Close"] - df[col]).abs()
            dist_prev = (df["Close"].shift(1) - df[col].shift(1)).abs()
            log.debug("  move toward %s → distance decreasing", col)
            return dist_now < dist_prev

    # ── Price near / touching an indicator ────────────────────────────────
    if re.search(r'\b(touch(?:es)?|come\s+(?:very\s+)?close\s+to|near|approach|close\s+to|very\s+close)\b', text):
        nums = re.findall(r'\d+', text)
        if nums:
            ma_series = _get_or_compute_ma(int(nums[0]), df)
        else:
            col = _resolve_col(text, df)
            ma_series = df[col] if col and col in df.columns else None
        if ma_series is not None:
            proximity = (df["Close"] - ma_series).abs() / df["Close"].replace(0, 1e-9)
            log.debug("  price touches/near indicator → within 0.5%%")
            return proximity < 0.005

    # ── SuperTrend direction ──────────────────────────────────────────────
    if re.search(r'\bsuper[\s-]?trend\b', text):
        dir_col = next((c for c in df.columns if c.startswith("SUPERTd_")), None)
        if dir_col is None:
            log.info("  rule skipped (SuperTrend not computed): '%s'", rule)
            return None
        direction = df[dir_col]
        if re.search(r'\b(turns?\s+green|becomes?\s+green|turns?\s+bull|flips?\s+green|goes?\s+green)\b', text):
            return (direction == 1) & (direction.shift(1) != 1)
        if re.search(r'\b(turns?\s+red|becomes?\s+red|turns?\s+bear|flips?\s+red|goes?\s+red)\b', text):
            return (direction == -1) & (direction.shift(1) != -1)
        if re.search(r'\b(is\s+green|green|bullish|above)\b', text):
            return direction == 1
        if re.search(r'\b(is\s+red|red|bearish|below)\b', text):
            return direction == -1
        if re.search(r'\bchanges?\s+(?:color|colour)\b', text):
            return direction != direction.shift(1)
        return direction == 1

    # ── Resistance / Support (before condition-verb gate) ─────────────────
    if any(w in text for w in _RESIST_WORDS):
        if "SWING_HIGH_20" in df.columns:
            if any(w in text for w in ["break", "above", "touch", "reach", "hit", "at", "exit"]):
                log.debug("  resistance → Close >= SWING_HIGH_20")
                return df["Close"] >= df["SWING_HIGH_20"]
            if any(w in text for w in ["below", "fails", "reject"]):
                return df["Close"] < df["SWING_HIGH_20"]
            return df["Close"] >= df["SWING_HIGH_20"]

    if any(w in text for w in _SUPPORT_WORDS):
        if "SWING_LOW_20" in df.columns:
            if any(w in text for w in ["break", "below", "touch", "reach", "hit", "at", "exit"]):
                log.debug("  support → Close <= SWING_LOW_20")
                return df["Close"] <= df["SWING_LOW_20"]
            if any(w in text for w in ["above", "holds", "bounce"]):
                return df["Close"] > df["SWING_LOW_20"]
            return df["Close"] <= df["SWING_LOW_20"]

    # Skip pure indicator-name strings with no condition verb
    if not _CONDITION_VERBS.search(text):
        log.debug("  skipping (no condition verb): '%s'", rule)
        return None

    # ── Price relative to N-week high / low ───────────────────────────────
    m = re.search(r'(\d+)\s*%\s+above\s+(?:the\s+)?(\d+)[\s-]week\s+(?:low|close)', text)
    if m:
        pct  = float(m.group(1)) / 100
        bars = int(m.group(2)) * 5
        actual_bars = min(bars, len(df))
        low_series = (df["Low"].expanding().min() if actual_bars < bars
                      else df["Low"].rolling(bars).min())
        return df["Close"] > low_series * (1 + pct)

    m = re.search(r'(\d+)\s*%\s+below\s+(?:the\s+)?(\d+)[\s-]week\s+(?:high|close)', text)
    if m:
        pct  = float(m.group(1)) / 100
        bars = int(m.group(2)) * 5
        actual_bars = min(bars, len(df))
        high_series = (df["High"].expanding().max() if actual_bars < bars
                       else df["High"].rolling(bars).max())
        return df["Close"] < high_series * (1 - pct)

    # ── Rising / Falling indicator ────────────────────────────────────────
    if re.search(r'\b(rising|sloping\s+up|trending\s+up|upward|slope\s+up)\b', text):
        nums = re.findall(r'\d+', text)
        ma_series = _get_or_compute_ma(int(nums[0]), df) if nums else None
        if ma_series is None:
            col = _resolve_col(text, df)
            ma_series = df[col] if col else None
        if ma_series is not None:
            return ma_series > ma_series.shift(1)

    if re.search(r'\b(falling|sloping\s+down|trending\s+down|downward|declining)\b', text):
        nums = re.findall(r'\d+', text)
        ma_series = _get_or_compute_ma(int(nums[0]), df) if nums else None
        if ma_series is None:
            col = _resolve_col(text, df)
            ma_series = df[col] if col else None
        if ma_series is not None:
            return ma_series < ma_series.shift(1)

    # ── Bidirectional cross ────────────────────────────────────────────────
    if re.search(r'cross(?:es|ed)?\s+(?:back\s+)?(?:through|past)\b', text):
        col = _resolve_col(text, df)
        if col and col in df.columns:
            f, s = df["Close"], df[col]
            return ((f > s) & (f.shift(1) <= s.shift(1))) | ((f < s) & (f.shift(1) >= s.shift(1)))

    # ── Crossover: "X crosses above Y" ───────────────────────────────────
    m = (re.search(r'(.+?)\s+cross(?:es|ed|over)?\s+(?:over\s+)?above\s+(.+)', text)
         or re.search(r'(.+?)\s+bullish\s+cross(?:over)?\s+(.+)', text))
    if m:
        slow_raw = m.group(2).strip()
        if not _is_number(slow_raw):
            fast_col = _resolve_col(m.group(1), df)
            slow_col = _resolve_col(slow_raw, df)
            if fast_col and slow_col:
                f, s = df[fast_col], df[slow_col]
                return (f > s) & (f.shift(1) <= s.shift(1))

    # ── Crossunder: "X crosses below Y" ──────────────────────────────────
    m = (re.search(r'(.+?)\s+cross(?:es|ed|under)?\s+(?:under\s+)?below\s+(.+)', text)
         or re.search(r'(.+?)\s+bearish\s+cross(?:under)?\s+(.+)', text))
    if m:
        slow_raw = m.group(2).strip()
        if not _is_number(slow_raw):
            fast_col = _resolve_col(m.group(1), df)
            slow_col = _resolve_col(slow_raw, df)
            if fast_col and slow_col:
                f, s = df[fast_col], df[slow_col]
                return (f < s) & (f.shift(1) >= s.shift(1))

    # ── Threshold: "X below/above N" ─────────────────────────────────────
    m = re.search(r'(.+?)\s+(?:\w+\s+)?(?:below|<|under|less\s+than)\s+([\d.]+)', text)
    if m:
        col = _resolve_col(m.group(1), df)
        val = float(m.group(2))
        if col:
            return df[col] < val

    m = re.search(r'(.+?)\s+(?:\w+\s+)?(?:above|>|over|greater\s+than|exceeds?)\s+([\d.]+)', text)
    if m:
        col = _resolve_col(m.group(1), df)
        val = float(m.group(2))
        if col:
            return df[col] > val

    # ── Price vs indicator ────────────────────────────────────────────────
    m = re.search(
        r'(?:price|close|stock)\s+(?:\w+\s+){0,2}(?:above|>|breaks?\s+above|trades?\s+above)\s+(?:the\s+)?(.+)',
        text,
    )
    if m:
        raw = m.group(1)
        if "both" in raw and "ema" in raw:
            cond = pd.Series([True] * len(df), index=df.index)
            for ecol in ["EMA_21", "EMA_50"]:
                if ecol in df.columns:
                    cond = cond & (df["Close"] > df[ecol])
            return cond
        col = _resolve_col(raw, df)
        if col:
            return df["Close"] > df[col]

    m = re.search(
        r'(?:price|close|stock)\s+(?:\w+\s+){0,2}(?:below|<|breaks?\s+below|trades?\s+below)\s+(?:the\s+)?(.+)',
        text,
    )
    if m:
        col = _resolve_col(m.group(1), df)
        if col:
            return df["Close"] < df[col]

    # ── MACD shortcuts ────────────────────────────────────────────────────
    if "macd" in text or "blue line" in text:
        if re.search(r'(?:reverse\s+cross(?:over)?|cross(?:es)?\s+back)', text):
            if "MACD_12_26_9" in df.columns and "MACDs_12_26_9" in df.columns:
                f, s = df["MACD_12_26_9"], df["MACDs_12_26_9"]
                return (f < s) & (f.shift(1) >= s.shift(1))
        if re.search(r'cross(?:es|ed|over)?\s+(?:above|over)\s+(?:signal|zero|red)', text):
            if "MACD_12_26_9" in df.columns and "MACDs_12_26_9" in df.columns:
                f, s = df["MACD_12_26_9"], df["MACDs_12_26_9"]
                return (f > s) & (f.shift(1) <= s.shift(1))
        if re.search(r'cross(?:es|ed|under)?\s+(?:below|under)\s+(?:signal|zero|red)', text):
            if "MACD_12_26_9" in df.columns and "MACDs_12_26_9" in df.columns:
                f, s = df["MACD_12_26_9"], df["MACDs_12_26_9"]
                return (f < s) & (f.shift(1) >= s.shift(1))
        if any(w in text for w in ["positive", "above zero", "> 0", "bullish", "turns up"]):
            col = "MACDh_12_26_9" if "MACDh_12_26_9" in df.columns else "MACD_12_26_9"
            if col in df.columns:
                return df[col] > 0
        if any(w in text for w in ["negative", "below zero", "< 0", "bearish", "turns down"]):
            col = "MACDh_12_26_9" if "MACDh_12_26_9" in df.columns else "MACD_12_26_9"
            if col in df.columns:
                return df[col] < 0

    # ── Bollinger Band shortcuts ──────────────────────────────────────────
    if any(w in text for w in ["bollinger", "band", "bb "]):
        if any(w in text for w in ["break above", "breaks above", "above upper", "touch upper"]):
            if "BBU_20_2.0" in df.columns:
                return df["Close"] > df["BBU_20_2.0"]
        if any(w in text for w in ["break below", "breaks below", "below lower", "touch lower"]):
            if "BBL_20_2.0" in df.columns:
                return df["Close"] < df["BBL_20_2.0"]

    # ── RSI named levels ─────────────────────────────────────────────────
    if "rsi" in text and "RSI_14" in df.columns:
        if any(w in text for w in ["oversold", "below 30", "< 30", "under 30"]):
            return df["RSI_14"] < 30
        if any(w in text for w in ["overbought", "above 70", "> 70", "over 70"]):
            return df["RSI_14"] > 70
        if any(w in text for w in ["above 50", "> 50", "crosses 50", "cross 50"]):
            return df["RSI_14"] > 50
        if any(w in text for w in ["below 50", "< 50"]):
            return df["RSI_14"] < 50

    # ── ADX strength shortcuts ────────────────────────────────────────────
    if "adx" in text and "ADX_14" in df.columns:
        for threshold in [25, 20, 30]:
            if f"above {threshold}" in text or f"> {threshold}" in text:
                return df["ADX_14"] > threshold

    return None  # rule unrecognised


def _detect_logic(entry_rules: list) -> str:
    """Detect if rules should be combined with OR logic (default: AND)."""
    combined = " ".join(entry_rules).lower()
    if any(w in combined for w in [" or ", "either ", "any of ", "at least one"]):
        return "OR"
    return "AND"


_LONG_PREFIX_RE = re.compile(r'^\s*(?:for\s+)?(long|buy\s*entry|buy)\s*[:\s]', re.IGNORECASE)
_SHORT_PREFIX_RE = re.compile(r'^\s*(?:for\s+)?(short|sell\s*entry|sell)\s*[:\s]', re.IGNORECASE)
_LONG_ANYWHERE_RE = re.compile(
    r'\bfor\s+(?:a\s+)?(?:long|bull(?:ish)?)\s*(?:positions?|entries?|trades?|setups?)?\b',
    re.IGNORECASE,
)
_SHORT_ANYWHERE_RE = re.compile(
    r'\bfor\s+(?:a\s+)?(?:short|bear(?:ish)?)\s*(?:positions?|entries?|trades?|setups?)?\b',
    re.IGNORECASE,
)


def _is_long_rule(rule: str) -> bool:
    return bool(_LONG_PREFIX_RE.match(rule)) or bool(_LONG_ANYWHERE_RE.search(rule))


def _is_short_rule(rule: str) -> bool:
    return bool(_SHORT_PREFIX_RE.match(rule)) or bool(_SHORT_ANYWHERE_RE.search(rule))


def _split_directional(rules: list) -> tuple[list, list, list]:
    """
    Split rules by directional prefix / suffix.
    Returns (long_rules, short_rules, neutral_rules).
    Returns ([], [], rules) when no directional markers are detected.
    """
    long_r   = [r for r in rules if _is_long_rule(r)]
    short_r  = [r for r in rules if _is_short_rule(r)]
    neutral  = [r for r in rules if not _is_long_rule(r) and not _is_short_rule(r)]
    if long_r or short_r:
        return long_r, short_r, neutral
    return [], [], rules


# ── Public helpers (used by engine.py) ───────────────────────────────────

def parse_stop_loss_pct(stop_loss_text: str) -> float | None:
    """Extract a percentage value from a stop-loss description like '2% below entry'."""
    if not stop_loss_text:
        return None
    m = re.search(r'([\d.]+)\s*%', stop_loss_text.lower())
    return float(m.group(1)) if m else None


def parse_take_profit_pct_from_rules(rules: list) -> float | None:
    """Scan a rule list for an explicit take-profit percentage."""
    for rule in rules:
        text = rule.lower()
        m = re.search(r'(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?)?\s*%\s+(?:profit|gain|upside)', text)
        if not m:
            m = re.search(r'(?:profit|gain|upside)\s+(?:level\s+|target\s+)?(?:of\s+|is\s+(?:at\s+least\s+)?)?(\d+(?:\.\d+)?)\s*%', text)
        if not m:
            m = re.search(r'upside\s+is\s+at\s+least\s+(\d+(?:\.\d+)?)', text)
        if m:
            return float(m.group(1))
    return None


def parse_stop_loss_pct_from_rules(rules: list) -> float | None:
    """Scan a rule list for an explicit stop-loss percentage."""
    for rule in rules:
        text = rule.lower()
        m = re.search(r'(?:drops?|falls?)\s+(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?)?\s*%\s+below', text)
        if not m:
            m = re.search(r'(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?)?\s*%\s+below\s+(?:the\s+)?entry', text)
        if not m:
            m = re.search(r'(?:risk|downside)\s+(?:is\s+)?capped\s+at\s+(\d+(?:\.\d+)?)', text)
        if not m:
            m = re.search(r'downside\s+risk\s+(?:is\s+)?(?:of\s+|capped\s+at\s+|limited\s+to\s+)?(\d+(?:\.\d+)?)\s*%', text)
        if m:
            return float(m.group(1))
    return None


def _generate_signals_from_rules(
    df: pd.DataFrame,
    entry_rules: list,
    exit_rules: list,
    logic: str | None = None,
) -> tuple[pd.Series, pd.Series, dict]:
    """Internal: parse rule lists into buy/sell boolean Series plus a coverage report
    (df must have Title Case OHLCV)."""
    false_s = pd.Series([False] * len(df), index=df.index)
    if logic is None:
        logic = _detect_logic(entry_rules)

    long_entry, short_entry, neutral_entry = _split_directional(entry_rules)
    has_directional = bool(long_entry or short_entry)

    if has_directional:
        log.info(
            "Rule engine — directional: %d Long + %d Short + %d neutral entry, %d exit",
            len(long_entry), len(short_entry), len(neutral_entry), len(exit_rules),
        )
    else:
        log.info(
            "Rule engine — %d entry + %d exit  (logic=%s)",
            len(entry_rules), len(exit_rules), logic,
        )

    def combine(rules: list, label: str, inner_logic: str = logic) -> tuple[pd.Series, list]:
        """Returns (combined_signal, coverage) where coverage is a list of
        {"rule": str, "status": str, "triggers": int|None} — one entry per input rule,
        so callers can see exactly which rules were understood vs silently dropped."""
        parsed = []
        coverage = []
        for rule in rules:
            sig = _parse_rule(rule, df)
            if sig is not None:
                n = int(sig.sum())
                parsed.append((rule, sig.fillna(False)))
                coverage.append({"rule": rule, "status": "parsed", "triggers": n})
                if n == 0 and inner_logic == "AND":
                    log.warning("  [%s] ⚠  '%s'  → 0 triggers", label, rule)
                else:
                    log.info("  [%s] ✓  '%s'  →  %d triggers", label, rule, n)
            else:
                rl = rule.lower()
                if _TPSL_RE.search(rl):
                    status = "delegated_tpsl"
                    log.info("  [%s] ⓘ  simulator-handled (TP/SL): '%s'", label, rule)
                elif _FUNDAMENTAL_RE.search(rl):
                    status = "skipped_fundamental"
                    log.info("  [%s] ⓘ  skipped (fundamental): '%s'", label, rule)
                elif _POSITION_MGMT_RE.search(rl):
                    status = "skipped_position_mgmt"
                    log.info("  [%s] ⓘ  skipped (position mgmt): '%s'", label, rule)
                elif _NOT_COMPUTED_RE.search(rl):
                    status = "skipped_not_computed"
                    log.info("  [%s] ⓘ  skipped (not computed): '%s'", label, rule)
                elif re.match(r'^\s*optional\b', rl):
                    status = "skipped_optional"
                    log.info("  [%s] ⓘ  skipped (optional): '%s'", label, rule)
                else:
                    status = "unparsed"
                    log.warning("  [%s] ✗  could not parse: '%s'", label, rule)
                coverage.append({"rule": rule, "status": status, "triggers": None})

        if not parsed:
            log.warning("  [%s] no rules parsed — zero signals", label)
            return false_s, coverage

        result = parsed[0][1]
        for _, s in parsed[1:]:
            result = (result | s) if inner_logic == "OR" else (result & s)

        final_n = int(result.sum())
        if final_n == 0 and inner_logic == "AND" and len(parsed) > 1:
            log.warning("  [%s] AND→0: conditions are mutually exclusive on this period", label)
        return result, coverage

    entry_coverage: list = []
    exit_coverage: list = []

    if has_directional:
        long_rules_full  = long_entry + neutral_entry
        short_rules_full = short_entry + neutral_entry
        if long_rules_full:
            buy_signals, cov = combine(long_rules_full, "ENTRY/LONG", "AND")
            entry_coverage.extend(cov)
        else:
            buy_signals = false_s
        if short_rules_full:
            short_sell, cov = combine(short_rules_full, "ENTRY/SHORT", "AND")
            entry_coverage.extend(cov)
        else:
            short_sell = false_s
        exit_sell, cov = combine(exit_rules, "EXIT")
        exit_coverage.extend(cov)
        sell_signals = exit_sell if exit_sell.any() else short_sell
    else:
        buy_signals, cov = combine(entry_rules, "ENTRY")
        entry_coverage.extend(cov)
        sell_signals, cov = combine(exit_rules, "EXIT")
        exit_coverage.extend(cov)

    log.info(
        "Rule engine complete — buy=%d  sell=%d  bars=%d",
        int(buy_signals.sum()), int(sell_signals.sum()), len(df),
    )
    coverage = {"entry": entry_coverage, "exit": exit_coverage}
    return buy_signals, sell_signals, coverage


def parse_rules_to_signals(
    df: pd.DataFrame,
    entry_rules: list,
    exit_rules: list,
) -> tuple[pd.Series, pd.Series, dict]:
    """
    Parse strategy entry/exit rule text directly into buy/sell boolean Series.
    Uses natural language pattern matching — no AI involved.
    This is the primary signal generation path for strategies scraped from
    YouTube/webpages where rules are stored as plain English strings.
    Returns (buy_signals, sell_signals, coverage) where coverage is
    {"entry": [...], "exit": [...]} — one status entry per input rule, so
    callers can see which rules were understood vs silently dropped.
    """
    # Normalise lowercase OHLCV to Title Case so all internal helpers work correctly
    _OHLCV_LOWER = {"open", "high", "low", "close", "volume"}
    rename_map = {col: col.capitalize() for col in df.columns if col in _OHLCV_LOWER}
    df_titled = df.rename(columns=rename_map) if rename_map else df

    return _generate_signals_from_rules(df_titled, entry_rules, exit_rules)
