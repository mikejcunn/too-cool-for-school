import { and, asc, eq, inArray } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { db } from '@/lib/db';
import { events, orderLines, orders } from '@/lib/db/schema';
import { FulfillmentBoard, type FulfillmentOrder } from '@/components/admin/FulfillmentBoard';

export default async function FulfillmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { orgSlug } = await params;
  const { all } = await searchParams;
  const { org } = await requireMember(orgSlug, 'volunteer');
  const showFulfilled = all === '1';

  const rows = await db
    .select({ o: orders, eventName: events.name })
    .from(orders)
    .leftJoin(events, eq(events.id, orders.pickupEventId))
    .where(
      and(
        eq(orders.orgId, org.id),
        inArray(orders.status, ['paid', 'partially_refunded']),
        inArray(orders.fulfillmentMethod, ['classroom', 'pickup']),
        showFulfilled ? undefined : inArray(orders.fulfillmentStatus, ['unfulfilled', 'partial'])
      )
    )
    .orderBy(asc(orders.teacherName), asc(orders.studentName), asc(orders.createdAt));
  const ids = rows.map((r) => r.o.id);
  const lines = ids.length
    ? await db
        .select()
        .from(orderLines)
        .where(and(eq(orderLines.orgId, org.id), inArray(orderLines.orderId, ids)))
    : [];

  const data: FulfillmentOrder[] = rows.map(({ o, eventName }) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    studentName: o.studentName,
    teacherName: o.teacherName,
    grade: o.grade,
    classroomId: o.classroomId,
    pickupEventId: o.pickupEventId,
    pickupEventName: eventName,
    fulfillmentMethod: o.fulfillmentMethod,
    fulfillmentStatus: o.fulfillmentStatus,
    items: lines
      .filter((l) => l.orderId === o.id && l.quantity - l.refundedQuantity > 0)
      .map((l) => ({
        label: `${l.productName} (${l.variantLabel})`,
        quantity: l.quantity - l.refundedQuantity,
        isPreorder: l.isPreorder,
        fulfilledQuantity: l.fulfilledQuantity,
      })),
  }));

  return (
    <div className="grid gap-4">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Fulfillment</h1>
        <p className="text-sm text-muted-foreground">
          Paid orders grouped by classroom and pickup event. Tick what you have delivered.
        </p>
      </div>
      <FulfillmentBoard orgSlug={org.slug} orders={data} showFulfilled={showFulfilled} />
    </div>
  );
}
