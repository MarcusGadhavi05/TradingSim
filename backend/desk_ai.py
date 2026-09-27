"""
Claude-generated desk colour: a once-per-boot pre-sim market brief, an
opt-in one-line reaction to a fired headline, and a post-sim debrief of
the trader's session. Every function degrades to a plain templated
fallback if there's no API key or the call fails -- the game must never
break just because Claude is unavailable (same principle clients.py
already follows for chat replies).
"""

import traceback

from clients import _get_anthropic  # shared client + .env loading

MODEL = "claude-haiku-4-5"


# ---------- Pre-sim brief ----------
# Deterministic input (spot/vol at sim start never changes) -- callers
# should generate this ONCE and cache it, not per session.

def build_pre_sim_brief(instrument_lines: list[str]) -> str:
    fallback = (
        "Desk's quiet this morning. Spot's where it's been, vol's sitting in "
        "its usual range across the book — nothing screaming at you off the "
        "open. Mark your markets, watch the tape, and let the clients come "
        "to you."
    )
    client = _get_anthropic()
    if client is None:
        return fallback
    system = (
        "You are the head of a sell-side derivatives desk giving a 90-second "
        "morning brief to a junior trader about to take over the book for "
        "the hour. Voice: senior, terse, trading-floor — the way a desk "
        "head actually talks, not a research note. Reference the actual spot "
        "levels and vol regime given below concretely, comparing instruments "
        "against each other where it's useful. You have no news events to "
        "reference — do not invent any; talk only about the starting risk "
        "backdrop implied by the levels and vols given. 120-180 words. No "
        "headers, no markdown, no bullet points — flowing prose as if spoken."
    )
    prompt = "Today's book at the open:\n" + "\n".join(instrument_lines)
    try:
        resp = client.messages.create(
            model=MODEL, max_tokens=350, system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip() or fallback
    except Exception:
        traceback.print_exc()
        return fallback


# ---------- Headline commentary (opt-in, one per fired headline) ----------

def build_headline_commentary(headline: str, impact_hint: str, category: str) -> str:
    fallback = "Desk's watching this one — check how the tape actually reacts before you lean on it."
    client = _get_anthropic()
    if client is None:
        return fallback
    system = (
        "You are a senior trader's one-line gut reaction to a headline that "
        "just hit the wire, said out loud to the desk. Voice: terse, "
        "trading-floor shorthand, opinionated — not a research note. Under "
        "20 words. No preamble, no quotation marks, no markdown."
    )
    prompt = f"HEADLINE: {headline}\nLIKELY IMPACT: {impact_hint}\nCATEGORY: {category}"
    try:
        resp = client.messages.create(
            model=MODEL, max_tokens=60, system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip() or fallback
    except Exception:
        traceback.print_exc()
        return fallback


# ---------- Post-sim debrief ----------

def build_post_sim_debrief(snapshot: dict, trade_log: list[dict],
                           num_client_fills: int, num_direct_trades: int) -> str:
    total_pnl = snapshot.get("total_pnl", 0.0)
    fallback = (
        f"Session closed with a total P&L of £{total_pnl:,.2f} across "
        f"{len(trade_log)} trades. Review your Greeks and fills to see what "
        "actually drove that number — the desk cares about consistency, "
        "not just one good hour."
    )
    client = _get_anthropic()
    if client is None:
        return fallback

    lines = []
    for t in trade_log[-40:]:  # cap payload size on a very active session
        lines.append(
            f"{t['sim_time']:.0f}s {t['side']} {t['quantity']} {t['contract_id']} "
            f"@ {t['price']:.4f} (fair {t['mid']:.4f}, edge {t['edge']:+.4f}/unit) "
            f"via {t['counterparty']}"
        )
    trades_block = "\n".join(lines) if lines else "No trades executed this session."

    system = (
        "You are the head of a sell-side derivatives desk reviewing a junior "
        "trader's hour on the book, in a short end-of-session debrief said "
        "directly to them. Voice: direct, senior, constructive — praise "
        "what was good, call out what wasn't, the way a real desk head "
        "actually talks. Reference specific numbers from what's given below "
        "rather than speaking in generalities. Structure: one short "
        "paragraph on overall performance and P&L, one on risk-taking and "
        "Greeks discipline, one concrete thing to improve next session. "
        "150-220 words total. No headers, no markdown, no bullet points — "
        "flowing prose."
    )
    prompt = (
        f"FINAL P&L: £{total_pnl:,.2f} (realised £{snapshot.get('closed_pnl', 0):,.2f}, "
        f"unrealised £{snapshot.get('unrealised_pnl', 0):,.2f})\n"
        f"ENDING CASH: £{snapshot.get('cash', 0):,.2f}\n"
        f"NET GREEKS AT CLOSE: delta {snapshot.get('net_delta', 0):,.0f}, "
        f"gamma {snapshot.get('net_gamma', 0):,.0f}, "
        f"vega £{snapshot.get('net_vega', 0):,.0f}, "
        f"theta £{snapshot.get('net_theta', 0):,.0f}/day\n"
        f"OPEN POSITIONS AT CLOSE: {len(snapshot.get('positions', []))}\n"
        f"TRADE COUNT: {len(trade_log)} ({num_client_fills} client fills, "
        f"{num_direct_trades} direct)\n\n"
        f"TRADE LOG (most recent {len(lines)}):\n{trades_block}"
    )
    try:
        resp = client.messages.create(
            model=MODEL, max_tokens=450, system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip() or fallback
    except Exception:
        traceback.print_exc()
        return fallback
