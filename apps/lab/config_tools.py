"""
Pure-Python IR introspection + override engine for the parameter-sweep lab.
Reads a strategy's IR config (apps.strategies.ir.schema shape) and exposes
only two categories of numeric knob as editable at backtest run-time:

  - indicator params (e.g. RSI length, EMA length, BBANDS std)
  - numeric literals inside an exit's price_expr, plus exit action.close_pct
    (i.e. stop/target/profit-taking values)

Entry/exit *conditions* (`when`, `guard`) are never walked or exposed, so a
sweep can only ever change "how the same rule is parameterized", never the
rule itself. `generate_variants` re-validates every requested override path
against this same extraction, so a client cannot smuggle in an edit to a
path this module doesn't consider a knob.

Nothing here touches the Strategy model or persists anything — callers are
responsible for snapshotting the base config and storing resolved variants.
"""
import copy
import itertools


def _numeric_leaves(node, path=()):
    out = []
    if isinstance(node, bool):
        return out
    if isinstance(node, (int, float)):
        out.append((path, node))
    elif isinstance(node, dict):
        for k, v in node.items():
            out.extend(_numeric_leaves(v, path + (k,)))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out.extend(_numeric_leaves(v, path + (i,)))
    return out


def extract_tunables(config: dict) -> list[dict]:
    knobs = []

    for idx, decl in enumerate(config.get("indicators") or []):
        ind_id = decl.get("id", f"indicator{idx}")
        ind_type = decl.get("type", "?")
        for pname, pval in (decl.get("params") or {}).items():
            if isinstance(pval, bool) or not isinstance(pval, (int, float)):
                continue
            knobs.append({
                "path": f"indicators.{idx}.params.{pname}",
                "kind": "indicator_param",
                "group": f"{ind_type} ({ind_id})",
                "label": pname,
                "current": pval,
                "value_type": "int" if isinstance(pval, int) else "float",
            })

    for idx, decl in enumerate(config.get("exits") or []):
        tag = decl.get("tag") or decl.get("id") or f"{decl.get('type', 'exit')}{idx}"
        etype = decl.get("type")

        if etype in ("stop", "target") and "price_expr" in decl:
            for leaf_path, val in _numeric_leaves(decl["price_expr"]):
                suffix = ".".join(str(p) for p in leaf_path)
                full_path = f"exits.{idx}.price_expr" + (f".{suffix}" if suffix else "")
                knobs.append({
                    "path": full_path,
                    "kind": "exit_value",
                    "group": tag,
                    "label": f"{etype} value",
                    "current": val,
                    "value_type": "int" if isinstance(val, int) else "float",
                })

        action = decl.get("action") or {}
        if isinstance(action.get("close_pct"), (int, float)) and not isinstance(action.get("close_pct"), bool):
            knobs.append({
                "path": f"exits.{idx}.action.close_pct",
                "kind": "exit_close_pct",
                "group": tag,
                "label": "close %",
                "current": action["close_pct"],
                "value_type": "float",
            })

    return knobs


def _get_in(obj, parts):
    cur = obj
    for p in parts:
        cur = cur[int(p)] if isinstance(cur, list) else cur[p]
    return cur


def _set_in(obj, path: str, value):
    parts = path.split(".")
    parent = _get_in(obj, parts[:-1])
    last = parts[-1]
    if isinstance(parent, list):
        parent[int(last)] = value
    else:
        parent[last] = value


def apply_overrides(config: dict, overrides: dict) -> dict:
    resolved = copy.deepcopy(config)
    for path, value in overrides.items():
        _set_in(resolved, path, value)
    return resolved


def generate_variants(config: dict, overrides_spec: dict, max_variants: int = 60) -> list[dict]:
    """overrides_spec: {knob_path: [candidate values...]}. A path with a single
    candidate is a fixed override; >1 candidates makes it a swept dimension.
    Returns [{"overrides": {...}, "config": resolved_config, "label": str}, ...]."""
    knob_map = {k["path"]: k for k in extract_tunables(config)}

    for path in overrides_spec:
        if path not in knob_map:
            raise ValueError(f"'{path}' is not an editable parameter for this strategy.")

    if not overrides_spec:
        return [{"overrides": {}, "config": copy.deepcopy(config), "label": "Base"}]

    paths = list(overrides_spec.keys())
    value_lists = [overrides_spec[p] for p in paths]

    total = 1
    for vl in value_lists:
        total *= max(1, len(vl))
    if total > max_variants:
        raise ValueError(
            f"{total} variant combinations requested, exceeding the limit of {max_variants}. "
            f"Reduce the number of values per parameter or split into multiple runs."
        )

    # The strategy's own unmodified config always rides along as an explicit
    # comparator — without it, a sweep where every knob only got a single
    # override value would collapse to exactly one variant, leaving nothing
    # to actually compare against.
    variants = [{"overrides": {}, "config": copy.deepcopy(config), "label": "Base"}]

    for combo in itertools.product(*value_lists):
        overrides = dict(zip(paths, combo))
        resolved = apply_overrides(config, overrides)
        label_parts = []
        for p in paths:
            k = knob_map[p]
            value = overrides[p]
            is_swept = len(overrides_spec[p]) > 1
            changed_from_default = value != k["current"]
            if is_swept or changed_from_default:
                label_parts.append(f"{k['group']} {k['label']}={value}")
        label = " · ".join(label_parts) if label_parts else "Base"
        variants.append({"overrides": overrides, "config": resolved, "label": label})
    return variants
