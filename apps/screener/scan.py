"""
Point-in-time signal scanning for the Strategy IR — evaluates a strategy's
entry rules against only the *last* bar of a symbol's data (a "does this
qualify right now" check), as opposed to apps/strategies/ir/executor.py's
bar-by-bar historical simulation. Reuses that module's expression evaluator,
indicator computation, and position-context builder directly (read-only
imports) so signal semantics never drift from what a real backtest would do.

A symbol "qualifies" when one of the strategy's declared entries' when/guard
evaluates true at the latest bar. Since there's no simulated trade history,
state variables use their declared `init` value and no position is open —
this mirrors how the executor evaluates *new* entries when flat.
"""
import pandas as pd

from apps.strategies.ir.expr import evaluate
from apps.strategies.ir.indicators import compute_ir_indicators, ohlcv_series
from apps.strategies.ir.executor import _position_ctx
from apps.strategies.ir.schema import COMPARISON_OPS, ARITHMETIC_OPS, CROSS_OPS, LOGIC_OPS, LOOKBACK_OPS


def _round(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return round(float(v), 4)
    return v


def explain_condition(expr, series_by_id: dict, state: dict, position: dict, i: int) -> dict:
    """Recursively describes a condition tree with resolved values at bar i,
    for a human-readable "why did this qualify" breakdown. Delegates the
    actual boolean/numeric result at every node to evaluate() so operator
    semantics can never drift from the executor's."""
    if isinstance(expr, bool):
        return {"kind": "literal", "value": expr}
    if isinstance(expr, (int, float)):
        return {"kind": "literal", "value": _round(expr)}
    if isinstance(expr, str):
        return {"kind": "ref", "ref": expr, "value": _round(evaluate(expr, series_by_id, state, position, i))}

    if isinstance(expr, dict):
        op, operand = next(iter(expr.items()))
        result = evaluate(expr, series_by_id, state, position, i)

        if op in LOGIC_OPS:
            if op == "not":
                children = [explain_condition(operand, series_by_id, state, position, i)]
            else:
                children = [explain_condition(e, series_by_id, state, position, i) for e in operand]
            return {"kind": "logic", "op": op, "result": result, "children": children}

        if op in COMPARISON_OPS or op in ARITHMETIC_OPS or op in CROSS_OPS:
            a, b = operand
            kind = "comparison" if op in COMPARISON_OPS else ("cross" if op in CROSS_OPS else "arithmetic")
            return {
                "kind": kind, "op": op, "result": _round(result),
                "left": explain_condition(a, series_by_id, state, position, i),
                "right": explain_condition(b, series_by_id, state, position, i),
            }

        if op in LOOKBACK_OPS:
            inner = operand[0] if op == "prev" else operand
            return {
                "kind": "lookback", "op": op, "result": _round(result),
                "inner": explain_condition(inner, series_by_id, state, position, i),
            }

        raise ValueError(f"Cannot explain operator '{op}'")

    raise ValueError(f"Cannot explain node: {expr!r}")


def scan_symbol(df: pd.DataFrame, ir: dict, symbol: str) -> list[dict]:
    """Evaluates every declared entry against the last bar of df. Returns one
    signal dict per matching entry (usually 0 or 1, but a strategy could
    declare both a long and a short entry)."""
    if len(df) == 0:
        return []

    indicators_decl = ir.get("indicators") or []
    series_by_id = compute_ir_indicators(df, indicators_decl)
    open_, high, low, close, volume = ohlcv_series(df)
    series_by_id["open"] = open_
    series_by_id["high"] = high
    series_by_id["low"] = low
    series_by_id["close"] = close
    series_by_id["volume"] = volume

    state_decls = ir.get("state") or []
    state = {s["id"]: s["init"] for s in state_decls}

    exits_by_entry: dict = {}
    for x in ir.get("exits") or []:
        exits_by_entry.setdefault(x["from"], []).append(x)

    i = len(df) - 1
    as_of_date = str(df.index[i])[:10]
    last_close = float(close.iloc[i])
    bar = {
        "date": as_of_date,
        "open": _round(open_.iloc[i]), "high": _round(high.iloc[i]),
        "low": _round(low.iloc[i]), "close": _round(last_close),
    }
    flat_ctx = _position_ctx(None)

    signals = []
    for edecl in ir.get("entries") or []:
        when = edecl.get("when")
        if when is None or not evaluate(when, series_by_id, state, flat_ctx, i):
            continue
        guard = edecl.get("guard")
        if guard is not None and not evaluate(guard, series_by_id, state, flat_ctx, i):
            continue

        direction = edecl["direction"]
        synth_position = {"direction": direction, "entry_price": last_close, "qty": 0.0, "bars_in_trade": 0}
        pos_ctx = _position_ctx(synth_position)

        exit_plan = []
        for xdecl in exits_by_entry.get(edecl["id"], []):
            etype = xdecl.get("type", "signal")
            tag = xdecl.get("tag", etype)
            close_pct = (xdecl.get("action") or {}).get("close_pct", 100)
            if etype in ("stop", "target"):
                price = evaluate(xdecl["price_expr"], series_by_id, state, pos_ctx, i)
                exit_plan.append({"tag": tag, "type": etype, "price": _round(price), "close_pct": close_pct})
            elif etype == "time":
                exit_plan.append({"tag": tag, "type": etype, "bars": xdecl.get("bars"), "close_pct": close_pct})
            else:
                exit_plan.append({"tag": tag, "type": etype, "close_pct": close_pct,
                                   "note": "Exits when its own signal condition is met"})

        indicator_snapshot = {
            decl["id"]: _round(series_by_id[decl["id"]].iloc[i])
            for decl in indicators_decl if decl["id"] in series_by_id
        }

        signals.append({
            "symbol": symbol,
            "direction": direction,
            "as_of_date": as_of_date,
            "entry_price": _round(last_close),
            "entry_tag": edecl["id"],
            "exit_plan": exit_plan,
            "indicator_snapshot": indicator_snapshot,
            "rule_explanation": {
                "when": explain_condition(when, series_by_id, state, flat_ctx, i),
                "guard": explain_condition(guard, series_by_id, state, flat_ctx, i) if guard is not None else None,
            },
            "bar": bar,
        })

    return signals
