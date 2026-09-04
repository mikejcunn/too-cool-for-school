# Manual checklists

Kept short on purpose; automated coverage lives in `__tests__/` and `e2e/`.

## Phase 1 — MVP

- [ ] Checkout on a real phone in mobile Safari (Runner iframe keyboard, autofill, scroll).
- [ ] Receipt email renders in Gmail and iOS Mail.
- [ ] Declined card shows a friendly message; the order stays retryable.
- [ ] Admin finds an order by student name.
- [ ] Inventory ledger reconciles (admin "verify" button).
- [ ] UAT probe: a $1.23 charge shows as $1.23 in Run Merchant (settles `RUN_AMOUNT_UNITS`).

## Phase 2 — POS

- [ ] POS on an iPad in Safari standalone mode; numeric keyboard for card fields.
- [ ] Offline: shows an error, never double-charges.
- [ ] Close session: expected cash matches counted cash.

## Phase 3 — Pre-orders

- [ ] Closing a window produces a PO export a vendor can use.
- [ ] Partial PO receipt leaves the remainder on backorder; parents receive update emails.

## Phase 4 — Allocations

- [ ] Beneficiary report totals equal sum(paid − refunded lines) under `gross`.
- [ ] Margin figures match a spreadsheet for 5 sample orders.

## Phase 5 — Multi-tenant

- [ ] Create a second org; storefront and admin are fully isolated.
