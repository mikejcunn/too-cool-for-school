/* Pre-order window -> demand -> purchase order -> receive -> preorder_fill leaves surplus. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cleanupTestOrgs } from '@/__tests__/helpers';
import {
  orderLines,
  orders,
  organizations,
  preorderWindows,
  productVariants,
  products,
  users,
} from '@/lib/db/schema';
import {
  createPurchaseOrderFromWindow,
  getPurchaseOrder,
  getWindowDetail,
  receivePurchaseOrderLines,
} from '@/lib/purchasing/windows';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d('pre-orders (db)', () => {
  let orgId: string;
  let userId: string;
  let windowId: string;
  let variantId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ slug: `test-pre-${Date.now()}`, name: 'Test Org' })
      .returning();
    orgId = org.id;
    const [u] = await db
      .insert(users)
      .values({ email: `test-pre-${Date.now()}@example.com` })
      .returning();
    userId = u.id;
    const [w] = await db
      .insert(preorderWindows)
      .values({
        orgId,
        name: 'W',
        opensAt: new Date(Date.now() - 86_400_000),
        closesAt: new Date(Date.now() + 86_400_000),
        status: 'open',
      })
      .returning();
    windowId = w.id;
    const [p] = await db
      .insert(products)
      .values({
        orgId,
        slug: 'hoodie',
        name: 'Hoodie',
        priceCents: 4000,
        cogsCents: 1900,
        status: 'active',
        saleMode: 'preorder',
        preorderWindowId: windowId,
      })
      .returning();
    const [v] = await db
      .insert(productVariants)
      .values({ orgId, productId: p.id, sku: `HOOD-${Date.now()}`, label: 'YM' })
      .returning();
    variantId = v.id;
    // Two paid pre-orders: 2 units + 1 unit (one unit later refunded) -> demand 2.
    for (const [qty, refunded] of [
      [2, 0],
      [1, 1],
    ] as const) {
      const [o] = await db
        .insert(orders)
        .values({
          orgId,
          orderNumber: `T-${Math.random().toString(36).slice(2, 8)}`,
          status: 'paid',
          channel: 'online',
          subtotalCents: 4000 * qty,
          totalCents: 4000 * qty,
          paidCents: 4000 * qty,
          fulfillmentMethod: 'classroom',
          publicToken: Math.random().toString(36).slice(2),
          customerEmail: 'a@example.com',
        })
        .returning();
      await db.insert(orderLines).values({
        orgId,
        orderId: o.id,
        variantId,
        productId: p.id,
        sku: v.sku,
        productName: 'Hoodie',
        variantLabel: 'YM',
        quantity: qty,
        refundedQuantity: refunded,
        unitPriceCents: 4000,
        unitCogsCents: 1900,
        lineSubtotalCents: 4000 * qty,
        isPreorder: true,
        preorderWindowId: windowId,
        allocationBasis: 'margin',
        allocationRuleSnapshot: {},
      });
    }
  });

  afterAll(cleanupTestOrgs);

  it('rolls up demand net of refunds', async () => {
    const det = await getWindowDetail(orgId, windowId);
    expect(det?.demand[0]).toMatchObject({
      demandQty: 2,
      orderedQty: 0,
      receivedQty: 0,
      unitCogsCents: 1900,
    });
    expect(det?.orderCount).toBe(2);
  });

  it('creates a PO for uncovered demand and moves the window to ordered', async () => {
    const r = await createPurchaseOrderFromWindow(orgId, windowId, userId, { vendorName: 'Vendor' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const po = await getPurchaseOrder(orgId, r.poId);
    expect(po?.lines).toHaveLength(1);
    expect(po?.lines[0]).toMatchObject({ quantityOrdered: 2, unitCostCents: 1900 });
    expect(po?.po.totalCostCents).toBe(3800);
    const [w] = await db.select().from(preorderWindows).where(eq(preorderWindows.id, windowId));
    expect(w.status).toBe('ordered');
    const again = await createPurchaseOrderFromWindow(orgId, windowId, userId, { vendorName: 'Vendor' });
    expect(again.ok).toBe(false);
  });

  it('receiving fills the backlog first and leaves surplus on hand', async () => {
    const det = await getWindowDetail(orgId, windowId);
    const poId = det!.purchaseOrders[0].id;
    const po = await getPurchaseOrder(orgId, poId);
    // Vendor ships 3 (one extra): 2 satisfy pre-orders, 1 becomes sellable stock.
    const r = await receivePurchaseOrderLines(orgId, poId, userId, [
      { lineId: po!.lines[0].id, quantity: 3 },
    ]);
    expect(r).toEqual({ ok: true, poStatus: 'received' });
    const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    expect(v.onHand).toBe(1);
    const [w] = await db.select().from(preorderWindows).where(eq(preorderWindows.id, windowId));
    expect(w.status).toBe('received');
  });
});
