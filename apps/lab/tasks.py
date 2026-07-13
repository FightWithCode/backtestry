import logging

from celery import shared_task
from django.utils import timezone

from apps.strategies.timeframe import resolve_timeframe
from apps.backtests.tasks import _fetch_ohlcv, _parse_symbols

logger = logging.getLogger(__name__)

_EXTRA_METRIC_KEYS = (
    "annualized_return_pct", "sortino_ratio", "calmar_ratio",
    "risk_reward_ratio", "avg_win_pct", "avg_loss_pct",
    "avg_trade_duration_days", "monthly_returns",
)


@shared_task(bind=True, max_retries=0)
def run_lab_task(self, lab_run_id: str):
    """
    Runs every (symbol, variant) combination for a LabRun.

    OHLCV is fetched once per unique symbol and reused across all variants of
    that symbol — only the resolved IR config differs per variant, so there's
    no reason to re-hit yfinance per combination.
    """
    from .models import LabRun, LabResult
    from apps.strategies.ir.executor import run_ir_backtest

    try:
        run = LabRun.objects.select_related("strategy").get(pk=lab_run_id)
    except LabRun.DoesNotExist:
        logger.error("LabRun %s not found", lab_run_id)
        return

    run.status = "running"
    run.save(update_fields=["status"])

    symbols = _parse_symbols(run.symbols)
    interval = resolve_timeframe(run.timeframe or run.strategy.timeframe)
    variants = list(run.variants.all())

    logger.info(
        "LabRun %s - strategy='%s' symbols=%s variants=%d interval=%s",
        lab_run_id, run.strategy.name, symbols, len(variants), interval,
    )

    succeeded, failed = 0, []

    try:
        dfs = {}
        for symbol in symbols:
            try:
                dfs[symbol] = _fetch_ohlcv(symbol, run.start_date, run.end_date, interval)
            except Exception:
                logger.exception("[%s] OHLCV fetch failed - skipping symbol for all variants", symbol)
                failed.append(symbol)

        for symbol, df in dfs.items():
            for variant in variants:
                try:
                    metrics = run_ir_backtest(
                        df, variant.resolved_config, run.initial_capital, symbol,
                        commission_pct=run.commission_pct,
                        slippage_pct=run.slippage_pct,
                    )
                    LabResult.objects.create(
                        variant=variant,
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
                        chart_data=metrics.get("chart_data") or {},
                        extra_metrics={k: metrics.get(k) for k in _EXTRA_METRIC_KEYS},
                    )
                    succeeded += 1
                except Exception:
                    logger.exception(
                        "[%s] variant %d ('%s') failed - skipping",
                        symbol, variant.index, variant.label,
                    )
                    failed.append(f"{symbol}:{variant.label}")

        if succeeded == 0:
            raise RuntimeError(f"All {len(failed)} (symbol, variant) combination(s) failed: {failed[:10]}")

        run.status = "completed"
        run.completed_at = timezone.now()
        run.save(update_fields=["status", "completed_at"])
        logger.info("=== LabRun %s completed - ok=%d failed=%d ===", lab_run_id, succeeded, len(failed))

    except Exception as exc:
        logger.exception("=== LabRun %s FAILED: %s ===", lab_run_id, exc)
        try:
            run.status = "failed"
            run.error = str(exc)
            run.save(update_fields=["status", "error"])
        except Exception:
            pass
