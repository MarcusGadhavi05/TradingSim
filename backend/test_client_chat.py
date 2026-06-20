r"""
Standalone test for persona-driven client replies (chunk 1).
Run from the repo root:  ..\.conda\python.exe backend\test_client_chat.py
Loads backend/.env for ANTHROPIC_API_KEY. With no key it shows the fallback path.
"""
import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).with_name(".env"))
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).parent))
import clients

SAMPLES = [
    "coming now, 2 secs",
    "still working it, give me a min",
    "can't price that one, sorry",
    "what's the weather like",
]


def run(client_id: str, annoyance: float):
    c = clients.CLIENTS[client_id]
    print(f"\n===== {c.name}  ({c.style})  annoyance={annoyance} =====")
    for msg in SAMPLES:
        out = clients.generate_client_turn(
            client_id=client_id,
            contract_id="ASML.AS_bullish",
            side="buy",
            quantity=50,
            player_message=msg,
            annoyance=annoyance,
        )
        print(f"  you : {msg}")
        print(f"  <-  : intent={out['intent']!r}  reply={out['reply']!r}")


if __name__ == "__main__":
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("WARNING: no ANTHROPIC_API_KEY — using keyword + template fallback.")
    for cid in ("vortex", "monarch"):
        run(cid, annoyance=0.0)
    run("vortex", annoyance=0.8)
    run("monarch", annoyance=0.8)
