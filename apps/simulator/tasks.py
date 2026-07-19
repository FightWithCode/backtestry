import datetime
import logging

from celery import shared_task
from django.utils import timezone

from apps.strategies.timeframe import resolve_timeframe
from apps.backtests.tasks import _fetch_ohlcv, _parse_symbols
from apps.screener.tasks import _adapt_symbol_for_provider

logger = logging.getLogger(__name__)

WARMUP_DAYS = 250  # extra history fetched before start_date so indicators aren't NaN at the sim's start


@shared_task(bind=True, max_retries=0)
def run_simulator_task(self, simulator_run_id: str):
    """
    Fetches every symbol's OHLCV (with a warmup buffer before start_date so
    indicators are primed) and hands them all to apps/simulator/engine.py,
    which runs the actual single-position walk-forward simulation. An
    individual symbol failing to fetch doesn't fail the run — it's just
    excluded from the universe actually simulated, same rationale as the
    screener (expected for some fraction of a large universe).
    """
    from .models import SimulatorRun
    from .engine import run_simulation

    try:
        run = SimulatorRun.objects.select_related("strategy").get(pk=simulator_run_id)
    except SimulatorRun.DoesNotExist:
        logger.error("SimulatorRun %s not found", simulator_run_id)
        return

    run.status = "running"
    run.save(update_fields=["status"])

    from apps.appsettings.models import get_data_provider
    provider = get_data_provider().lower()

    symbols = _parse_symbols(run.symbols)
    interval = resolve_timeframe(run.timeframe or run.strategy.timeframe)
    fetch_start = run.start_date - datetime.timedelta(days=WARMUP_DAYS)

    logger.info(
        "SimulatorRun %s - strategy='%s' symbols=%d %s->%s interval=%s provider=%s capital=%.2f risk=%.2f%%",
        simulator_run_id, run.strategy.name, len(symbols), run.start_date, run.end_date,
        interval, provider, run.initial_capital, run.risk_pct,
    )

    fetched, failed = 0, []
    symbol_data = {}

    try:
        for symbol in symbols:
            fetch_symbol = _adapt_symbol_for_provider(symbol, provider)
            try:
                df = _fetch_ohlcv(fetch_symbol, fetch_start, run.end_date, interval)
                symbol_data[fetch_symbol] = df
                fetched += 1
            except Exception:
                logger.exception("[%s] simulator data fetch failed - excluding from universe", fetch_symbol)
                failed.append(fetch_symbol)

        if fetched == 0:
            raise RuntimeError(f"All {len(failed)} symbol(s) failed to fetch: {failed[:10]}")

        result = run_simulation(
            symbol_data, run.base_config, run.initial_capital, run.risk_pct, run.start_date,
            commission_pct=run.commission_pct, slippage_pct=run.slippage_pct,
        )

        # Symbols excluded inside the engine (e.g. too little history for a declared
        # indicator, like an EMA(50) on a stock with <50 bars) are reported the same
        # way as a fetch failure — both mean "didn't make it into the simulation".
        run.symbols_fetched = fetched
        run.symbols_failed = failed + result.get("excluded_symbols", [])
        run.symbols_traded = result["symbols_traded"]
        run.final_capital = result["final_capital"]
        run.total_trades = result["total_trades"]
        run.winning_trades = result["winning_trades"]
        run.losing_trades = result["losing_trades"]
        run.win_rate = result["win_rate"]
        run.total_return_pct = result["total_return_pct"]
        run.annualized_return_pct = result["annualized_return_pct"]
        run.max_drawdown_pct = result["max_drawdown_pct"]
        run.sharpe_ratio = result["sharpe_ratio"]
        run.sortino_ratio = result["sortino_ratio"]
        run.calmar_ratio = result["calmar_ratio"]
        run.profit_factor = result["profit_factor"]
        run.avg_trade_return_pct = result["avg_trade_return_pct"]
        run.best_trade_pct = result["best_trade_pct"]
        run.worst_trade_pct = result["worst_trade_pct"]
        run.avg_win_pct = result["avg_win_pct"]
        run.avg_loss_pct = result["avg_loss_pct"]
        run.risk_reward_ratio = result["risk_reward_ratio"]
        run.avg_trade_duration_days = result["avg_trade_duration_days"]
        run.equity_curve = result["equity_curve"]
        run.drawdown_series = result["drawdown_series"]
        run.trade_log = result["trade_log"]
        run.monthly_returns = result["monthly_returns"]
        run.status = "completed"
        run.completed_at = timezone.now()
        run.save()

        logger.info(
            "=== SimulatorRun %s completed - fetched=%d failed=%d trades=%d final_capital=%.2f return=%.2f%% ===",
            simulator_run_id, fetched, len(failed), result["total_trades"],
            result["final_capital"], result["total_return_pct"],
        )

    except Exception as exc:
        logger.exception("=== SimulatorRun %s FAILED: %s ===", simulator_run_id, exc)
        try:
            run.status = "failed"
            run.error = str(exc)
            # Persist what fetching actually accomplished even on failure, so the
            # error isn't the only clue — e.g. "487/500 fetched fine, the failure
            # was in the simulation logic, not the data" vs. "0/500 fetched".
            run.symbols_fetched = fetched
            run.symbols_failed = failed
            run.save(update_fields=["status", "error", "symbols_fetched", "symbols_failed"])
        except Exception:
            pass
