"""
FastAPI server. Streams ticks (with rolling price history),
news headlines, and portfolio snapshots over websocket.
"""

import asyncio
import itertools
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
from clients import seed_rfqs, evaluate_two_way, evaluate_unsolicited, maybe_spawn_rfq, qty_in_band, solicit_rfq, CLIENTS, RFQ, MAX_COUNTER_ROUNDS, apply_message, post_message, all_threads
ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
NEWS_PATH = DATA_DIR / "news_timeline.json"

SIM_DURATION_SEC = 60 * 60
TICK_HZ          = 1
DATA_TIME_SCALE  = 0.025  # slow the tape: ~1/40 of the historical window per sim hour
HISTORY_LEN      = 240   # 60s of history at 4Hz, plenty for a chart

# Unsolicited fills get their own id space so they can never collide with rfq_N
_unsol_seq = itertools.count(1)


def _short_ticker(t: str) -> str:
    for sfx in ("=X", "=F", ".L", ".AS", ".DE"):
        t = t.replace(sfx, "")
    return t


def _fmt_px(px: float) -> str:
    """Chat-friendly price: more decimals for small premiums (FX options ~0.004)."""
    a = abs(px)
    if a >= 10:
        return f"{px:.2f}"
    if a >= 1:
        return f"{px:.3f}"
    return f"{px:.4f}"

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
            data_time_scale=DATA_TIME_SCALE,
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
        # Pending unsolicited counters: (client_id, contract_id) -> {px, rounds, created_sec}.
        # Popped on FULL fill or walk; a partial fill does NOT reset rounds.
        self.unsol_counters: dict = {}
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
        if mid <= 0:
            return {"type": "client_result", "rfq_id": rfq_id, "accepted": False,
                    "message": "Pricing error — this contract has no fair value right now. No trade."}

        # Derive the short-form ticker the frontend displays/sends
        real_ticker = rfq.contract_id.rsplit("_", 1)[0]  # "GBPUSD=X_bullish" → "GBPUSD=X"
        def _short(t: str) -> str:
            for sfx in ("=X", "=F", ".L", ".AS", ".DE"):
                t = t.replace(sfx, "")
            return t
        real_short = _short(real_ticker)

        quoted_ticker = str(msg.get("quoted_ticker", real_short)).strip()
        _qty_raw = msg.get("quoted_qty", rfq.quantity)
        quoted_qty = rfq.quantity if _qty_raw is None else int(_qty_raw)

        ticker_ok = quoted_ticker.upper() == real_short.upper()
        qty_ok    = qty_in_band(rfq.quantity, quoted_qty)
        if not ticker_ok or not qty_ok:
            if not ticker_ok:
                post_message(rfq.client_id, "client",
                             f"I asked for {rfq.quantity} {real_short}, not "
                             f"{quoted_qty} {quoted_ticker}. Quote what I asked.", now)
            else:
                post_message(rfq.client_id, "client",
                             f"I asked for {rfq.quantity} {real_short} — {quoted_qty} is "
                             f"way off my size. Get closer and we can talk.", now)
            parts = []
            if not ticker_ok:
                parts.append(f"ticker ({quoted_ticker} ≠ {real_short})")
            if not qty_ok:
                parts.append(f"quantity ({quoted_qty} too far from {rfq.quantity})")
            return {"type": "client_result", "rfq_id": rfq_id, "accepted": False,
                    "message": f"Wrong {' and '.join(parts)} — {rfq.client_name} wants "
                               f"{rfq.quantity} {real_short}. RFQ still open."}

        post_message(rfq.client_id, "you", f"{your_bid:.4f} / {your_ask:.4f}", now)
        traded, dealer_qty, fill_price, action = evaluate_two_way(rfq, your_bid, your_ask, mid, now,
                                                                  offered_qty=quoted_qty)

        if action == "invalid":
            return {"type": "client_result", "rfq_id": rfq_id, "accepted": False,
                    "message": "Crossed or invalid market \u2014 your bid must be below your ask."}

        if traded:
            note = self.portfolio.trade(contract, dealer_qty, fill_price)
            n = abs(dealer_qty)
            remaining = rfq.quantity - n   # reduced fills keep the RFQ open for the balance
            lifted = action.startswith("lifted")
            edge = (your_ask - mid) if lifted else (mid - your_bid)
            if lifted:
                if action == "lifted_close":
                    post_message(rfq.client_id, "client", f"You're wide, but fine \u2014 lifting your offer at {_fmt_px(fill_price)}. Done.", now)
                elif action == "lifted_partial":
                    post_message(rfq.client_id, "client", f"Too wide for the full amount \u2014 I'll take {n} of {rfq.quantity} at {_fmt_px(fill_price)}. Show me better for the other {remaining}.", now)
                elif action == "lifted_short":
                    post_message(rfq.client_id, "client", f"Done \u2014 lifting {n} at {_fmt_px(fill_price)}. Still need the other {remaining} though.", now)
                else:
                    post_message(rfq.client_id, "client", f"Lifting your offer at {_fmt_px(fill_price)}. Done.", now)
                outcome = f"bought {n} from you at {fill_price:.4f} (fair {mid:.4f}) \u2014 you are short, {edge:+.4f}/unit edge"
            else:
                if action == "hit_close":
                    post_message(rfq.client_id, "client", f"Bit low, but I'll take it \u2014 yours at {_fmt_px(fill_price)}. Done.", now)
                elif action == "hit_partial":
                    post_message(rfq.client_id, "client", f"Only good for {n} at {_fmt_px(fill_price)}. Come back better on the other {remaining}.", now)
                elif action == "hit_short":
                    post_message(rfq.client_id, "client", f"Yours for {n} at {_fmt_px(fill_price)}. Done \u2014 balance of {remaining} still to go.", now)
                else:
                    post_message(rfq.client_id, "client", f"Yours at {_fmt_px(fill_price)}. Done.", now)
                outcome = f"sold {n} to you at {fill_price:.4f} (fair {mid:.4f}) \u2014 you are long, {edge:+.4f}/unit edge"
            if remaining > 0:
                rfq.quantity = remaining
                rfq.counter_qty = 0          # any size floor referred to the old total
                rfq.last_answered_sec = now  # fresh patience for the balance
                outcome += f" ({remaining} left to work \u2014 RFQ stays open)"
            else:
                rfq.status = "filled"
            return {"type": "client_result", "rfq_id": rfq_id, "accepted": True,
                    "message": f"{rfq.client_name} {outcome}. {note}"}

        if action == "counter_qty":
            # price is fine, size is too light — dealer_qty carries the compromise size.
            # Size haggling never burns counter_rounds or walks: the client likes the
            # level, so they hold their floor and keep the RFQ open.
            compromise = dealer_qty
            if rfq.counter_qty and quoted_qty < rfq.counter_qty:
                post_message(rfq.client_id, "client",
                             f"I said {rfq.counter_qty} — that's as low as I'll go. "
                             f"Do {rfq.counter_qty} at your level and we're done.", now)
                return {"type": "client_result", "rfq_id": rfq_id, "accepted": False,
                        "message": f"{rfq.client_name} is holding at {rfq.counter_qty}. Quote that size."}
            rfq.counter_qty = compromise
            post_message(rfq.client_id, "client",
                         f"{quoted_qty}'s too light — I asked for {rfq.quantity}. "
                         f"Do {compromise} and we'll trade at your level.", now)
            return {"type": "client_result", "rfq_id": rfq_id, "accepted": False,
                    "message": f"{rfq.client_name} countered on size: show at least {compromise}. Re-quote."}

        # action == "counter": fill_price carries the client's counter level
        counter_px = fill_price
        if rfq.counter_rounds >= MAX_COUNTER_ROUNDS:
            rfq.status = "rejected"
            post_message(rfq.client_id, "client", "We're too far apart \u2014 I'm done here.", now)
            return {"type": "client_result", "rfq_id": rfq_id, "accepted": False,
                    "message": f"{rfq.client_name} walked away after {rfq.counter_rounds} counters \u2014 fair was ~{mid:.4f}."}
        rfq.counter_rounds += 1
        rfq.counter_px = counter_px
        if rfq.side == "buy":
            post_message(rfq.client_id, "client",
                         f"Can't pay {_fmt_px(your_ask)}. Show me {_fmt_px(counter_px)} and I'll do the full {rfq.quantity}.", now)
        else:
            post_message(rfq.client_id, "client",
                         f"{_fmt_px(your_bid)} doesn't work. I need {_fmt_px(counter_px)} for the {rfq.quantity}.", now)
        return {"type": "client_result", "rfq_id": rfq_id, "accepted": False,
                "message": f"{rfq.client_name} countered at {counter_px:.4f} \u2014 improve your market and re-quote."}

    def _resolve_unsolicited_contract(self, ticker: str, client) -> Contract | None:
        """Map the quote bar's bare ticker to a contract. Full contract_id passes
        through; otherwise match the underlying and prefer the instrument the
        client has a standing interest in, falling back to the 1M future."""
        t = ticker.strip()
        if t in self.contracts_by_id:
            return self.contracts_by_id[t]
        underlying = next((u for u in self.current_prices
                           if u.upper() == t.upper()
                           or _short_ticker(u).upper() == t.upper()), None)
        if underlying is None:
            return None
        for cid in client.interest_map:
            c = self.contracts_by_id.get(cid)
            if c and c.underlying == underlying:
                return c
        return self.contracts_by_id.get(f"{underlying}_future")

    def handle_unsolicited_quote(self, msg: dict) -> dict:
        client_id = msg.get("client_id")
        client = CLIENTS.get(client_id)
        if client is None:
            return {"type": "client_result", "rfq_id": None, "accepted": False,
                    "message": "Unknown client."}
        ticker = str(msg.get("ticker", "")).strip()
        contract = self._resolve_unsolicited_contract(ticker, client)
        if contract is None:
            return {"type": "client_result", "rfq_id": None, "accepted": False,
                    "message": f"No instrument matches '{ticker}'."}
        try:
            qty = int(msg.get("qty", 0))
            your_bid = float(msg.get("bid", 0))
            your_ask = float(msg.get("ask", 0))
        except (TypeError, ValueError):
            return {"type": "client_result", "rfq_id": None, "accepted": False,
                    "message": "Invalid quote values."}
        if qty <= 0:
            return {"type": "client_result", "rfq_id": None, "accepted": False,
                    "message": "Quantity must be positive."}

        spot = self.current_prices[contract.underlying]
        mid = price_contract(contract, spot)
        now = self.sim_time
        if mid <= 0:
            return {"type": "client_result", "rfq_id": None, "accepted": False,
                    "message": "Pricing error — this contract has no fair value right now. No trade."}

        post_message(client_id, "you", f"{your_bid:.4f} / {your_ask:.4f}", now)
        traded, dealer_qty, fill_price, action = evaluate_unsolicited(
            client, contract.contract_id, your_bid, your_ask, mid, qty)

        if action == "invalid":
            return {"type": "client_result", "rfq_id": None, "accepted": False,
                    "message": "Crossed or invalid market \u2014 your bid must be below your ask."}

        if action == "not_interested":
            post_message(client_id, "client", "Nothing there for me right now.", now)
            return {"type": "client_result", "rfq_id": None, "accepted": False,
                    "message": f"{client.name} isn't interested in {contract.contract_id} right now."}

        if action == "passed":
            post_message(client_id, "client",
                         f"Fair's around {_fmt_px(mid)} \u2014 your {_fmt_px(your_bid)}/{_fmt_px(your_ask)} is too wide, I'll pass.", now)
            return {"type": "client_result", "rfq_id": None, "accepted": False,
                    "message": f"{client.name} passed \u2014 fair was ~{mid:.4f}, your market sat outside their interest."}

        key = (client_id, contract.contract_id)

        if action == "counter":
            counter_px = fill_price   # third slot carries the counter level
            entry = self.unsol_counters.get(key)
            if entry and now - entry["created_sec"] > 120:
                entry = None          # stale \u2014 rounds reset
            rounds = entry["rounds"] if entry else 0
            if rounds >= MAX_COUNTER_ROUNDS:
                self.unsol_counters.pop(key, None)
                post_message(client_id, "client", "We're too far apart \u2014 I'm done here.", now)
                return {"type": "client_result", "rfq_id": None, "accepted": False,
                        "message": f"{client.name} walked away after {rounds} counters \u2014 fair was ~{mid:.4f}."}
            self.unsol_counters[key] = {"px": counter_px, "rounds": rounds + 1, "created_sec": now}
            if client.interest_map[contract.contract_id]["desired_side"] == "buy":
                post_message(client_id, "client",
                             f"Can't pay {_fmt_px(your_ask)}. Show me {_fmt_px(counter_px)} and I'll do the full {qty}.", now)
            else:
                post_message(client_id, "client",
                             f"{_fmt_px(your_bid)} doesn't work. I need {_fmt_px(counter_px)} for the {qty}.", now)
            return {"type": "client_result", "rfq_id": None, "accepted": False,
                    "message": f"{client.name} countered at {counter_px:.4f} \u2014 improve your market and re-quote."}

        # traded: book dealer_qty exactly as evaluate_unsolicited returned it
        note = self.portfolio.trade(contract, dealer_qty, fill_price)
        if not action.endswith("_partial"):
            # Full fill ends the negotiation; a partial keeps rounds so the cap can't be reset
            self.unsol_counters.pop(key, None)
        n = abs(dealer_qty)
        lifted = action.startswith("lifted")
        rfq = RFQ(
            rfq_id=f"unsol_{next(_unsol_seq)}",
            client_id=client.client_id,
            client_name=client.name,
            contract_id=contract.contract_id,
            side="buy" if lifted else "sell",   # the client's action
            quantity=n,                          # what actually traded
            created_sec=now,
            deadline_sec=now,
            base_tolerance=client.base_tolerance,
            urgency_ramp=client.urgency_ramp,
            status="filled",
        )
        self.rfqs.append(rfq)
        edge = (your_ask - mid) if lifted else (mid - your_bid)
        if lifted:
            if action == "lifted_close":
                post_message(client_id, "client", f"You're wide, but fine \u2014 lifting your offer at {_fmt_px(fill_price)}. Done.", now)
            elif action == "lifted_partial":
                post_message(client_id, "client", f"Too wide for the full amount \u2014 I'll take {n} of {qty} at {_fmt_px(fill_price)}. Done for those.", now)
            else:
                post_message(client_id, "client", f"Lifting your offer at {_fmt_px(fill_price)}. Done.", now)
            outcome = f"bought {n} from you at {fill_price:.4f} (fair {mid:.4f}) \u2014 you are short, {edge:+.4f}/unit edge"
        else:
            if action == "hit_close":
                post_message(client_id, "client", f"Bit low, but I'll take it \u2014 yours at {_fmt_px(fill_price)}. Done.", now)
            elif action == "hit_partial":
                post_message(client_id, "client", f"Only good for {n} at {_fmt_px(fill_price)}. Partial, done.", now)
            else:
                post_message(client_id, "client", f"Yours at {_fmt_px(fill_price)}. Done.", now)
            outcome = f"sold {n} to you at {fill_price:.4f} (fair {mid:.4f}) \u2014 you are long, {edge:+.4f}/unit edge"
        if action.endswith("_partial"):
            outcome += f" (partial \u2014 you showed {qty})"
        return {"type": "client_result", "rfq_id": rfq.rfq_id, "accepted": True,
                "message": f"{client.name} {outcome}. {note}"}

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
                elif msg.get("type") == "unsolicited_quote":
                    await asyncio.sleep(1.2)  # same "thinking" delay as client_quote
                    await websocket.send_json(session.handle_unsolicited_quote(msg))
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