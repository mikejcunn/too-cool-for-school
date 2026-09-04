import { eq, sql } from 'drizzle-orm';
import { inventoryMovements, productVariants } from '@/lib/db/schema';
import type { InventoryTx } from './types';

export interface ReconcileRow {
  variantId: string;
  sku: string;
  onHand: number;
  ledgerOnHand: number;
  reserved: number;
  ledgerReserved: number;
  ok: boolean;
}

/**
 * Proves counters == ledger for every variant in the org (admin "verify" button + tests).
 * on_hand  = sum of receive/sale/return/adjust/preorder_fill quantities.
 * reserved = sum of reserve/release quantities PLUS sale quantities, because commitStock
 *            moves units out of `reserved` and writes a single `sale` row (negative).
 */
export async function reconcileInventory(tx: InventoryTx, orgId: string): Promise<ReconcileRow[]> {
  const rows = await tx
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      onHand: productVariants.onHand,
      reserved: productVariants.reserved,
      ledgerOnHand: sql<number>`coalesce(sum(case when ${inventoryMovements.type} in ('receive','sale','return','adjust','preorder_fill') then ${inventoryMovements.quantity} else 0 end), 0)::int`,
      ledgerReserved: sql<number>`coalesce(sum(case when ${inventoryMovements.type} in ('reserve','release','sale') then ${inventoryMovements.quantity} else 0 end), 0)::int`,
    })
    .from(productVariants)
    .leftJoin(inventoryMovements, eq(inventoryMovements.variantId, productVariants.id))
    .where(eq(productVariants.orgId, orgId))
    .groupBy(productVariants.id);

  return rows.map((r) => ({ ...r, ok: r.onHand === r.ledgerOnHand && r.reserved === r.ledgerReserved }));
}
