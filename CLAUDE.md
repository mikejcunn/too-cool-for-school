# Winthrop — repo notes for agents

A school-fundraising merch storefront + volunteer POS + inventory app, built for Friends of Winthrop (PTO,
Winthrop Elementary, Hamilton MA) and multi-tenant by `org_id` so other schools can follow. Payments run on
Run Payments rails (Runner.js tokenization → Javelin `/charge`). It is a side project, not a Run Payments
product: keep process light, keep correctness tight.

It is **not** (yet) memberships, forms, donations, or a calendar. Merch only.

## Run it

```bash
docker compose up -d db          # Postgres 17 on :5433
cp .env.example .env.local       # fill AUTH_SECRET at minimum (openssl rand -base64 32)
pnpm db:migrate && pnpm db:seed  # schema + Friends of Winthrop sample data
pnpm dev                         # http://localhost:3000 → redirects to /s/friends-of-winthrop
pnpm test                        # vitest: unit + db (db tests skip without DATABASE_URL)
pnpm typecheck && pnpm lint
```

Magic-link logins print to the dev server console when `AUTH_DEV_LOG_LINKS=true` and no Resend key is set.

**Demo mode** (`DEMO_MODE=true` + `NEXT_PUBLIC_DEMO_MODE=true`, the default in `.env.example`): charges are
simulated in `lib/run-api` (any card; ending `0000` declines, `9999` = network failure), reCAPTCHA is skipped,
an amber banner shows on every page, and `/login` offers one-click admin sign-in (`lib/auth/demo-session.ts`).
It is honoured in production builds on purpose so a hosted demo can never charge a card. Flip both to `false`
and supply Run credentials for real payments.

## Non-negotiables

1. **Money is integer cents.** Dollars exist only in `lib/money.ts` and `lib/run-api/amount.ts`.
2. **Every query is org-scoped.** Query functions take `orgId` first and filter on it, including child tables
   (`order_lines`, `payments` carry `org_id` for exactly this reason). Foreign-org rows must look missing.
3. **Amounts are recomputed server-side** from DB prices at checkout. Client totals are hints for
   `PRICE_CHANGED` messaging only.
4. **Stock only changes through `lib/inventory/*`.** Never `UPDATE product_variants.on_hand/reserved` directly.
   Every change writes an `inventory_movements` row in the same transaction.
5. **Only `result === 'A' && trans_id` is an approved charge.** Never auto-void an approved charge; an
   uncertain outcome becomes a payment in `unknown` for a human or webhook to resolve.
6. **Never log PANs, tokens, or the Javelin bearer token.** Runner.js keeps card data in its iframe.
7. **Allocation history is immutable.** Rules are snapshotted onto `order_lines`; entries are written when an
   order becomes paid and are reversed with negative entries, never edited.

## Always review carefully

`lib/checkout/*`, `lib/inventory/*`, `lib/allocation/*`, `lib/run-api/*`, `lib/tenant/*`, `drizzle/*` migrations.

## Traps

- `amount` on `/charge`: swagger says integer cents; the shipped apps send `"12.34"`. `RUN_AMOUNT_UNITS`
  selects; settle with a UAT probe (see `docs/checklists.md`).
- Javelin `result` codes: swagger lists A/B/C, apps have seen D/E. Treat anything but `A` as not approved.
- Massachusetts bans credit-card surcharges. `fee_cents` exists for other states; do not surcharge Winthrop.
- `student_name` is PII about minors: first name only on receipts; purge after fulfilment (Phase 5).
- Auth.js v5 is pinned (`next-auth@beta`); `middleware.ts` is edge-safe on purpose (no DB import).

## Where knowledge lives

- `docs/adr/` — decisions and why (0001 stack, 0002 inventory model, 0003 tenancy). Superseded, never rewritten.
- `docs/next-steps.md` — **the living status doc**: where we are, what is next, pick-up prompt. Update it before stopping.
- `docs/checklists.md` — manual verification per phase.
- Plan of record: `~/.claude/plans/inventory-management-between-online-warm-valiant.md` (Mike's machine).
- Run API reference: `../dev-docs/fern/apis/payments/swagger.yml` and `../dev-docs/fern/docs/pages/guides/`.
