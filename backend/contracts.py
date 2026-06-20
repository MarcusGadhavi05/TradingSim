"""
The friendly contract menu.

For each of the 12 underlyings we offer 5 contracts:
  - ATM Call (slightly out-of-the-money call)
  - ATM Put  (slightly out-of-the-money put)
  - OTM Call (deep OTM call, cheap, big payoff if it rips)
  - OTM Put  (deep OTM put, cheap protection)
  - 1M Future (linear delta-1 exposure)

The user sees professional labels. Strikes are derived from the spot at
the start of the sim. Pricing is Black-Scholes for options.
"""

from dataclasses import dataclass
from math import log, sqrt, exp
from statistics import NormalDist


# Implied vol per instrument (rough calibration to the 2025 window)
DEFAULT_IV = {
    "BARC.L":   0.30,
    "AZN.L":    0.25,
    "SPY":      0.22,
    "NVDA":     0.45,
    "ASML.AS":  0.35,
    "SAP.DE":   0.25,
    "GBPUSD=X": 0.08,
    "EURUSD=X": 0.08,
    "JPY=X":    0.10,
    "IGLT.L":   0.10,
    "BZ=F":     0.35,
    "GC=F":     0.18,
}

# 30 days to expiry, expressed as a fraction of a year
T_YEARS = 30 / 365
R = 0.045  # risk-free rate, ~ Fed funds in spring 2025


@dataclass
class Contract:
    contract_id: str          # e.g. "SPY_bullish"
    underlying:  str          # e.g. "SPY"
    label:       str          # e.g. "SPY 1M Call @ 586.50"
    subtitle:    str          # e.g. "ATM Call"
    option_type: str          # "call", "put", or "future"
    strike:      float
    iv:          float


def _norm_cdf(x: float) -> float:
    return NormalDist().cdf(x)


def black_scholes(spot: float, strike: float, t: float, r: float,
                  iv: float, option_type: str) -> float:
    """Standard BS price. Returns premium per unit of underlying."""
    if iv <= 0 or t <= 0:
        # Intrinsic value at expiry
        if option_type == "call":
            return max(0.0, spot - strike)
        return max(0.0, strike - spot)

    d1 = (log(spot / strike) + (r + 0.5 * iv ** 2) * t) / (iv * sqrt(t))
    d2 = d1 - iv * sqrt(t)
    if option_type == "call":
        return spot * _norm_cdf(d1) - strike * exp(-r * t) * _norm_cdf(d2)
    return strike * exp(-r * t) * _norm_cdf(-d2) - spot * _norm_cdf(-d1)


def _fmt_strike(ticker: str, strike: float) -> str:
    if "=X" in ticker:
        return f"{strike:.4f}"
    if strike >= 1000:
        return f"{strike:.1f}"
    return f"{strike:.2f}"


def build_menu(initial_spots: dict[str, float]) -> list[Contract]:
    """Build the 60-contract menu from initial spot prices."""
    contracts: list[Contract] = []
    for ticker, spot in initial_spots.items():
        iv = DEFAULT_IV.get(ticker, 0.25)
        
        # Options
        kinds = [
            ("bullish", "call", spot * 1.02, "ATM Call"),
            ("bearish", "put",  spot * 0.98, "ATM Put"),
            ("lottery", "call", spot * 1.10, "OTM Call"),
            ("hedge",   "put",  spot * 0.90, "OTM Put"),
        ]
        
        for suffix, otype, strike, sub in kinds:
            label = f"{ticker} 1M {'Call' if otype == 'call' else 'Put'} @ {_fmt_strike(ticker, strike)}"
            contracts.append(Contract(
                f"{ticker}_{suffix}", ticker, label, sub, otype, strike, iv
            ))
            
        # Future
        contracts.append(Contract(
            f"{ticker}_future", ticker, f"{ticker} 1M Future", "1-Month Future", "future", spot, 0.0
        ))
    return contracts


def price_contract(contract: Contract, spot: float) -> float:
    if contract.option_type == "future":
        return spot
    return black_scholes(
        spot=spot, strike=contract.strike,
        t=T_YEARS, r=R, iv=contract.iv,
        option_type=contract.option_type,
    )

def bs_vega(spot: float, strike: float, t: float, r: float, iv: float) -> float:
    """Black-Scholes vega (per 1.00 change in vol), per unit of underlying."""
    if iv <= 0 or t <= 0:
        return 0.0
    d1 = (log(spot / strike) + (r + 0.5 * iv ** 2) * t) / (iv * sqrt(t))
    return spot * NormalDist().pdf(d1) * sqrt(t)


# Per-instrument base liquidity (half-spread in fraction of mid, at clip size).
# Tighter = more liquid. FX & large caps tight; gilts/NVDA/commodities wider.
LIQUIDITY_BASE = {
    "EURUSD=X": 0.0005, "GBPUSD=X": 0.0006, "JPY=X": 0.0008,
    "SPY": 0.0008, "AZN.L": 0.0010, "ASML.AS": 0.0012,
    "SAP.DE": 0.0012, "BARC.L": 0.0015, "GC=F": 0.0012,
    "BZ=F": 0.0018, "NVDA": 0.0020, "IGLT.L": 0.0025,
}

# "Normal" order size for each instrument (the clip the base spread assumes).
LIQUIDITY_CLIP = {
    "GBPUSD=X": 50, "EURUSD=X": 50, "JPY=X": 50,
    "IGLT.L": 20, "BZ=F": 15, "GC=F": 15,
}  # default 10 for equities/options

IMPACT_COEFF = 0.0030  # overall size impact (per clip-multiple)
IMPACT_EXP   = 0.68    # size sensitivity: 0.5=sqrt (gentle) .. 1.0=linear (steep)


def liquidity_quote(contract: Contract, spot: float, qty: int) -> dict:
    """Return size-adjusted bid/ask for an order of `qty` contracts."""
    mid = price_contract(contract, spot)
    base = LIQUIDITY_BASE.get(contract.underlying, 0.0020)
    clip = LIQUIDITY_CLIP.get(contract.underlying, 10)

    # Options: widen base by vega (more risk warehoused = wider quote)
    if contract.option_type != "future":
        vega = bs_vega(spot, contract.strike, T_YEARS, R, contract.iv)
        # normalise vega against mid so the bump is proportionate
        vega_factor = 1.0 + min(2.0, (vega / mid) if mid > 0 else 0.0)
        base *= vega_factor

    size_penalty = IMPACT_COEFF * (max(1, abs(qty)) / clip) ** IMPACT_EXP
    half = base + size_penalty

    return {
        "mid": mid,
        "bid": mid * (1 - half),
        "ask": mid * (1 + half),
        "half_spread": half,
    }

# Quick self-test
if __name__ == "__main__":
    spots = {"SPY": 575.0, "NVDA": 114.0, "GBPUSD=X": 1.26}
    menu = build_menu(spots)
    print(f"Built {len(menu)} contracts\n")
    print(f"{'label':45s}  {'type':4s}  {'strike':>10s}  {'premium':>8s}")
    print("-" * 75)
    for c in menu:
        spot = spots[c.underlying]
        px = price_contract(c, spot)
        print(f"{c.label:45s}  {c.option_type:4s}  {c.strike:10.4f}  {px:8.4f}")
