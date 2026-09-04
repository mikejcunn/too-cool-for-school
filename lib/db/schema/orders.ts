/* Checkout sessions, orders, order lines, payments, refunds, POS sessions.
 * Order lines snapshot price/COGS/MSRP and the allocation rule at time of sale. */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, timestamps } from './_shared';
import { users } from './auth';
import { preorderWindows, products, productVariants } from './catalog';
import { allocationBasisEnum, classrooms, customers, events, organizations } from './orgs';

export const checkoutSessionStatusEnum = pgEnum('checkout_session_status', [
  'open',
  'reserved',
  'paying',
  'completed',
  'expired',
  'abandoned',
]);
export const salesChannelEnum = pgEnum('sales_channel', ['online', 'pos']);
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'partially_refunded',
  'refunded',
  'cancelled',
]);
export const fulfillmentMethodEnum = pgEnum('fulfillment_method', ['classroom', 'pickup', 'in_person']);
export const fulfillmentStatusEnum = pgEnum('fulfillment_status', ['unfulfilled', 'partial', 'fulfilled']);
export const tenderTypeEnum = pgEnum('tender_type', ['card', 'cash', 'venmo', 'check']);
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'approved',
  'declined',
  'error',
  'unknown',
  'voided',
  'partially_refunded',
  'refunded',
]);
export const refundStatusEnum = pgEnum('refund_status', ['pending', 'approved', 'declined', 'error']);

export const posSessions = pgTable(
  'pos_sessions',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id),
    openedBy: uuid('opened_by')
      .notNull()
      .references(() => users.id),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    startingCashCents: integer('starting_cash_cents').notNull().default(0),
    endingCashCents: integer('ending_cash_cents'),
    notes: text('notes'),
  },
  (t) => [index('pos_sessions_org_opened_idx').on(t.orgId, t.openedAt)]
);

export const checkoutSessions = pgTable(
  'checkout_sessions',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    status: checkoutSessionStatusEnum('status').notNull().default('open'),
    channel: salesChannelEnum('channel').notNull().default('online'),
    posSessionId: uuid('pos_session_id').references(() => posSessions.id),
    customerName: text('customer_name'),
    customerEmail: text('customer_email'),
    customerPhone: text('customer_phone'),
    /** While set and in the future, this session holds `reserved` units. */
    reservedUntil: timestamp('reserved_until', { withTimezone: true }),
    /** Opaque token stored in the shopper's cookie. */
    cookieToken: text('cookie_token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('checkout_sessions_cookie_uq').on(t.cookieToken),
    index('checkout_sessions_org_status_idx').on(t.orgId, t.status, t.reservedUntil),
  ]
);

export const checkoutItems = pgTable(
  'checkout_items',
  {
    id: id(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    quantity: integer('quantity').notNull(),
    /** Price the shopper saw; only used to detect PRICE_CHANGED. */
    unitPriceCentsShown: integer('unit_price_cents_shown').notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('checkout_items_session_variant_uq').on(t.sessionId, t.variantId)]
);

export const orders = pgTable(
  'orders',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Human number, e.g. W-1042. */
    orderNumber: text('order_number').notNull(),
    status: orderStatusEnum('status').notNull().default('pending'),
    channel: salesChannelEnum('channel').notNull().default('online'),
    posSessionId: uuid('pos_session_id').references(() => posSessions.id),
    checkoutSessionId: uuid('checkout_session_id').references(() => checkoutSessions.id),
    customerId: uuid('customer_id').references(() => customers.id),
    customerName: text('customer_name'),
    customerEmail: text('customer_email'),
    customerPhone: text('customer_phone'),
    subtotalCents: integer('subtotal_cents').notNull(),
    taxCents: integer('tax_cents').notNull().default(0),
    feeCents: integer('fee_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    paidCents: integer('paid_cents').notNull().default(0),
    refundedCents: integer('refunded_cents').notNull().default(0),
    fulfillmentMethod: fulfillmentMethodEnum('fulfillment_method').notNull(),
    classroomId: uuid('classroom_id').references(() => classrooms.id),
    teacherName: text('teacher_name'),
    grade: text('grade'),
    studentName: text('student_name'),
    pickupEventId: uuid('pickup_event_id').references(() => events.id),
    fulfillmentStatus: fulfillmentStatusEnum('fulfillment_status').notNull().default('unfulfilled'),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    fulfilledBy: uuid('fulfilled_by').references(() => users.id),
    /** Lets a guest view their confirmation page. */
    publicToken: text('public_token').notNull(),
    notes: text('notes'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** Volunteer who placed a POS order. */
    placedBy: uuid('placed_by').references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('orders_org_number_uq').on(t.orgId, t.orderNumber),
    uniqueIndex('orders_public_token_uq').on(t.publicToken),
    index('orders_org_status_created_idx').on(t.orgId, t.status, t.createdAt),
    index('orders_org_fulfillment_idx').on(t.orgId, t.fulfillmentMethod, t.fulfillmentStatus),
    index('orders_org_classroom_idx').on(t.orgId, t.classroomId),
    index('orders_org_pickup_event_idx').on(t.orgId, t.pickupEventId),
    index('orders_org_email_idx').on(t.orgId, sql`lower(${t.customerEmail})`),
  ]
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    sku: text('sku').notNull(),
    productName: text('product_name').notNull(),
    variantLabel: text('variant_label').notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    unitCogsCents: integer('unit_cogs_cents').notNull(),
    unitMsrpCents: integer('unit_msrp_cents'),
    lineSubtotalCents: integer('line_subtotal_cents').notNull(),
    isPreorder: boolean('is_preorder').notNull().default(false),
    preorderWindowId: uuid('preorder_window_id').references(() => preorderWindows.id),
    allocationBasis: allocationBasisEnum('allocation_basis').notNull(),
    /** No FK: allocation rules can be edited/deleted; the snapshot is authoritative. */
    allocationRuleId: uuid('allocation_rule_id'),
    /** { basis, splits: [{ beneficiaryId, kind, percentBps?, fixedCentsPerUnit?, position }] } */
    allocationRuleSnapshot: jsonb('allocation_rule_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    fulfilledQuantity: integer('fulfilled_quantity').notNull().default(0),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    refundedQuantity: integer('refunded_quantity').notNull().default(0),
    refundedCents: integer('refunded_cents').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('order_lines_org_order_idx').on(t.orgId, t.orderId),
    index('order_lines_org_variant_idx').on(t.orgId, t.variantId),
    index('order_lines_org_preorder_idx')
      .on(t.orgId, t.preorderWindowId)
      .where(sql`${t.isPreorder} = true`),
  ]
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    tender: tenderTypeEnum('tender').notNull(),
    status: paymentStatusEnum('status').notNull().default('pending'),
    amountCents: integer('amount_cents').notNull(),
    feeCents: integer('fee_cents').notNull().default(0),
    runMid: text('run_mid'),
    runTransId: text('run_trans_id'),
    runAuthcode: text('run_authcode'),
    runResult: text('run_result'),
    runRespCode: text('run_resp_code'),
    runRespText: text('run_resp_text'),
    cardLast4: text('card_last4'),
    cardBrand: text('card_brand'),
    nameOnCard: text('name_on_card'),
    avsResp: text('avs_resp'),
    cvvResp: text('cvv_resp'),
    /** Check number, Venmo note, etc. */
    reference: text('reference'),
    receivedBy: uuid('received_by').references(() => users.id),
    /** One per client attempt; a retried request returns the stored outcome. */
    idempotencyKey: text('idempotency_key').notNull(),
    rawResponse: jsonb('raw_response'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('payments_idempotency_uq').on(t.idempotencyKey),
    uniqueIndex('payments_run_trans_uq')
      .on(t.runTransId)
      .where(sql`${t.runTransId} is not null`),
    uniqueIndex('payments_one_approved_per_order_uq')
      .on(t.orderId)
      .where(sql`${t.status} = 'approved'`),
    index('payments_org_order_idx').on(t.orgId, t.orderId),
    index('payments_org_tender_idx').on(t.orgId, t.tender, t.createdAt),
  ]
);

export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    amountCents: integer('amount_cents').notNull(),
    reason: text('reason'),
    restock: boolean('restock').notNull().default(true),
    status: refundStatusEnum('status').notNull().default('pending'),
    tender: tenderTypeEnum('tender').notNull(),
    runTransId: text('run_trans_id'),
    runRespCode: text('run_resp_code'),
    runRespText: text('run_resp_text'),
    createdBy: uuid('created_by').references(() => users.id),
    rawResponse: jsonb('raw_response'),
    ...timestamps(),
  },
  (t) => [index('refunds_org_order_idx').on(t.orgId, t.orderId)]
);

export const refundLines = pgTable(
  'refund_lines',
  {
    id: id(),
    refundId: uuid('refund_id')
      .notNull()
      .references(() => refunds.id, { onDelete: 'cascade' }),
    orderLineId: uuid('order_line_id')
      .notNull()
      .references(() => orderLines.id),
    quantity: integer('quantity').notNull(),
    amountCents: integer('amount_cents').notNull(),
  },
  (t) => [index('refund_lines_order_line_idx').on(t.orderLineId)]
);
