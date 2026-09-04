# Next steps (living status doc)

Last updated: 2026-09-04, session 2. This file is the authoritative "where are we"; update it at the
end of every working session.

## Where we are

**Phases 0–4 are built and pushed** (session 2, 2026-09-04). Repo: https://github.com/mikejcunn/too-cool-for-school.

Smoke-tested in the browser with the mock gateway: storefront checkout incl. decline + retry; admin
dashboard/orders/order detail/mark fulfilled/partial refund/products edit/inventory receive/verify ledger;
POS cash sale + close register; pre-order window list + detail; events; fulfillment board; allocations
editor (per-product override with live preview). 39 vitest tests pass (unit + DB incl. saveProduct and the
pre-order → PO → receive flow).

Written, compiles, not yet clicked through: POS card/Venmo/check tenders and a POS sale with a pre-order
item; events dialog; fulfillment bulk-mark + print; Adjust-stock dialog; settings save; team member add;
new pre-order window dialog; create-PO / receive-PO pages; reports page + CSV; beneficiaries page.
Resend not configured (emails logged as `skipped`).

## Next session — Phase 5 (multi-tenant + hardening) and launch prep

1. **Click through the untested list above**, fixing as you go.
2. **Run webhook receiver** `app/api/webhooks/run/route.ts`: verify signature if Run provides one (check
   `dev-docs/fern/docs/pages/guides/webhooks/overview.mdx`), dedupe on `metadata.idempotency_key` via
   `webhook_events`, and resolve payments in `unknown` by matching `payload.order_id` (we send
   `order_number`) / `trans_id`: approved → run the settle path; declined → mark declined and release.
3. **Admin "Resolve payment"** on order detail for `unknown` payments (mark approved with trans_id, or
   declined) — the human backstop; plus a cron `reconcile-pending-payments` that re-settles payments stuck
   in `pending` with a stored `raw_response`.
4. **Platform admin**: `/platform/orgs` (create org: name, slug, first admin email → membership), gated by
   `users.is_platform_admin`.
5. **Audit log UI** (`admin/[orgSlug]/audit`), **student-name purge** cron (null `student_name` on orders
   fulfilled > 90 days ago), rate limit on `placeOrderAction` (per IP/session), Sentry.
6. **Launch prep**: UAT credentials in `.env.local` → `pnpm db:seed` → one $1.23 charge to settle
   `RUN_AMOUNT_UNITS`; Resend domain + `RESEND_API_KEY`; reCAPTCHA keys; Vercel project + Neon DB +
   env vars + crons (`vercel.json`); real product photos (image URL field) and copy.

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
> `docs/next-steps.md`, and follow its "Next session — Phase 5" list in order. Plan of record:
> `~/.claude/plans/inventory-management-between-online-warm-valiant.md`. Start with
> `docker compose up -d db && pnpm dev`; log in via the console magic link. Commit after each numbered
> step, push to origin, and update `docs/next-steps.md` before stopping.
