# ADR-0003: Multi-tenancy — org_id everywhere, path-prefix routing

**Status:** accepted 2026-09-03

## Decision

- One database; every tenant row carries `org_id` (including child tables such as `order_lines` and
  `payments`, so scoping never needs a join). Every unique index includes `org_id`.
- Routing by path prefix: `/s/[orgSlug]` storefront, `/admin/[orgSlug]`, `/pos/[orgSlug]`. Root `/`
  redirects to `DEFAULT_ORG_SLUG`. Custom domains can be added later with a host→slug rewrite in middleware.
- `lib/tenant/context.ts` resolves the org and enforces membership; every query function takes `orgId` as its
  first argument and filters on it. `lib/db/with-org.ts` sets `app.org_id` on the transaction so Postgres RLS
  can be enabled later without call-site changes.

## Why

Friends of Winthrop launches alone but other schools follow. Path prefixes need no DNS/SSL work per school,
and PTO links are shared from newsletters anyway. Row-level `org_id` is the simplest model that a test can
verify (every exported query's SQL must mention `org_id`).

## Consequences

- Cross-org reads by id must return nothing; tests assert this.
- Runner.js public key + MID live on the org row; the Javelin API token is platform-wide.
