import { and, eq, sql } from 'drizzle-orm';
import { inventoryMovements, productVariants } from '@/lib/db/schema';
import type { InventoryTx, MovementRef, StockResult } from './types';

/** Give back a reservation (session expired, abandoned, or order cancelled). */
export async function releaseStock(
  tx: InventoryTx,
  args: { orgId: string; variantId: string; quantity: number } & MovementRef
): Promise<StockResult | null> {
  const { orgId, variantId, quantity } = args;
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new Error('releaseStock: quantity must be a positive integer');

  const rows = await tx
    .update(productVariants)
    .set({ reserved: sql`${productVariants.reserved} - ${quantity}` })
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.orgId, orgId),
        sql`${productVariants.reserved} >= ${quantity}`
      )
    )
    .returning({ onHand: productVariants.onHand, reserved: productVariants.reserved });
  if (rows.length === 0) return null;

  const [row] = rows;
  await tx.insert(inventoryMovements).values({
    orgId,
    variantId,
    type: 'release',
    quantity: -quantity,
    onHandAfter: row.onHand,
    reservedAfter: row.reserved,
    referenceType: args.referenceType ?? 'checkout_session',
    referenceId: args.referenceId ?? null,
    note: args.note ?? null,
    createdBy: args.createdBy ?? null,
  });
  return { ok: true, ...row };
}
