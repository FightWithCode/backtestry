"""
Portfolio-of-one walk-forward simulator for the Strategy IR.

Unlike apps/strategies/ir/executor.py (which backtests one symbol
independently, each with its own capital), this holds at most ONE open
position at a time across an entire symbol universe: it deploys available
capital into whichever symbol signals an entry first, manages that position
to a full exit (mirroring the executor's declared-order stop/target/signal/
time exit handling and partial closes exactly), and only then resumes
scanning the whole universe for the next entry. This models how a single
trader running one strategy off one pool of capital across a watchlist
actually operates — one trade at a time, capital compounding trade to trade
— which is a fundamentally different question from "what if I'd backtested
every symbol independently and simultaneously" (the existing engines answer
that one).

Reuses apps.strategies.ir.expr.evaluate / .indicators.compute_ir_indicators /
.executor._position_ctx, apps.strategies.metrics.build_trade/calculate_metrics,
and apps.screener.scan.explain_condition (for the same human-readable "why
did this fire" detail the screener produces, attached to every trade here) —
all read-only imports; nothing in those modules is touched.

Position sizing: risk-based off the matched entry's declared stop-loss, when
one exists — qty = (cash * risk_pct/100) / abs(entry_price - stop_price),
capped so it never exceeds what current cash can actually buy (no margin/
leverage modeled). If the entry has no stop-type exit declared, sizing falls
back to full-capital notional (qty = cash / entry_price) — "all money
deployed" is the ceiling in both cases, since only one position is ever open.

Known simplification: state variables reset to their declared `init` value
every time a new position opens (on whichever symbol) — there's no notion of
persistent per-symbol state while a symbol isn't the active position, since
"the strategy" here is a single trade at a time, not N independent positions.
"""
import pandas as pd

from apps.strategies.ir.expr import evaluate
from apps.strategies.ir.indicators import compute_ir_indicators, ohlcv_series
from apps.strategies.ir.executor import _position_ctx
from apps.strategies.metrics import build_trade, calculate_metrics
from apps.screener.scan import explain_condition


def run_simulation(
    symbol_data: dict,
    ir: dict,
    initial_capital: float,
    risk_pct: float,
    start_date,
    commission_pct: float = 0.0,
    slippage_pct: float = 0.0,
) -> dict:
    start_ts = pd.Timestamp(start_date)

    per_symbol = {}
    excluded_symbols = []
    for symbol, df in symbol_data.items():
        if df is None or len(df) == 0:
            excluded_symbols.append(symbol)
            continue
        try:
            series_by_id = compute_ir_indicators(df, ir.get("indicators") or [])
        except Exception:
            # One symbol with too little history for a declared indicator (e.g. a
            # recent listing that predates an EMA(50)'s required bars) shouldn't
            # take down a 500-symbol simulation — exclude it and keep going, same
            # as a fetch failure.
            excluded_symbols.append(symbol)
            continue
        open_, high, low, close, volume = ohlcv_series(df)
        series_by_id["open"] = open_
        series_by_id["high"] = high
        series_by_id["low"] = low
        series_by_id["close"] = close
        series_by_id["volume"] = volume
        dates = [str(d)[:10] for d in df.index]
        per_symbol[symbol] = {
            "series": series_by_id,
            "dates": dates,
            "date_to_idx": {d: i for i, d in enumerate(dates)},
            "high": high, "low": low, "close": close,
        }

    if not per_symbol:
        raise ValueError(
            f"No usable symbol data to simulate — all {len(symbol_data)} fetched symbol(s) "
            f"lacked enough history for the strategy's declared indicators."
        )

    # Unified trading timeline: every bar date, across every symbol, on or after start_date.
    all_dates = sorted({
        d for info in per_symbol.values() for d in info["dates"] if pd.Timestamp(d) >= start_ts
    })
    if not all_dates:
        raise ValueError("No bars on or after the simulation start date — widen the date range.")

    state_decls = ir.get("state") or []
    exits_by_entry = {}
    for x in ir.get("exits") or []:
        exits_by_entry.setdefault(x["from"], []).append(x)

    comm_frac = commission_pct / 100.0
    slip_frac = slippage_pct / 100.0

    def buy_fill(px):
        return px * (1 + slip_frac)

    def sell_fill(px):
        return px * (1 - slip_frac)

    cash = float(initial_capital)
    position = None
    trade_log = []
    equity_curve = []
    symbols_traded = set()

    def _pos_ctx_now():
        return _position_ctx({
            "direction": position["direction"], "entry_price": position["entry_price"],
            "qty": position["qty"], "bars_in_trade": position["bars_in_trade"],
        })

    for date in all_dates:
        exited_this_bar = False

        # ---- Manage the open position: exits, declared order, first match wins ----
        if position is not None:
            info = per_symbol.get(position["symbol"])
            idx = info["date_to_idx"].get(date) if info else None
            if idx is not None:
                position["bars_in_trade"] += 1
                series_by_id = info["series"]
                sign = 1 if position["direction"] == "long" else -1
                high = float(info["high"].iloc[idx])
                low = float(info["low"].iloc[idx])
                close = float(info["close"].iloc[idx])
                pos_ctx = _pos_ctx_now()

                for xdecl in exits_by_entry.get(position["entry_id"], []):
                    guard = xdecl.get("guard")
                    if guard is not None and not evaluate(guard, series_by_id, position["state"], pos_ctx, idx):
                        continue

                    etype = xdecl.get("type", "signal")
                    fired = False
                    trigger_price = close

                    if etype in ("stop", "target"):
                        trigger_price = float(evaluate(xdecl["price_expr"], series_by_id, position["state"], pos_ctx, idx))
                        is_stop = etype == "stop"
                        if sign == 1:
                            fired = (low <= trigger_price) if is_stop else (high >= trigger_price)
                        else:
                            fired = (high >= trigger_price) if is_stop else (low <= trigger_price)
                    elif etype == "time":
                        fired = position["bars_in_trade"] >= int(xdecl["bars"])
                    else:
                        when = xdecl.get("when")
                        fired = when is not None and bool(evaluate(when, series_by_id, position["state"], pos_ctx, idx))

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
                        position["entry_date"], date, position["entry_price"], fill_price,
                        qty_to_close, pnl, xdecl.get("tag", etype),
                        type=position["direction"].upper(), symbol=position["symbol"],
                        quantity=round(qty_to_close, 6),
                        entry_reason=position["entry_reason"],
                        capital_after=round(cash, 2),
                    ))

                    for sid, val in (action.get("set_state") or {}).items():
                        position["state"][sid] = val

                    position["qty"] -= qty_to_close
                    if position["qty"] <= 1e-9:
                        position = None
                        exited_this_bar = True
                        break
                    pos_ctx = _pos_ctx_now()

        # ---- Flat: scan the universe (in list order) for the first qualifying entry ----
        if position is None and not exited_this_bar and cash > 0:
            for symbol, info in per_symbol.items():
                idx = info["date_to_idx"].get(date)
                if idx is None:
                    continue
                series_by_id = info["series"]
                state = {s["id"]: s["init"] for s in state_decls}
                flat_ctx = _position_ctx(None)

                matched_entry = None
                for edecl in ir.get("entries") or []:
                    when = edecl.get("when")
                    if when is None or not evaluate(when, series_by_id, state, flat_ctx, idx):
                        continue
                    guard = edecl.get("guard")
                    if guard is not None and not evaluate(guard, series_by_id, state, flat_ctx, idx):
                        continue
                    matched_entry = edecl
                    break
                if matched_entry is None:
                    continue

                direction = matched_entry["direction"]
                close = float(info["close"].iloc[idx])
                entry_fill = buy_fill(close) if direction == "long" else sell_fill(close)

                synth_ctx = _position_ctx({"direction": direction, "entry_price": entry_fill, "qty": 0.0, "bars_in_trade": 0})
                stop_price = None
                for xdecl in exits_by_entry.get(matched_entry["id"], []):
                    if xdecl.get("type") == "stop":
                        stop_price = float(evaluate(xdecl["price_expr"], series_by_id, state, synth_ctx, idx))
                        break

                if stop_price is not None and abs(entry_fill - stop_price) > 1e-9:
                    risk_per_share = abs(entry_fill - stop_price)
                    qty = min((cash * (risk_pct / 100.0)) / risk_per_share, cash / entry_fill)
                else:
                    qty = cash / entry_fill

                entry_commission = qty * entry_fill * comm_frac
                invest = qty * entry_fill + entry_commission
                if invest > cash:
                    qty = max(0.0, (cash - entry_commission) / entry_fill) if entry_fill else 0.0
                    invest = qty * entry_fill + entry_commission
                if qty <= 1e-9:
                    continue

                cash -= invest
                explanation = explain_condition(matched_entry["when"], series_by_id, state, flat_ctx, idx)

                position = {
                    "symbol": symbol, "entry_id": matched_entry["id"], "direction": direction,
                    "qty": qty, "entry_price": entry_fill, "entry_date": date,
                    "bars_in_trade": 0, "state": state, "entry_reason": explanation,
                }
                symbols_traded.add(symbol)
                break

        # ---- Equity snapshot ----
        if position is not None:
            info = per_symbol.get(position["symbol"])
            idx = info["date_to_idx"].get(date) if info else None
            mark = float(info["close"].iloc[idx]) if idx is not None else position["entry_price"]
            sign = 1 if position["direction"] == "long" else -1
            pos_value = position["qty"] * position["entry_price"] + sign * (mark - position["entry_price"]) * position["qty"]
            equity = cash + pos_value
        else:
            equity = cash
        equity_curve.append({"date": date, "equity": round(equity, 2)})

    # ---- Force-close any still-open position at period end ----
    if position is not None:
        info = per_symbol[position["symbol"]]
        last_date = all_dates[-1]
        idx = info["date_to_idx"].get(last_date)
        if idx is None:
            idx = len(info["close"]) - 1
            last_date = info["dates"][idx]
        close = float(info["close"].iloc[idx])
        sign = 1 if position["direction"] == "long" else -1
        fill_price = sell_fill(close) if sign == 1 else buy_fill(close)
        exit_commission = position["qty"] * fill_price * comm_frac
        pnl = sign * (fill_price - position["entry_price"]) * position["qty"] - exit_commission
        cash += position["qty"] * position["entry_price"] + pnl
        trade_log.append(build_trade(
            position["entry_date"], last_date, position["entry_price"], fill_price,
            position["qty"], pnl, "period_end",
            type=position["direction"].upper(), symbol=position["symbol"],
            quantity=round(position["qty"], 6),
            entry_reason=position["entry_reason"],
            capital_after=round(cash, 2),
        ))
        if equity_curve:
            equity_curve[-1]["equity"] = round(cash, 2)

    equities = [e["equity"] for e in equity_curve]
    equity_s = pd.Series(equities, dtype=float)
    peak_s = equity_s.cummax()
    dd_pct = (equity_s - peak_s) / peak_s.replace(0, 1) * 100
    drawdown_series = [
        {"date": equity_curve[i]["date"], "drawdown": round(float(dd_pct.iloc[i]), 4)}
        for i in range(len(equity_curve))
    ]

    metrics = calculate_metrics(equity_curve, trade_log, initial_capital, all_dates[0], all_dates[-1])

    return {
        **metrics,
        "final_capital": round(cash, 2),
        "equity_curve": equity_curve,
        "drawdown_series": drawdown_series,
        "trade_log": trade_log,
        "symbols_traded": sorted(symbols_traded),
        "excluded_symbols": excluded_symbols,
    }
