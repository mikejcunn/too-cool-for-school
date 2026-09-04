import { and, eq, sql } from 'drizzle-orm';
import { inventoryMovements, productVariants } from '@/lib/db/schema';
import type { InventoryTx, MovementRef, StockResult } from './types';

/**
 * Manual correction (count, shrink, damage). Signed delta to on_hand; refuses to go
 * below zero or below the currently reserved quantity.
 */
export async function adjustStock(
  tx: InventoryTx,
  args: { orgId: string; variantId: string; delta: number } & MovementRef
): Promise<StockResult | { ok: false; reason: 'insufficient' }> {
  const { orgId, variantId, delta } = args;
  if (!Number.isInteger(delta) || delta === 0)
    throw new Error('adjustStock: delta must be a non-zero integer');

  const rows = await tx
    .update(productVariants)
    .set({ onHand: sql`${productVariants.onHand} + ${delta}` })
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.orgId, orgId),
        sql`${productVariants.onHand} + ${delta} >= ${productVariants.reserved}`
      )
    )
    .returning({ onHand: productVariants.onHand, reserved: productVariants.reserved });
  if (rows.length === 0) return { ok: false, reason: 'insufficient' };

  const [row] = rows;
  await tx.insert(inventoryMovements).values({
    orgId,
    variantId,
    type: 'adjust',
    quantity: delta,
    onHandAfter: row.onHand,
    reservedAfter: row.reserved,
    referenceType: args.referenceType ?? 'manual',
    referenceId: args.referenceId ?? null,
    note: args.note ?? null,
    createdBy: args.createdBy ?? null,
  });
  return { ok: true, ...row };
}
