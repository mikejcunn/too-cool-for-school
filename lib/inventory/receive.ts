import { and, eq, sql } from 'drizzle-orm';
import { inventoryMovements, productVariants } from '@/lib/db/schema';
import type { InventoryTx, MovementRef, StockResult } from './types';

/** Add units to on_hand (stock delivery, PO receipt, or a refund restock via type='return'). */
export async function receiveStock(
  tx: InventoryTx,
  args: {
    orgId: string;
    variantId: string;
    quantity: number;
    type?: 'receive' | 'return' | 'preorder_fill';
  } & MovementRef
): Promise<StockResult> {
  const { orgId, variantId, quantity } = args;
  const type = args.type ?? 'receive';
  if (!Number.isInteger(quantity) || quantity === 0)
    throw new Error('receiveStock: quantity must be a non-zero integer');
  if (type !== 'preorder_fill' && quantity < 0) throw new Error('receiveStock: quantity must be positive');

  const rows = await tx
    .update(productVariants)
    .set({ onHand: sql`${productVariants.onHand} + ${quantity}` })
    .where(and(eq(productVariants.id, variantId), eq(productVariants.orgId, orgId)))
    .returning({ onHand: productVariants.onHand, reserved: productVariants.reserved });
  if (rows.length === 0) throw new Error(`receiveStock: variant ${variantId} not found in org`);

  const [row] = rows;
  await tx.insert(inventoryMovements).values({
    orgId,
    variantId,
    type,
    quantity,
    onHandAfter: row.onHand,
    reservedAfter: row.reserved,
    referenceType: args.referenceType ?? 'manual',
    referenceId: args.referenceId ?? null,
    note: args.note ?? null,
    createdBy: args.createdBy ?? null,
  });
  return { ok: true, ...row };
}
