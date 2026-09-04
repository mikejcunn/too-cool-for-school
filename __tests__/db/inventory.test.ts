/* DB integration tests. Require DATABASE_URL (docker compose up -d db && pnpm db:migrate). */
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, productVariants, products } from '@/lib/db/schema';
import {
  adjustStock,
  commitStock,
  reconcileInventory,
  releaseStock,
  reserveStock,
  receiveStock,
} from '@/lib/inventory';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d('inventory (db)', () => {
  let orgId: string;
  let variantId: string;

  beforeAll(async () => {
    const slug = `test-inv-${Date.now()}`;
    const [org] = await db.insert(organizations).values({ slug, name: 'Test Org' }).returning();
    orgId = org.id;
    const [p] = await db
      .insert(products)
      .values({ orgId, slug: 'tee', name: 'Tee', priceCents: 1000, status: 'active' })
      .returning();
    const [v] = await db
      .insert(productVariants)
      .values({ orgId, productId: p.id, sku: `TEE-${Date.now()}`, label: 'One', onHand: 0 })
      .returning();
    variantId = v.id;
    await db.transaction((tx) =>
      receiveStock(tx, { orgId, variantId, quantity: 5, note: 'test' }).then(() => undefined)
    );
  });

  it('exactly N parallel reservations succeed against on_hand=N', async () => {
    const attempts = Array.from({ length: 20 }, () =>
      db.transaction((tx) => reserveStock(tx, { orgId, variantId, quantity: 1 }))
    );
    const results = await Promise.all(attempts);
    const ok = results.filter((r) => r.ok).length;
    expect(ok).toBe(5);
    const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    expect(v.reserved).toBe(5);
    expect(v.onHand).toBe(5);
  });

  it('release, commit and adjust keep counters and ledger consistent', async () => {
    await db.transaction(async (tx) => {
      expect(await releaseStock(tx, { orgId, variantId, quantity: 2 })).toMatchObject({
        ok: true,
        reserved: 3,
      });
      expect(await commitStock(tx, { orgId, variantId, quantity: 3 })).toMatchObject({
        ok: true,
        onHand: 2,
        reserved: 0,
      });
      expect(await adjustStock(tx, { orgId, variantId, delta: -1, note: 'damaged' })).toMatchObject({
        ok: true,
        onHand: 1,
      });
      expect(await adjustStock(tx, { orgId, variantId, delta: -5 })).toEqual({
        ok: false,
        reason: 'insufficient',
      });
    });
    const rows = await db.transaction((tx) => reconcileInventory(tx, orgId));
    expect(rows.find((r) => r.variantId === variantId)).toMatchObject({
      onHand: 1,
      reserved: 0,
      ledgerOnHand: 1,
      ledgerReserved: 0,
      ok: true,
    });
  });

  it('CHECK constraints reject a forced negative', async () => {
    await expect(
      db.update(productVariants).set({ onHand: -1 }).where(eq(productVariants.id, variantId))
    ).rejects.toThrow();
  });

  it('cross-org access returns out-of-stock, never touches the row', async () => {
    const [other] = await db
      .insert(organizations)
      .values({ slug: `test-other-${Date.now()}`, name: 'Other' })
      .returning();
    const r = await db.transaction((tx) => reserveStock(tx, { orgId: other.id, variantId, quantity: 1 }));
    expect(r).toEqual({ ok: false, available: 0 });
  });
});
