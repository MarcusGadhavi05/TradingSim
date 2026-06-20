import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import clients

c = clients.CLIENTS["vortex"]
def mk(side):
    return clients.RFQ("rfq_x", c.client_id, c.name, "ASML.AS_bullish", side, 50,
                       0.0, 120.0, c.base_tolerance, c.urgency_ramp)

mid, now = 100.0, 0.0
tol = mk("buy").effective_tolerance(now)
print(f"tol={tol:.4f} -> ask <= {mid*(1+tol):.3f}, bid >= {mid*(1-tol):.3f}")
print("buyer  tight 99.7/100.4:", clients.evaluate_two_way(mk("buy"),  99.7, 100.4, mid, now))
print("buyer  wide  99.0/101.0:", clients.evaluate_two_way(mk("buy"),  99.0, 101.0, mid, now))
print("seller tight 99.7/100.4:", clients.evaluate_two_way(mk("sell"), 99.7, 100.4, mid, now))
print("seller wide  99.0/101.0:", clients.evaluate_two_way(mk("sell"), 99.0, 101.0, mid, now))
print("crossed     101/100    :", clients.evaluate_two_way(mk("buy"), 101.0, 100.0, mid, now))
