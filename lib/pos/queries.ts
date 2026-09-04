import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, orders, payments, posSessions, refunds, users } from '@/lib/db/schema';

export type PosSession = typeof posSessions.$inferSelect;

export interface TenderTotals {
  tender: 'card' | 'cash' | 'venmo' | 'check';
  count: number;
  salesCents: number;
  refundsCents: number;
}

export interface PosSummary {
  session: PosSession;
  eventName: string | null;
  openedByEmail: string | null;
  orders: number;
  totals: TenderTotals[];
  grossCents: number;
  refundedCents: number;
  netCents: number;
  expectedCashCents: number;
}

export async function listOpenPosSessions(orgId: string) {
  return db
    .select({ session: posSessions, eventName: events.name, openedByEmail: users.email })
    .from(posSessions)
    .leftJoin(events, eq(events.id, posSessions.eventId))
    .leftJoin(users, eq(users.id, posSessions.openedBy))
    .where(and(eq(posSessions.orgId, orgId), isNull(posSessions.closedAt)))
    .orderBy(posSessions.openedAt);
}

export async function getPosSummary(orgId: string, posSessionId: string): Promise<PosSummary | null> {
  const [row] = await db
    .select({ session: posSessions, eventName: events.name, openedByEmail: users.email })
    .from(posSessions)
    .leftJoin(events, eq(events.id, posSessions.eventId))
    .leftJoin(users, eq(users.id, posSessions.openedBy))
    .where(and(eq(posSessions.id, posSessionId), eq(posSessions.orgId, orgId)));
  if (!row) return null;

  const sales = await db
    .select({
      tender: payments.tender,
      count: sql<number>`count(*)::int`,
      cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        eq(orders.orgId, orgId),
        eq(orders.posSessionId, posSessionId),
        inArray(payments.status, ['approved', 'partially_refunded', 'refunded'])
      )
    )
    .groupBy(payments.tender);
  const refs = await db
    .select({ tender: refunds.tender, cents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
    .from(refunds)
    .innerJoin(orders, eq(orders.id, refunds.orderId))
    .where(
      and(eq(orders.orgId, orgId), eq(orders.posSessionId, posSessionId), eq(refunds.status, 'approved'))
    )
    .groupBy(refunds.tender);

  const tenders: TenderTotals['tender'][] = ['cash', 'card', 'venmo', 'check'];
  const totals = tenders.map((t) => ({
    tender: t,
    count: sales.find((s) => s.tender === t)?.count ?? 0,
    salesCents: sales.find((s) => s.tender === t)?.cents ?? 0,
    refundsCents: refs.find((r) => r.tender === t)?.cents ?? 0,
  }));
  const grossCents = totals.reduce((n, t) => n + t.salesCents, 0);
  const refundedCents = totals.reduce((n, t) => n + t.refundsCents, 0);
  const cash = totals.find((t) => t.tender === 'cash')!;
  return {
    session: row.session,
    eventName: row.eventName,
    openedByEmail: row.openedByEmail,
    orders: totals.reduce((n, t) => n + t.count, 0),
    totals,
    grossCents,
    refundedCents,
    netCents: grossCents - refundedCents,
    expectedCashCents: row.session.startingCashCents + cash.salesCents - cash.refundsCents,
  };
}
