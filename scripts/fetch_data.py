"""
Fetch historical market data for the trading sim.

Window: 1 March 2025 to 31 May 2025 (covers Liberation Day crash + recovery)
Granularity: 1-day bars (yfinance free tier limit for >60d back is daily)

For a real 20-min sim compressed from 3 months, daily bars give us
~63 data points. We interpolate between them in the replay engine
to produce smooth tick-by-tick price action.

If you want richer data later, swap to Polygon or another paid provider
and pull 1-min bars. The replay engine doesn't care about granularity.
"""

import yfinance as yf
import pandas as pd
from pathlib import Path

# 12 underlyings across 4 asset classes, 3 regions
INSTRUMENTS = {
    # UK equities
    "BARC.L":  {"asset_class": "equity",    "region": "UK",     "name": "Barclays"},
    "AZN.L":   {"asset_class": "equity",    "region": "UK",     "name": "AstraZeneca"},
    # US equities
    "SPY":     {"asset_class": "equity",    "region": "US",     "name": "S&P 500 ETF"},
    "NVDA":    {"asset_class": "equity",    "region": "US",     "name": "Nvidia"},
    # European equities
    "ASML.AS": {"asset_class": "equity",    "region": "EU",     "name": "ASML"},
    "SAP.DE":  {"asset_class": "equity",    "region": "EU",     "name": "SAP"},
    # FX
    "GBPUSD=X":{"asset_class": "fx",        "region": "global", "name": "GBP/USD"},
    "EURUSD=X":{"asset_class": "fx",        "region": "global", "name": "EUR/USD"},
    "JPY=X":   {"asset_class": "fx",        "region": "global", "name": "USD/JPY"},
    # Rates  (UK gilt future front month)
    "IGLT.L":  {"asset_class": "rates",     "region": "UK",     "name": "UK Gilts ETF"},
    # Commodities
    "BZ=F":    {"asset_class": "commodity", "region": "global", "name": "Brent Crude"},
    "GC=F":    {"asset_class": "commodity", "region": "global", "name": "Gold"},
}

START_DATE = "2025-03-01"
END_DATE   = "2025-05-31"
OUT_DIR    = Path(__file__).parent.parent / "data"


def fetch_one(ticker: str) -> pd.DataFrame | None:
    """Fetch a single ticker. Returns None if data unavailable."""
    try:
        df = yf.download(
            ticker,
            start=START_DATE,
            end=END_DATE,
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
        if df.empty:
            return None
        # Flatten multi-index columns from yfinance
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        return df
    except Exception as e:
        print(f"  failed: {e}")
        return None


def main():
    OUT_DIR.mkdir(exist_ok=True)
    summary = []

    for ticker, meta in INSTRUMENTS.items():
        print(f"Fetching {ticker} ({meta['name']})...")
        df = fetch_one(ticker)
        if df is None or df.empty:
            print(f"  NO DATA for {ticker}")
            summary.append({"ticker": ticker, "rows": 0, "ok": False, **meta})
            continue

        # Save as parquet — fast, compact, preserves types
        safe_name = ticker.replace("=", "_").replace(".", "_")
        out_path = OUT_DIR / f"{safe_name}.parquet"
        df.to_parquet(out_path)

        first_close = float(df["Close"].iloc[0])
        last_close  = float(df["Close"].iloc[-1])
        pct = (last_close / first_close - 1) * 100

        print(f"  {len(df)} rows  |  {first_close:.4f} -> {last_close:.4f}  ({pct:+.2f}%)")
        summary.append({
            "ticker": ticker,
            "rows": len(df),
            "ok": True,
            "first_close": first_close,
            "last_close": last_close,
            "pct_change": pct,
            **meta,
        })

    # Save summary
    summary_df = pd.DataFrame(summary)
    summary_df.to_csv(OUT_DIR / "_summary.csv", index=False)
    print("\n=== Summary ===")
    print(summary_df.to_string(index=False))


if __name__ == "__main__":
    main()
