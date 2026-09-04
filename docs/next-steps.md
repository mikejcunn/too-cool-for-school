# Next steps (living status doc)

Last updated: 2026-09-04, session 2. This file is the authoritative "where are we"; update it at the
end of every working session.

## Where we are

**Phases 0–5 are built and pushed** (session 2, 2026-09-04). Repo: https://github.com/mikejcunn/too-cool-for-school.

Smoke-tested in the browser with the mock gateway: storefront checkout incl. decline + retry; admin
dashboard/orders/order detail/mark fulfilled/partial refund/products edit/inventory receive/verify ledger;
POS cash sale + close register; pre-order window list + detail; events; fulfillment board; allocations
editor (per-product override with live preview). 39 vitest tests pass (unit + DB incl. saveProduct and the
pre-order → PO → receive flow).

Written, compiles, not yet clicked through: POS card/Venmo/check tenders and a POS sale with a pre-order
item; events dialog; fulfillment bulk-mark + print; Adjust-stock dialog; settings save; team member add;
new pre-order window dialog; create-PO / receive-PO pages; reports page + CSV; beneficiaries page.
Resend not configured (emails logged as `skipped`).

## Next session — launch prep and polish

Phase 5 shipped: Run webhook receiver (`/api/webhooks/run`, HMAC `X-Webhook-Signature-256`, dedupe via
`webhook_events`), admin **Resolve payment** dialog for pending/unknown payments, `reconcile-pending-payments`
cron, `/platform/orgs` (create a school with first admin), audit log page, `purge-student-names` cron.
42 tests pass incl. resolvePayment approve/decline/duplicate-trans_id.

1. **Click through what is still untested by hand**: POS card/Venmo/check tenders, POS sale with a pre-order
   item, events dialog, fulfillment bulk-mark + print, Adjust-stock dialog, settings save, team member add,
   new pre-order window dialog, create-PO / receive-PO pages, reports CSV, beneficiaries page, platform create
   org, Resolve-payment dialog (use mock card ending `9999` at checkout to produce an `unknown` payment).
2. **Launch prep**: UAT creds in `.env.local` → `pnpm db:seed` (or Settings page) → one $1.23 charge to settle
   `RUN_AMOUNT_UNITS`; confirm the Runner.js iframe renders with the real public key; share
   `/api/webhooks/run` + `RUN_WEBHOOK_SECRET` with Run; Resend domain + `RESEND_API_KEY` + `AUTH_RESEND_KEY`;
   reCAPTCHA v3 keys; Vercel project + Neon DB + env vars + crons (`vercel.json`); `NEXT_PUBLIC_APP_URL`.
3. **Content**: real product photos (image URL field; Vercel Blob upload is a nice-to-have), store copy,
   classroom list for this school year, first pre-order window dates.
4. **Nice-to-haves**: rate limit on `placeOrderAction`, Sentry, Postgres RLS behind `withOrg`, custom domain
   middleware, Playwright e2e (`e2e/` is empty; config exists), student-name first-name-only on the admin
   fulfillment print view.

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
> `docs/next-steps.md`, and follow its "Next session — launch prep" list in order. Plan of record:
> `~/.claude/plans/inventory-management-between-online-warm-valiant.md`. Start with
> `docker compose up -d db && pnpm dev`; log in via the console magic link. Commit after each numbered
> step, push to origin, and update `docs/next-steps.md` before stopping.
