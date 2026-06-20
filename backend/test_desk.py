r"""
Standalone test for the multi-client desk (chunk A).
Run from the repo root:  ..\.conda\python.exe backend\test_desk.py
"""
import sys, random
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import clients

random.seed(2)
CONTRACTS = ["ASML.AS_bullish", "NVDA_bearish", "SPY_future", "BARC.L_lottery", "GC=F_hedge"]

rfqs = clients.seed_rfqs(CONTRACTS)
print(f"seeded {len(rfqs)} RFQs:")
for r in rfqs:
    print(f"  {r.rfq_id}: {r.client_name} {r.side} {r.quantity} x {r.contract_id} (deadline {r.deadline_sec:.0f}s)")

max_open = 0
for t in range(400):
    clients.expire_rfqs(rfqs, t)
    for r in rfqs:                        # simulate you closing some
        if r.status == "open" and random.random() < 0.012:
            r.status = random.choice(("filled", "rejected"))
    clients.maybe_spawn_rfq(rfqs, t, CONTRACTS)
    max_open = max(max_open, sum(1 for r in rfqs if r.status == "open"))

ok_one = all(sum(1 for r in rfqs if r.client_id == c and r.status == "open") <= 1 for c in clients.CLIENTS)
print(f"\ntotal created: {len(rfqs)}   peak concurrent open: {max_open} (cap 8)")
print(f"one-open-RFQ-per-client invariant: {ok_one}")
print(f"every client has a persona voice: {set(clients.CLIENTS) == set(clients.PERSONAS)}")