/* DB integration tests for lib/catalog/save-product. Require DATABASE_URL. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, like } from 'drizzle-orm';
import { db } from '@/lib/db';
import { inventoryMovements, organizations, productVariants, products, users } from '@/lib/db/schema';
import { saveProduct } from '@/lib/catalog/save-product';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d('saveProduct (db)', () => {
  let orgId: string;
  let userId: string;
  let productId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ slug: `test-prod-${Date.now()}`, name: 'Test Org' })
      .returning();
    orgId = org.id;
    const [u] = await db
      .insert(users)
      .values({ email: `test-prod-${Date.now()}@example.com` })
      .returning();
    userId = u.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(like(organizations.slug, 'test-%'));
    await db.delete(users).where(like(users.email, 'test-prod-%'));
  });

  const base = {
    name: 'Test Hoodie',
    description: 'desc',
    category: 'Apparel',
    status: 'active' as const,
    saleMode: 'stock' as const,
    priceCents: 4000,
    cogsCents: 1900,
    msrpCents: 4500,
    imageUrl: '',
  };

  it('creates a product with variants and opening stock through the ledger', async () => {
    const res = await saveProduct(orgId, userId, {
      ...base,
      variants: [
        { sku: 'th-ym', size: 'YM', color: 'Navy', label: 'YM / Navy', initialOnHand: 4, active: true },
        {
          sku: 'TH-YL',
          size: 'YL',
          color: 'Navy',
          label: 'YL / Navy',
          initialOnHand: 0,
          priceCentsOverride: 4200,
          active: true,
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    productId = res.productId;
    const [p] = await db.select().from(products).where(eq(products.id, productId));
    expect(p.slug).toBe('test-hoodie');
    expect(p.hasVariants).toBe(true);
    const vs = await db.select().from(productVariants).where(eq(productVariants.productId, productId));
    expect(vs.map((v) => v.sku).sort()).toEqual(['TH-YL', 'TH-YM']);
    expect(vs.find((v) => v.sku === 'TH-YM')!.onHand).toBe(4);
    const moves = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.variantId, vs.find((v) => v.sku === 'TH-YM')!.id));
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe('receive');
  });

  it('updates fields, keeps stock, deactivates removed variants, ignores initialOnHand for existing ones', async () => {
    const vs = await db.select().from(productVariants).where(eq(productVariants.productId, productId));
    const ym = vs.find((v) => v.sku === 'TH-YM')!;
    const res = await saveProduct(orgId, userId, {
      ...base,
      id: productId,
      priceCents: 4100,
      variants: [
        {
          id: ym.id,
          sku: 'TH-YM',
          size: 'YM',
          color: 'Navy',
          label: 'Youth M / Navy',
          initialOnHand: 99,
          active: true,
        },
      ],
    });
    expect(res.ok).toBe(true);
    const [p] = await db.select().from(products).where(eq(products.id, productId));
    expect(p.priceCents).toBe(4100);
    expect(p.hasVariants).toBe(false);
    const after = await db.select().from(productVariants).where(eq(productVariants.productId, productId));
    expect(after.find((v) => v.sku === 'TH-YM')).toMatchObject({
      label: 'Youth M / Navy',
      onHand: 4,
      active: true,
    });
    expect(after.find((v) => v.sku === 'TH-YL')).toMatchObject({ active: false });
  });

  it('rejects a SKU used by another product in the org', async () => {
    const res = await saveProduct(orgId, userId, {
      ...base,
      name: 'Other',
      variants: [{ sku: 'TH-YM', label: 'One', active: true }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/already used/);
  });

  it('gives duplicate names distinct slugs', async () => {
    const res = await saveProduct(orgId, userId, {
      ...base,
      variants: [{ sku: 'TH2', label: 'One', active: true }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [p] = await db.select().from(products).where(eq(products.id, res.productId));
    expect(p.slug).toBe('test-hoodie-2');
  });

  it('requires a window for pre-order products', async () => {
    const res = await saveProduct(orgId, userId, {
      ...base,
      name: 'Pre',
      saleMode: 'preorder',
      variants: [{ sku: 'PRE1', label: 'One', active: true }],
    });
    expect(res).toEqual({ ok: false, message: 'Pick a pre-order window.' });
  });
});
