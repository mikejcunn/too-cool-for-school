/* Operational tables: audit log, inbound webhook dedupe, outbound notifications. */
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from './_shared';
import { users } from './auth';
import { orders } from './orders';
import { organizations } from './orgs';

export const actorTypeEnum = pgEnum('actor_type', ['user', 'shopper', 'system']);
export const notificationTypeEnum = pgEnum('notification_type', [
  'receipt',
  'refund',
  'preorder_update',
  'magic_link',
]);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    actorType: actorTypeEnum('actor_type').notNull().default('user'),
    /** e.g. order.refund, product.update */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_org_created_idx').on(t.orgId, t.createdAt),
    index('audit_log_entity_idx').on(t.entityType, t.entityId),
  ]
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    provider: text('provider').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    eventType: text('event_type'),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('webhook_events_provider_key_uq').on(t.provider, t.idempotencyKey)]
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    type: notificationTypeEnum('type').notNull(),
    toEmail: text('to_email').notNull(),
    providerMessageId: text('provider_message_id'),
    status: text('status').notNull().default('sent'),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_order_idx').on(t.orderId)]
);
