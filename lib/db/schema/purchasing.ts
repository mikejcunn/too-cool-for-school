/* Vendor purchase orders (typically generated from a closed pre-order window). */
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { users } from './auth';
import { preorderWindows, productVariants } from './catalog';
import { organizations } from './orgs';

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  'draft',
  'submitted',
  'partially_received',
  'received',
  'cancelled',
]);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    preorderWindowId: uuid('preorder_window_id').references(() => preorderWindows.id),
    vendorName: text('vendor_name').notNull(),
    vendorContact: text('vendor_contact'),
    status: purchaseOrderStatusEnum('status').notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    shippingCents: integer('shipping_cents').notNull().default(0),
    totalCostCents: integer('total_cost_cents').notNull().default(0),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    ...timestamps(),
  },
  (t) => [index('purchase_orders_org_status_idx').on(t.orgId, t.status)]
);

export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: id(),
    poId: uuid('po_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    quantityOrdered: integer('quantity_ordered').notNull(),
    quantityReceived: integer('quantity_received').notNull().default(0),
    unitCostCents: integer('unit_cost_cents').notNull().default(0),
  },
  (t) => [uniqueIndex('purchase_order_lines_po_variant_uq').on(t.poId, t.variantId)]
);
