"""
Client desk: pseudo-clients, RFQs, persistent chat threads.
Slice 3: tolerance (urgency widens, annoyance shrinks), messaging, canned replies.
"""

import os
import random
import json
import itertools
from dataclasses import dataclass, asdict
from pathlib import Path
from anthropic import Anthropic
from dotenv import load_dotenv


# ---------- Clients ----------

@dataclass
class Client:
    client_id: str
    name: str
    style: str
    base_tolerance: float
    urgency_ramp: float

CLIENTS = {
    "vortex":      Client("vortex",      "Vortex Capital",        "Aggressive macro fund",       0.018, 2.5),
    "helix":       Client("helix",       "Helix Trading",         "Quant prop / HFT",            0.012, 3.0),
    "monarch":     Client("monarch",     "Monarch Pension",       "Size-sensitive real-money",   0.035, 1.2),
    "brightwater": Client("brightwater", "Brightwater Treasury",  "Corporate hedger",            0.045, 0.9),
    "stonehaven":  Client("stonehaven",  "Stonehaven Asset Mgmt", "Long-only asset manager",     0.030, 1.3),
    "calloway":    Client("calloway",    "Calloway Family Office","Demanding family office",     0.040, 1.8),
    "meridian":    Client("meridian",    "Meridian Systematic",   "Systematic CTA",              0.022, 1.6),
    "albion":      Client("albion",      "Albion Life",           "Insurance / LDI",             0.050, 0.8),
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


_rfq_seq = itertools.count(1)

def _make_rfq(client: Client, contract_id: str, now: float) -> RFQ:
    side = random.choice(("buy", "sell"))
    qty = random.choice((10, 25, 50, 100, 200))
    window = random.uniform(60.0, 150.0)        # seconds until deadline
    return RFQ(f"rfq_{next(_rfq_seq)}", client.client_id, client.name, contract_id,
               side, qty, now, now + window, client.base_tolerance, client.urgency_ramp)


def seed_rfqs(contract_ids: list[str]) -> list[RFQ]:
    """Open the desk with a few live RFQs from different clients."""
    starters = ["vortex", "helix", "monarch", "brightwater"]
    return [_make_rfq(CLIENTS[cid], random.choice(contract_ids), 0.0) for cid in starters]


def maybe_spawn_rfq(rfqs: list[RFQ], now: float, contract_ids: list[str],
                    max_open: int = 8, rate: float = 0.05, quiet_secs: float = 45.0) -> RFQ | None:
    """Occasionally hand a new RFQ to an idle client. Skips clients with recent
    chat activity so a conversation you are in does not get a new request mid-flow."""
    open_clients = {r.client_id for r in rfqs if r.status == "open"}
    if len(open_clients) >= max_open or random.random() > rate:
        return None
    def busy(cid: str) -> bool:
        msgs = THREADS.get(cid, [])
        return bool(msgs) and (now - msgs[-1].sim_time) < quiet_secs
    idle = [c for cid, c in CLIENTS.items() if cid not in open_clients and not busy(cid)]
    if not idle:
        return None
    rfq = _make_rfq(random.choice(idle), random.choice(contract_ids), now)
    rfqs.append(rfq)
    return rfq


def expire_rfqs(rfqs: list[RFQ], now: float) -> None:
    """Mark still-open RFQs past their deadline as expired."""
    for r in rfqs:
        if r.status == "open" and now >= r.deadline_sec:
            r.status = "expired"
            post_message(r.client_id, "client", "Took too long \u2014 not interested anymore.", now)


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
        # Load backend/.env explicitly so the key is found regardless of cwd
        load_dotenv(Path(__file__).parent / ".env")
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
    """Process your message: classify intent, apply effect, generate in-persona reply."""
    annoyance = rfq.annoyance(now)                       # capture BEFORE resetting the clock
    history = thread_for(rfq.client_id)[:-1]             # exclude the just-posted current message
    turn = generate_client_turn(
        client_id=rfq.client_id,
        contract_id=rfq.contract_id,
        side=rfq.side,
        quantity=rfq.quantity,
        player_message=text,
        annoyance=annoyance,
        history=history,
    )
    intent = turn["intent"]
    reply = turn["reply"]

    effect = None
    if rfq.status == "open":
        if intent in ("coming_now", "working_it") and not rfq.extended:
            rfq.deadline_sec += 30
            rfq.extended = True
            effect = "deadline_extended"
        elif intent == "cant_help":
            rfq.status = "rejected"
            effect = "closed"
    rfq.last_answered_sec = now
    return {"intent": intent, "effect": effect, "reply": reply}


# ---------- Persona-driven replies (Haiku, one combined call) ----------

PERSONAS = {
    "vortex": (
        "You ARE Vortex Capital, an aggressive global-macro hedge fund, talking to a "
        "sell-side trader on a chat line. Voice: clipped trading-floor slang, impatient, "
        "transactional, no pleasantries. Lowercase, abbreviations fine (omw, lvls, mid, "
        "where r u, show me). Usually under 8 words. You want a price NOW and hate waiting. "
        "Never apologise, never explain yourself."
    ),
    "helix": (
        "You ARE Helix Trading, a quant prop / HFT shop, talking to a sell-side trader on a "
        "chat line. Voice: ultra-terse, numeric, latency-obsessed, zero small talk. Often "
        "just a few words or a number. You want the tightest price instantly and call out "
        "anything wide. e.g. 'px?', '2 wide, no', 'done if 1'."
    ),
    "monarch": (
        "You ARE Monarch Pension, a large real-money pension fund, talking to a sell-side "
        "trader on a chat line. Voice: measured, courteous, formal, process-driven and very "
        "size-sensitive \u2014 you care about getting filled in size without moving the "
        "market and you reference your mandate or committee. Full polite sentences, patient "
        "but firm. One or two sentences."
    ),
    "brightwater": (
        "You ARE Brightwater Treasury, the corporate treasury of a non-financial company "
        "hedging FX and rates exposure, talking to a sell-side trader. Voice: polite, plain "
        "English, not a markets native \u2014 you are hedging a business need, not trading a "
        "view. You reference budget rates, board approval or hedging policy, and you sometimes "
        "check your understanding of jargon. Full courteous sentences."
    ),
    "stonehaven": (
        "You ARE Stonehaven Asset Management, a long-only asset manager, talking to a "
        "sell-side trader. Voice: professional, calm, benchmark-aware, unhurried. You care "
        "about tracking your benchmark and executing cleanly, not about a few seconds. "
        "One or two measured sentences."
    ),
    "calloway": (
        "You ARE Calloway Family Office, managing money for a wealthy principal, talking to a "
        "sell-side trader. Voice: informal but demanding, relationship-driven, expects "
        "white-glove service and a little impatient. You invoke 'the principal' and expect to "
        "be prioritised. Short, slightly entitled."
    ),
    "meridian": (
        "You ARE Meridian Systematic, a systematic CTA / trend fund, talking to a sell-side "
        "trader. Voice: flat, unemotional, rules-driven. You execute because a signal fired, "
        "not because you have an opinion. Terse, mechanical, no pleasantries. "
        "e.g. 'Signal fired. Need execution. Price.'"
    ),
    "albion": (
        "You ARE Albion Life, an insurance / LDI account, talking to a sell-side trader. "
        "Voice: very conservative, formal, slow, risk-averse. You speak in terms of matching "
        "liabilities, duration and regulatory constraints, and you are never rushed. "
        "Careful, polite sentences."
    ),
}


def generate_client_turn(
    client_id: str,
    contract_id: str,
    side: str,
    quantity: int,
    player_message: str,
    annoyance: float = 0.0,
    history: list[dict] | None = None,
) -> dict:
    """
    ONE Haiku call that both (a) classifies the TRADER's message into an INTENT
    (drives the deterministic game effect) and (b) writes the client's in-persona REPLY.
    Returns {"intent": <one of INTENTS>, "reply": <str>}.
    Any failure (no key, unknown client, bad JSON, API error) falls back to the
    keyword classifier + template reply, so the game never breaks.
    """
    persona = PERSONAS.get(client_id)
    client = _get_anthropic()

    if client is None or persona is None:
        intent = detect_intent(player_message)
        return {"intent": intent, "reply": client_reply(intent, annoyance)}

    if annoyance < 0.33:
        mood = "You are calm."
    elif annoyance < 0.66:
        mood = "You are getting impatient at being kept waiting."
    else:
        mood = "You are angry at how long this is taking."

    system = (
        persona + "\n\n"
        f"CONTEXT: You sent this trader an RFQ to {side} {quantity} of {contract_id} "
        "and you are waiting on their price. The message below is the TRADER's latest "
        f"chat line to you. {mood}\n\n"
        "Return ONLY a JSON object (no markdown, no prose, no code fences) with two keys:\n"
        f'  "intent": classify the TRADER\'S message as exactly one of {INTENTS}. '
        "coming_now = they will price it imminently or ask you to hold; "
        "working_it = actively looking but not ready; "
        "cant_help = declining or cannot quote; unclear = none of these.\n"
        '  "reply": your next chat line back to the trader, fully in persona and '
        "consistent with that intent. Keep it short.\n"
        'Example: {"intent": "coming_now", "reply": "..."}'
    )

    msgs = []
    for m in (history or [])[-4:]:
        role = "assistant" if m.get("sender") == "client" else "user"
        if m.get("text"):
            msgs.append({"role": role, "content": m["text"]})
    msgs.append({"role": "user", "content": player_message})

    try:
        resp = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=120,
            system=system,
            messages=msgs,
        )
        raw = resp.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw[:4].lower() == "json":
                raw = raw[4:]
            raw = raw.strip()
        data = json.loads(raw)
        intent = str(data.get("intent", "")).strip().lower()
        reply = data.get("reply", "")
        if intent not in INTENTS:
            intent = _keyword_intent(player_message)
        if not isinstance(reply, str) or not reply.strip():
            reply = client_reply(intent, annoyance) or ""
        return {"intent": intent, "reply": reply.strip()}
    except Exception:
        intent = detect_intent(player_message)
        return {"intent": intent, "reply": client_reply(intent, annoyance)}
def evaluate_two_way(rfq: RFQ, your_bid: float, your_ask: float, mid: float, now: float):
    """
    Market-making: client wants a two-way market; their true side is hidden in rfq.side.
    Returns (traded, dealer_qty, fill_price, action):
      client buys  -> lifts your ask -> you sell (dealer short, -qty) at your ask
      client sells -> hits your bid  -> you buy  (dealer long,  +qty) at your bid
    """
    if your_bid <= 0 or your_ask <= 0 or your_bid >= your_ask:
        return (False, 0, 0.0, "invalid")
    tol = rfq.effective_tolerance(now)
    if rfq.side == "buy":
        if your_ask <= mid * (1 + tol):
            return (True, -rfq.quantity, your_ask, "lifted")
        return (False, 0, 0.0, "passed")
    else:
        if your_bid >= mid * (1 - tol):
            return (True, rfq.quantity, your_bid, "hit")
        return (False, 0, 0.0, "passed")

def solicit_rfq(rfqs: list[RFQ], client_id: str, now: float, contract_ids: list[str]) -> RFQ | None:
    """Player asks a quiet client for a market. New RFQ only if they have none open."""
    client = CLIENTS.get(client_id)
    if client is None:
        return None
    if any(r.client_id == client_id and r.status == "open" for r in rfqs):
        return None
    rfq = _make_rfq(client, random.choice(contract_ids), now)
    rfqs.append(rfq)
    post_message(client_id, "client", f"Sure \u2014 show me a market in {rfq.quantity} {rfq.contract_id}.", now)
    return rfq
