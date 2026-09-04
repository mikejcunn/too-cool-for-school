import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  allocationEntries,
  beneficiaries,
  classrooms,
  events,
  orderLines,
  orders,
  payments,
  refunds,
} from '@/lib/db/schema';

export type Order = typeof orders.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Refund = typeof refunds.$inferSelect;

export interface OrderFilters {
  status?: Order['status'][] | 'open';
  fulfillmentMethod?: Order['fulfillmentMethod'];
  fulfillmentStatus?: Order['fulfillmentStatus'];
  classroomId?: string;
  pickupEventId?: string;
  channel?: Order['channel'];
  q?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface OrderListRow extends Order {
  itemCount: number;
  tender: Payment['tender'] | null;
  cardLast4: string | null;
}

export async function listOrders(orgId: string, f: OrderFilters = {}): Promise<OrderListRow[]> {
  const conds: SQL[] = [eq(orders.orgId, orgId)];
  if (f.status === 'open') conds.push(inArray(orders.status, ['paid', 'partially_refunded']));
  else if (f.status?.length) conds.push(inArray(orders.status, f.status));
  if (f.fulfillmentMethod) conds.push(eq(orders.fulfillmentMethod, f.fulfillmentMethod));
  if (f.fulfillmentStatus) conds.push(eq(orders.fulfillmentStatus, f.fulfillmentStatus));
  if (f.classroomId) conds.push(eq(orders.classroomId, f.classroomId));
  if (f.pickupEventId) conds.push(eq(orders.pickupEventId, f.pickupEventId));
  if (f.channel) conds.push(eq(orders.channel, f.channel));
  if (f.from) conds.push(gte(orders.createdAt, f.from));
  if (f.to) conds.push(lte(orders.createdAt, f.to));
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    conds.push(
      or(
        ilike(orders.orderNumber, like),
        ilike(orders.customerName, like),
        ilike(orders.customerEmail, like),
        ilike(orders.studentName, like),
        ilike(orders.teacherName, like)
      )!
    );
  }

  const approved = db
    .select({ orderId: payments.orderId, tender: payments.tender, cardLast4: payments.cardLast4 })
    .from(payments)
    .where(
      and(eq(payments.orgId, orgId), inArray(payments.status, ['approved', 'partially_refunded', 'refunded']))
    )
    .as('approved');
  const counts = db
    .select({
      orderId: orderLines.orderId,
      itemCount: sql<number>`sum(${orderLines.quantity})::int`.as('item_count'),
    })
    .from(orderLines)
    .where(eq(orderLines.orgId, orgId))
    .groupBy(orderLines.orderId)
    .as('counts');

  const rows = await db
    .select({
      order: orders,
      itemCount: counts.itemCount,
      tender: approved.tender,
      cardLast4: approved.cardLast4,
    })
    .from(orders)
    .leftJoin(counts, eq(counts.orderId, orders.id))
    .leftJoin(approved, eq(approved.orderId, orders.id))
    .where(and(...conds))
    .orderBy(desc(orders.createdAt))
    .limit(f.limit ?? 200)
    .offset(f.offset ?? 0);
  return rows.map((r) => ({
    ...r.order,
    itemCount: r.itemCount ?? 0,
    tender: r.tender ?? null,
    cardLast4: r.cardLast4 ?? null,
  }));
}

export interface OrderDetail {
  order: Order;
  lines: OrderLine[];
  payments: Payment[];
  refunds: Refund[];
  allocations: {
    beneficiaryName: string;
    orderLineId: string;
    kind: 'sale' | 'refund';
    amountCents: number;
  }[];
  classroom: typeof classrooms.$inferSelect | null;
  pickupEvent: typeof events.$inferSelect | null;
}

export async function getOrderDetail(orgId: string, orderId: string): Promise<OrderDetail | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orgId, orgId), eq(orders.id, orderId)));
  if (!order) return null;
  const [lines, pays, refs, allocs, classroom, pickupEvent] = await Promise.all([
    db
      .select()
      .from(orderLines)
      .where(and(eq(orderLines.orgId, orgId), eq(orderLines.orderId, orderId)))
      .orderBy(asc(orderLines.createdAt)),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.orgId, orgId), eq(payments.orderId, orderId)))
      .orderBy(asc(payments.createdAt)),
    db
      .select()
      .from(refunds)
      .where(and(eq(refunds.orgId, orgId), eq(refunds.orderId, orderId)))
      .orderBy(asc(refunds.createdAt)),
    db
      .select({
        beneficiaryName: beneficiaries.name,
        orderLineId: allocationEntries.orderLineId,
        kind: allocationEntries.kind,
        amountCents: allocationEntries.amountCents,
      })
      .from(allocationEntries)
      .innerJoin(beneficiaries, eq(beneficiaries.id, allocationEntries.beneficiaryId))
      .where(and(eq(allocationEntries.orgId, orgId), eq(allocationEntries.orderId, orderId))),
    order.classroomId
      ? db
          .select()
          .from(classrooms)
          .where(eq(classrooms.id, order.classroomId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    order.pickupEventId
      ? db
          .select()
          .from(events)
          .where(eq(events.id, order.pickupEventId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  return { order, lines, payments: pays, refunds: refs, allocations: allocs, classroom, pickupEvent };
}

/** Guest confirmation page: order must match org + public token. */
export async function getOrderForConfirmation(
  orgId: string,
  orderId: string,
  publicToken: string
): Promise<OrderDetail | null> {
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.orgId, orgId), eq(orders.id, orderId), eq(orders.publicToken, publicToken)));
  if (!order) return null;
  return getOrderDetail(orgId, orderId);
}

export async function markFulfilled(
  orgId: string,
  orderId: string,
  userId: string,
  fulfilled: boolean
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        fulfillmentStatus: fulfilled ? 'fulfilled' : 'unfulfilled',
        fulfilledAt: fulfilled ? now : null,
        fulfilledBy: fulfilled ? userId : null,
      })
      .where(and(eq(orders.orgId, orgId), eq(orders.id, orderId)));
    await tx
      .update(orderLines)
      .set({ fulfilledQuantity: fulfilled ? orderLines.quantity : 0, fulfilledAt: fulfilled ? now : null })
      .where(and(eq(orderLines.orgId, orgId), eq(orderLines.orderId, orderId)));
  });
}

export interface DashboardStats {
  paidToday: number;
  revenueTodayCents: number;
  unfulfilled: number;
  lowStock: number;
}
