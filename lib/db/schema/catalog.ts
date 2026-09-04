/* Catalog: pre-order windows, products, images, variants.
 * Every product has >= 1 variant (a default one when has_variants=false) so
 * inventory, order lines and allocations always key on variant_id. */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './orgs';

export const productStatusEnum = pgEnum('product_status', ['draft', 'active', 'archived']);
export const saleModeEnum = pgEnum('sale_mode', ['stock', 'preorder']);
export const preorderWindowStatusEnum = pgEnum('preorder_window_status', [
  'draft',
  'open',
  'closed',
  'ordered',
  'received',
  'fulfilled',
  'cancelled',
]);

export const preorderWindows = pgTable(
  'preorder_windows',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
    closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
    status: preorderWindowStatusEnum('status').notNull().default('draft'),
    expectedDeliveryOn: date('expected_delivery_on'),
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => [index('preorder_windows_org_status_idx').on(t.orgId, t.status)]
);

export const products = pgTable(
  'products',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category'),
    status: productStatusEnum('status').notNull().default('draft'),
    /** Cost of goods per unit, cents. */
    cogsCents: integer('cogs_cents').notNull().default(0),
    /** Manufacturer suggested retail, cents (display / "compare at"). */
    msrpCents: integer('msrp_cents'),
    /** Selling price per unit, cents. */
    priceCents: integer('price_cents').notNull(),
    saleMode: saleModeEnum('sale_mode').notNull().default('stock'),
    preorderWindowId: uuid('preorder_window_id').references(() => preorderWindows.id),
    hasVariants: boolean('has_variants').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('products_org_slug_uq').on(t.orgId, t.slug),
    index('products_org_status_idx').on(t.orgId, t.status),
    check('products_money_nonneg', sql`${t.priceCents} >= 0 and ${t.cogsCents} >= 0`),
  ]
);

export const productImages = pgTable(
  'product_images',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    alt: text('alt'),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('product_images_product_idx').on(t.productId, t.position)]
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    size: text('size'),
    color: text('color'),
    /** Display label, e.g. "Youth M / Navy". */
    label: text('label').notNull(),
    priceCentsOverride: integer('price_cents_override'),
    cogsCentsOverride: integer('cogs_cents_override'),
    msrpCentsOverride: integer('msrp_cents_override'),
    /** Physical units in the bin. Only changed via lib/inventory/*. */
    onHand: integer('on_hand').notNull().default(0),
    /** Units held by open checkout sessions. available = on_hand - reserved. */
    reserved: integer('reserved').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(0),
    active: boolean('active').notNull().default(true),
    position: integer('position').notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('product_variants_org_sku_uq').on(t.orgId, t.sku),
    uniqueIndex('product_variants_product_size_color_uq').on(
      t.productId,
      sql`coalesce(${t.size}, '')`,
      sql`coalesce(${t.color}, '')`
    ),
    index('product_variants_product_idx').on(t.productId),
    check('product_variants_on_hand_nonneg', sql`${t.onHand} >= 0`),
    check('product_variants_reserved_nonneg', sql`${t.reserved} >= 0`),
    check('product_variants_reserved_lte_on_hand', sql`${t.reserved} <= ${t.onHand}`),
  ]
);
