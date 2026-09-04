/* Write allocation_entries for a paid order, and negative entries for refunds. */
import { and, eq } from 'drizzle-orm';
import { allocationEntries, orderLines } from '@/lib/db/schema';
import type { Tx } from '@/lib/db';
import { computeLineAllocation, reverseLineAllocation, reverseProportional } from './compute';
import { parseSnapshot } from './rules';
import type { AllocationBasis } from './types';

/** Called in the settle transaction when an order becomes paid. Idempotent per order. */
export async function writeSaleAllocations(
  tx: Tx,
  args: { orgId: string; orderId: string; effectiveAt: Date; orgBasis: AllocationBasis }
): Promise<void> {
  const existing = await tx
    .select({ id: allocationEntries.id })
    .from(allocationEntries)
    .where(and(eq(allocationEntries.orderId, args.orderId), eq(allocationEntries.kind, 'sale')))
    .limit(1);
  if (existing.length) return;

  const lines = await tx
    .select()
    .from(orderLines)
    .where(and(eq(orderLines.orgId, args.orgId), eq(orderLines.orderId, args.orderId)));
  const values: (typeof allocationEntries.$inferInsert)[] = [];
  for (const line of lines) {
    const snap = parseSnapshot(line.allocationRuleSnapshot, line.allocationBasis);
    if (snap.splits.length === 0) continue;
    const { pool, amounts } = computeLineAllocation({
      unitPriceCents: line.unitPriceCents,
      unitCogsCents: line.unitCogsCents,
      quantity: line.quantity,
      basis: snap.basis,
      splits: snap.splits,
    });
    for (const a of amounts) {
      values.push({
        orgId: args.orgId,
        orderId: args.orderId,
        orderLineId: line.id,
        beneficiaryId: a.beneficiaryId,
        kind: 'sale',
        amountCents: a.amountCents,
        basisPoolCents: pool,
        ruleId: snap.ruleId,
        effectiveAt: args.effectiveAt,
      });
    }
  }
  if (values.length) await tx.insert(allocationEntries).values(values);
}

/**
 * Reverse allocations for a refund. `unitsByLine` reverses whole units; `amountByLine`
 * handles a custom cent amount proportionally against that line's sale entries.
 */
export async function writeRefundAllocations(
  tx: Tx,
  args: {
    orgId: string;
    orderId: string;
    refundId: string;
    effectiveAt: Date;
    unitsByLine: Map<string, number>;
    amountByLine?: Map<string, number>;
  }
): Promise<void> {
  const lines = await tx
    .select()
    .from(orderLines)
    .where(and(eq(orderLines.orgId, args.orgId), eq(orderLines.orderId, args.orderId)));
  const values: (typeof allocationEntries.$inferInsert)[] = [];

  for (const line of lines) {
    const snap = parseSnapshot(line.allocationRuleSnapshot, line.allocationBasis);
    if (snap.splits.length === 0) continue;
    const lineInput = {
      unitPriceCents: line.unitPriceCents,
      unitCogsCents: line.unitCogsCents,
      quantity: line.quantity,
      basis: snap.basis,
      splits: snap.splits,
    };

    const units = args.unitsByLine.get(line.id) ?? 0;
    if (units > 0) {
      const { pool, amounts } = reverseLineAllocation(lineInput, units);
      for (const a of amounts) {
        values.push({
          orgId: args.orgId,
          orderId: args.orderId,
          orderLineId: line.id,
          beneficiaryId: a.beneficiaryId,
          kind: 'refund',
          amountCents: a.amountCents,
          basisPoolCents: pool,
          ruleId: snap.ruleId,
          refundId: args.refundId,
          effectiveAt: args.effectiveAt,
        });
      }
    }

    const custom = args.amountByLine?.get(line.id) ?? 0;
    if (custom > 0) {
      const sale = await tx
        .select({
          beneficiaryId: allocationEntries.beneficiaryId,
          amountCents: allocationEntries.amountCents,
        })
        .from(allocationEntries)
        .where(and(eq(allocationEntries.orderLineId, line.id), eq(allocationEntries.kind, 'sale')));
      // Scale the refund into pool terms: refund share of the line's price -> same share of its pool.
      const poolTotal = sale.reduce((n, s) => n + s.amountCents, 0);
      const refundPool = Math.round((custom / Math.max(1, line.lineSubtotalCents)) * poolTotal);
      const amounts = reverseProportional(sale, refundPool);
      for (const a of amounts) {
        values.push({
          orgId: args.orgId,
          orderId: args.orderId,
          orderLineId: line.id,
          beneficiaryId: a.beneficiaryId,
          kind: 'refund',
          amountCents: a.amountCents,
          basisPoolCents: -refundPool,
          ruleId: snap.ruleId,
          refundId: args.refundId,
          effectiveAt: args.effectiveAt,
        });
      }
    }
  }
  if (values.length) await tx.insert(allocationEntries).values(values);
}
