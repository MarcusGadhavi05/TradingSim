"""
Client desk: pseudo-clients, RFQs, persistent chat threads.
Slice 3: tolerance (urgency widens, annoyance shrinks), messaging, canned replies.
"""

import os
import random
from dataclasses import dataclass, asdict
from anthropic import Anthropic


# ---------- Clients ----------

@dataclass
class Client:
    client_id: str
    name: str
    style: str
    base_tolerance: float
    urgency_ramp: float

CLIENTS = {
    "vortex":  Client("vortex", "Vortex Capital", "Aggressive macro fund", 0.006, 2.5),
    "monarch": Client("monarch", "Monarch Pension", "Size-sensitive real-money", 0.015, 1.2),
}


# ---------- Chat threads (one per client, persists across RFQs) ----------

@dataclass
class Message:
    sender: str   # "you" or "client"
    text: str
    sim_time: float

THREADS: dict[str, list] = {cid: [] for cid in CLIENTS}

def post_message(client_id: str, sender: str, text: str, sim_time: float):
    THREADS.setdefault(client_id, []).append(Message(sender, text, sim_time))

def thread_for(client_id: str) -> list[dict]:
    return [asdict(m) for m in THREADS.get(client_id, [])]

def all_threads() -> dict[str, list]:
    return {cid: [asdict(m) for m in msgs] for cid, msgs in THREADS.items()}


# ---------- RFQs ----------

@dataclass
class RFQ:
    rfq_id: str
    client_id: str
    client_name: str
    contract_id: str
    side: str
    quantity: int
    created_sec: float
    deadline_sec: float
    base_tolerance: float
    urgency_ramp: float
    extended: bool = False
    last_answered_sec: float = 0.0
    status: str = "open"

    def annoyance(self, now: float) -> float:
        """0..1 — climbs with unanswered time. Medium: ~full by halfway through a silent span."""
        span = max(1.0, self.deadline_sec - self.created_sec)
        silent = now - max(self.created_sec, self.last_answered_sec)
        return min(1.0, silent / (span * 0.5))

    def effective_tolerance(self, now: float) -> float:
        span = max(1.0, self.deadline_sec - self.created_sec)
        elapsed = min(1.0, max(0.0, (now - self.created_sec) / span))
        urgency = 1 + self.urgency_ramp * elapsed     # widens toward deadline
        annoy_shrink = 1 - 0.5 * self.annoyance(now)   # up to 50% tighter when ignored
        return self.base_tolerance * urgency * annoy_shrink

    def to_dict(self, now: float | None = None) -> dict:
        d = asdict(self)
        if now is not None:
            d["eff_tolerance"] = self.effective_tolerance(now)
            d["annoyance"] = self.annoyance(now)
            d["time_left"] = max(0.0, self.deadline_sec - now)
        return d


def seed_rfqs() -> list[RFQ]:
    c = CLIENTS["vortex"]
    return [RFQ("rfq_1", c.client_id, c.name, "ASML.AS_bullish", "buy", 50,
                0.0, 120.0, c.base_tolerance, c.urgency_ramp)]


def evaluate_quote(rfq: RFQ, your_price: float, mid: float, now: float) -> bool:
    tol = rfq.effective_tolerance(now)
    if rfq.side == "buy":
        return your_price <= mid * (1 + tol)
    return your_price >= mid * (1 - tol)


# ---------- Intent detection (Haiku + keyword fallback) ----------

INTENTS = ["coming_now", "working_it", "cant_help", "unclear"]
_client = None

def _get_anthropic():
    global _client
    if _client is None:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if key:
            _client = Anthropic(api_key=key)
    return _client

def _keyword_intent(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ["coming", "omw", "sec", "moment", "hold", "wait", "now"]):
        return "coming_now"
    if any(w in t for w in ["working", "on it", "looking", "checking"]):
        return "working_it"
    if any(w in t for w in ["can't", "cant", "no", "pass", "sorry"]):
        return "cant_help"
    return "unclear"

def detect_intent(text: str) -> str:
    client = _get_anthropic()
    if client is None:
        return _keyword_intent(text)
    try:
        resp = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=10,
            system=(
                "You classify a trader's chat message to a client into ONE intent. "
                f"Reply with ONLY one word from this list: {', '.join(INTENTS)}. "
                "coming_now = will price it imminently / asking to hold. "
                "working_it = actively looking but not ready. "
                "cant_help = declining / can't quote. "
                "unclear = none of the above."
            ),
            messages=[{"role": "user", "content": text}],
        )
        out = resp.content[0].text.strip().lower()
        return out if out in INTENTS else "unclear"
    except Exception:
        return _keyword_intent(text)


# ---------- Canned client replies ----------

_REPLIES = {
    "coming_now":  ["Cheers, standing by.", "Ok, waiting on you.", "Right, don't be long."],
    "working_it":  ["Appreciate it.", "Ok, keep me posted.", "Sure."],
    "cant_help":   ["Understood, I'll go elsewhere.", "No worries, thanks."],
    "unclear":     ["Sorry — didn't catch that?", "Come again?"],
}
_HUFFY = ["Any day now…", "I'm losing patience here.", "This is taking forever."]

def client_reply(intent: str, annoyance: float) -> str | None:
    if annoyance > 0.6 and intent in ("coming_now", "working_it") and random.random() < 0.7:
        return random.choice(_HUFFY)
    if intent in ("coming_now", "working_it") and random.random() < 0.25:
        return None
    return random.choice(_REPLIES.get(intent, _REPLIES["unclear"]))


def apply_message(rfq: RFQ, text: str, now: float) -> dict:
    """Process your message: detect intent, apply effect, generate reply."""
    intent = detect_intent(text)
    effect = None
    if intent in ("coming_now", "working_it") and not rfq.extended:
        rfq.deadline_sec += 30
        rfq.extended = True
        effect = "deadline_extended"
    elif intent == "cant_help":
        rfq.status = "rejected"
        effect = "closed"
    rfq.last_answered_sec = now
    reply = client_reply(intent, rfq.annoyance(now))
    return {"intent": intent, "effect": effect, "reply": reply}