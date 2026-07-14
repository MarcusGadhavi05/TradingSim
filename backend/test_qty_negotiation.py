import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import clients

c = clients.CLIENTS["vortex"]
def mk(side, qty=100, counter_qty=0):
    r = clients.RFQ("rfq_x", c.client_id, c.name, "ASML.AS_bullish", side, qty,
                    0.0, 120.0, c.base_tolerance, c.urgency_ramp)
    r.counter_qty = counter_qty
    return r

mid, now = 100.0, 0.0
tol = mk("buy").effective_tolerance(now)
# vortex at t=0: T = 0.018 -> tight ask <= 101.8, close <= 102.25, borderline <= 102.88
print(f"tol={tol:.4f} -> tight <= {mid*(1+tol):.3f}, close <= {mid*(1+clients.CLOSE_FACTOR*tol):.3f}, "
      f"borderline <= {mid*(1+clients.BORDERLINE_FACTOR*tol):.3f}")

# band gate (server-side reject)
assert clients.qty_in_band(100, 50) and clients.qty_in_band(100, 120)
assert not clients.qty_in_band(100, 40) and not clients.qty_in_band(100, 130)
assert not clients.qty_in_band(100, 0)
print("band gate: 50-120 in, 40/130/0 out")

# regression: exact qty, tight price -> full fill
r = clients.evaluate_two_way(mk("buy"), 99.7, 100.4, mid, now, offered_qty=100)
assert r == (True, -100, 100.4, "lifted"), r
print("exact qty, tight:", r)

# under-quote at a tight price -> client accepts reduced size
r = clients.evaluate_two_way(mk("buy"), 99.7, 100.4, mid, now, offered_qty=60)
assert r == (True, -60, 100.4, "lifted_short"), r
r = clients.evaluate_two_way(mk("sell"), 99.7, 100.4, mid, now, offered_qty=60)
assert r == (True, 60, 99.7, "hit_short"), r
print("under-quote, tight: reduced fill both sides")

# under-quote at a close price, >= 80% of size -> accepted
r = clients.evaluate_two_way(mk("buy"), 99.0, 102.0, mid, now, offered_qty=85)
assert r == (True, -85, 102.0, "lifted_short"), r
print("85 of 100 at close price: accepted", r)

# under-quote at a close price, too light -> size counter with compromise 80
r = clients.evaluate_two_way(mk("buy"), 99.0, 102.0, mid, now, offered_qty=60)
assert r == (False, 80, 102.0, "counter_qty"), r
print("60 of 100 at close price: counter_qty ->", r[1])

# re-quote at the countered floor -> fills
r = clients.evaluate_two_way(mk("buy", counter_qty=80), 99.0, 102.0, mid, now, offered_qty=80)
assert r == (True, -80, 102.0, "lifted_short"), r
print("re-quote at floor 80: filled", r)

# over-quote clamps to the requested size
r = clients.evaluate_two_way(mk("buy"), 99.7, 100.4, mid, now, offered_qty=120)
assert r == (True, -100, 100.4, "lifted"), r
print("120 vs 100 asked: fills 100 only")

# borderline price: partial capped at the offer
r = clients.evaluate_two_way(mk("buy"), 99.0, 102.5, mid, now, offered_qty=60)
assert r == (True, -50, 102.5, "lifted_partial"), r
r = clients.evaluate_two_way(mk("buy"), 99.0, 102.5, mid, now, offered_qty=55)
assert r == (True, -50, 102.5, "lifted_partial"), r
print("borderline: partial min(offer, half)")

# wide price still price-counters regardless of size
r = clients.evaluate_two_way(mk("buy"), 99.0, 104.0, mid, now, offered_qty=60)
assert r[3] == "counter" and not r[0], r
print("wide: price counter unchanged")

# size counters never burn walk-away rounds — client holds the floor, RFQ stays open
rfq = mk("buy")
for _ in range(3):
    traded, comp, px, action = clients.evaluate_two_way(rfq, 99.0, 102.0, mid, now, offered_qty=60)
    assert not traded and action == "counter_qty", (traded, action)
    rfq.counter_qty = comp   # server stores the floor but does NOT touch counter_rounds
assert rfq.counter_rounds == 0 and rfq.status == "open"
print("size haggling: 3 light quotes, client holds floor", rfq.counter_qty, "- no walk")

# price counters still burn rounds toward the walk (mimics server logic)
rfq = mk("buy")
for _ in range(clients.MAX_COUNTER_ROUNDS):
    traded, _, px, action = clients.evaluate_two_way(rfq, 99.0, 104.0, mid, now, offered_qty=100)
    assert not traded and action == "counter", (traded, action)
    rfq.counter_rounds += 1
assert rfq.counter_rounds >= clients.MAX_COUNTER_ROUNDS  # server would now walk the client
print("price walk-away trigger after", rfq.counter_rounds, "counters")

# regressions: default path (no offered_qty) and crossed market
r = clients.evaluate_two_way(mk("buy"), 99.7, 100.4, mid, now)
assert r == (True, -100, 100.4, "lifted"), r
r = clients.evaluate_two_way(mk("buy"), 101.0, 100.0, mid, now)
assert r == (False, 0, 0.0, "invalid"), r
print("regressions: default qty + crossed market OK")

print("all qty negotiation checks passed")
