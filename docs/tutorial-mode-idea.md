# Tutorial Mode — idea notes (reference only, not wired into the app)

*Captured 2026-07-12. Nothing in the site reads this file.*

## The idea

A guided first session for new players on the sell side. The current briefing screen
(`/sell-side`, pre-start) explains the rules in three lines; a tutorial mode would go
further and *walk you through your first quotes* with training wheels on.

## Two possible shapes

**A. Guided overlay (frontend-only, cheapest)**
- Normal session, but a step-by-step coach overlay highlights one panel at a time:
  watchlist → chart → execution → client desk.
- Advance on action, not on "Next" clicks: e.g. step 3 completes when the user
  actually sends a two-way quote to a client.
- Implementation sketch: a `tutorialStep` state machine in the sell-side page; dim
  everything except the highlighted panel (absolute overlay with a cut-out); listen
  to existing events (first tick, first RFQ, first quote sent, first fill).
- No backend changes at all.

**B. Scripted training session (backend-assisted, richer)**
- A `?mode=tutorial` session flag on the websocket init.
- Backend runs a slower clock, and a scripted "training client" who:
  - always asks for a market in the same liquid name first,
  - accepts any reasonable spread on the first RFQ (guaranteed first win),
  - then progressively tightens what they'll accept.
- News timeline replaced with 3–4 hand-written teaching headlines
  ("this one moves oil — watch BZ").
- P&L doesn't count / separate "practice" badge on the header.

## Suggested step sequence (either shape)

1. **The tape** — watch prices tick; click a ticker to load its chart.
2. **The exchange** — buy 1 ATM call on the selected name; see it appear in the blotter.
3. **The phone rings** — first RFQ arrives; explain bid/ask boxes and what "ref mid" means.
4. **Show a price** — send a two-way quote; scripted client deals. First fill!
5. **You're carrying risk now** — point at Net Exposure; hedge with a future.
6. **Free play** — overlay dismisses, clock speeds up to normal.

## Things to decide later

- Entry point: a third small "Tutorial" link on the landing page vs. a toggle on the
  briefing screen (briefing screen feels more natural — it's already the pre-flight page).
- Should tutorial completion persist (localStorage) so returning players skip straight
  to the briefing?
- Does the buy side eventually get its own tutorial, and can the step-machine be shared?

## Effort guess

- Shape A: a day-ish of frontend work, no backend risk.
- Shape B: A + a scripted client persona in `backend/clients.py` + a mode flag in
  `server.py` (`SimSession` already spins up per-websocket, so a per-session mode
  flag is clean).
