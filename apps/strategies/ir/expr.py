"""
Expression evaluator for the Strategy IR's condition trees (entries[].when,
exits[].when/guard/price_expr, state[].reset_when).

Grammar (see schema.py for the authoritative operator/ref vocabulary):
  - number / bool literal            -> itself
  - string                           -> a ref: indicator id, OHLCV column,
                                         state id, or built-in position var
  - {"gt": [a, b]} / lt / gte / lte / eq / neq   -> comparison, operand = [a, b]
  - {"and": [e1, e2, ...]} / {"or": [...]}        -> operand = list of exprs
  - {"not": e}                                    -> operand = single expr
  - {"crosses_above": [a, b]} / crosses_below     -> operand = [a, b]
  - {"add": [a, b]} / sub / mul / div             -> operand = [a, b]
  - {"prev": [e]} or {"prev": [e, n]}              -> value of e, n bars back (default n=1)
  - {"rising": e} / {"falling": e}                -> operand = single expr

Refs are resolved against a per-bar context: precomputed indicator/OHLCV
Series (indexed by bar), the strategy's declared state dict (current values),
and built-in position vars (entry_price, position_avg_price, position_size,
bars_in_trade) for the *current* bar. "prev"/"rising"/"falling"/crosses_*
re-evaluate the same expression at bar index-n; for state/position refs this
uses their *current* value rather than a true historical snapshot (state
history isn't tracked) — in practice these ops are applied to indicator/price
series, matching how Pine's ta.rising()/ta.falling()/[1] are actually used.
"""
from apps.strategies.ir.schema import (
    COMPARISON_OPS, LOGIC_OPS, CROSS_OPS, ARITHMETIC_OPS, LOOKBACK_OPS,
)

_CMP = {
    "gt": lambda a, b: a > b,
    "lt": lambda a, b: a < b,
    "gte": lambda a, b: a >= b,
    "lte": lambda a, b: a <= b,
    "eq": lambda a, b: a == b,
    "neq": lambda a, b: a != b,
}
_ARITH = {
    "add": lambda a, b: a + b,
    "sub": lambda a, b: a - b,
    "mul": lambda a, b: a * b,
    "div": lambda a, b: (a / b) if b else float("nan"),
}


def evaluate(expr, series_by_id: dict, state: dict, position: dict, i: int):
    """Evaluate an IR expression tree at bar index i. Returns a bool or float."""
    if isinstance(expr, bool):
        return expr
    if isinstance(expr, (int, float)):
        return float(expr)
    if isinstance(expr, str):
        return _resolve_ref(expr, series_by_id, state, position, i)
    if isinstance(expr, dict):
        if len(expr) != 1:
            raise ValueError(f"Malformed expression node (expected exactly 1 op key): {expr!r}")
        op, operand = next(iter(expr.items()))
        return _apply_op(op, operand, series_by_id, state, position, i)
    raise ValueError(f"Unrecognized expression node: {expr!r}")


def _resolve_ref(ref: str, series_by_id: dict, state: dict, position: dict, i: int):
    if ref in series_by_id:
        series = series_by_id[ref]
        idx = max(0, min(i, len(series) - 1))
        return float(series.iloc[idx])
    if ref in state:
        return state[ref]
    if ref in position:
        return position[ref]
    raise KeyError(f"Unresolved ref '{ref}' — not a declared indicator, OHLCV column, state id, or position var")


def _apply_op(op: str, operand, series_by_id: dict, state: dict, position: dict, i: int):
    ev = lambda e, idx=i: evaluate(e, series_by_id, state, position, idx)

    if op in COMPARISON_OPS:
        a, b = operand
        return _CMP[op](ev(a), ev(b))

    if op == "and":
        return all(ev(e) for e in operand)
    if op == "or":
        return any(ev(e) for e in operand)
    if op == "not":
        return not ev(operand)

    if op in ARITHMETIC_OPS:
        a, b = operand
        return _ARITH[op](ev(a), ev(b))

    if op in CROSS_OPS:
        a, b = operand
        if i < 1:
            return False
        now_a, now_b = ev(a), ev(b)
        prev_a, prev_b = ev(a, i - 1), ev(b, i - 1)
        if op == "crosses_above":
            return (now_a > now_b) and (prev_a <= prev_b)
        return (now_a < now_b) and (prev_a >= prev_b)

    if op in LOOKBACK_OPS:
        if op == "prev":
            inner = operand[0]
            n = operand[1] if len(operand) > 1 else 1
            idx = i - n
            if idx < 0:
                return ev(inner, 0)
            return ev(inner, idx)
        # rising / falling: operand is a single expression
        if i < 1:
            return False
        now_v, prev_v = ev(operand), ev(operand, i - 1)
        return now_v > prev_v if op == "rising" else now_v < prev_v

    raise ValueError(f"Unknown operator '{op}'")
