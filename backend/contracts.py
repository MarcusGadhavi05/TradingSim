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
