"""
A starter universe of well-known NSE mid/small-cap symbols, seeded into the
database the first time the screener is used (see views.UniverseListCreateView).

This is NOT a verified, current NSE F&O-eligible list. F&O eligibility is
reviewed by the exchange periodically against liquidity/market-cap criteria,
so any hardcoded list goes stale — and a list this size can't be hand-verified
symbol-by-symbol here. Treat it as a convenience starting point: edit it,
delete symbols that no longer apply, or replace it entirely by pasting your
own list (one symbol per line or comma-separated) via the "Manage Universes"
screen before relying on screener results for anything real.
"""

DEFAULT_UNIVERSE_SYMBOLS = [
    # Banks / NBFC
    "FEDERALBNK.NS", "IDFCFIRSTB.NS", "BANDHANBNK.NS", "RBLBANK.NS", "PNB.NS",
    "BANKBARODA.NS", "CANBK.NS", "UNIONBANK.NS", "INDIANB.NS", "AUBANK.NS",
    "CHOLAFIN.NS", "MUTHOOTFIN.NS", "MANAPPURAM.NS", "PFC.NS", "RECLTD.NS",
    "LICHSGFIN.NS", "SBICARD.NS", "M&MFIN.NS", "SUNDARMFIN.NS", "CREDITACC.NS",
    "POONAWALLA.NS", "EQUITASBNK.NS", "UJJIVANSFB.NS", "CANFINHOME.NS",

    # Auto ancillary
    "BHARATFORG.NS", "MOTHERSON.NS", "BALKRISHNAIND.NS", "MRF.NS", "APOLLOTYRE.NS",
    "CEATLTD.NS", "EXIDEIND.NS", "SUPRAJIT.NS", "ENDURANCE.NS", "SONACOMS.NS",
    "ASHOKLEY.NS", "ESCORTS.NS", "TIINDIA.NS",

    # IT services (mid-tier)
    "COFORGE.NS", "PERSISTENT.NS", "MPHASIS.NS", "LTTS.NS", "TATAELXSI.NS",
    "ZENSARTECH.NS", "KPITTECH.NS", "CYIENT.NS", "NEWGEN.NS", "INTELLECT.NS",
    "BIRLASOFT.NS", "HEXAWARE.NS",

    # Pharma
    "LUPIN.NS", "TORNTPHARM.NS", "ALKEM.NS", "IPCALAB.NS", "GLENMARK.NS",
    "LAURUSLABS.NS", "GRANULES.NS", "AJANTPHARM.NS", "NATCOPHARM.NS", "JBCHEPHARM.NS",
    "ABBOTINDIA.NS", "GLAND.NS", "SUVENPHARM.NS", "CAPLIPOINT.NS",

    # Chemicals / specialty
    "SRF.NS", "DEEPAKNTR.NS", "AARTIIND.NS", "NAVINFLUOR.NS", "VINATIORGA.NS",
    "ATUL.NS", "PIIND.NS", "GALAXYSURF.NS", "FINEORG.NS", "CLEAN.NS",

    # Real estate
    "GODREJPROP.NS", "OBEROIRLTY.NS", "PRESTIGE.NS", "BRIGADE.NS", "SOBHA.NS",
    "PHOENIXLTD.NS", "SUNTECK.NS",

    # Capital goods / industrials
    "CUMMINSIND.NS", "THERMAX.NS", "VOLTAS.NS", "BLUESTARCO.NS", "HAVELLS.NS",
    "CROMPTON.NS", "POLYCAB.NS", "KEI.NS", "FINCABLES.NS", "CGPOWER.NS",
    "SIEMENS.NS", "ABB.NS", "BHEL.NS",

    # Consumer
    "PAGEIND.NS", "VBL.NS", "DIXON.NS", "RELAXO.NS", "BATAINDIA.NS",
    "TRENT.NS", "VMART.NS", "ABFRL.NS", "JUBLFOOD.NS", "DEVYANI.NS", "WESTLIFE.NS",

    # Metals / mining
    "JINDALSTEL.NS", "NMDC.NS", "NATIONALUM.NS", "HINDCOPPER.NS", "RATNAMANI.NS",
    "WELCORP.NS",

    # Cement
    "JKCEMENT.NS", "RAMCOCEM.NS", "DALBHARAT.NS", "JKLAKSHMI.NS",

    # Financial market infra / fintech / misc growth names
    "IEX.NS", "IRCTC.NS", "NYKAA.NS", "POLICYBZR.NS", "DELHIVERY.NS",
    "CDSL.NS", "BSE.NS", "MCX.NS", "CAMS.NS", "ANGELONE.NS", "KFINTECH.NS",
]
