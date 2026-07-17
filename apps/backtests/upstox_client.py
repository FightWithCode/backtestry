"""
Upstox v3 Historical/Intraday Candle Data client.

Docs:
  https://upstox.com/developer/api-documentation/v3/get-historical-candle-data
  https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data

Upstox only covers Indian exchanges (NSE/BSE), and its API is keyed by
`instrument_key` (e.g. "NSE_EQ|INE002A01018"), not by trading symbol — so
symbols like "RELIANCE.NS" have to be resolved through Upstox's daily
instrument master file before they can be requested. This module handles
that resolution (with an on-disk cache) plus the candle fetch + response ->
DataFrame conversion, and is used as a drop-in alternative to
`_fetch_ohlcv_yfinance` in apps/backtests/tasks.py when DATA_PROVIDER=upstox.
"""

import datetime as dt
import gzip
import json
import logging
import os
import tempfile
import threading
import time
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://api.upstox.com/v3"
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))

INSTRUMENT_MASTER_URLS = {
    "NSE": "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
    "BSE": "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz",
}
INSTRUMENT_CACHE_TTL_SECONDS = 24 * 3600  # instrument master refreshes ~daily at Upstox

# yfinance-style interval (see apps/strategies/timeframe.py) -> Upstox (unit, interval, max_lookback_days)
# Lookback limits per https://upstox.com/developer/api-documentation/v3/get-historical-candle-data:
#   minutes 1-15  -> 1 month;  minutes >15 / hours -> 1 quarter;  days -> 1 decade;  weeks/months -> unlimited
INTERVAL_MAP = {
    "1m":  ("minutes", "1",  30),
    "5m":  ("minutes", "5",  30),
    "15m": ("minutes", "15", 30),
    "30m": ("minutes", "30", 90),
    "1h":  ("hours",   "1",  90),
    "4h":  ("hours",   "4",  90),
    "1d":  ("days",    "1",  3650),
    "1wk": ("weeks",   "1",  None),
    "1mo": ("months",  "1",  None),
}


class UpstoxAPIError(Exception):
    pass


_instrument_cache = {}
_instrument_cache_lock = threading.Lock()


def _cache_file_path(exchange: str) -> str:
    return os.path.join(tempfile.gettempdir(), f"upstox_instruments_{exchange}.json")


def _load_instrument_map(exchange: str) -> dict:
    """trading_symbol -> instrument_key for equities on `exchange`, cached in memory
    and on disk for INSTRUMENT_CACHE_TTL_SECONDS to avoid re-downloading the (~2-20MB
    gzipped) instrument master on every symbol lookup."""
    with _instrument_cache_lock:
        cached = _instrument_cache.get(exchange)
        if cached and time.time() - cached["loaded_at"] < INSTRUMENT_CACHE_TTL_SECONDS:
            return cached["data"]

        records = None
        cache_file = _cache_file_path(exchange)
        if os.path.exists(cache_file) and time.time() - os.path.getmtime(cache_file) < INSTRUMENT_CACHE_TTL_SECONDS:
            try:
                with open(cache_file) as f:
                    records = json.load(f)
            except (OSError, ValueError):
                records = None

        if records is None:
            url = INSTRUMENT_MASTER_URLS.get(exchange)
            if not url:
                raise UpstoxAPIError(f"No Upstox instrument master configured for exchange '{exchange}'")
            logger.info("Downloading Upstox instrument master for %s …", exchange)
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            records = json.loads(gzip.decompress(resp.content))
            try:
                with open(cache_file, "w") as f:
                    json.dump(records, f)
            except OSError:
                pass  # disk cache is best-effort; in-memory cache still applies

        symbol_map = {
            rec["trading_symbol"].upper(): rec["instrument_key"]
            for rec in records
            if rec.get("instrument_type") == "EQ" and rec.get("trading_symbol") and rec.get("instrument_key")
        }
        _instrument_cache[exchange] = {"data": symbol_map, "loaded_at": time.time()}
        logger.info("Upstox instrument master for %s loaded — %d equities", exchange, len(symbol_map))
        return symbol_map


def resolve_instrument_key(symbol: str) -> str:
    """
    "RELIANCE.NS" -> NSE, "RELIANCE.BO" -> BSE, bare "RELIANCE" -> NSE (matches
    this project's default exchange convention, see apps/screener/utils.py).
    A symbol already containing "|" is assumed to be a raw instrument_key and
    passed through unchanged.
    """
    symbol = symbol.strip().upper()
    if "|" in symbol:
        return symbol

    if symbol.endswith(".NS"):
        exchange, base = "NSE", symbol[:-3]
    elif symbol.endswith(".BO"):
        exchange, base = "BSE", symbol[:-3]
    else:
        exchange, base = "NSE", symbol

    instrument_key = _load_instrument_map(exchange).get(base)
    if not instrument_key:
        raise UpstoxAPIError(
            f"'{symbol}' not found in Upstox's {exchange} instrument master "
            f"— Upstox only covers Indian exchanges (NSE/BSE)"
        )
    return instrument_key


def _access_token() -> str:
    from apps.appsettings.models import get_upstox_access_token
    token = get_upstox_access_token()
    if not token:
        raise UpstoxAPIError(
            "UPSTOX_ACCESS_TOKEN is not set. Generate a daily access token via the Upstox "
            "OAuth login flow and set it in .env — Upstox access tokens expire every day "
            "around 3:30am IST."
        )
    return token


def _get(path: str) -> list:
    url = f"{BASE_URL}{path}"
    resp = requests.get(
        url,
        headers={"Authorization": f"Bearer {_access_token()}", "Accept": "application/json"},
        timeout=30,
    )
    if resp.status_code == 401:
        raise UpstoxAPIError(
            "Upstox access token is invalid or expired — generate a new one "
            "(tokens expire daily at ~3:30am IST)."
        )
    try:
        payload = resp.json()
    except ValueError:
        resp.raise_for_status()
        raise UpstoxAPIError(f"Upstox returned a non-JSON response (HTTP {resp.status_code})")

    if resp.status_code >= 400 or payload.get("status") != "success":
        raise UpstoxAPIError(f"Upstox API error (HTTP {resp.status_code}): {payload.get('errors') or payload}")

    return payload.get("data", {}).get("candles", [])


def _candles_to_df(candles: list):
    import pandas as pd

    if not candles:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

    df = pd.DataFrame(
        [(c[0], c[1], c[2], c[3], c[4], c[5]) for c in candles],
        columns=["timestamp", "open", "high", "low", "close", "volume"],
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.set_index("timestamp").sort_index()
    return df


def fetch_candles(symbol: str, start_date, end_date, interval: str):
    """Same contract as `_fetch_ohlcv_yfinance` in apps/backtests/tasks.py: returns a
    DatetimeIndex-sorted DataFrame with lowercase open/high/low/close/volume columns."""
    import pandas as pd

    if interval not in INTERVAL_MAP:
        raise UpstoxAPIError(
            f"Unsupported interval '{interval}' for Upstox provider — supported: {sorted(INTERVAL_MAP)}"
        )
    unit, unit_interval, max_lookback_days = INTERVAL_MAP[interval]
    instrument_key = resolve_instrument_key(symbol)

    start = pd.Timestamp(start_date).date()
    end = pd.Timestamp(end_date).date()

    if max_lookback_days is not None:
        min_start = end - dt.timedelta(days=max_lookback_days)
        if start < min_start:
            logger.warning(
                "[%s] Upstox lookback limit: clamping start %s → %s (max %d days for unit=%s interval=%s)",
                symbol, start, min_start, max_lookback_days, unit, unit_interval,
            )
            start = min_start

    logger.info(
        "[%s] Fetching Upstox candles — instrument_key=%s unit=%s interval=%s  %s → %s",
        symbol, instrument_key, unit, unit_interval, start, end,
    )
    t0 = time.perf_counter()

    quoted_key = quote(instrument_key, safe="")
    candles = _get(f"/historical-candle/{quoted_key}/{unit}/{unit_interval}/{end.isoformat()}/{start.isoformat()}")

    # The historical endpoint only covers completed trading days — today's data (for
    # sub-daily intervals) has to come from the separate intraday endpoint.
    today_ist = dt.datetime.now(IST).date()
    if unit in ("minutes", "hours") and end >= today_ist:
        try:
            candles = candles + _get(f"/historical-candle/intraday/{quoted_key}/{unit}/{unit_interval}")
        except UpstoxAPIError:
            logger.warning("[%s] Upstox intraday candle fetch failed — using historical data only", symbol)

    elapsed = time.perf_counter() - t0
    df = _candles_to_df(candles)
    df = df[~df.index.duplicated(keep="last")].dropna()

    if df.empty:
        raise ValueError(f"[{symbol}] Upstox returned no data for interval={interval} {start} → {end}")

    logger.info(
        "[%s] Upstox OHLCV fetched — %d bars  first=%s  last=%s  (%.2fs)",
        symbol, len(df), str(df.index[0])[:10], str(df.index[-1])[:10], elapsed,
    )
    return df
