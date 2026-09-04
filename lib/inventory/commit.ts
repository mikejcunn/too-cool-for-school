import { and, eq, sql } from 'drizzle-orm';
import { inventoryMovements, productVariants } from '@/lib/db/schema';
import type { InventoryTx, MovementRef, StockResult } from './types';

/** Convert a reservation into a sale once the order is paid. */
export async function commitStock(
  tx: InventoryTx,
  args: { orgId: string; variantId: string; quantity: number } & MovementRef
): Promise<StockResult> {
  const { orgId, variantId, quantity } = args;
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new Error('commitStock: quantity must be a positive integer');

  const rows = await tx
    .update(productVariants)
    .set({
      onHand: sql`${productVariants.onHand} - ${quantity}`,
      reserved: sql`${productVariants.reserved} - ${quantity}`,
    })
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.orgId, orgId),
        sql`${productVariants.reserved} >= ${quantity}`
      )
    )
    .returning({ onHand: productVariants.onHand, reserved: productVariants.reserved });
  if (rows.length === 0) {
    throw new Error(`commitStock: reservation missing for variant ${variantId} (qty ${quantity})`);
  }

  const [row] = rows;
  await tx.insert(inventoryMovements).values({
    orgId,
    variantId,
    type: 'sale',
    quantity: -quantity,
    onHandAfter: row.onHand,
    reservedAfter: row.reserved,
    referenceType: args.referenceType ?? 'order',
    referenceId: args.referenceId ?? null,
    note: args.note ?? null,
    createdBy: args.createdBy ?? null,
  });
  return { ok: true, ...row };
}
