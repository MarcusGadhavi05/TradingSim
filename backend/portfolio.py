"""
Portfolio: tracks the user's positions and computes P&L.

Each position is (contract_id, quantity, entry_price).
Quantity can be negative (short).

P&L = sum over positions of:
    quantity * (current_premium - entry_price) * contract_size

For simplicity, contract_size = 100 for equities (standard option contract),
1 for FX/rates/commodities (we'll just treat as 1 unit). Keeps the maths
clean and the numbers human-readable.
"""

from dataclasses import dataclass, field
from typing import Iterable
from contracts import Contract, price_contract


CONTRACT_SIZE = {
    "BARC.L":   100, "AZN.L":    100,
    "SPY":      100, "NVDA":     100,
    "ASML.AS":  100, "SAP.DE":   100,
    "GBPUSD=X": 10000, "EURUSD=X": 10000, "JPY=X": 10000,
    "IGLT.L":   100,
    "BZ=F":     100, "GC=F":     100,
}


@dataclass
class Position:
    contract_id: str
    quantity:    int        # +ve long, -ve short
    entry_price: float      # premium paid per unit (or spot for futures)


@dataclass
class Portfolio:
    cash: float = 100_000.0
    positions: list[Position] = field(default_factory=list)
    closed_pnl: float = 0.0     # realised P&L from closed trades

    def trade(self, contract: Contract, quantity: int, current_premium: float) -> str:
        """Buy (quantity > 0) or sell (quantity < 0) a contract."""
        size = CONTRACT_SIZE.get(contract.underlying, 1)
        is_future = contract.option_type == "future"
        
        # Options have an upfront premium (cost); futures don't (simplified margin-free model)
        if not is_future:
            cost = quantity * current_premium * size
            self.cash -= cost

        # Check for existing position to net against
        for pos in self.positions:
            if pos.contract_id == contract.contract_id:
                # Same direction: average up
                if (pos.quantity > 0 and quantity > 0) or (pos.quantity < 0 and quantity < 0):
                    total_q = pos.quantity + quantity
                    pos.entry_price = (
                        (pos.entry_price * pos.quantity + current_premium * quantity) / total_q
                    )
                    pos.quantity = total_q
                else:
                    # Opposite direction: close some/all
                    closing = min(abs(quantity), abs(pos.quantity))
                    sign = 1 if pos.quantity > 0 else -1
                    realised = sign * closing * (current_premium - pos.entry_price) * size
                    self.closed_pnl += realised
                    if is_future:
                        # For futures, realised P&L directly affects cash
                        self.cash += realised
                    pos.quantity += quantity
                    if pos.quantity == 0:
                        self.positions.remove(pos)
                return f"Updated position {contract.contract_id}: qty now {pos.quantity if pos in self.positions else 0}"

        # New position
        self.positions.append(Position(
            contract_id=contract.contract_id,
            quantity=quantity,
            entry_price=current_premium,
        ))
        return f"Opened position {contract.contract_id}: {quantity} @ {current_premium:.4f}"

    def mark_to_market(self, contracts: Iterable[Contract],
                       spots: dict[str, float]) -> dict:
        """Compute unrealised P&L given current spot prices."""
        contracts_by_id = {c.contract_id: c for c in contracts}
        unrealised = 0.0
        breakdown = []
        for pos in self.positions:
            c = contracts_by_id[pos.contract_id]
            spot = spots[c.underlying]
            current_px = price_contract(c, spot)
            size = CONTRACT_SIZE.get(c.underlying, 1)
            pnl = pos.quantity * (current_px - pos.entry_price) * size
            unrealised += pnl
            breakdown.append({
                "contract_id": pos.contract_id,
                "label": c.label,
                "quantity": pos.quantity,
                "entry": pos.entry_price,
                "current": current_px,
                "pnl": pnl,
                "type": c.option_type,
            })
        return {
            "cash": self.cash,
            "closed_pnl": self.closed_pnl,
            "unrealised_pnl": unrealised,
            "total_pnl": self.closed_pnl + unrealised,
            "equity": self.cash + unrealised,
            "positions": breakdown,
        }
