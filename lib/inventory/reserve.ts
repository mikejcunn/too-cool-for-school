import { and, eq, sql } from 'drizzle-orm';
import { inventoryMovements, productVariants } from '@/lib/db/schema';
import type { InventoryTx, MovementRef, OutOfStock, StockResult } from './types';

/**
 * Hold `quantity` units for a checkout session. Single conditional UPDATE: succeeds
 * only if on_hand - reserved >= quantity at the moment the row lock is taken (ADR-0002).
 */
export async function reserveStock(
  tx: InventoryTx,
  args: { orgId: string; variantId: string; quantity: number } & MovementRef
): Promise<StockResult | OutOfStock> {
  const { orgId, variantId, quantity } = args;
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new Error('reserveStock: quantity must be a positive integer');

  const rows = await tx
    .update(productVariants)
    .set({ reserved: sql`${productVariants.reserved} + ${quantity}` })
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.orgId, orgId),
        sql`${productVariants.onHand} - ${productVariants.reserved} >= ${quantity}`
      )
    )
    .returning({ onHand: productVariants.onHand, reserved: productVariants.reserved });

  if (rows.length === 0) {
    const [v] = await tx
      .select({ onHand: productVariants.onHand, reserved: productVariants.reserved })
      .from(productVariants)
      .where(and(eq(productVariants.id, variantId), eq(productVariants.orgId, orgId)));
    return { ok: false, available: v ? Math.max(0, v.onHand - v.reserved) : 0 };
  }

  const [row] = rows;
  await tx.insert(inventoryMovements).values({
    orgId,
    variantId,
    type: 'reserve',
    quantity,
    onHandAfter: row.onHand,
    reservedAfter: row.reserved,
    referenceType: args.referenceType ?? 'checkout_session',
    referenceId: args.referenceId ?? null,
    note: args.note ?? null,
    createdBy: args.createdBy ?? null,
  });
  return { ok: true, ...row };
}
