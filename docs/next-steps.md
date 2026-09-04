# Next steps (living status doc)

Last updated: 2026-09-04, session 2. This file is the authoritative "where are we"; update it at the
end of every working session.

## Where we are

**Phase 0 — done. Phase 1 (MVP) — done and smoke-tested. Phase 2 (POS + tenders + events) — done and
smoke-tested (session 2, 2026-09-04).** Repo: https://github.com/mikejcunn/too-cool-for-school (`main`).

Verified in the browser with the mock gateway:

- Storefront checkout, decline + retry (superseded pending order is cancelled and its hold released).
- Admin: dashboard, orders, order detail, mark fulfilled, partial refund, products list/edit/save,
  inventory receive + verify ledger, settings render.
- POS: open register (event + starting cash) → tap items (variant picker for multi-option products) →
  cash tender with quick amounts and change due → order W-1003 recorded as `channel=pos`, `in_person`,
  fulfilled, cash payment with "tendered 50.00", stock decremented, $20 margin allocated → close register
  records counted cash (35.00 vs 33.00 expected).
- 36 vitest tests pass.

Written, compiles, but not yet exercised by hand: POS card / Venmo / check tenders, POS sale containing a
pre-order item (forces classroom/pickup fields), events CRUD dialog, fulfillment board (bulk mark + print),
Adjust-stock dialog, settings save, team member add. Resend is not configured (receipts logged as `skipped`).

## Next session — Phase 3 (pre-orders + purchase orders), then Phase 4

1. **Smoke-test what Phase 2 left untested** (list above), fixing as you go. Card tender at POS uses the
   same mock (`…0000` declines).
2. **Pre-order windows CRUD** (`admin/[orgSlug]/preorders`): name, opens/closes, status
   (draft/open/closed/…), expected delivery. Products already reference `preorder_window_id`.
3. **Window detail page**: demand by variant = `sum(order_lines.quantity - refunded_quantity)` for paid
   lines in the window; "Close window" (manual + `api/cron/close-preorder-windows` when `closes_at` passes);
   **"Create purchase order"** → `purchase_orders` + `purchase_order_lines` (qty = demand, unit cost =
   variant COGS), CSV export for the vendor.
4. **Receive PO** (`admin/[orgSlug]/purchase-orders/[poId]`): per-line received qty → `receiveStock`
   (`receive`) then `receiveStock(type='preorder_fill', negative backlog)` so surplus stays on hand; window →
   `received`; pre-order lines become fulfillable on the fulfillment board (they already appear there).
5. **Pre-order status emails** (`lib/email/templates/preorder-update.tsx`): window closed / items arrived.
6. **Phase 4**: beneficiaries CRUD + `AllocationEditor` (org default + per-product, percent + fixed,
   live preview), reports page (beneficiary earnings by date range, sales by product, tender summary per
   POS session, COGS/margin), CSV exports.
7. Commit after each step, push, update this file before stopping.

## Known issues / notes

- **Browser automation flake, not an app bug:** in the in-app browser the first click right after a
  navigation is sometimes swallowed. Wait ~2s after navigating, or click a neutral element first.
- Port 3000 is used by another local project; `.claude/launch.json` has `autoPort: true` so the dev
  server picks a free port (it was 60155 this session).
- DB tests create `test-inv-*` / `test-other-*` orgs and do not clean up. Add teardown (delete by slug
  prefix) in `__tests__/db/inventory.test.ts`.
- `lib/db/index.ts` deliberately does **not** import `server-only` so `tsx` scripts (seed) and vitest can
  import it. Do not add it back.
- The `form` shadcn component is not available in the `base-nova` style; use react-hook-form directly
  (see `components/store/CheckoutForm.tsx`).
- Base UI buttons that render links need `nativeButton={false} render={<Link … />}` (no `asChild`).
- Open questions from the plan still stand: Javelin `amount` units (`RUN_AMOUNT_UNITS`), result codes,
  `com_ind` for keyed POS. Settle with one $1.23 UAT charge before any real use.

## Pick-up prompt (paste this to resume)

> Continue the Winthrop project in `/Users/mike/run-projects/winthrop`. Read `CLAUDE.md`, then
> `docs/next-steps.md`, and follow its "Next session — Phase 3" list in order. Plan of record:
> `~/.claude/plans/inventory-management-between-online-warm-valiant.md`. Start with
> `docker compose up -d db && pnpm dev`; log in via the console magic link. Commit after each numbered
> step, push to origin, and update `docs/next-steps.md` before stopping.
