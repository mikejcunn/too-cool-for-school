/* Beneficiary allocation rules and the per-order-line entries they produce.
 * A rule with product_id NULL is the org default. Entries are written when an
 * order becomes paid and never recomputed when rules change later. */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, timestamps } from './_shared';
import { products } from './catalog';
import { orderLines, orders, refunds } from './orders';
import { allocationBasisEnum, beneficiaries, organizations } from './orgs';

export const splitKindEnum = pgEnum('allocation_split_kind', ['percent', 'fixed']);
export const allocationEntryKindEnum = pgEnum('allocation_entry_kind', ['sale', 'refund']);

export const allocationRules = pgTable(
  'allocation_rules',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** NULL = org-wide default rule. */
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
    /** NULL = inherit organizations.allocation_basis. */
    basis: allocationBasisEnum('basis'),
    active: boolean('active').notNull().default(true),
    name: text('name'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('allocation_rules_org_default_uq')
      .on(t.orgId)
      .where(sql`${t.productId} is null and ${t.active} = true`),
    uniqueIndex('allocation_rules_org_product_uq')
      .on(t.orgId, t.productId)
      .where(sql`${t.productId} is not null and ${t.active} = true`),
  ]
);

export const allocationRuleSplits = pgTable(
  'allocation_rule_splits',
  {
    id: id(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => allocationRules.id, { onDelete: 'cascade' }),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaries.id),
    kind: splitKindEnum('kind').notNull().default('percent'),
    /** Basis points of the (remaining) pool, 0..10000. Percent splits must sum to 10000. */
    percentBps: integer('percent_bps'),
    /** Fixed cents per unit sold, taken before percent splits. */
    fixedCentsPerUnit: integer('fixed_cents_per_unit'),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('allocation_rule_splits_rule_idx').on(t.ruleId),
    check(
      'allocation_rule_splits_kind_value',
      sql`(${t.kind} = 'percent' and ${t.percentBps} is not null and ${t.percentBps} between 0 and 10000) or (${t.kind} = 'fixed' and ${t.fixedCentsPerUnit} is not null and ${t.fixedCentsPerUnit} >= 0)`
    ),
  ]
);

export const allocationEntries = pgTable(
  'allocation_entries',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    orderLineId: uuid('order_line_id')
      .notNull()
      .references(() => orderLines.id, { onDelete: 'cascade' }),
    beneficiaryId: uuid('beneficiary_id')
      .notNull()
      .references(() => beneficiaries.id),
    kind: allocationEntryKindEnum('kind').notNull(),
    /** Negative for refunds. */
    amountCents: integer('amount_cents').notNull(),
    basisPoolCents: integer('basis_pool_cents').notNull(),
    ruleId: uuid('rule_id'),
    refundId: uuid('refund_id').references(() => refunds.id),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('allocation_entries_org_beneficiary_idx').on(t.orgId, t.beneficiaryId, t.effectiveAt),
    index('allocation_entries_order_line_idx').on(t.orderLineId),
    index('allocation_entries_org_effective_idx').on(t.orgId, t.effectiveAt),
  ]
);
