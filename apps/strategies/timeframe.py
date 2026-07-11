TIMEFRAME_MAP = {
    "1min": "1m",  "1m": "1m",  "1minute": "1m",
    "5min": "5m",  "5m": "5m",  "5minute": "5m",
    "15min": "15m", "15m": "15m", "15minute": "15m",
    "30min": "30m", "30m": "30m", "30minute": "30m",
    "1h": "1h",  "1hour": "1h", "hourly": "1h", "60min": "1h",
    "4h": "4h",  "4hour": "4h",
    "daily": "1d", "1d": "1d", "1day": "1d", "day": "1d",
    "weekly": "1wk", "1w": "1wk", "1week": "1wk", "week": "1wk", "1wk": "1wk",
    "monthly": "1mo", "1mo": "1mo", "month": "1mo",
}


def resolve_timeframe(strategy_timeframe: str, default: str = "1d") -> str:
    if not strategy_timeframe:
        return default
    return TIMEFRAME_MAP.get(strategy_timeframe.lower().strip(), default)
