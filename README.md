# Multi-Asset Derivatives Trading Sim

scenario-based replay simulator. Three months of real 2025 market data
(March–May, including Liberation Day) compressed into a 20-minute sim
across 12 underlyings.

## What's built so far (v0)

1. **`scripts/fetch_data.py`** — downloads daily bars for 12 underlyings from Yahoo Finance and saves them as parquet files.
2. **`backend/replay_engine.py`** — walks through the historical data at a configurable compression ratio and emits price ticks.
3. **`backend/news_scheduler.py`** — fires curated real headlines at the correct sim-time.
4. **`data/news_timeline.json`** — 24 hand-curated headlines from the window: Liberation Day, the April 9 reversal, BoE moves, Reeves Spring Statement, US-UK trade deal, etc.

## Instruments (12 total)

| Asset class | Tickers |
|---|---|
| UK equities  | BARC.L, AZN.L |
| US equities  | SPY, NVDA |
| EU equities  | ASML.AS, SAP.DE |
| FX           | GBPUSD=X, EURUSD=X, JPY=X (USDJPY) |
| Rates        | FLG=F (Long Gilt Future) |
| Commodities  | BZ=F (Brent), GC=F (Gold) |

## Running it

```bash
pip install yfinance pandas pyarrow
python scripts/fetch_data.py        # one-off, populates data/
python backend/replay_engine.py     # synthetic-data self-test
python backend/news_scheduler.py    # see when headlines fire
```

If any instruments fail to download (FLG=F sometimes does), pick a substitute — TLT is a fine US bond ETF stand-in for gilts.

## What's next (build order)

5. **Pre-baked contract menu** — define 4 contracts per underlying (call/put, ATM/OTM) with friendly labels like "SPY Bullish high-conviction". Black-Scholes pricer hidden behind it.
6. **Order manager + portfolio** — track positions, mark-to-market P&L on every tick.
7. **FastAPI backend** — single endpoint streams ticks + news + portfolio over websocket.
8. **React frontend** — single screen: chart, contract menu, blotter, P&L, news ticker.
9. **Claude integration** — pre-sim brief, optional headline commentary, post-sim debrief.

## Design principles

- **Replay over simulation.** Real 2025 data, no GBM.
- **Lazy options.** Constant IV per instrument; Greeks computed but hidden from user in v1.
- **Friendly menu over chain.** Four named contracts per underlying, not a strike grid.
- **One screen, big numbers.** Big, tabular numbers; minimal chrome; nothing on screen that isn't earning its place.
- **Scenario per session.** Don't bolt on more windows until the first one is polished.
