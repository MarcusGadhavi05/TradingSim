"""
Client desk: pseudo-clients, RFQs, persistent chat threads.
Tolerance (urgency widens, annoyance shrinks) plus persona-driven chat replies.
"""

import os
import math
import random
import itertools
import traceback
from dataclasses import dataclass, asdict, field
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
    interest_map: dict = field(default_factory=dict)
    # Typical clip sizes this client's RFQs are drawn from. Bank-desk scale:
    # ~5x the old retail-ish 10-200 range, but still a clear step below the
    # whale accounts below, so Solstice/Colossus still feel like the biggest
    # tickets on the desk rather than just more of the same.
    qty_choices: tuple = (50, 100, 250, 500, 1000)

CLIENTS = {
    "harrow":      Client("harrow",      "Harrow Global Macro",   "Aggressive macro fund",       0.018, 2.5, interest_map={
        "SPY_future":      {"desired_side": "buy",  "edge_threshold": 0.010, "max_qty": None},
        "GBPUSD=X_future": {"desired_side": "sell", "edge_threshold": 0.008, "max_qty": None},
        "JPY=X_future":    {"desired_side": "buy",  "edge_threshold": 0.008, "max_qty": 1500},
        "BZ=F_future":     {"desired_side": "buy",  "edge_threshold": 0.012, "max_qty": 1000},
        "GC=F_bullish":    {"desired_side": "buy",  "edge_threshold": 0.015, "max_qty": 750},
        "NVDA_lottery":    {"desired_side": "buy",  "edge_threshold": 0.020, "max_qty": 750},
    }),
    "perrystreet": Client("perrystreet", "Perry Street Trading",  "Quant prop / ETF & options arb", 0.012, 3.0),
    "monarch":     Client("monarch",     "Monarch Pension",       "Size-sensitive real-money",   0.035, 1.2, interest_map={
        "IGLT.L_future": {"desired_side": "buy",  "edge_threshold": 0.030, "max_qty": 250},
        "SPY_hedge":     {"desired_side": "buy",  "edge_threshold": 0.035, "max_qty": 200},
        "AZN.L_future":  {"desired_side": "sell", "edge_threshold": 0.030, "max_qty": 125},
    }),
    "brightwater": Client("brightwater", "Brightwater Treasury",  "Corporate hedger",            0.045, 0.9),
    "stonehaven":  Client("stonehaven",  "Stonehaven Asset Mgmt", "Long-only asset manager",     0.030, 1.3),
    "calloway":    Client("calloway",    "Calloway Family Office","Demanding family office",     0.040, 1.8),
    "meridian":    Client("meridian",    "Meridian Systematic",   "Systematic CTA",              0.022, 1.6),
    "zuidas":      Client("zuidas",      "Zuidas Derivatives",    "Options market maker — sharp, blunt, size-flexible", 0.014, 2.8,
        interest_map={
            "SPY_bullish":    {"desired_side": "sell", "edge_threshold": 0.012, "max_qty": 800},
            "ASML.AS_hedge":  {"desired_side": "buy",  "edge_threshold": 0.014, "max_qty": 600},
            "NVDA_bearish":   {"desired_side": "sell", "edge_threshold": 0.016, "max_qty": 500},
        },
    ),
    "kinross":     Client("kinross",     "Kinross Re",            "Pension risk transfer / bulk annuity insurer", 0.050, 0.7,
        qty_choices=(100, 250, 500, 1000, 2000),
    ),
    "solstice":    Client("solstice",    "Solstice Sovereign Wealth Fund", "Sovereign wealth fund — vast, patient real money", 0.026, 0.5,
        interest_map={
            "SPY_future":     {"desired_side": "buy", "edge_threshold": 0.012, "max_qty": 6000},
            "GC=F_future":    {"desired_side": "buy", "edge_threshold": 0.016, "max_qty": 4000},
            "IGLT.L_future":  {"desired_side": "buy", "edge_threshold": 0.022, "max_qty": 5000},
        },
        qty_choices=(500, 1000, 2500, 5000, 10000),
    ),
    "colossus":    Client("colossus",    "Colossus Capital Partners", "Mega multi-strategy hedge fund — huge, aggressive size", 0.015, 2.8,
        interest_map={
            "NVDA_lottery":    {"desired_side": "buy",  "edge_threshold": 0.018, "max_qty": 3000},
            "BZ=F_future":     {"desired_side": "sell", "edge_threshold": 0.010, "max_qty": 4000},
            "GBPUSD=X_future": {"desired_side": "buy",  "edge_threshold": 0.008, "max_qty": 5000},
        },
        qty_choices=(500, 1000, 2000, 5000),
    ),
    "obsidian":    Client("obsidian",    "Obsidian Asset Management", "Giant institutional asset manager — calm, index-heavy, process-driven", 0.024, 0.6,
        interest_map={
            "SPY_future":      {"desired_side": "buy",  "edge_threshold": 0.010, "max_qty": 8000},
            "EURUSD=X_future": {"desired_side": "sell", "edge_threshold": 0.010, "max_qty": 5000},
            "IGLT.L_future":   {"desired_side": "buy",  "edge_threshold": 0.018, "max_qty": 4000},
        },
        qty_choices=(500, 1000, 2500, 5000, 8000),
    ),
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
    last_answered_sec: float = 0.0
    status: str = "open"
    counter_px: float = 0.0      # level the client countered at (0 = none)
    counter_rounds: int = 0      # counters used; client walks after MAX_COUNTER_ROUNDS
    counter_qty: int = 0         # size the client countered at (0 = no size counter outstanding)

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

# ---------- Notional-based ticket sizing ----------
#
# Ticket size is expressed here as underlying notional (spot x contract size x
# quantity) rather than a fixed lot count. A fixed "50-1000 lots" range means
# wildly different money depending what's being traded — 1000 lots of a cheap
# OTM option is pocket change, 1000 lots of an FX future is enormous — so raw
# lot counts were producing tickets with no consistent relationship to the
# desk's own book size. Bands below are calibrated against the desk's
# starting capital (Portfolio.cash, portfolio.py) so a client's ticket size
# actually reflects how big they are relative to your £10,000,000, instead of
# being an arbitrary contract count. (min_notional, max_notional) in GBP.
NOTIONAL_BANDS: dict[str, tuple] = {
    "harrow":      (150_000,    800_000),
    "perrystreet": (50_000,     400_000),
    "monarch":     (100_000,    500_000),
    "brightwater": (50_000,     300_000),
    "stonehaven":  (100_000,    600_000),
    "calloway":    (50_000,     300_000),
    "meridian":    (150_000,    800_000),
    "zuidas":      (100_000,    700_000),
    "kinross":     (300_000,  1_500_000),
    "solstice":    (500_000,  4_000_000),
    "colossus":    (750_000,  5_000_000),
    "obsidian":    (500_000,  3_500_000),
}


def _round_qty(q: float) -> int:
    """Round a raw notional-derived quantity to a clean, desk-readable lot
    count — mirrors the flavour of the old hand-picked choices (50, 100, 250,
    500, 1000, ...) instead of leaving ugly numbers like '743' on screen."""
    if q < 20:
        step = 1
    elif q < 200:
        step = 5
    elif q < 2000:
        step = 25
    else:
        step = 100
    return max(1, int(round(q / step) * step))


# FX tickers quoted "foreign units per USD" (JPY=X is USD/JPY: ~150 yen per
# dollar) rather than "USD per foreign unit" like GBPUSD=X/EURUSD=X (~1.2-1.3).
# Their contract size already expresses notional directly in the non-yen base
# currency, so — unlike every other instrument here — that notional must NOT
# also be multiplied by the (much larger, inverted-scale) yen spot price, or a
# lot looks ~150x bigger than it really is and notional sizing collapses to
# the 1-lot floor. Treat their "price" as 1 rather than spot.
INVERTED_FX_QUOTE = {"JPY=X"}


def _qty_from_notional(contract_id: str, spot: float, min_notional: float, max_notional: float) -> int:
    """Convert a random notional ticket into a lot count for this contract.
    Uses underlying notional (spot x contract size), not premium, for both
    options and futures — an option's cheap premium would otherwise blow the
    lot count up to keep the same £ notional, which is not how ticket size is
    actually meant when a client says '£500k of these calls'."""
    from portfolio import CONTRACT_SIZE  # local import: avoids a hard import-time cycle with portfolio.py
    underlying = contract_id.rsplit("_", 1)[0]
    size = CONTRACT_SIZE.get(underlying, 1)
    price = 1.0 if underlying in INVERTED_FX_QUOTE else spot
    notional = random.uniform(min_notional, max_notional)
    raw_qty = notional / max(price, 1e-9) / size
    return _round_qty(raw_qty)


def _make_rfq(client: Client, contract_id: str, now: float,
             spots: dict[str, float] | None = None) -> RFQ:
    side = random.choice(("buy", "sell"))
    band = NOTIONAL_BANDS.get(client.client_id)
    underlying = contract_id.rsplit("_", 1)[0]
    if band is not None and spots is not None and underlying in spots:
        qty = _qty_from_notional(contract_id, spots[underlying], *band)
    else:
        # Fallback for callers with no live spot (e.g. standalone offline
        # scripts/tests) — keeps the old fixed-lot behaviour rather than erroring.
        qty = random.choice(client.qty_choices)
    window = random.uniform(60.0, 150.0)        # seconds until deadline
    return RFQ(f"rfq_{next(_rfq_seq)}", client.client_id, client.name, contract_id,
               side, qty, now, now + window, client.base_tolerance, client.urgency_ramp)


def seed_rfqs(contract_ids: list[str], spots: dict[str, float] | None = None) -> list[RFQ]:
    """Open the desk with a few live RFQs from different clients."""
    starters = ["harrow", "perrystreet", "monarch", "brightwater"]
    return [_make_rfq(CLIENTS[cid], random.choice(contract_ids), 0.0, spots) for cid in starters]


def maybe_spawn_rfq(rfqs: list[RFQ], now: float, contract_ids: list[str],
                    max_open: int = 8, rate: float = 0.05, quiet_secs: float = 150.0,
                    spots: dict[str, float] | None = None) -> RFQ | None:
    """Occasionally hand a new RFQ to an idle client. Skips clients with recent
    chat activity so a conversation you are in does not get a new request mid-flow.
    Every RFQ close posts a client message, so quiet_secs also acts as a cooldown
    between a client's request ending and them coming back with a new one."""
    open_clients = {r.client_id for r in rfqs if r.status == "open"}
    if len(open_clients) >= max_open or random.random() > rate:
        return None
    def busy(cid: str) -> bool:
        msgs = THREADS.get(cid, [])
        return bool(msgs) and (now - msgs[-1].sim_time) < quiet_secs
    idle = [c for cid, c in CLIENTS.items() if cid not in open_clients and not busy(cid)]
    if not idle:
        return None
    rfq = _make_rfq(random.choice(idle), random.choice(contract_ids), now, spots)
    rfqs.append(rfq)
    return rfq


def expire_rfqs(rfqs: list[RFQ], now: float) -> None:
    """Mark still-open RFQs past their deadline as expired.
    No longer called by the server (timer trial) — kept for easy revert."""
    for r in rfqs:
        if r.status == "open" and now >= r.deadline_sec:
            r.status = "expired"
            post_message(r.client_id, "client", "Took too long \u2014 not interested anymore.", now)


def evaluate_quote(rfq: RFQ, your_price: float, mid: float, now: float) -> bool:
    tol = rfq.effective_tolerance(now)
    if rfq.side == "buy":
        return your_price <= mid * (1 + tol)
    return your_price >= mid * (1 - tol)


# ---------- Anthropic client + offline fallback reply ----------

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


# Used only when there's no API key or a call fails — the game must never
# break just because chat is unavailable. Not tied to what the trader typed,
# only to how annoyed the client currently is.
_CALM_FALLBACK  = ["Noted, thanks.", "Understood.", "Ok, appreciate it."]
_HUFFY_FALLBACK = [
    "Whenever you get a chance, I'd really appreciate a price.",
    "Still keen when you're ready - no rush, just flagging it.",
    "Would love to get this wrapped up when you have a moment, thanks.",
]

def _fallback_reply(annoyance: float) -> str:
    if annoyance > 0.6 and random.random() < 0.7:
        return random.choice(_HUFFY_FALLBACK)
    return random.choice(_CALM_FALLBACK)


def apply_message(rfq: RFQ, text: str, now: float) -> dict:
    """Process your message: generate an in-persona reply. Chat is flavor and
    relationship-management — it does not extend deadlines or auto-reject a
    request; only the price/size you actually quote drives that."""
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
        rfq_status=rfq.status,
    )
    rfq.last_answered_sec = now
    return {"reply": turn["reply"]}


# ---------- Persona-driven replies (Haiku, one combined call) ----------

PERSONAS = {
    "harrow": (
        "You ARE Harrow Global Macro, an aggressive global-macro hedge fund, talking to a "
        "sell-side trader on a chat line. Voice: brisk, efficient, trading-floor shorthand "
        "(omw, lvls, mid), but courteous \u2014 you value the trader's time as much as your own. "
        "Usually under 12 words. You'd like a price promptly, and you say so plainly and "
        "pleasantly rather than snapping; if the trader explains a delay, acknowledge it."
    ),
    "perrystreet": (
        "You ARE Perry Street Trading, an elite quant proprietary trading firm known for ETF "
        "and options arbitrage, talking to a sell-side trader on a chat line. Voice: terse and "
        "numeric by habit, but friendly and easy to deal with. You want a tight price quickly "
        "and will say plainly if something looks wide, but you explain why when it's useful and "
        "never talk down to the trader. e.g. 'px?', 'that's a touch wide for me, mind tightening?'."
    ),
    "monarch": (
        "You ARE Monarch Pension, a large real-money pension fund, talking to a sell-side "
        "trader on a chat line. Voice: measured, warm, formal, process-driven and very "
        "size-sensitive \u2014 you care about getting filled in size without moving the "
        "market and you reference your mandate or committee. Full polite sentences, patient "
        "and appreciative of good service. One or two sentences."
    ),
    "brightwater": (
        "You ARE Brightwater Treasury, the corporate treasury of a non-financial company "
        "hedging FX and rates exposure, talking to a sell-side trader. Voice: friendly, plain "
        "English, not a markets native \u2014 you are hedging a business need, not trading a "
        "view. You reference budget rates, board approval or hedging policy, ask questions "
        "openly when unsure of jargon, and thank the trader for their help. Full courteous "
        "sentences."
    ),
    "stonehaven": (
        "You ARE Stonehaven Asset Management, a long-only asset manager, talking to a "
        "sell-side trader. Voice: professional, calm, benchmark-aware, unhurried, and genuinely "
        "collegial. You care about tracking your benchmark and executing cleanly, not about a "
        "few seconds, and you're happy to work with the trader rather than pressure them. "
        "One or two measured, friendly sentences."
    ),
    "calloway": (
        "You ARE Calloway Family Office, managing money for a wealthy principal, talking to a "
        "sell-side trader. Voice: warm, relationship-driven, appreciative of attentive service. "
        "You mention 'the principal' occasionally and value being looked after, but you're "
        "gracious about it, not entitled \u2014 you say please and thank you and take a fair "
        "no for an answer. Short, friendly sentences."
    ),
    "meridian": (
        "You ARE Meridian Systematic, a systematic CTA / trend fund, talking to a sell-side "
        "trader. Voice: flat, matter-of-fact, rules-driven \u2014 you execute because a signal "
        "fired, not because you have an opinion \u2014 but still courteous. Terse and "
        "mechanical, not cold; a brief 'thanks' or 'appreciated' costs nothing. "
        "e.g. 'Signal fired, need execution when you have a moment. Price?'."
    ),
    "zuidas": (
        "You ARE Zuidas Derivatives, a Dutch options market-making firm out of Amsterdam, "
        "talking to a sell-side trader on a chat line. Voice: direct, confident, faintly "
        "accented English, genuinely interested in vol and skew \u2014 and friendly with it. "
        "You quote back in basis points and vol points rather than adjectives, and you'll say "
        "plainly if a market looks wide, but lightly and without sarcasm. e.g. 'that skew looks "
        "generous to me', 'could you tighten that up a touch?'."
    ),
    "kinross": (
        "You ARE Kinross Re, a pension risk transfer insurer that takes on bulk annuity and "
        "longevity risk from corporate pension schemes, talking to a sell-side trader. Voice: "
        "conservative, formal, unhurried, and consistently courteous. You speak in terms of "
        "matching liabilities, duration, Solvency II capital and regulatory constraints, and "
        "you are never rushed \u2014 a deal like this took months of due diligence to get to "
        "this call. Careful, polite sentences. Confirmations, settlement and legal "
        "documentation are your own ops/legal team's job, done entirely outside this chat \u2014 "
        "you never ask the trader for paperwork here, and once a price is agreed you don't "
        "relitigate it."
    ),
    "solstice": (
        "You ARE Solstice Sovereign Wealth Fund, a state-owned sovereign wealth fund managing "
        "hundreds of billions, talking to a sell-side trader on a chat line. Voice: formal, "
        "measured, unhurried, and graciously courteous \u2014 size and discretion matter far "
        "more than a few seconds or a shaved basis point. You reference minimising market "
        "impact, your mandate, or your long-term horizon. Full, warm sentences. Never rushed, "
        "never sharp, and appreciative when the trader handles your flow well."
    ),
    "colossus": (
        "You ARE Colossus Capital Partners, a mega multi-strategy hedge fund running tens of "
        "billions, talking to a sell-side trader on a chat line. Voice: confident and direct "
        "\u2014 you trade in size that moves markets and you know it \u2014 but genuinely "
        "respectful of the trader's work. Short, clear sentences, no sarcasm. You expect good "
        "service because of your flow, and you say thanks when you get it."
    ),
    "obsidian": (
        "You ARE Obsidian Asset Management, the world's largest asset manager, running index "
        "funds, ETFs and multi-asset mandates on trillions in AUM, talking to a sell-side "
        "trader on a chat line. Voice: calm, formal, unhurried, institutional, and warmly "
        "professional \u2014 you are never rattled and never in a rush, because size and "
        "process matter far more than a few seconds. You reference fiduciary duty, best "
        "execution, benchmarks, or your internal risk platform. Full, measured, courteous "
        "sentences."
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
    rfq_status: str = "open",
) -> dict:
    """
    One Haiku call that writes the client's in-persona REPLY to the trader's
    chat message. Returns {"reply": <str>}. Purely flavor/relationship-management
    — it has no effect on the RFQ's deadline or status. Any failure (no key,
    unknown client, API error) falls back to a neutral templated reply, so the
    game never breaks.
    """
    persona = PERSONAS.get(client_id)
    client = _get_anthropic()

    if client is None or persona is None:
        return {"reply": _fallback_reply(annoyance)}

    if annoyance < 0.33:
        mood = "You are calm and in no hurry."
    elif annoyance < 0.66:
        mood = "You would genuinely appreciate a price soon, but you stay courteous about it."
    else:
        mood = (
            "It has been a while and you would like to move this along, but you remain "
            "polite and professional throughout - firm about wanting a price, never rude."
        )

    # rfq_status tells the model whether this deal is still live. Without this,
    # every reply was framed as "still waiting on a price" even long after the
    # trade filled — which, combined with a formal/back-office-flavoured persona,
    # caused the model to invent an ongoing paperwork/settlement subplot that
    # never resolves, since nothing ever told it the deal was already done.
    if rfq_status == "filled":
        deal_context = (
            f"You already agreed a price and executed this trade ({side} {quantity} "
            f"{contract_id}) — it is DONE and booked. Any confirmation, settlement or "
            "paperwork is handled entirely by your own back-office/ops team, NOT over "
            "this chat, and NOT something the trader can produce for you here. Do not "
            "ask the trader for documents, do not stall or withhold new business over "
            "it, and do not keep revisiting this deal turn after turn — acknowledge "
            "briefly at most, then move on."
        )
    elif rfq_status in ("rejected", "expired"):
        deal_context = (
            f"This particular request ({side} {quantity} {contract_id}) is no longer "
            "live — it was declined or timed out. Don't keep pressing on it; you may "
            "still bring the trader new business separately."
        )
    else:
        deal_context = (
            f"You sent this trader an RFQ to {side} {quantity} of {contract_id} and "
            "you are waiting on their price."
        )

    system = (
        persona + "\n\n"
        f"CONTEXT: {deal_context} The message below is the TRADER's latest "
        f"chat line to you. {mood}\n\n"
        "Before replying, actually read the conversation history above the trader's "
        "latest line. React to what they specifically just said - a number they quoted, "
        "a reason they gave, a question they asked - rather than a generic in-persona "
        "one-liner that would fit any message. Do not repeat a phrase or sentence "
        "structure you've already used earlier in this conversation; say it differently "
        "each time, the way a real person would. Stay warm, receptive and easy to deal "
        "with even when you're pressing for a price - firmness and politeness are not "
        "in tension here.\n\n"
        "Reply with ONLY your next chat line back to the trader, fully in persona. "
        "No preamble, no quotation marks, no markdown, no code fences. Keep it short."
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
            max_tokens=80,
            system=system,
            messages=msgs,
        )
        reply = resp.content[0].text.strip()
        return {"reply": reply or _fallback_reply(annoyance)}
    except Exception:
        traceback.print_exc()
        return {"reply": _fallback_reply(annoyance)}
# ---------- Negotiation bands (multiples of each client's own threshold) ----------

CLOSE_FACTOR       = 1.25   # up to 1.25x T: full size, grudging
BORDERLINE_FACTOR  = 1.60   # up to 1.60x T: reduced size
PARTIAL_FRACTION   = 0.5    # reduced size = half, floor, min 1
MAX_COUNTER_ROUNDS = 2      # client counters at most twice, then walks

QTY_BAND_LO          = 0.5   # entertain quotes down to 50% of requested size
QTY_BAND_HI          = 1.2   # over-quotes up to 120% fine; client fills only their size
QTY_ACCEPT_SHORTFALL = 0.2   # at a merely-OK price, accepts up to 20% under size without fuss


def qty_in_band(requested: int, quoted: int) -> bool:
    """A quoted size the client will entertain rather than auto-reject."""
    return quoted > 0 and requested * QTY_BAND_LO <= quoted <= requested * QTY_BAND_HI


def _tiered_decision(side: str, your_bid: float, your_ask: float,
                     mid: float, threshold: float, qty: int,
                     offered_qty: int | None = None, floor_qty: int = 0):
    """side is the CLIENT's action. Returns (traded, dealer_qty, price, action).
    price is the fill price on fills, the client's counter level on "counter".
    On "counter_qty" the second slot carries the client's compromise size.
    offered_qty is the size the dealer quoted (None = the requested size);
    floor_qty is a size the client already agreed to accept via a size counter.
    Compared in price space (px vs mid*(1±k*T)) so exact boundaries fill."""
    offer = qty if offered_qty is None else min(offered_qty, qty)
    short = offer < qty
    if side == "buy":
        px, sign, verb = your_ask, -1, "lifted"
        within = lambda k: px <= mid * (1 + k * threshold)
        counter_px = mid * (1 + CLOSE_FACTOR * threshold)
    else:
        px, sign, verb = your_bid, +1, "hit"
        within = lambda k: px >= mid * (1 - k * threshold)
        counter_px = mid * (1 - CLOSE_FACTOR * threshold)
    if within(1.0):
        return (True, sign * offer, px, verb + ("_short" if short else ""))
    if within(CLOSE_FACTOR):
        if not short:
            return (True, sign * qty, px, verb + "_close")
        min_ok = floor_qty if floor_qty > 0 else math.ceil(qty * (1 - QTY_ACCEPT_SHORTFALL))
        if offer >= min_ok:
            return (True, sign * offer, px, verb + "_short")
        compromise = max(offer + 1, (offer + qty + 1) // 2)
        return (False, compromise, px, "counter_qty")
    if within(BORDERLINE_FACTOR):
        fill_qty = min(offer, max(1, int(qty * PARTIAL_FRACTION)))
        return (True, sign * fill_qty, px, verb + "_partial")
    return (False, 0, counter_px, "counter")


def evaluate_two_way(rfq: RFQ, your_bid: float, your_ask: float, mid: float, now: float,
                     offered_qty: int | None = None):
    """
    Market-making: client wants a two-way market; their true side is hidden in rfq.side.
    Returns (traded, dealer_qty, price, action):
      client buys  -> lifts your ask -> you sell (dealer short, -qty) at your ask
      client sells -> hits your bid  -> you buy  (dealer long,  +qty) at your bid
    action in {"invalid", "lifted", "hit", "lifted_close", "hit_close",
    "lifted_short", "hit_short", "lifted_partial", "hit_partial",
    "counter", "counter_qty"}; on "counter" price is the level the client wants,
    on "counter_qty" dealer_qty is the size the client will settle for.
    Caller owns counter-round state.
    """
    if your_bid <= 0 or your_ask <= 0 or your_bid >= your_ask:
        return (False, 0, 0.0, "invalid")
    tol = rfq.effective_tolerance(now)
    return _tiered_decision(rfq.side, your_bid, your_ask, mid, tol, rfq.quantity,
                            offered_qty=offered_qty, floor_qty=rfq.counter_qty)

def evaluate_unsolicited(client: Client, contract_id: str, your_bid: float,
                         your_ask: float, mid: float, qty: int):
    """
    Unsolicited two-way shown to a client with standing interests.
    Same sign convention and action vocabulary as evaluate_two_way, plus
    "not_interested" (no interest entry) and "passed" (qty above max_qty).
    """
    if your_bid <= 0 or your_ask <= 0 or your_bid >= your_ask:
        return (False, 0, 0.0, "invalid")
    interest = client.interest_map.get(contract_id)
    if interest is None:
        return (False, 0, 0.0, "not_interested")
    max_qty = interest.get("max_qty")
    if max_qty is not None and qty > max_qty:
        return (False, 0, 0.0, "passed")
    return _tiered_decision(interest["desired_side"], your_bid, your_ask, mid,
                            interest["edge_threshold"], qty)

def solicit_rfq(rfqs: list[RFQ], client_id: str, now: float, contract_ids: list[str],
                spots: dict[str, float] | None = None) -> RFQ | None:
    """Player asks a quiet client for a market. New RFQ only if they have none open."""
    client = CLIENTS.get(client_id)
    if client is None:
        return None
    if any(r.client_id == client_id and r.status == "open" for r in rfqs):
        return None
    rfq = _make_rfq(client, random.choice(contract_ids), now, spots)
    rfqs.append(rfq)
    post_message(client_id, "client", f"Sure \u2014 show me a market in {rfq.quantity} {rfq.contract_id}.", now)
    return rfq
