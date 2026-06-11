"""
Client desk: pseudo-clients who request quotes (RFQs).
Slice 2: tolerance + urgency, accept/reject against exchange mid.
"""

from dataclasses import dataclass, asdict, field


@dataclass
class Client:
    client_id: str
    name: str
    style: str
    base_tolerance: float   # fraction over mid it'll stomach at t=0 (e.g. 0.010 = 1%)
    urgency_ramp: float     # how much tolerance widens by deadline (e.g. 2.0 = triples)


@dataclass
class RFQ:
    rfq_id: str
    client_id: str
    client_name: str
    contract_id: str
    side: str               # "buy"/"sell" from CLIENT's perspective
    quantity: int
    created_sec: float      # sim_time the RFQ appeared
    deadline_sec: float     # sim_time it expires if unfilled
    base_tolerance: float
    urgency_ramp: float
    status: str = "open"    # open | filled | rejected | expired

    def effective_tolerance(self, now: float) -> float:
        """Tolerance widens linearly toward the deadline."""
        span = max(1.0, self.deadline_sec - self.created_sec)
        elapsed_frac = min(1.0, max(0.0, (now - self.created_sec) / span))
        return self.base_tolerance * (1 + self.urgency_ramp * elapsed_frac)

    def to_dict(self, now: float | None = None) -> dict:
        d = asdict(self)
        if now is not None:
            d["eff_tolerance"] = self.effective_tolerance(now)
            d["time_left"] = max(0.0, self.deadline_sec - now)
        return d


CLIENTS = {
    "vortex":  Client("vortex", "Vortex Capital", "Aggressive macro fund", 0.006, 2.5),
    "monarch": Client("monarch", "Monarch Pension", "Size-sensitive real-money", 0.015, 1.2),
}


def seed_rfqs() -> list[RFQ]:
    c = CLIENTS["vortex"]
    return [
        RFQ(
            rfq_id="rfq_1",
            client_id=c.client_id,
            client_name=c.name,
            contract_id="ASML.AS_bullish",
            side="buy",
            quantity=50,
            created_sec=0.0,
            deadline_sec=120.0,    # expires 2 min in if unquoted
            base_tolerance=c.base_tolerance,
            urgency_ramp=c.urgency_ramp,
        ),
    ]


def evaluate_quote(rfq: RFQ, your_price: float, mid: float, now: float) -> bool:
    """
    Client decides accept/reject.
    Client buying => you quote an ask; they accept if your ask <= mid*(1+tol).
    Client selling => you quote a bid; they accept if your bid >= mid*(1-tol).
    """
    tol = rfq.effective_tolerance(now)
    if rfq.side == "buy":
        return your_price <= mid * (1 + tol)
    else:
        return your_price >= mid * (1 - tol)
import os
from anthropic import Anthropic

# Intents the classifier can return
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
    """Free fallback if the API is unavailable."""
    t = text.lower()
    if any(w in t for w in ["coming", "omw", "sec", "moment", "hold", "wait", "now"]):
        return "coming_now"
    if any(w in t for w in ["working", "on it", "looking", "checking"]):
        return "working_it"
    if any(w in t for w in ["can't", "cant", "no", "pass", "sorry"]):
        return "cant_help"
    return "unclear"


def detect_intent(text: str) -> str:
    """Map free text to one intent. Tries Haiku, falls back to keywords."""
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