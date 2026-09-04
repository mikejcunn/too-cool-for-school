import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, orderLines, orders, payments, posSessions, products, refunds, users } from '@/lib/db/schema';

const PAID = ['paid', 'partially_refunded', 'refunded'] as const;

export interface ProductSales {
  productId: string;
  productName: string;
  saleMode: 'stock' | 'preorder';
  units: number;
  refundedUnits: number;
  grossCents: number;
  refundedCents: number;
  cogsCents: number;
  marginCents: number;
}

export async function salesByProduct(orgId: string, from: Date, to: Date): Promise<ProductSales[]> {
  const rows = await db
    .select({
      productId: orderLines.productId,
      productName: products.name,
      saleMode: products.saleMode,
      units: sql<number>`coalesce(sum(${orderLines.quantity}), 0)::int`,
      refundedUnits: sql<number>`coalesce(sum(${orderLines.refundedQuantity}), 0)::int`,
      grossCents: sql<number>`coalesce(sum(${orderLines.lineSubtotalCents}), 0)::int`,
      refundedCents: sql<number>`coalesce(sum(${orderLines.refundedCents}), 0)::int`,
      cogsCents: sql<number>`coalesce(sum(${orderLines.unitCogsCents} * (${orderLines.quantity} - ${orderLines.refundedQuantity})), 0)::int`,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(products, eq(products.id, orderLines.productId))
    .where(
      and(
        eq(orderLines.orgId, orgId),
        inArray(orders.status, [...PAID]),
        gte(orders.paidAt, from),
        lt(orders.paidAt, to)
      )
    )
    .groupBy(orderLines.productId, products.name, products.saleMode)
    .orderBy(sql`5 desc`);
  return rows.map((r) => ({ ...r, marginCents: r.grossCents - r.refundedCents - r.cogsCents }));
}

export interface TenderSummary {
  tender: 'card' | 'cash' | 'venmo' | 'check';
  count: number;
  salesCents: number;
  refundsCents: number;
}

export async function tenderSummary(orgId: string, from: Date, to: Date): Promise<TenderSummary[]> {
  const sales = await db
    .select({
      tender: payments.tender,
      count: sql<number>`count(*)::int`,
      cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.orgId, orgId),
        inArray(payments.status, ['approved', 'partially_refunded', 'refunded']),
        gte(payments.approvedAt, from),
        lt(payments.approvedAt, to)
      )
    )
    .groupBy(payments.tender);
  const refs = await db
    .select({ tender: refunds.tender, cents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
    .from(refunds)
    .where(
      and(
        eq(refunds.orgId, orgId),
        eq(refunds.status, 'approved'),
        gte(refunds.createdAt, from),
        lt(refunds.createdAt, to)
      )
    )
    .groupBy(refunds.tender);
  return (['card', 'cash', 'venmo', 'check'] as const).map((t) => ({
    tender: t,
    count: sales.find((s) => s.tender === t)?.count ?? 0,
    salesCents: sales.find((s) => s.tender === t)?.cents ?? 0,
    refundsCents: refs.find((r) => r.tender === t)?.cents ?? 0,
  }));
}

export interface PosSessionSummary {
  id: string;
  openedAt: Date;
  closedAt: Date | null;
  eventName: string | null;
  openedBy: string | null;
  orders: number;
  salesCents: number;
  cashCents: number;
  startingCashCents: number;
  endingCashCents: number | null;
}

export async function posSessionSummaries(orgId: string, from: Date, to: Date): Promise<PosSessionSummary[]> {
  const rows = await db
    .select({
      id: posSessions.id,
      openedAt: posSessions.openedAt,
      closedAt: posSessions.closedAt,
      eventName: events.name,
      openedBy: users.email,
      startingCashCents: posSessions.startingCashCents,
      endingCashCents: posSessions.endingCashCents,
      orders: sql<number>`count(distinct ${orders.id})::int`,
      salesCents: sql<number>`coalesce(sum(${orders.paidCents} - ${orders.refundedCents}), 0)::int`,
    })
    .from(posSessions)
    .leftJoin(events, eq(events.id, posSessions.eventId))
    .leftJoin(users, eq(users.id, posSessions.openedBy))
    .leftJoin(orders, and(eq(orders.posSessionId, posSessions.id), inArray(orders.status, [...PAID])))
    .where(and(eq(posSessions.orgId, orgId), gte(posSessions.openedAt, from), lt(posSessions.openedAt, to)))
    .groupBy(posSessions.id, events.name, users.email)
    .orderBy(sql`${posSessions.openedAt} desc`);
  const ids = rows.map((r) => r.id);
  const cash = ids.length
    ? await db
        .select({
          posSessionId: orders.posSessionId,
          cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
        })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(
          and(
            eq(payments.orgId, orgId),
            eq(payments.tender, 'cash'),
            inArray(payments.status, ['approved', 'partially_refunded', 'refunded']),
            inArray(orders.posSessionId, ids)
          )
        )
        .groupBy(orders.posSessionId)
    : [];
  return rows.map((r) => ({ ...r, cashCents: cash.find((c) => c.posSessionId === r.id)?.cents ?? 0 }));
}

export interface Totals {
  orders: number;
  grossCents: number;
  refundedCents: number;
  cogsCents: number;
}

export async function periodTotals(orgId: string, from: Date, to: Date): Promise<Totals> {
  const [o] = await db
    .select({
      orders: sql<number>`count(*)::int`,
      grossCents: sql<number>`coalesce(sum(${orders.paidCents}), 0)::int`,
      refundedCents: sql<number>`coalesce(sum(${orders.refundedCents}), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.orgId, orgId),
        inArray(orders.status, [...PAID]),
        gte(orders.paidAt, from),
        lt(orders.paidAt, to)
      )
    );
  const [c] = await db
    .select({
      cogs: sql<number>`coalesce(sum(${orderLines.unitCogsCents} * (${orderLines.quantity} - ${orderLines.refundedQuantity})), 0)::int`,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.orgId, orgId),
        inArray(orders.status, [...PAID]),
        gte(orders.paidAt, from),
        lt(orders.paidAt, to)
      )
    );
  return {
    orders: o?.orders ?? 0,
    grossCents: o?.grossCents ?? 0,
    refundedCents: o?.refundedCents ?? 0,
    cogsCents: c?.cogs ?? 0,
  };
}
