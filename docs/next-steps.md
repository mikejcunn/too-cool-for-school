# Next steps (living status doc)

Last updated: 2026-09-03, end of session 1. This file is the authoritative "where are we"; update it at the
end of every working session.

## Where we are

**Phase 0 (scaffold) — done, committed.** Next.js 15 + Drizzle/Neon-ready Postgres schema (31 tables), Auth.js
magic link, Run Payments client + Runner.js hook, oversell-proof inventory functions, allocation math,
seed data, vitest unit + DB tests (31 passing), CI workflow, ADRs, `CLAUDE.md`.

**Phase 1 (MVP) — storefront half done and verified; admin half in progress.**

Working end to end (verified in the browser against the local dev server with the mock gateway):

- Storefront catalog → product page (color/size picker) → cart → checkout (contact, classroom/pickup,
  card) → order confirmation. Order `W-1000` was placed: stock 12→11 with reserve→sale ledger rows,
  $11.00 margin allocated to General Fund, session completed, receipt logged (Resend not configured),
  audit row written.
- Server libs: `lib/checkout/place-order.ts` (reserve → charge → settle, idempotent), `refund.ts`,
  `release-expired.ts` + cron route, `cart.ts`, allocation rules/entries, catalog + order queries,
  receipt email template, dev-only mock gateway (`RUN_MOCK_GATEWAY=true`).

Written but **not yet rendered or smoke-tested** (typecheck + lint pass):

- Admin layout/nav, dashboard, orders list + filters, order detail (items, payments, refunds,
  beneficiary breakdown), mark-fulfilled button, refund dialog (full / by line / custom amount, restock).
- Products list page (read-only).

## Next session — do these in order

1. **Smoke-test the admin.** `pnpm dev`, open `/login`, enter `mike@runpayments.io`; the magic link prints in
   the dev-server console (`AUTH_DEV_LOG_LINKS=true`). Visit `/admin/friends-of-winthrop`, check dashboard,
   orders list, order `W-1000` detail. Try **Mark fulfilled** and a **partial refund** (mock gateway
   approves) and confirm: order status `partially_refunded`, `return` movement if restock, negative
   `allocation_entries`.
2. **Products: new/edit form + actions.** `app/admin/[orgSlug]/products/new/page.tsx`,
   `products/[productId]/page.tsx`, `products/actions.ts` (zod: name, slug auto, description, category,
   status, saleMode + preorderWindowId, priceCents/cogsCents/msrpCents via `parseDollarsToCents`).
   `components/admin/ProductForm.tsx` with a size × color **VariantMatrix** that generates SKUs and
   labels; per-variant price/COGS/MSRP overrides; initial on-hand for *new* variants only (writes a
   `receive` movement via `lib/inventory/receive.ts`). Image URL field for now (Vercel Blob later).
   Archive = status `archived` (never delete; order lines reference variants).
3. **Inventory page.** `admin/[orgSlug]/inventory/page.tsx`: variants grouped by product with on-hand /
   reserved / available / low-stock badge; **Receive** and **Adjust** dialogs → server actions calling
   `receiveStock` / `adjustStock` inside `db.transaction`; `inventory/ledger/page.tsx` listing
   `inventory_movements`; a **Verify ledger** button calling `reconcileInventory`.
4. **Settings page.** Org profile (name, short name, contact email, brand color, logo URL), Run MID +
   public key, allocation basis, tax bps; **classrooms** CRUD; **team**: add member by email (creates the
   `users` row if needed + `memberships` row) so volunteers can log in. Admin-only mutations
   (`requireMember(slug, 'admin')`).
5. **Storefront polish.** Exercise the decline path in the browser (mock card ending `0000` → "Card not
   approved", session stays `reserved` for 10 more minutes) and the network-failure path (`9999` →
   payment `unknown`). Show "Opens <date>" instead of "Pre-order closed" for windows that have not
   opened yet (`components/store/ProductCard.tsx`, product page).
6. **Commit, then move to Phase 2** (POS mode, cash/Venmo/check tenders, events, fulfillment page) per
   the plan.

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
> `docs/next-steps.md`, and follow its "Next session" list in order. Plan of record:
> `~/.claude/plans/inventory-management-between-online-warm-valiant.md`. Start by running
> `docker compose up -d db && pnpm dev`, log in via the console magic link, and smoke-test the admin
> pages written last session before building the product form, inventory page, and settings page.
> Commit after each numbered step and update `docs/next-steps.md` before stopping.
