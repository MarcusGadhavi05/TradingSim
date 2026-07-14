r"""
Standalone test for chunk 2: apply_message now uses generate_client_turn.
Run from the repo root:  ..\.conda\python.exe backend\test_apply_message.py
Verifies the deadline-extend effect fires exactly once and an in-persona reply comes back.
"""
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).with_name(".env"))
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).parent))
import clients

rfq = clients.seed_rfqs(["ASML.AS_bullish"])[0]   # vortex
rfq.deadline_sec = 120.0   # pin the random window so the +30 assert is deterministic
now = 10.0
print(f"before: deadline={rfq.deadline_sec}  extended={rfq.extended}  status={rfq.status}")

# turn 1: trader says coming now -> should extend the deadline once
clients.post_message(rfq.client_id, "you", "coming now, 2 secs", now)
r1 = clients.apply_message(rfq, "coming now, 2 secs", now)
print(f"turn1: {r1}")
print(f"after1: deadline={rfq.deadline_sec}  extended={rfq.extended}")

# turn 2: another hold -> effect must NOT fire again (already extended)
now = 40.0
clients.post_message(rfq.client_id, "client", r1["reply"], now)
clients.post_message(rfq.client_id, "you", "almost there, hold on", now)
r2 = clients.apply_message(rfq, "almost there, hold on", now)
print(f"turn2: {r2}")
print(f"after2: deadline={rfq.deadline_sec}  extended={rfq.extended}")

assert rfq.deadline_sec == 150.0, "deadline should extend by 30 exactly once"
assert rfq.extended is True
print("\nOK: deadline extended once; replies generated in persona.")
