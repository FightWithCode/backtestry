"""
Shared trade/equity metrics math, used by both the legacy signal-column
backtester (backtester.py) and the IR's stateful executor (ir/executor.py)
so the two engines report performance numbers the same way.
"""
import math

import numpy as np
import pandas as pd


def build_trade(entry_date, exit_date, entry_price, exit_price, qty, pnl, reason, **extra) -> dict:
    """Base trade dict consumed by calculate_metrics(). Extra fields (type, tag, ...)
    from callers are merged in and ignored by the metrics math below."""
    return_pct = ((exit_price / entry_price) - 1) * 100 if entry_price else 0.0
    trade = {
        "entry_date":   entry_date,
        "exit_date":    exit_date,
        "entry_price":  round(entry_price, 4),
        "exit_price":   round(exit_price, 4),
        "return_pct":   round(return_pct, 4),
        "pnl":          round(pnl, 2),
        "exit_reason":  reason,
    }
    trade.update(extra)
    return trade


def calculate_metrics(
    equity_curve: list,
    trades: list,
    initial_capital: float,
    start_date: str,
    end_date: str,
) -> dict:
    if not equity_curve:
        return {k: 0.0 for k in [
            "total_trades", "winning_trades", "losing_trades", "win_rate",
            "total_return_pct", "max_drawdown_pct", "sharpe_ratio", "sortino_ratio",
            "calmar_ratio", "profit_factor", "avg_trade_return_pct", "best_trade_pct",
            "worst_trade_pct", "risk_reward_ratio", "avg_win_pct", "avg_loss_pct",
            "avg_trade_duration_days", "annualized_return_pct",
        ]} | {"monthly_returns": {}}

    values       = [e["equity"] for e in equity_curve]
    final_equity = values[-1]

    total_return_pct = (final_equity / initial_capital - 1) * 100

    # CAGR
    days  = (pd.to_datetime(end_date) - pd.to_datetime(start_date)).days if start_date and end_date else 365
    years = max(days / 365.25, 0.01)
    cagr  = ((final_equity / initial_capital) ** (1 / years) - 1) * 100

    equity_s      = pd.Series(values, dtype=float)
    daily_returns = equity_s.pct_change().dropna()

    # Sharpe
    sharpe = 0.0
    if daily_returns.std() > 0:
        sharpe = float((daily_returns.mean() / daily_returns.std()) * math.sqrt(252))

    # Sortino (downside deviation)
    sortino = 0.0
    downside = daily_returns[daily_returns < 0]
    if len(downside) > 1 and downside.std() > 0:
        sortino = float((daily_returns.mean() / downside.std()) * math.sqrt(252))

    # Max drawdown
    peak_s       = equity_s.cummax()
    dd_pct_s     = (equity_s - peak_s) / peak_s.replace(0, 1) * 100
    max_drawdown = float(dd_pct_s.min())

    # Calmar
    calmar = cagr / abs(max_drawdown) if max_drawdown != 0 else 0.0

    # Trade stats
    total_trades = len(trades)
    wins   = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] <= 0]

    win_rate     = len(wins) / total_trades * 100 if total_trades else 0.0
    gross_profit = sum(t["pnl"] for t in wins)
    gross_loss   = abs(sum(t["pnl"] for t in losses))
    profit_factor = (
        gross_profit / gross_loss if gross_loss > 0
        else (999.0 if gross_profit > 0 else 0.0)
    )

    returns = [t["return_pct"] for t in trades]
    avg_trade_return_pct = float(np.mean(returns)) if returns else 0.0
    best_trade_pct       = float(max(returns))     if returns else 0.0
    worst_trade_pct      = float(min(returns))     if returns else 0.0

    avg_win_pct  = float(np.mean([t["return_pct"] for t in wins]))   if wins   else 0.0
    avg_loss_pct = float(np.mean([t["return_pct"] for t in losses])) if losses else 0.0
    risk_reward  = abs(avg_win_pct / avg_loss_pct) if avg_loss_pct != 0 else 0.0

    avg_trade_duration = avg_duration(trades)
    monthly_rets        = monthly_returns(equity_curve)

    return {
        "total_trades":            total_trades,
        "winning_trades":          len(wins),
        "losing_trades":           len(losses),
        "win_rate":                round(win_rate, 2),
        "total_return_pct":        round(total_return_pct, 2),
        "annualized_return_pct":   round(cagr, 2),
        "max_drawdown_pct":        round(max_drawdown, 2),
        "sharpe_ratio":            round(sharpe, 3),
        "sortino_ratio":           round(sortino, 3),
        "calmar_ratio":            round(calmar, 3),
        "profit_factor":           round(profit_factor, 3),
        "avg_trade_return_pct":    round(avg_trade_return_pct, 4),
        "best_trade_pct":          round(best_trade_pct, 4),
        "worst_trade_pct":         round(worst_trade_pct, 4),
        "avg_win_pct":             round(avg_win_pct, 2),
        "avg_loss_pct":            round(avg_loss_pct, 2),
        "risk_reward_ratio":       round(risk_reward, 3),
        "avg_trade_duration_days": avg_trade_duration,
        "monthly_returns":         monthly_rets,
    }


def avg_duration(trades: list) -> float:
    durations = []
    for t in trades:
        try:
            entry = pd.to_datetime(t["entry_date"])
            exit_ = pd.to_datetime(t["exit_date"])
            durations.append((exit_ - entry).days)
        except Exception:
            pass
    return round(float(np.mean(durations)), 1) if durations else 0.0


def monthly_returns(equity_curve: list) -> dict:
    if len(equity_curve) < 2:
        return {}
    df = pd.DataFrame(equity_curve)
    df["date"] = pd.to_datetime(df["date"])
    df.set_index("date", inplace=True)
    monthly = df["equity"].resample("ME").last().dropna()
    result = {}
    for i in range(1, len(monthly)):
        key = monthly.index[i].strftime("%Y-%m")
        ret = (monthly.iloc[i] / monthly.iloc[i - 1] - 1) * 100
        result[key] = round(float(ret), 2)
    return result
