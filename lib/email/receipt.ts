import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations } from '@/lib/db/schema';
import { getOrderDetail } from '@/lib/orders/queries';
import { sendEmail } from './resend';
import { ReceiptEmail } from './templates/receipt';

/** Fire-and-forget after checkout (called via next/server `after`). */
export async function sendReceipt(orgId: string, orderId: string): Promise<void> {
  try {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const d = await getOrderDetail(orgId, orderId);
    if (!org || !d || !d.order.customerEmail) return;
    const approved = d.payments.find((p) =>
      ['approved', 'partially_refunded', 'refunded'].includes(p.status)
    );
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const fulfillment =
      d.order.fulfillmentMethod === 'classroom'
        ? `Delivery to ${d.order.teacherName ?? 'classroom'}${d.order.grade ? ` (grade ${d.order.grade})` : ''} for ${firstName(d.order.studentName)}.`
        : d.order.fulfillmentMethod === 'pickup'
          ? `Pick up at ${d.pickupEvent?.name ?? 'the event'}${d.pickupEvent ? ` on ${d.pickupEvent.startsAt.toLocaleDateString('en-US', { timeZone: org.timezone })}` : ''}.`
          : 'Purchased in person.';
    await sendEmail({
      to: d.order.customerEmail,
      subject: `${org.name}: order ${d.order.orderNumber}`,
      type: 'receipt',
      orgId,
      orderId,
      react: ReceiptEmail({
        orgName: org.name,
        orderNumber: d.order.orderNumber,
        customerName: d.order.customerName ?? 'there',
        lines: d.lines.map((l) => ({
          name: l.productName,
          variant: l.variantLabel,
          quantity: l.quantity,
          lineSubtotalCents: l.lineSubtotalCents,
          isPreorder: l.isPreorder,
        })),
        subtotalCents: d.order.subtotalCents,
        taxCents: d.order.taxCents,
        totalCents: d.order.totalCents,
        fulfillment,
        cardLast4: approved?.cardLast4 ?? null,
        orderUrl: `${base}/s/${org.slug}/orders/${d.order.id}?t=${d.order.publicToken}`,
        contactEmail: org.contactEmail,
      }),
    });
  } catch (e) {
    console.error('[receipt] failed', e);
  }
}

/** Minors: first name only in outbound mail. */
function firstName(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'your student';
}
