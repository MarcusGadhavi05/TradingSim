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


# Options whose fair value is essentially zero (deep OTM at low vol — think a
# 10%-away FX strike at 8% IV) are unquotable: mid ~ 0 makes every bid/ask 0 and
# breaks the RFQ tolerance bands. Skip them at menu build time.
MIN_PREMIUM_RATIO = 1e-4   # keep options worth at least 0.01% of spot


# How far "OTM" sits from spot, in multiples of the underlying's own 30-day
# standard deviation (log-return terms) rather than a flat percentage. A flat
# 10%-away strike is ~4 standard deviations out for an 8%-IV FX pair (worth
# ~nothing — filtered out entirely below) but only ~0.3 sigma for a 45%-IV
# name like NVDA (barely OTM at all). Scaling by each instrument's own vol
# keeps "OTM" meaning roughly the same thing — a real, still-priced-with-some-
# optionality strike — across every asset class instead of only equities.
OTM_SIGMA_MULT = 1.5


def build_menu(initial_spots: dict[str, float]) -> list[Contract]:
    """Build the contract menu (up to 5 per underlying) from initial spot prices."""
    contracts: list[Contract] = []
    for ticker, spot in initial_spots.items():
        iv = DEFAULT_IV.get(ticker, 0.25)
        sigma_move = iv * sqrt(T_YEARS)              # 1-sigma 30-day move (log-return)
        otm_mult = exp(OTM_SIGMA_MULT * sigma_move)  # vol-scaled OTM distance

        # Options
        kinds = [
            ("bullish", "call", spot * 1.02, "ATM Call"),
            ("bearish", "put",  spot * 0.98, "ATM Put"),
            ("lottery", "call", spot * otm_mult, "OTM Call"),
            ("hedge",   "put",  spot / otm_mult, "OTM Put"),
        ]

        for suffix, otype, strike, sub in kinds:
            premium = black_scholes(spot, strike, T_YEARS, R, iv, otype)
            if premium < spot * MIN_PREMIUM_RATIO:
                continue
            label = f"{ticker} 1M {'Call' if otype == 'call' else 'Put'} @ {_fmt_strike(ticker, strike)}"
            contracts.append(Contract(
                f"{ticker}_{suffix}", ticker, label, sub, otype, strike, iv
            ))
            
        # Future
        contracts.append(Contract(
            f"{ticker}_future", ticker, f"{ticker} 1M Future", "1-Month Future", "future", spot, 0.0
        ))
    return contracts


def price_contract(contract: Contract, spot: float, t: float | None = None) -> float:
    """`t` is the REMAINING time to expiry in years. Defaults to the full 30-day
    tenor (T_YEARS) so menu-building / offline scripts still work without
    threading a clock through. The live session passes the actual remaining
    time so premiums decay (theta) as sim time passes, and collapse to pure
    intrinsic value at expiry — which is also the exercise/settlement payoff."""
    if t is None:
        t = T_YEARS
    if contract.option_type == "future":
        return spot
    return black_scholes(
        spot=spot, strike=contract.strike,
        t=t, r=R, iv=contract.iv,
        option_type=contract.option_type,
    )

def bs_vega(spot: float, strike: float, t: float, r: float, iv: float) -> float:
    """Black-Scholes vega (per 1.00 change in vol), per unit of underlying."""
    if iv <= 0 or t <= 0:
        return 0.0
    d1 = (log(spot / strike) + (r + 0.5 * iv ** 2) * t) / (iv * sqrt(t))
    return spot * NormalDist().pdf(d1) * sqrt(t)


def _d1(spot: float, strike: float, t: float, r: float, iv: float) -> float:
    return (log(spot / strike) + (r + 0.5 * iv ** 2) * t) / (iv * sqrt(t))


def bs_delta(spot: float, strike: float, t: float, r: float, iv: float, option_type: str) -> float:
    """dPrice/dSpot, per unit of underlying. At/after expiry, delta jumps to the
    fully-exercised (1 or -1) or worthless (0) value depending on moneyness."""
    if iv <= 0 or t <= 0:
        if option_type == "call":
            return 1.0 if spot > strike else 0.0
        return -1.0 if spot < strike else 0.0
    d1 = _d1(spot, strike, t, r, iv)
    if option_type == "call":
        return _norm_cdf(d1)
    return _norm_cdf(d1) - 1.0


def bs_gamma(spot: float, strike: float, t: float, r: float, iv: float) -> float:
    """d^2Price/dSpot^2, per unit of underlying. Same for calls and puts."""
    if iv <= 0 or t <= 0:
        return 0.0
    d1 = _d1(spot, strike, t, r, iv)
    return NormalDist().pdf(d1) / (spot * iv * sqrt(t))


def bs_theta(spot: float, strike: float, t: float, r: float, iv: float, option_type: str) -> float:
    """dPrice/dt as calendar time passes (i.e. already negated + per CALENDAR DAY,
    not per year) — a long option's theta is negative, a short position's is positive."""
    if iv <= 0 or t <= 0:
        return 0.0
    d1 = _d1(spot, strike, t, r, iv)
    d2 = d1 - iv * sqrt(t)
    pdf_d1 = NormalDist().pdf(d1)
    decay = -(spot * pdf_d1 * iv) / (2 * sqrt(t))
    if option_type == "call":
        drift = -r * strike * exp(-r * t) * _norm_cdf(d2)
    else:
        drift = r * strike * exp(-r * t) * _norm_cdf(-d2)
    return (decay + drift) / 365.0


def contract_greeks(contract: Contract, spot: float, t: float | None = None) -> dict:
    """Per-unit-of-underlying Greeks for one contract. Vega is per 1 vol POINT
    (0.01 IV), theta is per CALENDAR DAY, and gamma is the change in delta per
    1% MOVE IN SPOT (not the textbook per-$1-move) — the conventions a desk
    actually reads off a risk sheet, rather than raw units. The 1%-move gamma
    matters: raw d(delta)/dSpot is in units of 1/price, so "per $1" is a huge,
    unrealistic move for a ~1.3 FX spot but a tiny one for a ~500 equity spot —
    without normalising, FX/rates gamma reads as a nonsensical, out-of-scale
    number next to delta and equity gamma. Normalising by spot makes it
    comparable in magnitude across every asset class."""
    if t is None:
        t = T_YEARS
    if contract.option_type == "future":
        return {"delta": 1.0, "gamma": 0.0, "vega": 0.0, "theta": 0.0}
    args = (spot, contract.strike, t, R, contract.iv)
    return {
        "delta": bs_delta(*args, contract.option_type),
        "gamma": bs_gamma(*args) * spot * 0.01,
        "vega":  bs_vega(*args) / 100.0,
        "theta": bs_theta(*args, contract.option_type),
    }


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


def liquidity_quote(contract: Contract, spot: float, qty: int, t: float | None = None) -> dict:
    """Return size-adjusted bid/ask for an order of `qty` contracts.
    `t` is remaining time to expiry in years (see price_contract)."""
    if t is None:
        t = T_YEARS
    mid = price_contract(contract, spot, t)
    base = LIQUIDITY_BASE.get(contract.underlying, 0.0020)
    clip = LIQUIDITY_CLIP.get(contract.underlying, 10)

    # Options: widen base by vega (more risk warehoused = wider quote)
    if contract.option_type != "future":
        vega = bs_vega(spot, contract.strike, t, R, contract.iv)
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
