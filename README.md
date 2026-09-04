# Winthrop

School-fundraising merch storefront + volunteer point-of-sale + inventory, built for Friends of Winthrop
(PTO, Winthrop Elementary, Hamilton MA) and multi-tenant so other schools can be added. Payments run on
Run Payments (Runner.js tokenization → Javelin API).

See [`CLAUDE.md`](CLAUDE.md) for the working rules and [`docs/adr/`](docs/adr) for decisions.

## Quick start

```bash
docker compose up -d db
cp .env.example .env.local        # set AUTH_SECRET (openssl rand -base64 32)
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev
```

- Storefront: http://localhost:3000/s/friends-of-winthrop
- Admin: http://localhost:3000/admin/friends-of-winthrop (magic link prints to the console in dev)
- POS: http://localhost:3000/pos/friends-of-winthrop

## Scripts

| Command | What |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm test` | vitest unit + DB integration (DB tests skip without `DATABASE_URL`) |
| `pnpm e2e` | Playwright (needs a running app + Run UAT keys) |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:studio` | Drizzle |
| `pnpm typecheck` / `lint` / `format` | Quality |
