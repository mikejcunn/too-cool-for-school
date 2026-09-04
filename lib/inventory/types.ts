import type { Tx } from '@/lib/db';

export type InventoryTx = Tx;

export type ReferenceType = 'order' | 'checkout_session' | 'purchase_order' | 'refund' | 'manual';

export interface MovementRef {
  referenceType?: ReferenceType;
  referenceId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

export interface StockResult {
  ok: true;
  onHand: number;
  reserved: number;
}

export interface OutOfStock {
  ok: false;
  available: number;
}
