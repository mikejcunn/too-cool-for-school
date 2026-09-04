import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { allocationEntries, beneficiaries, orderLines, orders } from '@/lib/db/schema';

export interface BeneficiaryEarnings {
  beneficiaryId: string;
  name: string;
  active: boolean;
  saleCents: number;
  refundCents: number; // negative
  netCents: number;
  lines: number;
}

export async function beneficiaryEarnings(
  orgId: string,
  from: Date,
  to: Date
): Promise<BeneficiaryEarnings[]> {
  const rows = await db
    .select({
      beneficiaryId: beneficiaries.id,
      name: beneficiaries.name,
      active: beneficiaries.active,
      saleCents: sql<number>`coalesce(sum(case when ${allocationEntries.kind} = 'sale' then ${allocationEntries.amountCents} else 0 end), 0)::int`,
      refundCents: sql<number>`coalesce(sum(case when ${allocationEntries.kind} = 'refund' then ${allocationEntries.amountCents} else 0 end), 0)::int`,
      lines: sql<number>`count(distinct ${allocationEntries.orderLineId})::int`,
    })
    .from(beneficiaries)
    .leftJoin(
      allocationEntries,
      and(
        eq(allocationEntries.beneficiaryId, beneficiaries.id),
        gte(allocationEntries.effectiveAt, from),
        lt(allocationEntries.effectiveAt, to)
      )
    )
    .where(eq(beneficiaries.orgId, orgId))
    .groupBy(beneficiaries.id)
    .orderBy(sql`3 desc`, beneficiaries.name);
  return rows.map((r) => ({ ...r, netCents: r.saleCents + r.refundCents }));
}

export interface BeneficiaryLine {
  effectiveAt: Date;
  orderNumber: string;
  orderId: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  kind: 'sale' | 'refund';
  amountCents: number;
}

export async function beneficiaryDrilldown(
  orgId: string,
  beneficiaryId: string,
  from: Date,
  to: Date
): Promise<BeneficiaryLine[]> {
  return db
    .select({
      effectiveAt: allocationEntries.effectiveAt,
      orderNumber: orders.orderNumber,
      orderId: orders.id,
      productName: orderLines.productName,
      variantLabel: orderLines.variantLabel,
      quantity: orderLines.quantity,
      kind: allocationEntries.kind,
      amountCents: allocationEntries.amountCents,
    })
    .from(allocationEntries)
    .innerJoin(orders, eq(orders.id, allocationEntries.orderId))
    .innerJoin(orderLines, eq(orderLines.id, allocationEntries.orderLineId))
    .where(
      and(
        eq(allocationEntries.orgId, orgId),
        eq(allocationEntries.beneficiaryId, beneficiaryId),
        gte(allocationEntries.effectiveAt, from),
        lt(allocationEntries.effectiveAt, to)
      )
    )
    .orderBy(sql`${allocationEntries.effectiveAt} desc`);
}

/** Unallocated margin: paid lines whose snapshot had no splits (so no entries were written). */
export async function unallocatedCents(orgId: string, from: Date, to: Date): Promise<number> {
  const [r] = await db
    .select({
      cents: sql<number>`coalesce(sum(case when ${orderLines.allocationBasis} = 'margin' then (${orderLines.unitPriceCents} - ${orderLines.unitCogsCents}) else ${orderLines.unitPriceCents} end * (${orderLines.quantity} - ${orderLines.refundedQuantity})), 0)::int`,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.orgId, orgId),
        sql`${orders.status} in ('paid','partially_refunded','refunded')`,
        gte(orders.paidAt, from),
        lt(orders.paidAt, to),
        sql`not exists (select 1 from ${allocationEntries} e where e.order_line_id = ${orderLines.id})`
      )
    );
  return r?.cents ?? 0;
}
