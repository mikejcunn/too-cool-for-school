# ADR-0001: Stack

**Status:** accepted 2026-09-03

## Decision

Next.js 15 (App Router, React 19, TypeScript), Drizzle ORM on Postgres (Neon in prod, docker locally),
Auth.js v5 magic-link for volunteers/admins, Tailwind v4 + shadcn/ui, Resend for email, Vercel hosting.
Payments on Run Payments rails: Runner.js browser tokenization → Javelin `/charge`.

## Why

- Matches the author's other Next.js checkout apps (`run-payment-page`, `carols-cookies`) so the Runner.js and
  Javelin client patterns port directly.
- Drizzle is SQL-first: the conditional `UPDATE … WHERE on_hand - reserved >= q` that prevents overselling is a
  one-liner, and there is no engine binary for serverless cold starts.
- Neon branches give a free isolated DB per preview; Vercel gives zero-config deploys and cron. Everything else
  (Neon, Resend, reCAPTCHA) starts on a free tier — Mike asked for low cost and easy deploys.
- Magic link means no passwords to support for ~10 PTO parents; sessions live in our own tables so
  `memberships(org_id, user_id, role)` joins directly.

## Consequences

- Money is integer cents everywhere; `lib/money.ts` is the only place dollars appear.
- Cron endpoints are plain route handlers guarded by `CRON_SECRET`, so the app is not tied to Vercel.
