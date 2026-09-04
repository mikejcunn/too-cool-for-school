/* Release reservations whose hold has lapsed and cancel their pending orders.
 * Never touches a session whose order has an approved or unknown payment. */
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db, type Tx } from '@/lib/db';
import {
  checkoutItems,
  checkoutSessions,
  orders,
  payments,
  products,
  productVariants,
} from '@/lib/db/schema';
import { releaseStock } from '@/lib/inventory';

export interface ReleaseSummary {
  sessionsExpired: number;
  ordersCancelled: number;
}

export async function releaseExpiredReservations(
  tx: Tx,
  orgId?: string,
  now = new Date()
): Promise<ReleaseSummary> {
  const where = orgId
    ? and(
        eq(checkoutSessions.orgId, orgId),
        inArray(checkoutSessions.status, ['reserved', 'paying']),
        lt(checkoutSessions.reservedUntil, now)
      )
    : and(inArray(checkoutSessions.status, ['reserved', 'paying']), lt(checkoutSessions.reservedUntil, now));
  const stale = await tx.select().from(checkoutSessions).where(where).for('update', { skipLocked: true });

  let sessionsExpired = 0;
  let ordersCancelled = 0;
  for (const s of stale) {
    const linked = await tx.select().from(orders).where(eq(orders.checkoutSessionId, s.id));
    const pendingOrders = linked.filter((o) => o.status === 'pending');
    if (pendingOrders.length) {
      const blocking = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            inArray(
              payments.orderId,
              pendingOrders.map((o) => o.id)
            ),
            inArray(payments.status, ['approved', 'unknown'])
          )
        )
        .limit(1);
      if (blocking.length) continue; // a human/webhook must resolve this one
    }

    const items = await tx
      .select({
        variantId: checkoutItems.variantId,
        quantity: checkoutItems.quantity,
        saleMode: products.saleMode,
      })
      .from(checkoutItems)
      .innerJoin(productVariants, eq(productVariants.id, checkoutItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(checkoutItems.sessionId, s.id));
    for (const it of items) {
      if (it.saleMode === 'preorder') continue;
      await releaseStock(tx, {
        orgId: s.orgId,
        variantId: it.variantId,
        quantity: it.quantity,
        referenceType: 'checkout_session',
        referenceId: s.id,
      });
    }
    if (pendingOrders.length) {
      await tx
        .update(orders)
        .set({
          status: 'cancelled',
          notes: sql`coalesce(${orders.notes}, '') || ' [auto-cancelled: reservation expired]'`,
        })
        .where(
          inArray(
            orders.id,
            pendingOrders.map((o) => o.id)
          )
        );
      ordersCancelled += pendingOrders.length;
    }
    // Back to an open cart so the shopper can try again; items stay in the cart.
    await tx
      .update(checkoutSessions)
      .set({ status: 'open', reservedUntil: null })
      .where(eq(checkoutSessions.id, s.id));
    sessionsExpired++;
  }
  return { sessionsExpired, ordersCancelled };
}

/** Entry point for the cron route. */
export function releaseExpiredReservationsAllOrgs(): Promise<ReleaseSummary> {
  return db.transaction((tx) => releaseExpiredReservations(tx));
}
