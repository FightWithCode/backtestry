def normalize_symbols(items: list) -> list:
    """Uppercases, dedupes (order-preserving), and appends the NSE '.NS' suffix
    to any bare ticker — lets a user paste a raw list copied from a broker/exchange
    site without needing to hand-format every line."""
    result, seen = [], set()
    for item in items:
        for tok in str(item).replace("\n", ",").replace("\t", ",").split(","):
            sym = tok.strip().upper()
            if not sym:
                continue
            if "." not in sym:
                sym = f"{sym}.NS"
            if sym not in seen:
                result.append(sym)
                seen.add(sym)
    return result
