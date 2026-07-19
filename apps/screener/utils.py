def normalize_symbols(items: list) -> list:
    """Uppercases, dedupes (order-preserving), and strips a trailing '.NS'/'.BO'
    exchange suffix if present — universes store bare symbols (this project's
    NSE-default convention, see apps/backtests/upstox_client.py), so a user
    pasting a raw list copied from Yahoo Finance (with ".NS") still normalizes
    to the same bare form as one typed without it."""
    result, seen = [], set()
    for item in items:
        for tok in str(item).replace("\n", ",").replace("\t", ",").split(","):
            sym = tok.strip().upper()
            if not sym:
                continue
            if sym.endswith(".NS") or sym.endswith(".BO"):
                sym = sym[:-3]
            if sym not in seen:
                result.append(sym)
                seen.add(sym)
    return result
