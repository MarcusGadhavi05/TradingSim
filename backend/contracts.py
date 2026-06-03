"""
The friendly contract menu.

For each of the 12 underlyings we offer 4 contracts:
  - Bullish call (slightly out-of-the-money call)
  - Bearish put  (slightly out-of-the-money put)
  - Lottery call (deep OTM call, cheap, big payoff if it rips)
  - Hedge put    (deep OTM put, cheap protection)

The user sees friendly labels. Strikes are derived from the spot at
the start of the sim. Pricing is Black-Scholes with a fixed IV per
instrument.
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
    label:       str          # e.g. "SPY Bullish (high conviction)"
    option_type: str          # "call" or "put"
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


def build_menu(initial_spots: dict[str, float]) -> list[Contract]:
    """Build the 48-contract menu from initial spot prices."""
    contracts: list[Contract] = []
    for ticker, spot in initial_spots.items():
        iv = DEFAULT_IV.get(ticker, 0.25)
        contracts.extend([
            Contract(f"{ticker}_bullish", ticker,
                     f"{ticker} Bullish (high conviction)",
                     "call", spot * 1.02, iv),
            Contract(f"{ticker}_bearish", ticker,
                     f"{ticker} Bearish (high conviction)",
                     "put",  spot * 0.98, iv),
            Contract(f"{ticker}_lottery", ticker,
                     f"{ticker} Lottery (cheap upside)",
                     "call", spot * 1.10, iv),
            Contract(f"{ticker}_hedge",   ticker,
                     f"{ticker} Hedge (cheap downside)",
                     "put",  spot * 0.90, iv),
        ])
    return contracts


def price_contract(contract: Contract, spot: float) -> float:
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