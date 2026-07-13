import logging
import time
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from apps.strategies.timeframe import resolve_timeframe

logger = logging.getLogger(__name__)

INTRADAY_INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"}
MAX_INTRADAY_DAYS = 59


def _parse_symbols(raw: list) -> list[str]:
    """
    Normalise the symbols list: expand any comma-separated entries, uppercase,
    strip whitespace, and deduplicate while preserving order.
    Handles both ["AAPL,MSFT"] and ["AAPL", "MSFT"] transparently.
    """
    result, seen = [], set()
    for item in raw:
        for sym in str(item).split(","):
            sym = sym.strip().upper()
            if sym and sym not in seen:
                result.append(sym)
                seen.add(sym)
    return result


def _fetch_ohlcv(symbol: str, start_date, end_date, interval: str):
    import yfinance as yf
    import pandas as pd

    start = pd.Timestamp(start_date)
    end   = pd.Timestamp(end_date)

    if interval in INTRADAY_INTERVALS:
        max_start = end - timedelta(days=MAX_INTRADAY_DAYS)
        if start < max_start:
            logger.warning(
                "[%s] Intraday limit: clamping start %s → %s (max %d days back for %s)",
                symbol, start.date(), max_start.date(), MAX_INTRADAY_DAYS, interval,
            )
            start = max_start

    logger.info(
        "[%s] Fetching OHLCV — interval=%s  %s → %s",
        symbol, interval, start.date(), end.date(),
    )
    t0 = time.perf_counter()
    ticker = yf.Ticker(symbol)
    df = ticker.history(start=start, end=end, interval=interval)
    elapsed = time.perf_counter() - t0

    if df.empty:
        raise ValueError(
            f"[{symbol}] yfinance returned no data for interval={interval} "
            f"{start.date()} → {end.date()}"
        )

    df.columns = [c.lower() for c in df.columns]
    df = df[["open", "high", "low", "close", "volume"]].copy()
    df = df.dropna()
    df.index = pd.to_datetime(df.index)

    logger.info(
        "[%s] OHLCV fetched — %d bars  first=%s  last=%s  (%.2fs)",
        symbol, len(df),
        str(df.index[0])[:10], str(df.index[-1])[:10],
        elapsed,
    )
    return df


@shared_task(bind=True, max_retries=0)
def run_backtest_task(self, backtest_run_id: str):
    """
    Celery task: run a backtest across one or more symbols.

    Flow:
      1. Load BacktestRun and mark as "running"
      2. Resolve timeframe → yfinance interval
      3. For each symbol: fetch OHLCV → run strategy engine → run backtester → save result
      4. Mark as "completed"; on any unhandled exception mark as "failed"
    """
    import json
    from .models import BacktestRun, BacktestResult
    from apps.strategies.engine import run_strategy_engine
    from apps.strategies.backtester import run_backtest
    from apps.strategies.ir.executor import run_ir_backtest

    task_start = time.perf_counter()
    logger.info("=== BacktestRun %s — task started ===", backtest_run_id)

    # ── Load run ──────────────────────────────────────────────────────────
    try:
        run = BacktestRun.objects.get(pk=backtest_run_id)
    except BacktestRun.DoesNotExist:
        logger.error("BacktestRun %s not found — aborting", backtest_run_id)
        return

    strategy = run.strategy
    symbols  = _parse_symbols(run.symbols)

    logger.info(
        "BacktestRun %s — strategy='%s'  symbols=%s  %s → %s  capital=%.2f",
        backtest_run_id, strategy.name, symbols,
        run.start_date, run.end_date, run.initial_capital,
    )

    run.status = "running"
    run.save(update_fields=["status"])

    try:
        # ── Validate + parse config ───────────────────────────────────────
        if not strategy.backtest_script:
            raise ValueError(f"Strategy '{strategy.name}' has no backtest config")

        config   = json.loads(strategy.backtest_script)
        interval = resolve_timeframe(run.timeframe or strategy.timeframe)
        is_ir    = "entries" in config and "indicators" in config

        if is_ir:
            path_label = "IR (structured)"
        elif config.get("entry_rules"):
            path_label = "A (natural-language rules)"
        else:
            path_label = "B (structured conditions)"

        logger.info(
            "BacktestRun %s — timeframe='%s'%s → interval='%s'  path=%s",
            backtest_run_id, run.timeframe or strategy.timeframe,
            "" if run.timeframe else " (strategy default)", interval, path_label,
        )

        succeeded, failed_symbols = 0, []

        # ── Per-symbol loop ───────────────────────────────────────────────
        for idx, symbol in enumerate(symbols, 1):
            sym_start = time.perf_counter()
            logger.info(
                "--- [%d/%d] %s — starting ---",
                idx, len(symbols), symbol,
            )

            try:
                # 1. Fetch
                df = _fetch_ohlcv(symbol, run.start_date, run.end_date, interval)

                # 2. Run the backtest — IR path executes its own stateful loop directly;
                #    legacy Path A/B still goes through run_strategy_engine → run_backtest.
                t0 = time.perf_counter()
                if is_ir:
                    logger.info("[%s] Running IR executor …", symbol)
                    metrics = run_ir_backtest(
                        df, config, run.initial_capital, symbol,
                        commission_pct=run.commission_pct,
                        slippage_pct=run.slippage_pct,
                    )
                else:
                    logger.info("[%s] Running strategy engine …", symbol)
                    df_with_signals = run_strategy_engine(df, config)
                    buy_n  = int((df_with_signals["signal"] == 1).sum())
                    sell_n = int((df_with_signals["signal"] == -1).sum())
                    logger.info(
                        "[%s] Strategy engine done — buy_signals=%d  sell_signals=%d  bars=%d",
                        symbol, buy_n, sell_n, len(df_with_signals),
                    )
                    logger.info("[%s] Running backtester …", symbol)
                    metrics = run_backtest(
                        df_with_signals, run.initial_capital, symbol,
                        commission_pct=run.commission_pct,
                        slippage_pct=run.slippage_pct,
                    )
                logger.info(
                    "[%s] Backtest done (%.2fs) — trades=%d  win_rate=%.1f%%  "
                    "return=%.2f%%  maxDD=%.2f%%  sharpe=%.3f",
                    symbol, time.perf_counter() - t0,
                    metrics["total_trades"], metrics["win_rate"],
                    metrics["total_return_pct"], metrics["max_drawdown_pct"],
                    metrics["sharpe_ratio"],
                )

                # 4. Persist result
                BacktestResult.objects.create(
                    run=run,
                    symbol=symbol,
                    total_trades=metrics["total_trades"],
                    winning_trades=metrics["winning_trades"],
                    losing_trades=metrics["losing_trades"],
                    win_rate=metrics["win_rate"],
                    total_return_pct=metrics["total_return_pct"],
                    max_drawdown_pct=metrics["max_drawdown_pct"],
                    sharpe_ratio=metrics["sharpe_ratio"],
                    profit_factor=metrics["profit_factor"],
                    avg_trade_return_pct=metrics["avg_trade_return_pct"],
                    best_trade_pct=metrics["best_trade_pct"],
                    worst_trade_pct=metrics["worst_trade_pct"],
                    equity_curve=metrics["equity_curve"],
                    drawdown_series=metrics["drawdown_series"],
                    trade_log=metrics["trade_log"],
                    signal_coverage=metrics.get("rule_coverage") or {},
                    chart_data=metrics.get("chart_data") or {},
                )

                sym_elapsed = time.perf_counter() - sym_start
                logger.info(
                    "--- [%d/%d] %s — completed in %.2fs ---",
                    idx, len(symbols), symbol, sym_elapsed,
                )
                succeeded += 1

            except Exception as sym_exc:
                logger.exception(
                    "[%s] Failed — skipping symbol (run continues): %s",
                    symbol, sym_exc,
                )
                failed_symbols.append(symbol)

        # ── Finalise run ──────────────────────────────────────────────────
        total_elapsed = time.perf_counter() - task_start

        if succeeded == 0 and failed_symbols:
            # Every symbol failed — treat the whole run as failed
            raise RuntimeError(
                f"All {len(failed_symbols)} symbol(s) failed: {failed_symbols}"
            )

        run.status       = "completed"
        run.completed_at = timezone.now()
        run.save(update_fields=["status", "completed_at"])

        if failed_symbols:
            logger.warning(
                "=== BacktestRun %s — completed with partial failures "
                "(ok=%d  failed=%d: %s)  total=%.2fs ===",
                backtest_run_id, succeeded, len(failed_symbols),
                failed_symbols, total_elapsed,
            )
        else:
            logger.info(
                "=== BacktestRun %s — completed successfully "
                "(%d symbol(s) in %.2fs) ===",
                backtest_run_id, succeeded, total_elapsed,
            )

    except Exception as exc:
        total_elapsed = time.perf_counter() - task_start
        logger.exception(
            "=== BacktestRun %s — FAILED after %.2fs: %s ===",
            backtest_run_id, total_elapsed, exc,
        )
        try:
            run.status = "failed"
            run.error  = str(exc)
            run.save(update_fields=["status", "error"])
        except Exception:
            pass
