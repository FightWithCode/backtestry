"""
Stateful bar-by-bar executor for the Strategy IR — the direct replacement,
for IR-shaped configs, of the legacy vectorized "signal column" backtester
(apps/strategies/backtester.py). Executes top-to-bottom per bar, mirroring
how Pine itself evaluates a script, so it can represent what the legacy
engine structurally cannot: per-strategy state, partial position closes,
shorting, intrabar stop/target fills, and time-based exits.

Position accounting (verified to reduce to the legacy engine's exact
zero-cost and cost-bearing math for the trivial single-entry/single-exit/
100%-sizing case):
  - At entry: invest = cash * (sizing_pct/100); entry_commission = invest * comm_frac;
    qty = (invest - entry_commission) / entry_fill_price; cash -= invest.
  - At (partial) exit of qty_to_close: exit_commission = qty_to_close * exit_fill * comm_frac;
    pnl = sign * (exit_fill - entry_price) * qty_to_close - exit_commission;
    cash += qty_to_close * entry_price + pnl.
  - Mark-to-market equity while in a position: cash + qty*entry_price + sign*(mark-entry)*qty.
"""
import pandas as pd

from apps.strategies.ir.expr import evaluate
from apps.strategies.ir.indicators import compute_ir_indicators, ohlcv_series
from apps.strategies.ir.schema import INDICATOR_SCALE
from apps.strategies.metrics import build_trade, calculate_metrics


def _build_chart_data(df: pd.DataFrame, ir_indicators: list, indicator_series: dict,
                       open_, high_, low_, close_) -> dict:
    """Price OHLC series + declared-indicator series, keyed for the frontend price chart.
    Indicator values are tagged with a display "scale" (overlay vs oscillator, see schema.py)
    so the chart knows whether to plot on the price axis or a separate toggleable axis."""
    dates = [str(d)[:10] for d in df.index]
    price = [
        {"date": dates[i], "open": round(float(open_.iloc[i]), 4), "high": round(float(high_.iloc[i]), 4),
         "low": round(float(low_.iloc[i]), 4), "close": round(float(close_.iloc[i]), 4)}
        for i in range(len(df))
    ]
    indicators = {}
    for decl in ir_indicators:
        ind_id, ind_type = decl["id"], decl["type"]
        series = indicator_series.get(ind_id)
        if series is None:
            continue
        indicators[ind_id] = {
            "type": ind_type,
            "scale": INDICATOR_SCALE.get(ind_type, "oscillator"),
            "values": [None if pd.isna(v) else round(float(v), 4) for v in series],
        }
    return {"price": price, "indicators": indicators}


def _position_ctx(position: dict | None) -> dict:
    if position is None:
        return {"entry_price": 0.0, "position_avg_price": 0.0, "position_size": 0.0, "bars_in_trade": 0}
    sign = 1 if position["direction"] == "long" else -1
    return {
        "entry_price": position["entry_price"],
        "position_avg_price": position["entry_price"],
        "position_size": sign * position["qty"],
        "bars_in_trade": position["bars_in_trade"],
    }


def run_ir_backtest(
    df: pd.DataFrame,
    ir: dict,
    initial_capital: float,
    symbol: str,
    commission_pct: float = 0.0,
    slippage_pct: float = 0.0,
) -> dict:
    meta = ir.get("meta") or {}
    sizing = meta.get("position_sizing") or {"mode": "percent_of_equity", "value": 100}
    sizing_pct = float(sizing.get("value", 100))

    series_by_id = compute_ir_indicators(df, ir.get("indicators") or [])
    open_, high_, low_, close_, volume_ = ohlcv_series(df)
    chart_data = _build_chart_data(df, ir.get("indicators") or [], series_by_id, open_, high_, low_, close_)
    series_by_id["open"] = open_
    series_by_id["high"] = high_
    series_by_id["low"] = low_
    series_by_id["close"] = close_
    series_by_id["volume"] = volume_

    state_decls = ir.get("state") or []
    state = {s["id"]: s["init"] for s in state_decls}

    exits_by_entry: dict = {}
    for x in ir.get("exits") or []:
        exits_by_entry.setdefault(x["from"], []).append(x)

    comm_frac = float(commission_pct) / 100.0
    slip_frac = float(slippage_pct) / 100.0

    def buy_fill(px: float) -> float:
        return px * (1 + slip_frac)

    def sell_fill(px: float) -> float:
        return px * (1 - slip_frac)

    cash = float(initial_capital)
    position = None  # {"entry_id","direction","qty","entry_price","entry_date","bars_in_trade"}
    trade_log = []
    equity_curve = []

    for i in range(len(df)):
        date_label = str(df.index[i])[:10]
        close = float(close_.iloc[i])
        high  = float(high_.iloc[i])
        low   = float(low_.iloc[i])

        # ── State resets ─────────────────────────────────────────────────
        pos_ctx = _position_ctx(position)
        for sdecl in state_decls:
            reset_when = sdecl.get("reset_when")
            if reset_when is not None and evaluate(reset_when, series_by_id, state, pos_ctx, i):
                state[sdecl["id"]] = sdecl["init"]

        # ── Manage open position: exits (declared order, first match wins) ─
        exited_this_bar = False
        if position is not None:
            position["bars_in_trade"] += 1
            pos_ctx = _position_ctx(position)
            sign = 1 if position["direction"] == "long" else -1

            for xdecl in exits_by_entry.get(position["entry_id"], []):
                guard = xdecl.get("guard")
                if guard is not None and not evaluate(guard, series_by_id, state, pos_ctx, i):
                    continue

                etype = xdecl.get("type", "signal")
                fired = False
                trigger_price = close

                if etype in ("stop", "target"):
                    trigger_price = float(evaluate(xdecl["price_expr"], series_by_id, state, pos_ctx, i))
                    is_stop = etype == "stop"
                    if sign == 1:   # long
                        fired = (low <= trigger_price) if is_stop else (high >= trigger_price)
                    else:           # short
                        fired = (high >= trigger_price) if is_stop else (low <= trigger_price)
                elif etype == "time":
                    fired = position["bars_in_trade"] >= int(xdecl["bars"])
                else:  # signal
                    when = xdecl.get("when")
                    fired = when is not None and bool(evaluate(when, series_by_id, state, pos_ctx, i))

                if not fired:
                    continue

                action = xdecl.get("action") or {}
                close_pct = float(action.get("close_pct", 100))
                qty_to_close = position["qty"] * (close_pct / 100.0)

                fill_price = sell_fill(trigger_price) if sign == 1 else buy_fill(trigger_price)
                exit_commission = qty_to_close * fill_price * comm_frac
                pnl = sign * (fill_price - position["entry_price"]) * qty_to_close - exit_commission
                cash += qty_to_close * position["entry_price"] + pnl

                trade_log.append(build_trade(
                    position["entry_date"], date_label, position["entry_price"], fill_price,
                    qty_to_close, pnl, xdecl.get("tag", etype),
                    type=position["direction"].upper(), symbol=symbol,
                    quantity=round(qty_to_close, 6),
                ))

                for sid, val in (action.get("set_state") or {}).items():
                    state[sid] = val

                position["qty"] -= qty_to_close
                if position["qty"] <= 1e-9:
                    position = None
                    exited_this_bar = True
                    break
                pos_ctx = _position_ctx(position)

        # ── New entry when flat (not on the same bar a position just exited) ─
        if position is None and not exited_this_bar and cash > 0:
            for edecl in ir.get("entries") or []:
                guard = edecl.get("guard")
                when = edecl.get("when")
                if when is None:
                    continue
                if not evaluate(when, series_by_id, state, _position_ctx(None), i):
                    continue
                if guard is not None and not evaluate(guard, series_by_id, state, _position_ctx(None), i):
                    continue

                direction = edecl["direction"]
                invest = cash * (sizing_pct / 100.0)
                entry_fill = buy_fill(close) if direction == "long" else sell_fill(close)
                entry_commission = invest * comm_frac
                qty = (invest - entry_commission) / entry_fill
                cash -= invest

                position = {
                    "entry_id": edecl["id"],
                    "direction": direction,
                    "qty": qty,
                    "entry_price": entry_fill,
                    "entry_date": date_label,
                    "bars_in_trade": 0,
                }
                break

        # ── Equity snapshot ──────────────────────────────────────────────
        if position is not None:
            sign = 1 if position["direction"] == "long" else -1
            pos_value = position["qty"] * position["entry_price"] + sign * (close - position["entry_price"]) * position["qty"]
            equity = cash + pos_value
        else:
            equity = cash
        equity_curve.append({"date": date_label, "equity": round(equity, 2)})

    # ── Force-close any open position at period end ─────────────────────────
    if position is not None:
        last_i = len(df) - 1
        close = float(close_.iloc[last_i])
        date_label = str(df.index[last_i])[:10]
        sign = 1 if position["direction"] == "long" else -1

        fill_price = sell_fill(close) if sign == 1 else buy_fill(close)
        exit_commission = position["qty"] * fill_price * comm_frac
        pnl = sign * (fill_price - position["entry_price"]) * position["qty"] - exit_commission
        cash += position["qty"] * position["entry_price"] + pnl

        trade_log.append(build_trade(
            position["entry_date"], date_label, position["entry_price"], fill_price,
            position["qty"], pnl, "period_end",
            type=position["direction"].upper(), symbol=symbol,
            quantity=round(position["qty"], 6),
        ))
        if equity_curve:
            equity_curve[-1]["equity"] = round(cash, 2)

    # ── Drawdown series + metrics (shared with the legacy backtester) ───────
    equities = [e["equity"] for e in equity_curve]
    equity_s = pd.Series(equities, dtype=float)
    peak_s = equity_s.cummax()
    dd_pct = (equity_s - peak_s) / peak_s.replace(0, 1) * 100
    drawdown_series = [
        {"date": equity_curve[i]["date"], "drawdown": round(float(dd_pct.iloc[i]), 4)}
        for i in range(len(equity_curve))
    ]

    start_date = str(df.index[0])[:10] if len(df) > 0 else ""
    end_date   = str(df.index[-1])[:10] if len(df) > 0 else ""
    metrics = calculate_metrics(equity_curve, trade_log, initial_capital, start_date, end_date)

    return {
        "symbol": symbol,
        "total_trades":            metrics["total_trades"],
        "winning_trades":          metrics["winning_trades"],
        "losing_trades":           metrics["losing_trades"],
        "win_rate":                metrics["win_rate"],
        "total_return_pct":        metrics["total_return_pct"],
        "max_drawdown_pct":        metrics["max_drawdown_pct"],
        "sharpe_ratio":            metrics["sharpe_ratio"],
        "profit_factor":           metrics["profit_factor"],
        "avg_trade_return_pct":    metrics["avg_trade_return_pct"],
        "best_trade_pct":          metrics["best_trade_pct"],
        "worst_trade_pct":         metrics["worst_trade_pct"],
        "equity_curve":            equity_curve,
        "drawdown_series":         drawdown_series,
        "trade_log":               trade_log,
        "annualized_return_pct":   metrics["annualized_return_pct"],
        "sortino_ratio":           metrics["sortino_ratio"],
        "calmar_ratio":            metrics["calmar_ratio"],
        "risk_reward_ratio":       metrics["risk_reward_ratio"],
        "avg_win_pct":             metrics["avg_win_pct"],
        "avg_loss_pct":            metrics["avg_loss_pct"],
        "avg_trade_duration_days": metrics["avg_trade_duration_days"],
        "monthly_returns":         metrics["monthly_returns"],
        "rule_coverage":           None,  # IR is validated whole at generation time, not partially matched
        "chart_data":              chart_data,
    }
