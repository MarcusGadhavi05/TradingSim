"""
FastAPI server. Streams ticks (with rolling price history),
news headlines, and portfolio snapshots over websocket.
"""

import asyncio
import sys
from collections import defaultdict, deque
from datetime import timezone
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(Path(__file__).parent))

from replay_engine import ReplayEngine
from news_scheduler import NewsScheduler
from contracts import build_menu, price_contract, Contract
from portfolio import Portfolio


ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
NEWS_PATH = DATA_DIR / "news_timeline.json"

SIM_DURATION_SEC = 20 * 60
TICK_HZ          = 1
HISTORY_LEN      = 240   # 60s of history at 4Hz, plenty for a chart

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SimSession:
    def __init__(self):
        self.engine = ReplayEngine(
            data_dir=DATA_DIR,
            sim_duration_sec=SIM_DURATION_SEC,
            tick_hz=TICK_HZ,
        )
        initial_tick = self.engine.step(0)
        self.contracts: list[Contract] = build_menu(initial_tick.prices)
        self.contracts_by_id = {c.contract_id: c for c in self.contracts}
        self.portfolio = Portfolio()
        self.scheduler = NewsScheduler(
            news_path=NEWS_PATH,
            real_start=self.engine.real_start.replace(tzinfo=timezone.utc),
            compression=self.engine.compression,
        )
        self.current_prices = dict(initial_tick.prices)
        # Rolling price history per underlying (list of {t, px})
        self.history: dict[str, deque] = defaultdict(lambda: deque(maxlen=HISTORY_LEN))
        self.tick_idx = 0
        self.running = False

    def menu_for_frontend(self) -> list[dict]:
        out = []
        for c in self.contracts:
            spot = self.current_prices.get(c.underlying, 0.0)
            out.append({
                "id":       c.contract_id,
                "label":    c.label,
                "subtitle": c.subtitle,
                "type":     c.option_type,
                "strike":   c.strike,
                "premium":  price_contract(c, spot),
                "underlying": c.underlying,
                "spot":     spot,
            })
        return out

    def history_for_frontend(self) -> dict[str, list]:
        return {k: list(v) for k, v in self.history.items()}

    def handle_order(self, msg: dict) -> dict:
        cid = msg.get("contract_id")
        qty = int(msg.get("quantity", 0))
        contract = self.contracts_by_id.get(cid)
        if not contract or qty == 0:
            return {"type": "error", "message": "Invalid order"}
        spot = self.current_prices[contract.underlying]
        premium = price_contract(contract, spot)
        note = self.portfolio.trade(contract, qty, premium)
        return {"type": "order_ack", "message": note}


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = SimSession()

    await websocket.send_json({
        "type": "init",
        "contracts": session.menu_for_frontend(),
        "sim_duration_sec": SIM_DURATION_SEC,
        "tick_hz": TICK_HZ,
    })

    async def order_listener():
        try:
            while True:
                msg = await websocket.receive_json()
                if msg.get("type") == "order":
                    ack = session.handle_order(msg)
                    await websocket.send_json(ack)
        except WebSocketDisconnect:
            session.running = False

    listener_task = asyncio.create_task(order_listener())
    session.running = True
    try:
        for i in range(session.engine.total_ticks):
            if not session.running:
                break
            tick = session.engine.step(i)
            session.current_prices = dict(tick.prices)
            session.tick_idx = i

            # Append to history
            for ticker, px in tick.prices.items():
                session.history[ticker].append({"t": tick.sim_time, "px": px})

            snap = session.portfolio.mark_to_market(
                session.contracts, session.current_prices,
            )
            await websocket.send_json({
                "type":      "tick",
                "sim_time":  tick.sim_time,
                "real_time": tick.real_time,
                "prices":    tick.prices,
                "history":   session.history_for_frontend(),
                "menu":      session.menu_for_frontend(),
                "portfolio": snap,
            })

            for news in session.scheduler.pending(tick.sim_time):
                await websocket.send_json({
                    "type":        "news",
                    "sim_time":    news.sim_time,
                    "real_time":   news.real_time,
                    "category":    news.category,
                    "headline":    news.headline,
                    "impact_hint": news.impact_hint,
                })

            await asyncio.sleep(1.0 / TICK_HZ)

        await websocket.send_json({"type": "sim_complete"})
    except WebSocketDisconnect:
        pass
    finally:
        listener_task.cancel()


@app.get("/")
def root():
    return {"status": "ok", "message": "Trading sim backend running. Connect via /ws."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)