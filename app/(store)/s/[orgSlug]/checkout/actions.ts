'use server';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireOrg } from '@/lib/tenant/context';
import { cartCookieName, clearCartCookie } from '@/lib/checkout/cart';
import { placeOrder } from '@/lib/checkout/place-order';
import type { PlaceOrderResult } from '@/lib/checkout/schemas';
import { sendReceipt } from '@/lib/email/receipt';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';

export async function placeOrderAction(orgSlug: string, input: unknown): Promise<PlaceOrderResult> {
  const org = await requireOrg(orgSlug);
  const jar = await cookies();
  const token = jar.get(cartCookieName(org.id))?.value;
  let result = await placeOrder(org, token, input);
  if (result.ok) {
    if (!result.publicToken) {
      // Idempotent replay: fill in the redirect data.
      const [o] = await db
        .select({ orderNumber: orders.orderNumber, publicToken: orders.publicToken })
        .from(orders)
        .where(and(eq(orders.id, result.orderId), eq(orders.orgId, org.id)));
      if (o) result = { ...result, orderNumber: o.orderNumber, publicToken: o.publicToken };
    }
    const orderId = result.orderId;
    await clearCartCookie(org.id);
    after(() => sendReceipt(org.id, orderId));
  }
  return result;
}
