"""
FastAPI server. Streams ticks (with rolling price history),
news headlines, and portfolio snapshots over websocket.
"""

import asyncio
import sys
from collections import defaultdict, deque
from datetime import timezone
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()  # reads backend/.env into the environment

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(Path(__file__).parent))

from replay_engine import ReplayEngine
from news_scheduler import NewsScheduler
from contracts import build_menu, price_contract, liquidity_quote, Contract
from portfolio import Portfolio
from clients import seed_rfqs, evaluate_two_way, maybe_spawn_rfq, expire_rfqs, solicit_rfq, CLIENTS, apply_message, post_message, all_threads
ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
NEWS_PATH = DATA_DIR / "news_timeline.json"

SIM_DURATION_SEC = 60 * 60
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
        self.rfqs = seed_rfqs(list(self.contracts_by_id.keys()))
        self.scheduler = NewsScheduler(
            news_path=NEWS_PATH,
            real_start=self.engine.real_start.replace(tzinfo=timezone.utc),
            compression=self.engine.compression,
        )
        self.current_prices = dict(initial_tick.prices)
        # Rolling price history per underlying (list of {t, px})
        self.history: dict[str, deque] = defaultdict(lambda: deque(maxlen=HISTORY_LEN))
        self.tick_idx = 0
        self.sim_time = 0.0
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
        quote = liquidity_quote(contract, spot, qty)
        # Buy fills at ask, sell fills at bid — same spread the user was quoted
        fill = quote["ask"] if qty > 0 else quote["bid"]
        note = self.portfolio.trade(contract, qty, fill)
        return {"type": "order_ack", "message": note, "fill": fill}

    def handle_quote(self, msg: dict) -> dict:
        cid = msg.get("contract_id")
        qty = int(msg.get("quantity", 1))
        contract = self.contracts_by_id.get(cid)
        if not contract:
            return {"type": "quote", "bid": 0, "ask": 0}
        spot = self.current_prices[contract.underlying]
        q = liquidity_quote(contract, spot, qty)
        return {
            "type": "quote",
            "contract_id": cid,
            "quantity": qty,
            "bid": q["bid"],
            "ask": q["ask"],
            "mid": q["mid"],
        }
    def handle_client_quote(self, msg: dict) -> dict:
        rfq_id = msg.get("rfq_id")
        your_bid = float(msg.get("bid", 0))
        your_ask = float(msg.get("ask", 0))
        rfq = next((r for r in self.rfqs if r.rfq_id == rfq_id), None)
        if not rfq or rfq.status != "open":
            return {"type": "client_result", "rfq_id": rfq_id, "accepted": False,
                    "message": "RFQ no longer open"}

        contract = self.contracts_by_id.get(rfq.contract_id)
        spot = self.current_prices[contract.underlying]
        mid = price_contract(contract, spot)
        now = self.sim_time

        post_message(rfq.client_id, "you", f"{your_bid:.4f} / {your_ask:.4f}", now)
        traded, dealer_qty, fill_price, action = evaluate_two_way(rfq, your_bid, your_ask, mid, now)

        if action == "invalid":
            return {"type": "client_result", "rfq_id": rfq_id, "accepted": False,
                    "message": "Crossed or invalid market \u2014 your bid must be below your ask."}

        if traded:
            note = self.portfolio.trade(contract, dealer_qty, fill_price)
            rfq.status = "filled"
            edge = (your_ask - mid) if action == "lifted" else (mid - your_bid)
            if action == "lifted":
                post_message(rfq.client_id, "client", f"Lifting your offer at {fill_price:.2f}. Done.", now)
                outcome = f"bought {rfq.quantity} from you at {fill_price:.4f} (fair {mid:.4f}) \u2014 you are short, {edge:+.4f}/unit edge"
            else:
                post_message(rfq.client_id, "client", f"Yours at {fill_price:.2f}. Done.", now)
                outcome = f"sold {rfq.quantity} to you at {fill_price:.4f} (fair {mid:.4f}) \u2014 you are long, {edge:+.4f}/unit edge"
            return {"type": "client_result", "rfq_id": rfq_id, "accepted": True,
                    "message": f"{rfq.client_name} {outcome}. {note}"}

        rfq.status = "rejected"
        post_message(rfq.client_id, "client",
                     f"Fair's around {mid:.2f} \u2014 your {your_bid:.2f}/{your_ask:.2f} is too wide. I'll pass.", now)
        return {"type": "client_result", "rfq_id": rfq_id, "accepted": False,
                "message": f"{rfq.client_name} passed \u2014 fair was ~{mid:.4f}, your market sat outside their tolerance."}

    def handle_client_message(self, msg: dict) -> dict:
        rfq_id = msg.get("rfq_id")
        text = str(msg.get("text", "")).strip()
        rfq = next((r for r in self.rfqs if r.rfq_id == rfq_id), None)
        if not rfq or not text:
            return {"type": "client_msg_result", "rfq_id": rfq_id}
        now = self.sim_time
        post_message(rfq.client_id, "you", text, now)
        result = apply_message(rfq, text, now)
        if result["reply"]:
            post_message(rfq.client_id, "client", result["reply"], now)
        return {"type": "client_msg_result", "rfq_id": rfq_id,
                "intent": result["intent"], "effect": result["effect"]}

    def handle_request_market(self, msg: dict) -> dict:
        client_id = msg.get("client_id")
        rfq = solicit_rfq(self.rfqs, client_id, self.sim_time, list(self.contracts_by_id.keys()))
        if rfq is None:
            name = CLIENTS[client_id].name if client_id in CLIENTS else str(client_id)
            return {"type": "client_result", "rfq_id": None, "accepted": False,
                    "message": f"{name} has nothing to show right now."}
        return {"type": "client_result", "rfq_id": rfq.rfq_id, "accepted": True,
                "message": f"{rfq.client_name} sent a new market."}


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = SimSession()

    await websocket.send_json({
        "type": "init",
        "contracts": session.menu_for_frontend(),
        "sim_duration_sec": SIM_DURATION_SEC,
        "tick_hz": TICK_HZ,
        "clients": [{"client_id": c.client_id, "name": c.name, "style": c.style} for c in CLIENTS.values()],
    })

    async def order_listener():
        try:
            while True:
                msg = await websocket.receive_json()
                if msg.get("type") == "order":
                    ack = session.handle_order(msg)
                    await websocket.send_json(ack)
                elif msg.get("type") == "quote_request":
                    await websocket.send_json(session.handle_quote(msg))
                elif msg.get("type") == "client_quote":
                    await asyncio.sleep(1.2)  # "thinking" delay
                    await websocket.send_json(session.handle_client_quote(msg))
                elif msg.get("type") == "request_market":
                    await websocket.send_json(session.handle_request_market(msg))
                elif msg.get("type") == "client_message":
                    await asyncio.sleep(0.8)  # brief "reading" pause
                    result = await asyncio.to_thread(session.handle_client_message, msg)
                    await websocket.send_json(result)
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
            session.sim_time = tick.sim_time
            expire_rfqs(session.rfqs, tick.sim_time)
            maybe_spawn_rfq(session.rfqs, tick.sim_time, list(session.contracts_by_id.keys()))

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
                "rfqs":      [r.to_dict(tick.sim_time) for r in session.rfqs],
                "threads":   all_threads(),
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