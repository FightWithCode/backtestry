"""
Validates a Strategy IR dict before it's ever executed or saved as a
Strategy's backtest_script. Fail-fast replacement for the legacy natural-
language rule engine's "silently drop what didn't parse" behavior: an
invalid IR is rejected here with specific, actionable errors instead of
quietly producing a partial backtest.

validate_ir(ir) -> list[str]; empty list means valid.
"""
from apps.strategies.ir.schema import (
    INDICATOR_TYPES, ALL_OPS, BUILTIN_REFS, DIRECTIONS, EXIT_TYPES,
    POSITION_SIZING_MODES, STATE_TYPES,
)


def _validate_expr(expr, known_refs: set, path: str) -> list:
    errors = []
    if isinstance(expr, bool) or isinstance(expr, (int, float)):
        return errors
    if isinstance(expr, str):
        if expr not in known_refs:
            errors.append(f"{path}: unresolved ref '{expr}'")
        return errors
    if isinstance(expr, dict):
        if len(expr) != 1:
            errors.append(f"{path}: malformed expression node (expected exactly 1 op key): {expr!r}")
            return errors
        op, operand = next(iter(expr.items()))
        if op not in ALL_OPS:
            errors.append(f"{path}: unknown operator '{op}'")
            return errors

        if op == "not" or op in ("rising", "falling"):
            errors.extend(_validate_expr(operand, known_refs, f"{path}.{op}"))
        elif op == "prev":
            if not isinstance(operand, list) or not (1 <= len(operand) <= 2):
                errors.append(f"{path}.prev: operand must be [expr] or [expr, n]")
            else:
                errors.extend(_validate_expr(operand[0], known_refs, f"{path}.prev"))
                if len(operand) == 2 and not isinstance(operand[1], int):
                    errors.append(f"{path}.prev: n must be an int")
        elif op in ("and", "or"):
            if not isinstance(operand, list) or not operand:
                errors.append(f"{path}.{op}: operand must be a non-empty list")
            else:
                for j, sub in enumerate(operand):
                    errors.extend(_validate_expr(sub, known_refs, f"{path}.{op}[{j}]"))
        else:  # comparison / cross / arithmetic: [a, b]
            if not isinstance(operand, list) or len(operand) != 2:
                errors.append(f"{path}.{op}: operand must be a 2-element list [a, b]")
            else:
                errors.extend(_validate_expr(operand[0], known_refs, f"{path}.{op}[0]"))
                errors.extend(_validate_expr(operand[1], known_refs, f"{path}.{op}[1]"))
        return errors

    errors.append(f"{path}: expression must be a number, string ref, or op-dict, got {expr!r}")
    return errors


def validate_ir(ir: dict) -> list:
    errors = []

    for key in ("meta", "indicators", "entries", "exits"):
        if key not in ir:
            errors.append(f"missing required top-level key '{key}'")
    if errors:
        return errors

    # ── meta ─────────────────────────────────────────────────────────────
    meta = ir.get("meta") or {}
    if meta.get("direction") not in DIRECTIONS | {"long_short"}:
        errors.append(f"meta.direction must be one of long/short/long_short, got {meta.get('direction')!r}")

    sizing = meta.get("position_sizing") or {}
    if sizing.get("mode") not in POSITION_SIZING_MODES:
        errors.append(f"meta.position_sizing.mode must be one of {POSITION_SIZING_MODES}, got {sizing.get('mode')!r}")
    value = sizing.get("value")
    if not isinstance(value, (int, float)) or not (0 < value <= 100):
        errors.append(f"meta.position_sizing.value must be a number in (0, 100], got {value!r}")

    # ── indicators ───────────────────────────────────────────────────────
    declared_indicator_ids = set()
    for i, decl in enumerate(ir.get("indicators") or []):
        ind_id = decl.get("id")
        ind_type = decl.get("type")
        if not ind_id:
            errors.append(f"indicators[{i}]: missing 'id'")
            continue
        if ind_type not in INDICATOR_TYPES:
            errors.append(f"indicators[{i}] '{ind_id}': unsupported type '{ind_type}' "
                          f"(supported: {sorted(INDICATOR_TYPES)})")
            continue
        declared_indicator_ids.add(ind_id)

        spec = INDICATOR_TYPES[ind_type]["params"]
        params = decl.get("params") or {}
        for pname in params:
            if pname not in spec:
                errors.append(f"indicators[{i}] '{ind_id}': unknown param '{pname}' for type {ind_type}")
        for pname, pmeta in spec.items():
            if pmeta.get("required") and pname not in params:
                errors.append(f"indicators[{i}] '{ind_id}': missing required param '{pname}'")
            elif pmeta.get("type") == "enum" and pname in params and params[pname] not in pmeta["choices"]:
                errors.append(f"indicators[{i}] '{ind_id}': param '{pname}' must be one of "
                              f"{pmeta['choices']}, got {params[pname]!r}")

    # ── state ────────────────────────────────────────────────────────────
    declared_state_ids = set()
    state_decls = ir.get("state") or []
    for i, decl in enumerate(state_decls):
        sid = decl.get("id")
        if not sid:
            errors.append(f"state[{i}]: missing 'id'")
            continue
        declared_state_ids.add(sid)
        if decl.get("type") not in STATE_TYPES:
            errors.append(f"state[{i}] '{sid}': type must be one of {STATE_TYPES}, got {decl.get('type')!r}")
        if "init" not in decl:
            errors.append(f"state[{i}] '{sid}': missing 'init'")

    known_refs = declared_indicator_ids | declared_state_ids | BUILTIN_REFS

    for i, decl in enumerate(state_decls):
        reset_when = decl.get("reset_when")
        if reset_when is not None:
            errors.extend(_validate_expr(reset_when, known_refs, f"state[{i}].reset_when"))

    # ── entries ──────────────────────────────────────────────────────────
    declared_entry_ids = set()
    for i, decl in enumerate(ir.get("entries") or []):
        eid = decl.get("id")
        if not eid:
            errors.append(f"entries[{i}]: missing 'id'")
            continue
        declared_entry_ids.add(eid)
        if decl.get("direction") not in DIRECTIONS:
            errors.append(f"entries[{i}] '{eid}': direction must be one of {DIRECTIONS}, got {decl.get('direction')!r}")
        when = decl.get("when")
        if when is None:
            errors.append(f"entries[{i}] '{eid}': missing 'when'")
        else:
            errors.extend(_validate_expr(when, known_refs, f"entries[{i}].when"))
        guard = decl.get("guard")
        if guard is not None:
            errors.extend(_validate_expr(guard, known_refs, f"entries[{i}].guard"))

    if not declared_entry_ids:
        errors.append("entries: at least one entry must be declared")

    # ── exits ────────────────────────────────────────────────────────────
    for i, decl in enumerate(ir.get("exits") or []):
        frm = decl.get("from")
        if frm not in declared_entry_ids:
            errors.append(f"exits[{i}]: 'from' references unknown entry id {frm!r}")

        etype = decl.get("type", "signal")
        if etype not in EXIT_TYPES:
            errors.append(f"exits[{i}]: type must be one of {EXIT_TYPES}, got {etype!r}")

        if etype == "signal":
            when = decl.get("when")
            if when is None:
                errors.append(f"exits[{i}]: signal exit missing 'when'")
            else:
                errors.extend(_validate_expr(when, known_refs, f"exits[{i}].when"))
        elif etype in ("stop", "target"):
            price_expr = decl.get("price_expr")
            if price_expr is None:
                errors.append(f"exits[{i}]: {etype} exit missing 'price_expr'")
            else:
                errors.extend(_validate_expr(price_expr, known_refs, f"exits[{i}].price_expr"))
        elif etype == "time":
            bars = decl.get("bars")
            if not isinstance(bars, int) or bars <= 0:
                errors.append(f"exits[{i}]: time exit requires a positive integer 'bars'")

        guard = decl.get("guard")
        if guard is not None:
            errors.extend(_validate_expr(guard, known_refs, f"exits[{i}].guard"))

        action = decl.get("action") or {}
        close_pct = action.get("close_pct", 100)
        if not isinstance(close_pct, (int, float)) or not (0 < close_pct <= 100):
            errors.append(f"exits[{i}]: action.close_pct must be in (0, 100], got {close_pct!r}")
        for sid in (action.get("set_state") or {}):
            if sid not in declared_state_ids:
                errors.append(f"exits[{i}]: action.set_state references unknown state id '{sid}'")

    return errors
