"""
Replay engine: walks through historical data at a compressed rate
and emits price ticks to listeners.

Design:
  - Real window: 3 months (~63 trading days)
  - Sim duration: configurable (default 20 min)
  - Tick rate: configurable (default 4 Hz)
  - Between daily bars we interpolate linearly with small random noise
    so prices feel "live" rather than jumping in steps

Usage:
    engine = ReplayEngine(
        data_dir="./data",
        sim_duration_sec=20*60,
        tick_hz=4,
    )
    engine.subscribe(lambda tick: print(tick))
    engine.run()
"""

from __future__ import annotations
import asyncio
import json
import random
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable

import pandas as pd


@dataclass
class Tick:
    sim_time:   float           # seconds since sim start
    real_time:  str             # ISO timestamp in the historical window
    prices:     dict[str, float]  # ticker -> current mid price


class ReplayEngine:
    def __init__(
        self,
        data_dir: str | Path,
        sim_duration_sec: float = 20 * 60,
        tick_hz: float = 4.0,
        noise_bps: float = 0.1,        # 0.1bp of intratick noise — barely-visible tape shimmer
        data_time_scale: float = 1.0,  # <1 slows how fast historical time passes per sim second
        seed: int | None = 42,
    ):
        self.data_dir = Path(data_dir)
        self.sim_duration_sec = sim_duration_sec
        self.data_time_scale = data_time_scale
        self.tick_hz = tick_hz
        self.tick_interval = 1.0 / tick_hz
        self.total_ticks = int(sim_duration_sec * tick_hz)
        self.noise_bps = noise_bps
        self.rng = random.Random(seed)
        self.listeners: list[Callable[[Tick], None]] = []

        self._load_data()

    def _load_data(self) -> None:
        """Load every parquet file in the data directory."""
        self.series: dict[str, pd.Series] = {}
        for path in sorted(self.data_dir.glob("*.parquet")):
            df = pd.read_parquet(path)
            ticker = path.stem.replace("_", "=", 1) if "_F" in path.stem or "_X" in path.stem else path.stem.replace("_", ".")
            # Use Close as our price reference
            self.series[ticker] = df["Close"].dropna()

        if not self.series:
            raise FileNotFoundError(
                f"No parquet files found in {self.data_dir}. "
                "Run scripts/fetch_data.py first."
            )

        # Establish the real-time window from the first ticker we loaded
        first = next(iter(self.series.values()))
        self.real_start = first.index[0].to_pydatetime()
        self.real_end   = first.index[-1].to_pydatetime()
        self.real_span_sec = (self.real_end - self.real_start).total_seconds()
        # Historical seconds that pass per sim second. data_time_scale < 1 means the
        # sim covers only that fraction of the window, at a proportionally calmer pace.
        # Everything downstream (step(), NewsScheduler) keys off this one number.
        self.compression = self.real_span_sec / self.sim_duration_sec * self.data_time_scale

    def subscribe(self, fn: Callable[[Tick], None]) -> None:
        self.listeners.append(fn)

    def _price_at(self, ticker: str, real_time: datetime) -> float:
        """Linear interpolation between daily closes + tiny noise."""
        s = self.series[ticker]
        # Find surrounding indices
        ts = pd.Timestamp(real_time)
        if ts <= s.index[0]:
            base = float(s.iloc[0])
        elif ts >= s.index[-1]:
            base = float(s.iloc[-1])
        else:
            # Locate bracketing observations
            after_idx = s.index.searchsorted(ts)
            before_idx = after_idx - 1
            t0, t1 = s.index[before_idx], s.index[after_idx]
            p0, p1 = float(s.iloc[before_idx]), float(s.iloc[after_idx])
            frac = (ts - t0) / (t1 - t0)
            base = p0 + frac * (p1 - p0)

        # Add a small noise term so the tape looks alive
        noise = self.rng.gauss(0, base * self.noise_bps / 10_000)
        return base + noise

    def step(self, tick_idx: int) -> Tick:
        sim_time = tick_idx * self.tick_interval
        real_time = self.real_start + timedelta(
            seconds=sim_time * self.compression
        )
        prices = {t: self._price_at(t, real_time) for t in self.series}
        return Tick(
            sim_time=sim_time,
            real_time=real_time.isoformat(),
            prices=prices,
        )

    def run(self, on_tick: Callable[[Tick], None] | None = None) -> None:
        """Synchronous run for CLI testing — no real-time pacing."""
        if on_tick:
            self.listeners.append(on_tick)
        for i in range(self.total_ticks):
            tick = self.step(i)
            for fn in self.listeners:
                fn(tick)

    async def run_async(self) -> None:
        """Real-time-paced run, intended for live websocket streaming."""
        for i in range(self.total_ticks):
            tick = self.step(i)
            for fn in self.listeners:
                fn(tick)
            await asyncio.sleep(self.tick_interval)


# Quick self-test that doesn't require external data: synthesise some bars,
# write them as parquet, then prove the engine walks through them correctly.
if __name__ == "__main__":
    import numpy as np
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        # Fake 63 trading days for two tickers
        idx = pd.bdate_range("2025-03-01", periods=63)
        for ticker, start_px in [("SPY", 580.0), ("BARC.L", 320.0)]:
            # Random walk
            rets = np.random.default_rng(hash(ticker) & 0xFFFF).normal(0, 0.015, 63)
            prices = start_px * np.exp(np.cumsum(rets))
            df = pd.DataFrame({"Close": prices}, index=idx)
            safe = ticker.replace(".", "_")
            df.to_parquet(tmp_dir / f"{safe}.parquet")

        engine = ReplayEngine(data_dir=tmp_dir, sim_duration_sec=10, tick_hz=2)
        print(f"Compression: {engine.compression:.0f}x")
        print(f"Total ticks: {engine.total_ticks}")
        print(f"Real window: {engine.real_start} -> {engine.real_end}\n")

        # Sample every 5th tick so output isn't enormous
        seen = []
        engine.run(lambda t: seen.append(t))
        for t in seen[::4]:
            line = f"t={t.sim_time:5.2f}s  real={t.real_time[:10]}  "
            line += "  ".join(f"{k}={v:.2f}" for k, v in t.prices.items())
            print(line)
