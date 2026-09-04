/* Inventory ledger. product_variants.on_hand / reserved are the denormalized
 * truth used for oversell prevention; every change writes a movement here. */
import { index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from './_shared';
import { users } from './auth';
import { productVariants } from './catalog';
import { organizations } from './orgs';

export const movementTypeEnum = pgEnum('inventory_movement_type', [
  'receive',
  'sale',
  'return',
  'adjust',
  'reserve',
  'release',
  'preorder_fill',
]);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    type: movementTypeEnum('type').notNull(),
    /** Signed delta. For reserve/release it applies to `reserved`; otherwise to `on_hand`. */
    quantity: integer('quantity').notNull(),
    onHandAfter: integer('on_hand_after').notNull(),
    reservedAfter: integer('reserved_after').notNull(),
    /** order | checkout_session | purchase_order | refund | manual */
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('inventory_movements_org_variant_idx').on(t.orgId, t.variantId, t.createdAt),
    index('inventory_movements_reference_idx').on(t.referenceType, t.referenceId),
  ]
);
