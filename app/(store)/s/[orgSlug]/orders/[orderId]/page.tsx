import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireOrg } from '@/lib/tenant/context';
import { getOrderForConfirmation } from '@/lib/orders/queries';
import { formatCents } from '@/lib/money';

export const metadata = { title: 'Order confirmation' };

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; orderId: string }>;
  searchParams: Promise<{ t?: string; new?: string }>;
}) {
  const { orgSlug, orderId } = await params;
  const { t, new: isNew } = await searchParams;
  const org = await requireOrg(orgSlug);
  if (!t) notFound();
  const d = await getOrderForConfirmation(org.id, orderId, t);
  if (!d) notFound();
  const { order, lines, pickupEvent } = d;
  const approved = d.payments.find((p) => ['approved', 'partially_refunded', 'refunded'].includes(p.status));
  const now = lines.filter((l) => !l.isPreorder);
  const later = lines.filter((l) => l.isPreorder);
  const paid = order.status !== 'pending' && order.status !== 'cancelled';

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div className="grid gap-2">
        {isNew && paid && (
          <div className="inline-flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" /> Payment received
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">
          Order {order.orderNumber}{' '}
          <Badge variant="outline" className="ml-2 align-middle capitalize">
            {order.status.replace('_', ' ')}
          </Badge>
        </h1>
        <p className="text-muted-foreground">
          Thanks, {order.customerName?.split(' ')[0]}. A receipt is on its way to {order.customerEmail}.
        </p>
      </div>

      <section className="rounded-lg border p-4 text-sm">
        <h2 className="mb-1 font-medium">Delivery</h2>
        {order.fulfillmentMethod === 'classroom' ? (
          <p>
            To <strong>{order.teacherName}</strong>
            {order.grade ? ` (Grade ${order.grade})` : ''} for <strong>{order.studentName}</strong>.
          </p>
        ) : order.fulfillmentMethod === 'pickup' ? (
          <p>
            Pick up at <strong>{pickupEvent?.name}</strong>
            {pickupEvent
              ? ` on ${pickupEvent.startsAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: org.timezone })}`
              : ''}
            .
          </p>
        ) : (
          <p>Purchased in person.</p>
        )}
      </section>

      {now.length > 0 && <LineList title={later.length ? 'Ready now' : 'Items'} lines={now} />}
      {later.length > 0 && <LineList title="Pre-ordered · arrives after the window closes" lines={later} />}

      <section className="grid gap-1 rounded-lg border p-4 text-sm">
        <Row label="Subtotal" value={formatCents(order.subtotalCents)} />
        {order.taxCents > 0 && <Row label="Tax" value={formatCents(order.taxCents)} />}
        <Row label="Total" value={formatCents(order.totalCents)} strong />
        {approved?.cardLast4 && (
          <Row label="Paid with" value={`${approved.cardBrand ?? 'Card'} ending ${approved.cardLast4}`} />
        )}
        {order.refundedCents > 0 && <Row label="Refunded" value={formatCents(order.refundedCents)} />}
      </section>

      <Button
        nativeButton={false}
        render={<Link href={`/s/${org.slug}`} />}
        variant="outline"
        className="justify-self-start"
      >
        Back to the store
      </Button>
    </div>
  );
}

function LineList({
  title,
  lines,
}: {
  title: string;
  lines: {
    id: string;
    quantity: number;
    productName: string;
    variantLabel: string;
    lineSubtotalCents: number;
  }[];
}) {
  return (
    <section className="rounded-lg border">
      <h2 className="border-b px-4 py-2 text-sm font-medium">{title}</h2>
      <ul className="divide-y text-sm">
        {lines.map((l) => (
          <li key={l.id} className="flex justify-between gap-2 px-4 py-2">
            <span>
              {l.quantity} × {l.productName} <span className="text-muted-foreground">({l.variantLabel})</span>
            </span>
            <span>{formatCents(l.lineSubtotalCents)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'text-base font-semibold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
