import logging

import pandas as pd

from .components.indicators import compute_all_indicators
from .components.patterns import compute_patterns
from .components.conditions import (
    evaluate_conditions,
    parse_rules_to_signals,
    parse_stop_loss_pct_from_rules,
    parse_take_profit_pct_from_rules,
)

log = logging.getLogger(__name__)


def validate_strategy_config(config: dict) -> None:
    # PATH A: plain English rules
    if "entry_rules" in config:
        rules = config["entry_rules"]
        if isinstance(rules, list) and (not rules or isinstance(rules[0], str)):
            return  # valid PATH A config
    # PATH B: structured JSON conditions
    missing = {"entry_conditions", "exit_conditions"} - set(config.keys())
    if missing:
        raise ValueError(f"Strategy config missing required keys: {missing}")
    if not isinstance(config["entry_conditions"], list):
        raise ValueError("'entry_conditions' must be a list")
    if not isinstance(config["exit_conditions"], list):
        raise ValueError("'exit_conditions' must be a list")


def _is_plain_text_rules(rules) -> bool:
    """True when rules is a non-empty list of plain strings (not condition dicts)."""
    if not rules or not isinstance(rules, list):
        return False
    return isinstance(rules[0], str)


def run_strategy_engine(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """
    Apply a rule engine to df and return it with a 'signal' column.

    Signal values:  1 = buy/enter long,  -1 = sell/exit,  0 = hold.

    Two signal paths are supported:
      PATH A — Natural language rules (primary path for scraped strategies):
               config must contain "entry_rules" as a list of plain English strings.
      PATH B — Structured JSON conditions (manually configured strategies):
               config must contain "entry_conditions" and "exit_conditions".
    PATH A takes priority when both keys are present.

    stop_loss_pct and take_profit_pct, if resolved, are stored in df.attrs so the
    backtester can read them without an extra argument.
    """
    validate_strategy_config(config)
    log.info("run_strategy_engine — bars=%d  columns=%s", len(df), list(df.columns))

    df = df.copy()

    # 1. Normalise OHLCV to lowercase
    df.columns = [c.lower() for c in df.columns]

    # 2. Compute all indicators unconditionally (also produces CDL_* pattern columns)
    log.info("Computing all indicators …")
    df = compute_all_indicators(df)
    indicator_cols = [c for c in df.columns if c not in {"open","high","low","close","volume"}]
    log.info("Indicators computed — %d new columns added", len(indicator_cols))

    # 3. Compute pat_* candle pattern columns
    log.info("Computing candle patterns …")
    df = compute_patterns(df)
    pat_cols = [c for c in df.columns if c.startswith("pat_")]
    log.info("Patterns computed — %d pat_* columns", len(pat_cols))

    # 4. Detect signal path
    use_path_a = _is_plain_text_rules(config.get("entry_rules"))

    if use_path_a:
        entry_rules = config["entry_rules"]
        exit_rules  = config.get("exit_rules", [])
        log.info(
            "Signal path: A (natural language) — %d entry rules, %d exit rules",
            len(entry_rules), len(exit_rules),
        )
        buy_signals, sell_signals, rule_coverage = parse_rules_to_signals(df, entry_rules, exit_rules)
    else:
        log.info(
            "Signal path: B (structured conditions) — %d entry, %d exit",
            len(config["entry_conditions"]), len(config["exit_conditions"]),
        )
        entry_mask = evaluate_conditions(df, config["entry_conditions"])
        exit_mask  = evaluate_conditions(df, config["exit_conditions"])
        buy_signals  = entry_mask
        sell_signals = exit_mask
        rule_coverage = None  # structured conditions are fully computable by construction

    # 5. Build signal column (exit takes priority on the same bar)
    df["signal"] = 0
    df.loc[buy_signals,  "signal"] = 1
    df.loc[sell_signals, "signal"] = -1
    df["signal"] = df["signal"].fillna(0).astype(int)

    buy_n  = int((df["signal"] == 1).sum())
    sell_n = int((df["signal"] == -1).sum())
    log.info("Signals assigned — buy=%d  sell=%d  bars=%d", buy_n, sell_n, len(df))

    # 6. Resolve stop_loss_pct / take_profit_pct and store in df.attrs
    sl_pct = config.get("stop_loss_pct")
    tp_pct = config.get("take_profit_pct")

    if use_path_a:
        all_rules = config.get("entry_rules", []) + config.get("exit_rules", [])
        if sl_pct is None:
            sl_pct = parse_stop_loss_pct_from_rules(all_rules)
        if tp_pct is None:
            tp_pct = parse_take_profit_pct_from_rules(all_rules)

    if sl_pct is not None:
        df.attrs["stop_loss_pct"] = float(sl_pct)
        log.info("stop_loss_pct=%.2f%%", float(sl_pct))
    if tp_pct is not None:
        df.attrs["take_profit_pct"] = float(tp_pct)
        log.info("take_profit_pct=%.2f%%", float(tp_pct))

    if rule_coverage is not None:
        df.attrs["rule_coverage"] = rule_coverage
        all_rules = rule_coverage["entry"] + rule_coverage["exit"]
        matched = sum(1 for r in all_rules if r["status"] == "parsed")
        log.info("rule_coverage — %d/%d rules parsed", matched, len(all_rules))

    return df
