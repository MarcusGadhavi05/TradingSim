"""
News scheduler. Loads the curated headline JSON and figures out
which sim-second each headline should fire at, given the engine's
compression ratio.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class NewsItem:
    sim_time:    float   # seconds into the sim
    real_time:   str
    category:    str
    headline:    str
    impact_hint: str
    fired:       bool = False


class NewsScheduler:
    def __init__(self, news_path: str | Path, real_start: datetime, compression: float):
        self.items: list[NewsItem] = []
        with open(news_path) as f:
            raw = json.load(f)

        # Ensure real_start is timezone-aware
        if real_start.tzinfo is None:
            real_start = real_start.replace(tzinfo=timezone.utc)

        for entry in raw:
            event_time = datetime.fromisoformat(entry["real_time"].replace("Z", "+00:00"))
            real_offset_sec = (event_time - real_start).total_seconds()
            sim_time = real_offset_sec / compression
            self.items.append(NewsItem(
                sim_time=sim_time,
                real_time=entry["real_time"],
                category=entry["category"],
                headline=entry["headline"],
                impact_hint=entry["impact_hint"],
            ))

        self.items.sort(key=lambda x: x.sim_time)

    def pending(self, current_sim_time: float) -> list[NewsItem]:
        """Return any items that should have fired by now and haven't."""
        out = []
        for item in self.items:
            if not item.fired and item.sim_time <= current_sim_time:
                item.fired = True
                out.append(item)
        return out

    def reset(self) -> None:
        for item in self.items:
            item.fired = False


# Self-test
if __name__ == "__main__":
    from datetime import datetime
    sched = NewsScheduler(
        news_path=Path(__file__).parent.parent / "data" / "news_timeline.json",
        real_start=datetime(2025, 3, 1, tzinfo=timezone.utc),
        compression=92 * 24 * 3600 / (20 * 60),  # ~3 months compressed to 20 min
    )
    print(f"Loaded {len(sched.items)} news items\n")
    print(f"{'sim_t':>8s}  {'real_date':12s}  {'cat':6s}  headline")
    print("-" * 100)
    for item in sched.items:
        mins = int(item.sim_time // 60)
        secs = item.sim_time % 60
        print(f"  {mins:2d}:{secs:05.2f}  {item.real_time[:10]}  {item.category:6s}  {item.headline[:70]}")
