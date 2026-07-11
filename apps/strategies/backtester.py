import logging

import pandas as pd
from typing import Any

from apps.strategies.metrics import build_trade as _build_trade, calculate_metrics as _calculate_metrics

log = logging.getLogger(__name__)


def run_backtest(
    df_with_signals: pd.DataFrame,
    initial_capital: float,
    symbol: str,
    commission_pct: float = 0.0,
    slippage_pct: float = 0.0,
) -> dict[str, Any]:
    """
    Strategy-agnostic backtester. Reads the 'signal' column (1=buy, -1=sell, 0=hold).

    Execution model (ported from old simulator.py):
      - TP/SL are checked first against the current bar's close.
      - Buy / sell signals are acted on at the current bar's close.
      - One long-only position at a time, 100 % position sizing.
      - Any open position at the last bar is force-closed (exit_reason = "period_end").

    commission_pct / slippage_pct model trading costs, applied on every fill (entry and exit):
      - slippage moves the fill price against you (buys fill higher, sells fill lower).
      - commission is charged as a % of trade notional, deducted from capital on each fill.
      Both default to 0.0, which reproduces the previous zero-cost behaviour exactly.

    stop_loss_pct / take_profit_pct are read from df.attrs if set by run_strategy_engine.

    Returns all original keys PLUS: annualized_return_pct, sortino_ratio, calmar_ratio,
    risk_reward_ratio, avg_win_pct, avg_loss_pct, avg_trade_duration_days, monthly_returns.
    Each trade_log entry includes an exit_reason field.
    """
    df = df_with_signals.copy()
    df["signal"] = df["signal"].fillna(0).astype(int)

    close_col = "Close" if "Close" in df.columns else "close"
    open_col  = "Open"  if "Open"  in df.columns else "open"
    high_col  = "High"  if "High"  in df.columns else "high"
    low_col   = "Low"   if "Low"   in df.columns else "low"

    # Price-only chart data (no structured indicator list exists for the legacy
    # natural-language rule engine — see apps/strategies/ir/executor.py for the
    # IR path, which includes indicator overlays too).
    chart_data = {
        "price": [
            {"date": str(df.index[i])[:10], "open": round(float(df[open_col].iloc[i]), 4),
             "high": round(float(df[high_col].iloc[i]), 4), "low": round(float(df[low_col].iloc[i]), 4),
             "close": round(float(df[close_col].iloc[i]), 4)}
            for i in range(len(df))
        ],
        "indicators": {},
    }

    stop_loss_pct   = df.attrs.get("stop_loss_pct")
    take_profit_pct = df.attrs.get("take_profit_pct")

    comm_frac = float(commission_pct) / 100.0
    slip_frac = float(slippage_pct) / 100.0

    def buy_fill(raw_close: float) -> float:
        return raw_close * (1 + slip_frac)

    def sell_fill(raw_close: float) -> float:
        return raw_close * (1 - slip_frac)

    log.info(
        "Backtester start — symbol=%s  bars=%d  capital=%.2f  sl=%s%%  tp=%s%%  commission=%.3f%%  slippage=%.3f%%",
        symbol, len(df), initial_capital,
        stop_loss_pct   if stop_loss_pct   is not None else "none",
        take_profit_pct if take_profit_pct is not None else "none",
        commission_pct, slippage_pct,
    )

    capital       = float(initial_capital)
    position      = 0.0
    entry_price   = 0.0
    entry_capital = 0.0   # capital committed at trade entry — pnl baseline
    entry_date    = None
    trade_log     = []
    equity_curve  = []

    buy_signals  = df["signal"] == 1
    sell_signals = df["signal"] == -1

    def close_position(exit_close: float, date_label: str, reason: str) -> tuple[float, float]:
        """Fill the exit at slippage-adjusted price, deduct commission, return (capital, pnl)."""
        exit_fill      = sell_fill(exit_close)
        proceeds       = position * exit_fill
        commission_amt = proceeds * comm_frac
        new_capital    = proceeds - commission_amt
        pnl            = new_capital - entry_capital
        trade_log.append(
            _build_trade(entry_date, date_label, entry_price, exit_fill, position, pnl, reason, type="LONG")
        )
        return new_capital, pnl

    for i in range(len(df)):
        date_label = str(df.index[i])[:10]
        close      = float(df[close_col].iloc[i])

        current_equity = capital if position == 0 else position * close
        equity_curve.append({"date": date_label, "equity": round(current_equity, 2)})

        # ── Stop-loss check ───────────────────────────────────────────────
        if position > 0 and stop_loss_pct and entry_price > 0:
            sl_price = entry_price * (1 - stop_loss_pct / 100)
            if close <= sl_price:
                capital, pnl = close_position(close, date_label, "stop_loss")
                log.info("STOP LOSS  %s @ %.4f  pnl=%.2f", date_label, close, pnl)
                position = 0.0; entry_price = 0.0; entry_capital = 0.0; entry_date = None
                equity_curve[-1]["equity"] = round(capital, 2)
                continue

        # ── Take-profit check ─────────────────────────────────────────────
        if position > 0 and take_profit_pct and entry_price > 0:
            tp_price = entry_price * (1 + take_profit_pct / 100)
            if close >= tp_price:
                capital, pnl = close_position(close, date_label, "take_profit")
                log.info("TAKE PROFIT  %s @ %.4f  pnl=%.2f", date_label, close, pnl)
                position = 0.0; entry_price = 0.0; entry_capital = 0.0; entry_date = None
                equity_curve[-1]["equity"] = round(capital, 2)
                continue

        # ── Buy signal ────────────────────────────────────────────────────
        if bool(buy_signals.iloc[i]) and position == 0 and capital > 0:
            entry_fill          = buy_fill(close)
            commission_amt      = capital * comm_frac
            capital_after_comm  = capital - commission_amt
            position            = capital_after_comm / entry_fill
            entry_price         = entry_fill
            entry_capital       = capital
            entry_date          = date_label
            capital             = 0.0
            log.info("BUY   %s @ %.4f  qty=%.4f", date_label, entry_fill, position)

        # ── Sell signal ───────────────────────────────────────────────────
        elif bool(sell_signals.iloc[i]) and position > 0:
            capital, pnl = close_position(close, date_label, "signal")
            log.info("SELL  %s @ %.4f  pnl=%.2f", date_label, close, pnl)
            position = 0.0; entry_price = 0.0; entry_capital = 0.0; entry_date = None
            equity_curve[-1]["equity"] = round(capital, 2)

    # ── Force-close any open position at period end ───────────────────────
    if position > 0:
        close      = float(df[close_col].iloc[-1])
        date_label = str(df.index[-1])[:10]
        capital, pnl = close_position(close, date_label, "period_end")
        log.info("PERIOD END  %s @ %.4f  pnl=%.2f", date_label, close, pnl)
        if equity_curve:
            equity_curve[-1]["equity"] = round(capital, 2)

    # ── Drawdown series ───────────────────────────────────────────────────
    equities   = [e["equity"] for e in equity_curve]
    equity_s   = pd.Series(equities, dtype=float)
    peak_s     = equity_s.cummax()
    dd_pct     = (equity_s - peak_s) / peak_s.replace(0, 1) * 100
    drawdown_series = [
        {"date": equity_curve[i]["date"], "drawdown": round(float(dd_pct.iloc[i]), 4)}
        for i in range(len(equity_curve))
    ]

    # ── Metrics ───────────────────────────────────────────────────────────
    start_date = str(df.index[0])[:10]  if len(df) > 0 else ""
    end_date   = str(df.index[-1])[:10] if len(df) > 0 else ""
    metrics    = _calculate_metrics(equity_curve, trade_log, initial_capital, start_date, end_date)

    log.info(
        "Backtest complete — trades=%d  return=%.2f%%  sharpe=%.3f  maxDD=%.2f%%",
        metrics["total_trades"], metrics["total_return_pct"],
        metrics["sharpe_ratio"], metrics["max_drawdown_pct"],
    )

    return {
        "symbol": symbol,
        # ── Original keys (unchanged) ──────────────────────────────────────
        "total_trades":        metrics["total_trades"],
        "winning_trades":      metrics["winning_trades"],
        "losing_trades":       metrics["losing_trades"],
        "win_rate":            metrics["win_rate"],
        "total_return_pct":    metrics["total_return_pct"],
        "max_drawdown_pct":    metrics["max_drawdown_pct"],
        "sharpe_ratio":        metrics["sharpe_ratio"],
        "profit_factor":       metrics["profit_factor"],
        "avg_trade_return_pct": metrics["avg_trade_return_pct"],
        "best_trade_pct":      metrics["best_trade_pct"],
        "worst_trade_pct":     metrics["worst_trade_pct"],
        "equity_curve":        equity_curve,
        "drawdown_series":     drawdown_series,
        "trade_log":           trade_log,
        # ── New keys ──────────────────────────────────────────────────────
        "annualized_return_pct":   metrics["annualized_return_pct"],
        "sortino_ratio":           metrics["sortino_ratio"],
        "calmar_ratio":            metrics["calmar_ratio"],
        "risk_reward_ratio":       metrics["risk_reward_ratio"],
        "avg_win_pct":             metrics["avg_win_pct"],
        "avg_loss_pct":            metrics["avg_loss_pct"],
        "avg_trade_duration_days": metrics["avg_trade_duration_days"],
        "monthly_returns":         metrics["monthly_returns"],
        "rule_coverage":           df_with_signals.attrs.get("rule_coverage"),
        "chart_data":              chart_data,
    }


# Metrics math (build_trade / calculate_metrics / avg_duration / monthly_returns)
# now lives in apps/strategies/metrics.py, shared with the IR executor.
