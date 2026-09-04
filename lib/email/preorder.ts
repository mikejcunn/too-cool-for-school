import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orderLines, orders, organizations, preorderWindows } from '@/lib/db/schema';
import { sendEmail } from './resend';
import { PreorderUpdateEmail } from './templates/preorder-update';

async function notify(orgId: string, windowId: string, kind: 'closed' | 'arrived'): Promise<number> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const [win] = await db
    .select()
    .from(preorderWindows)
    .where(and(eq(preorderWindows.id, windowId), eq(preorderWindows.orgId, orgId)));
  if (!org || !win) return 0;
  const rows = await db
    .select({ o: orders, l: orderLines })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.orgId, orgId),
        eq(orderLines.preorderWindowId, windowId),
        eq(orderLines.isPreorder, true),
        inArray(orders.status, ['paid', 'partially_refunded'])
      )
    );
  const byOrder = new Map<
    string,
    { o: typeof orders.$inferSelect; items: (typeof orderLines.$inferSelect)[] }
  >();
  for (const r of rows) {
    const g = byOrder.get(r.o.id) ?? { o: r.o, items: [] };
    if (r.l.quantity - r.l.refundedQuantity > 0) g.items.push(r.l);
    byOrder.set(r.o.id, g);
  }
  let sent = 0;
  for (const { o, items } of byOrder.values()) {
    if (!o.customerEmail || items.length === 0) continue;
    const fulfillment =
      o.fulfillmentMethod === 'classroom'
        ? `Delivery to ${o.teacherName ?? 'classroom'} for ${(o.studentName ?? '').split(' ')[0] || 'your student'}.`
        : o.fulfillmentMethod === 'pickup'
          ? 'Pick up at the event you chose at checkout.'
          : 'We will be in touch about hand-off.';
    await sendEmail({
      to: o.customerEmail,
      subject:
        kind === 'closed'
          ? `${org.name}: your ${win.name} pre-order is placed`
          : `${org.name}: your ${win.name} items arrived`,
      type: 'preorder_update',
      orgId,
      orderId: o.id,
      react: PreorderUpdateEmail({
        orgName: org.name,
        customerName: o.customerName,
        windowName: win.name,
        kind,
        expectedDeliveryOn: win.expectedDeliveryOn
          ? new Date(win.expectedDeliveryOn + 'T12:00:00').toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
            })
          : null,
        items: items.map((l) => ({
          name: l.productName,
          variant: l.variantLabel,
          quantity: l.quantity - l.refundedQuantity,
        })),
        fulfillment,
        contactEmail: org.contactEmail,
      }),
    });
    sent++;
  }
  return sent;
}

export const notifyWindowClosed = (orgId: string, windowId: string) => notify(orgId, windowId, 'closed');
export const notifyItemsArrived = (orgId: string, windowId: string) => notify(orgId, windowId, 'arrived');
