# Next steps (living status doc)

Last updated: 2026-09-04, session 2. This file is the authoritative "where are we"; update it at the
end of every working session.

## Where we are

**Phase 0 (scaffold) — done.** **Phase 1 (MVP) — done and smoke-tested (session 2, 2026-09-04).**
Repo: https://github.com/mikejcunn/too-cool-for-school (branch `main`).

Verified in the browser against the local dev server with the mock gateway:

- Storefront: catalog → product → cart → checkout → confirmation (orders W-1000, W-1002). Decline path
  shows "Card not approved" and keeps the cart reserved; a retry cancels the superseded pending order
  (W-1001), releases its hold, and succeeds.
- Admin (magic-link login works; link prints in the dev console): dashboard, orders list + filters, order
  detail, **mark fulfilled**, **partial refund** ($5 of W-1000 → status partially refunded, negative
  allocation entry, ledger untouched), products list, **product edit/save**, **inventory receive** (+5 →
  ledger row), **verify ledger** (23/23 match), settings page renders (org, classrooms, team).
- Tests: 36 vitest tests (unit + DB, incl. saveProduct) pass; DB tests tear down their orgs.

Not yet exercised by hand: creating a brand-new product through the form (covered by DB tests), the
Adjust dialog, settings save, adding a team member. Resend is not configured, so receipts are logged
with status `skipped`.

## Next session — Phase 2 (POS + tenders + events)

1. **Events CRUD** in admin (`admin/[orgSlug]/events`): name, starts/ends, location, kind
   (pickup | sale | both), active. Storefront pickup dropdown already reads `events`.
2. **POS session model + screens** under `app/(pos)/pos/[orgSlug]/`: `page.tsx` opens/resumes a
   `pos_sessions` row (pick event, starting cash); `[posSessionId]/page.tsx` renders `<PosApp/>`:
   touch-first product grid (stock items with available counts; pre-order items allowed but force
   classroom/pickup fields), cart, tender sheet with **cash / Venmo / check / card**.
3. **`lib/checkout/pos-order.ts` → `placePosOrder()`**: reuse `stageOrder`-style reservation (5-min TTL,
   `channel='pos'`, `fulfillmentMethod='in_person'`, stock lines fulfilled immediately). Card tender uses
   the same `charge()` + settle path (`com_ind` still `E` until Run confirms); cash/Venmo/check collapse
   stage+settle into one transaction with `payments.reference` and `received_by`. Email/phone optional;
   send a receipt when an email is given. Refactor `place-order.ts` so the shared pieces
   (`stageOrder` internals, `settle`, `upsertCustomer`) are importable rather than duplicated.
4. **Close session**: summary of tenders, expected cash = starting + cash sales − cash refunds, record
   counted cash + notes.
5. **Fulfillment page** (`admin/[orgSlug]/fulfillment`): paid orders grouped by classroom (teacher →
   students) and by pickup event, bulk "mark delivered", printable view.
6. **Non-card refunds** already work in `refundOrder` (no gateway call); confirm the refund dialog copy
   for cash/Venmo.
7. Commit after each step; update this file before stopping.

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
> `docs/next-steps.md`, and follow its "Next session — Phase 2" list in order. Plan of record:
> `~/.claude/plans/inventory-management-between-online-warm-valiant.md`. Start with
> `docker compose up -d db && pnpm dev`; log in via the console magic link. Commit after each numbered
> step, push to origin, and update `docs/next-steps.md` before stopping.
