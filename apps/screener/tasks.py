import datetime
import logging

from celery import shared_task
from django.utils import timezone

from apps.strategies.timeframe import resolve_timeframe
from apps.backtests.tasks import _fetch_ohlcv, _parse_symbols

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def run_screener_task(self, screener_run_id: str):
    """
    Scans every symbol in the run against the strategy's entries, evaluated
    only at the latest available bar (see apps/screener/scan.py). Unlike a
    backtest, an individual symbol failing (delisted, insufficient history,
    no data for the date range) doesn't fail the run — it's just skipped and
    recorded in symbols_failed, since that's the normal, expected outcome for
    some fraction of a few-hundred-symbol universe.
    """
    from .models import ScreenerRun, ScreenerSignal
    from .scan import scan_symbol

    try:
        run = ScreenerRun.objects.select_related("strategy").get(pk=screener_run_id)
    except ScreenerRun.DoesNotExist:
        logger.error("ScreenerRun %s not found", screener_run_id)
        return

    run.status = "running"
    run.save(update_fields=["status"])

    symbols = _parse_symbols(run.symbols)
    interval = resolve_timeframe(run.timeframe or run.strategy.timeframe)
    start_date = run.as_of_date - datetime.timedelta(days=run.lookback_days)

    logger.info(
        "ScreenerRun %s - strategy='%s' symbols=%d as_of=%s interval=%s",
        screener_run_id, run.strategy.name, len(symbols), run.as_of_date, interval,
    )

    scanned, found, failed = 0, 0, []

    try:
        for symbol in symbols:
            try:
                df = _fetch_ohlcv(symbol, start_date, run.as_of_date, interval)
                signals = scan_symbol(df, run.base_config, symbol)
                scanned += 1
                for sig in signals:
                    ScreenerSignal.objects.create(run=run, **sig)
                    found += 1
            except Exception:
                logger.exception("[%s] screener scan failed - skipping", symbol)
                failed.append(symbol)

        if scanned == 0 and failed:
            raise RuntimeError(f"All {len(failed)} symbol(s) failed to scan: {failed[:10]}")

        run.symbols_scanned = scanned
        run.symbols_failed = failed
        run.signals_found = found
        run.status = "completed"
        run.completed_at = timezone.now()
        run.save(update_fields=[
            "symbols_scanned", "symbols_failed", "signals_found", "status", "completed_at",
        ])
        logger.info(
            "=== ScreenerRun %s completed - scanned=%d found=%d failed=%d ===",
            screener_run_id, scanned, found, len(failed),
        )

    except Exception as exc:
        logger.exception("=== ScreenerRun %s FAILED: %s ===", screener_run_id, exc)
        try:
            run.status = "failed"
            run.error = str(exc)
            run.save(update_fields=["status", "error"])
        except Exception:
            pass
