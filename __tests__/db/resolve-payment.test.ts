/* Resolving an `unknown` payment as approved settles the order; as declined it releases the hold. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cleanupTestOrgs } from '@/__tests__/helpers';
import {
  allocationEntries,
  allocationRuleSplits,
  allocationRules,
  beneficiaries,
  checkoutItems,
  checkoutSessions,
  orderLines,
  orders,
  organizations,
  payments,
  productVariants,
  products,
} from '@/lib/db/schema';
import { reserveStock } from '@/lib/inventory';
import { resolvePayment } from '@/lib/checkout/resolve-payment';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d('resolvePayment (db)', () => {
  let orgId: string;
  let variantId: string;
  let productId: string;
  let benId: string;

  async function pendingOrder(qty: number) {
    const [s] = await db
      .insert(checkoutSessions)
      .values({
        orgId,
        cookieToken: `t-${Math.random()}`,
        expiresAt: new Date(Date.now() + 3600_000),
        status: 'paying',
        reservedUntil: new Date(Date.now() + 600_000),
      })
      .returning();
    await db
      .insert(checkoutItems)
      .values({ sessionId: s.id, variantId, quantity: qty, unitPriceCentsShown: 1800 });
    await db.transaction((tx) =>
      reserveStock(tx, {
        orgId,
        variantId,
        quantity: qty,
        referenceType: 'checkout_session',
        referenceId: s.id,
      })
    );
    const [o] = await db
      .insert(orders)
      .values({
        orgId,
        orderNumber: `R-${Math.random().toString(36).slice(2, 8)}`,
        status: 'pending',
        channel: 'online',
        checkoutSessionId: s.id,
        subtotalCents: 1800 * qty,
        totalCents: 1800 * qty,
        fulfillmentMethod: 'pickup',
        publicToken: Math.random().toString(36).slice(2),
        customerEmail: 'r@example.com',
        customerName: 'R',
      })
      .returning();
    await db
      .insert(orderLines)
      .values({
        orgId,
        orderId: o.id,
        variantId,
        productId,
        sku: 'RT',
        productName: 'Tee',
        variantLabel: 'One',
        quantity: qty,
        unitPriceCents: 1800,
        unitCogsCents: 700,
        lineSubtotalCents: 1800 * qty,
        allocationBasis: 'margin',
        allocationRuleSnapshot: {
          ruleId: null,
          basis: 'margin',
          splits: [{ beneficiaryId: benId, kind: 'percent', percentBps: 10000, position: 0 }],
        },
      });
    const [p] = await db
      .insert(payments)
      .values({
        orgId,
        orderId: o.id,
        tender: 'card',
        status: 'unknown',
        amountCents: 1800 * qty,
        idempotencyKey: `k-${Math.random()}`,
      })
      .returning();
    return { order: o, payment: p };
  }

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ slug: `test-res-${Date.now()}`, name: 'Test' })
      .returning();
    orgId = org.id;
    const [b] = await db.insert(beneficiaries).values({ orgId, name: 'GF', slug: 'gf' }).returning();
    benId = b.id;
    const [r] = await db.insert(allocationRules).values({ orgId, productId: null }).returning();
    await db
      .insert(allocationRuleSplits)
      .values({ ruleId: r.id, beneficiaryId: benId, kind: 'percent', percentBps: 10000, position: 0 });
    const [p] = await db
      .insert(products)
      .values({ orgId, slug: 'tee', name: 'Tee', priceCents: 1800, cogsCents: 700, status: 'active' })
      .returning();
    productId = p.id;
    const [v] = await db
      .insert(productVariants)
      .values({ orgId, productId, sku: `RT-${Date.now()}`, label: 'One', onHand: 10 })
      .returning();
    variantId = v.id;
  });
  afterAll(cleanupTestOrgs);

  it('approving commits stock, marks paid, writes allocations', async () => {
    const { order, payment } = await pendingOrder(2);
    const r = await resolvePayment(
      orgId,
      payment.id,
      { kind: 'approved', transId: `tx-${Date.now()}`, cardLast4: '4242' },
      null,
      'webhook'
    );
    expect(r).toEqual({ ok: true, orderStatus: 'paid' });
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.status).toBe('paid');
    expect(o.paidCents).toBe(3600);
    const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    expect(v).toMatchObject({ onHand: 8, reserved: 0 });
    const entries = await db.select().from(allocationEntries).where(eq(allocationEntries.orderId, order.id));
    expect(entries.reduce((n, e) => n + e.amountCents, 0)).toBe(2200);
    const again = await resolvePayment(orgId, payment.id, { kind: 'declined' }, null, 'admin');
    expect(again.ok).toBe(false);
  });

  it('declining cancels the order and releases the hold', async () => {
    const { order, payment } = await pendingOrder(3);
    const r = await resolvePayment(
      orgId,
      payment.id,
      { kind: 'declined', respText: 'Do not honor' },
      null,
      'admin'
    );
    expect(r).toEqual({ ok: true, orderStatus: 'cancelled' });
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.status).toBe('cancelled');
    const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    expect(v).toMatchObject({ onHand: 8, reserved: 0 });
    const [s] = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, order.checkoutSessionId!));
    expect(s.status).toBe('open');
  });

  it('rejects reusing a transaction id', async () => {
    const first = await pendingOrder(1);
    const tid = `dup-${Date.now()}`;
    expect(
      (await resolvePayment(orgId, first.payment.id, { kind: 'approved', transId: tid }, null, 'admin')).ok
    ).toBe(true);
    const second = await pendingOrder(1);
    const r = await resolvePayment(
      orgId,
      second.payment.id,
      { kind: 'approved', transId: tid },
      null,
      'admin'
    );
    expect(r.ok).toBe(false);
  });
});
