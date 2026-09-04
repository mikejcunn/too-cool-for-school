# ADR-0002: Inventory model — counters + ledger, reservations, pre-orders

**Status:** accepted 2026-09-03

## Decision

- `product_variants.on_hand` and `.reserved` are the denormalized truth; `available = on_hand - reserved`.
- Every change is written to `inventory_movements` (the ledger) in the same transaction.
- Stock only changes through `lib/inventory/*`, which use single conditional `UPDATE`s:
  reserve `WHERE on_hand - reserved >= q`, commit `WHERE reserved >= q`, release `WHERE reserved >= q`.
  Zero rows updated means the shopper lost the race; CHECK constraints are the backstop.
- Multi-line carts process lines in ascending `variant_id` inside one transaction (deadlock-free).
- Reservations expire: 15 min online, 5 min POS. Expiry is lazy (each reserve call releases stale sessions
  for the org) plus a cron sweep.
- Pre-order lines (`order_lines.is_preorder`) never touch counters. Demand is derived from paid lines per
  window. Receiving the vendor PO writes `receive` (+N) then `preorder_fill` (−backlog); surplus stays on hand.

## Why

Read-then-write (`SELECT available … if ok UPDATE`) oversells under concurrency. A ledger alone is slow to
query for "is it in stock". Counters + ledger give a cheap truth and a full audit trail, and a
reconciliation query (`sum(ledger) == on_hand`) can prove them consistent.

## Consequences

- Admin adjustments must go through `lib/inventory/adjust.ts` (never raw updates).
- A stuck reservation costs at most one TTL; no manual intervention.
