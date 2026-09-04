/* Tenancy and people: organizations (tenants), memberships, customers,
 * classrooms, beneficiaries, events. Every tenant row carries org_id. */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, createdAt } from './_shared';
import { users } from './auth';

export const allocationBasisEnum = pgEnum('allocation_basis', ['margin', 'gross']);
export const orgStatusEnum = pgEnum('org_status', ['active', 'suspended']);
export const membershipRoleEnum = pgEnum('membership_role', ['admin', 'volunteer', 'viewer']);
export const eventKindEnum = pgEnum('event_kind', ['pickup', 'sale', 'both']);

export const organizations = pgTable('organizations', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  shortName: text('short_name'),
  timezone: text('timezone').notNull().default('America/New_York'),
  brandColor: text('brand_color'),
  logoUrl: text('logo_url'),
  contactEmail: text('contact_email'),
  /** Run Payments credit-card MID this org charges against. */
  runMid: text('run_mid'),
  /** Runner.js public key (may be platform-wide with per-mid routing). */
  runPublicKey: text('run_public_key'),
  runGateway: text('run_gateway').notNull().default('cardpointe'),
  /** Default pool for beneficiary allocation: margin (price - cogs) or gross (price). */
  allocationBasis: allocationBasisEnum('allocation_basis').notNull().default('margin'),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  orderPrefix: text('order_prefix').notNull().default('W'),
  nextOrderNumber: integer('next_order_number').notNull().default(1000),
  status: orgStatusEnum('status').notNull().default('active'),
  settings: jsonb('settings')
    .notNull()
    .default(sql`'{}'::jsonb`),
  ...timestamps(),
});

export const memberships = pgTable(
  'memberships',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull().default('volunteer'),
    invitedBy: uuid('invited_by').references(() => users.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index('memberships_user_idx').on(t.userId)]
);

export const customers = pgTable(
  'customers',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    phone: text('phone'),
    name: text('name'),
    userId: uuid('user_id').references(() => users.id),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex('customers_org_email_uq').on(t.orgId, sql`lower(${t.email})`)]
);

export const classrooms = pgTable(
  'classrooms',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    teacherName: text('teacher_name').notNull(),
    grade: text('grade'),
    room: text('room'),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('classrooms_org_active_idx').on(t.orgId, t.active)]
);

export const beneficiaries = pgTable(
  'beneficiaries',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex('beneficiaries_org_slug_uq').on(t.orgId, t.slug)]
);

export const events = pgTable(
  'events',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    location: text('location'),
    kind: eventKindEnum('kind').notNull().default('both'),
    active: boolean('active').notNull().default(true),
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => [index('events_org_starts_idx').on(t.orgId, t.startsAt)]
);
