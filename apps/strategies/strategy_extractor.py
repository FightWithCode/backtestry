import json
import re
from django.conf import settings
from google import genai

from apps.strategies.ir.schema import (
    INDICATOR_TYPES, COMPARISON_OPS, BUILTIN_REFS, EXIT_TYPES,
)
from apps.strategies.ir.validate import validate_ir

MODEL_NAME = "gemini-2.5-flash"

EXTRACT_SYSTEM_PROMPT = """You are a trading strategy extractor. The input text may be in any language — understand it regardless of language. The input may be a YouTube transcript, webpage text, or the actual source code of the strategy (e.g. a Pine Script indicator/strategy) — read whichever form is given.

Given the raw input, extract the trading strategy details and return ONLY a valid JSON object with these exact keys:
{
  "name": "string",
  "description": "string",
  "timeframe": "string (e.g. 5m, 15m, 1h, 1d)",
  "indicators": ["list of indicators with their parameters e.g. RSI 14, EMA 21"],
  "candle_patterns": ["list of candle patterns e.g. doji, hammer"],
  "entry_rules": ["list of precise entry conditions as strings"],
  "exit_rules": ["list of precise exit conditions as strings"],
  "step_wise_process": ["numbered steps of the strategy"]
}

If the input is source code (Pine Script or similar), read the actual formulas and logic the code computes — do NOT rely on variable/input labels alone. Labels can be misleading (e.g. an input literally named "Stop Loss % of Capital" whose formula is
  strategy.position_avg_price * (1 - slPct / 100)
is actually a percent-of-*price* stop, not a percent-of-capital risk calculation — describe what the formula does, not what its label says).

All output values must be in English regardless of the input language.
Return ONLY the JSON. No explanation. No markdown. No backticks."""


def _indicator_types_doc() -> str:
    lines = []
    for name, spec in INDICATOR_TYPES.items():
        params = spec["params"]
        if not params:
            lines.append(f'  - "{name}": no params')
            continue
        parts = []
        for pname, pmeta in params.items():
            if pmeta.get("type") == "enum":
                parts.append(f"{pname} (one of {pmeta['choices']}, default {pmeta.get('default')!r})")
            elif pmeta.get("required"):
                parts.append(f"{pname} (required)")
            else:
                parts.append(f"{pname} (default {pmeta.get('default')!r})")
        lines.append(f'  - "{name}": {{{", ".join(parts)}}}')
    return "\n".join(lines)


CONFIG_SYSTEM_PROMPT = f"""You are a trading strategy compiler. Convert the given strategy details into a structured Strategy IR (intermediate representation) that a bar-by-bar backtest executor can run directly — NOT plain English rules.

Return ONLY a valid JSON object with this exact top-level schema:
{{
  "meta": {{
    "direction": "long" | "short" | "long_short",
    "position_sizing": {{"mode": "percent_of_equity", "value": <0-100, default 100>}},
    "timeframe": "<e.g. 5m, 1h, 1d>"
  }},
  "indicators": [{{"id": "<your chosen id>", "type": "<see supported types below>", "params": {{...}}}}],
  "state": [{{"id": "<name>", "type": "bool"|"number", "init": <value>, "reset_when": <expr, optional>}}],
  "entries": [{{"id": "<name>", "direction": "long"|"short", "when": <expr>, "guard": <expr, optional>}}],
  "exits": [
    {{"from": "<entry id>", "type": "signal", "when": <expr>, "guard": <expr, optional>,
      "action": {{"close_pct": <1-100, default 100>, "set_state": {{"<state id>": <value>}}}}, "tag": "<label>"}},
    {{"from": "<entry id>", "type": "stop"|"target", "price_expr": <expr>,
      "action": {{"close_pct": <1-100>}}, "tag": "<label>"}},
    {{"from": "<entry id>", "type": "time", "bars": <int>, "action": {{"close_pct": 100}}, "tag": "<label>"}}
  ],
  "unsupported": ["plain-English description of anything in the source you could NOT express in this schema — fundamental data, discretionary judgment calls, indicators not in the supported list, etc. Empty list if everything was expressible."]
}}

SUPPORTED INDICATOR TYPES (only use these; each computed by pandas_ta from OHLCV — no fundamental/external data):
{_indicator_types_doc()}
Note: "VWAP" here is a typical-price approximation (High+Low+Close)/3 — NOT true session/volume-anchored VWAP. If the strategy's edge depends on precise VWAP, note that in "unsupported" instead of silently using the approximation.

EXPRESSION SYNTAX (used for "when", "guard", "price_expr", "reset_when"):
  - A number or boolean is a literal.
  - A bare string is a ref: an indicator id you declared, one of the built-in refs listed below, or a state id you declared.
  - Built-in refs (always available, no need to declare): {sorted(BUILTIN_REFS)}
    ("position_size" is signed: positive while long, negative while short, 0 when flat.
     "entry_price"/"position_avg_price" are the position's fill price, 0 when flat.
     "bars_in_trade" counts bars since entry, 0 when flat.)
  - Operators (all take a list operand [a, b] except "not"/"rising"/"falling" which take a single expr,
    "and"/"or" which take a list of N exprs, and "prev" which takes [expr] or [expr, n]):
    comparison: {sorted(COMPARISON_OPS)}
    logic: {{"and": [...]}}, {{"or": [...]}}, {{"not": expr}}
    crossovers: {{"crosses_above": [a, b]}}, {{"crosses_below": [a, b]}}
    arithmetic: {{"add": [a,b]}}, {{"sub": [a,b]}}, {{"mul": [a,b]}}, {{"div": [a,b]}}
    lookback: {{"prev": [expr]}} or {{"prev": [expr, n]}} (value n bars back), {{"rising": expr}}, {{"falling": expr}}
  Example: "RSI(5) < 50 AND EMA9 > EMA21" is {{"and": [{{"lt": ["rsi", 50]}}, {{"gt": ["ema_fast", "ema_slow"]}}]}}

exits[].type must be one of {sorted(EXIT_TYPES)}: "signal" (checked against the bar's close), "stop"/"target"
(checked INTRABAR against the bar's low/high — always use these for stop-losses and take-profits, not "signal",
so fills are realistic), or "time" (closes after N bars in the trade — for a max-holding-period rule).

RULES:
- Read the source's ACTUAL formulas/logic, not just labels — see the extraction note above about misleading labels.
- Preserve the actual edge: exact indicator periods/parameters, exact thresholds, state machines (e.g. "take
  partial profit once, then a different exit condition applies afterward" — use "state" + "guard" for this),
  partial closes (action.close_pct), and both long and short legs if the source has both.
- Only use indicator types from the supported list above. If the source needs something else, add a plain-English
  description of it to "unsupported" — do not invent a fake mapping to a supported type.
- Every id in "indicators"/"state"/"entries" must be unique. Every exits[].from must match a declared entries[].id.

WORKED EXAMPLE — a Pine strategy with RSI(5)+EMA9/21 trend filter, a 50%-then-100% partial take-profit exit
(second half exits on either an RSI pullback OR a trend flip), and a percent-of-price stop, both long and short:

{{
  "meta": {{"direction": "long_short", "position_sizing": {{"mode": "percent_of_equity", "value": 100}}, "timeframe": "5m"}},
  "indicators": [
    {{"id": "rsi", "type": "RSI", "params": {{"length": 5}}}},
    {{"id": "ema_fast", "type": "EMA", "params": {{"length": 9}}}},
    {{"id": "ema_slow", "type": "EMA", "params": {{"length": 21}}}}
  ],
  "state": [
    {{"id": "longTP1Hit", "type": "bool", "init": false, "reset_when": {{"eq": ["position_size", 0]}}}},
    {{"id": "shortTP1Hit", "type": "bool", "init": false, "reset_when": {{"eq": ["position_size", 0]}}}}
  ],
  "entries": [
    {{"id": "Long", "direction": "long", "when": {{"and": [{{"lt": ["rsi", 50]}}, {{"gt": ["ema_fast", "ema_slow"]}}]}}}},
    {{"id": "Short", "direction": "short", "when": {{"and": [{{"gt": ["rsi", 50]}}, {{"lt": ["ema_fast", "ema_slow"]}}]}}}}
  ],
  "exits": [
    {{"from": "Long", "type": "signal", "when": {{"crosses_above": ["rsi", 70]}}, "guard": {{"not": "longTP1Hit"}},
     "action": {{"close_pct": 50, "set_state": {{"longTP1Hit": true}}}}, "tag": "TP1"}},
    {{"from": "Long", "type": "signal", "guard": "longTP1Hit",
     "when": {{"or": [{{"crosses_below": ["rsi", 60]}}, {{"crosses_below": ["ema_fast", "ema_slow"]}}]}},
     "action": {{"close_pct": 100}}, "tag": "TP2"}},
    {{"from": "Long", "type": "stop", "price_expr": {{"mul": ["entry_price", 0.9964]}}, "action": {{"close_pct": 100}}, "tag": "SL"}},
    {{"from": "Short", "type": "signal", "when": {{"crosses_below": ["rsi", 30]}}, "guard": {{"not": "shortTP1Hit"}},
     "action": {{"close_pct": 50, "set_state": {{"shortTP1Hit": true}}}}, "tag": "TP1"}},
    {{"from": "Short", "type": "signal", "guard": "shortTP1Hit",
     "when": {{"or": [{{"crosses_above": ["rsi", 40]}}, {{"crosses_above": ["ema_fast", "ema_slow"]}}]}},
     "action": {{"close_pct": 100}}, "tag": "TP2"}},
    {{"from": "Short", "type": "stop", "price_expr": {{"mul": ["entry_price", 1.0036]}}, "action": {{"close_pct": 100}}, "tag": "SL"}}
  ],
  "unsupported": []
}}

Return ONLY the JSON. No explanation. No markdown. No backticks."""


def _call_gemini(prompt: str) -> str:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    response = client.models.generate_content(model=MODEL_NAME, contents=prompt)
    return response.text.strip()


def _parse_json(text: str) -> dict:
    text = re.sub(r"^```[a-zA-Z]*\n?", "", text.strip())
    text = re.sub(r"\n?```$", "", text.strip())
    return json.loads(text)


def extract_strategy_details(raw_text: str) -> dict:
    """
    Call Gemini to extract structured strategy data from raw scraped text or source code.
    Returns a dict with keys: name, description, timeframe, indicators,
    candle_patterns, entry_rules, exit_rules, step_wise_process.
    """
    prompt = f"{EXTRACT_SYSTEM_PROMPT}\n\nRaw input:\n{raw_text[:12000]}"
    return _parse_json(_call_gemini(prompt))


def extract_strategy_config(structured_details: dict) -> dict:
    """
    Convert structured strategy details into a Strategy IR dict — the schema
    apps/strategies/ir/executor.py::run_ir_backtest() executes directly.
    Raises ValueError with the specific validation errors if Gemini's output
    doesn't conform to the IR schema (bad ref, unsupported indicator type,
    dangling exits[].from, etc.) — fails loudly at generation time instead of
    silently producing a partial backtest later.
    """
    details_json = json.dumps(structured_details, indent=2)
    prompt = f"{CONFIG_SYSTEM_PROMPT}\n\nStrategy details:\n{details_json}"
    config = _parse_json(_call_gemini(prompt))

    errors = validate_ir(config)
    if errors:
        raise ValueError("Generated strategy IR failed validation:\n" + "\n".join(f"  - {e}" for e in errors))

    return config
