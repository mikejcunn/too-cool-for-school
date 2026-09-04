/* Online checkout: reserve -> charge -> settle (plan §Order & payment flows).
 * Tx A reserves stock and snapshots the order; the charge runs outside any DB
 * transaction; Tx B settles. Only result 'A' + trans_id is an approval. */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db, type Tx } from '@/lib/db';
import {
  checkoutItems,
  checkoutSessions,
  classrooms,
  customers,
  events,
  orderLines,
  orders,
  organizations,
  payments,
  preorderWindows,
  productVariants,
  products,
} from '@/lib/db/schema';
import { audit } from '@/lib/audit';
import { snapshotRuleForProduct } from '@/lib/allocation/rules';
import { writeSaleAllocations } from '@/lib/allocation/entries';
import type { RuleSnapshot } from '@/lib/allocation/types';
import { commitStock, reserveStock } from '@/lib/inventory';
import { resolveMoney } from '@/lib/pricing/resolve-price';
import { computeTotals } from '@/lib/pricing/totals';
import { verifyRecaptchaToken } from '@/lib/recaptcha';
import { charge, RunApiError } from '@/lib/run-api';
import { toRunAmount } from '@/lib/run-api/amount';
import { isApproved, type ChargeResponse } from '@/types/run';
import { releaseExpiredReservations } from './release-expired';
import { nextOrderNumber } from './order-number';
import { placeOrderInputSchema, type PlaceOrderInput, type PlaceOrderResult } from './schemas';

const ONLINE_RESERVATION_MS = 15 * 60_000;
const RETRY_EXTENSION_MS = 10 * 60_000;
const SETTLE_RETRIES = 3;

type Org = typeof organizations.$inferSelect;

export const DECLINE_MESSAGE = 'Your card was not approved. Check the details or try a different card.';
export const UNCERTAIN_MESSAGE =
  "We couldn't confirm your payment yet. Please do not retry; we'll email you once it's confirmed or you can contact us.";

export async function placeOrder(
  org: Org,
  sessionCookieToken: string | undefined,
  raw: unknown
): Promise<PlaceOrderResult> {
  const parsed = placeOrderInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID',
      message: parsed.error.issues[0]?.message ?? 'Check the form.',
      details: { issues: parsed.error.flatten() },
    };
  }
  const input = parsed.data;
  if (!org.runMid)
    return { ok: false, code: 'NOT_CONFIGURED', message: 'This store is not set up to take payments yet.' };
  if (!sessionCookieToken) return { ok: false, code: 'EMPTY_CART', message: 'Your cart is empty.' };

  // reCAPTCHA (fails open only in non-production without a secret; see lib/recaptcha.ts)
  const captcha = await verifyRecaptchaToken(input.recaptchaToken ?? '', 'checkout_submit', 0.5);
  if (!captcha.success)
    return {
      ok: false,
      code: 'RECAPTCHA_FAILED',
      message: 'We could not verify you are human. Refresh and try again.',
    };

  // Idempotency: a retried click returns the stored outcome.
  const prior = await db.select().from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey));
  if (prior.length) return outcomeFromPayment(prior[0]);

  // ── Tx A: reserve + snapshot ───────────────────────────────────────────────
  let staged: Staged;
  try {
    staged = await db.transaction((tx) => stageOrder(tx, org, sessionCookieToken, input));
  } catch (e) {
    if (e instanceof StageError) return e.result;
    if (isUniqueViolation(e)) {
      const again = await db.select().from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey));
      if (again.length) return outcomeFromPayment(again[0]);
    }
    console.error('[placeOrder] stage failed', e);
    return {
      ok: false,
      code: 'ERROR',
      message: 'Something went wrong before charging your card. Nothing was charged.',
    };
  }

  // ── Charge (outside any DB transaction) ────────────────────────────────────
  let response: ChargeResponse | null = null;
  let chargeError: unknown = null;
  try {
    response = await charge({
      mid: org.runMid,
      amount: toRunAmount(staged.totalCents),
      account_token: input.accountToken,
      expiration: input.expiration,
      capture: 'Y',
      currency: 'USD',
      com_ind: 'E',
      order_id: staged.orderNumber,
      name: input.nameOnCard || input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
      account_zip: input.billingZip,
      custom_01: org.slug,
      custom_02: staged.orderId,
    });
  } catch (e) {
    chargeError = e;
  }

  // ── Tx B: settle ───────────────────────────────────────────────────────────
  for (let attempt = 1; attempt <= SETTLE_RETRIES; attempt++) {
    try {
      return await db.transaction((tx) => settle(tx, org, staged, response, chargeError));
    } catch (e) {
      console.error(`[placeOrder] settle attempt ${attempt} failed for payment ${staged.paymentId}`, e);
      if (attempt === SETTLE_RETRIES) {
        // Approved charge with an unsettled order: persist what we know so a cron/admin can finish.
        if (response && isApproved(response)) {
          console.error(
            `[placeOrder] CRITICAL approved charge ${response.trans_id} unsettled; payment ${staged.paymentId}`
          );
          await db
            .update(payments)
            .set({
              rawResponse: response,
              runTransId: response.trans_id,
              runResult: response.result,
              status: 'unknown',
            })
            .where(eq(payments.id, staged.paymentId))
            .catch(() => undefined);
          return { ok: false, code: 'PAYMENT_UNCERTAIN', message: UNCERTAIN_MESSAGE };
        }
        return {
          ok: false,
          code: 'ERROR',
          message: 'Something went wrong. If your card was charged, we will contact you.',
        };
      }
    }
  }
  return { ok: false, code: 'ERROR', message: 'Something went wrong.' };
}

// ─────────────────────────────────────────────────────────────────────────────

interface StagedLine {
  variantId: string;
  quantity: number;
  isPreorder: boolean;
}

interface Staged {
  orderId: string;
  orderNumber: string;
  publicToken: string;
  paymentId: string;
  sessionId: string;
  totalCents: number;
  lines: StagedLine[];
  customer: { name: string; email: string; phone: string };
}

class StageError extends Error {
  constructor(public readonly result: PlaceOrderResult) {
    super(result.ok ? 'ok' : result.code);
  }
}

async function stageOrder(tx: Tx, org: Org, cookieToken: string, input: PlaceOrderInput): Promise<Staged> {
  await releaseExpiredReservations(tx, org.id);

  const [session] = await tx
    .select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.cookieToken, cookieToken), eq(checkoutSessions.orgId, org.id)))
    .for('update');
  if (
    !session ||
    session.status === 'completed' ||
    session.status === 'expired' ||
    session.status === 'abandoned'
  ) {
    throw new StageError({ ok: false, code: 'EMPTY_CART', message: 'Your cart is empty.' });
  }
  if (session.status === 'paying') {
    throw new StageError({
      ok: false,
      code: 'PAYMENT_UNCERTAIN',
      message: 'A payment for this cart is already in progress.',
    });
  }

  const items = await tx
    .select({ item: checkoutItems, variant: productVariants, product: products })
    .from(checkoutItems)
    .innerJoin(productVariants, eq(productVariants.id, checkoutItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(checkoutItems.sessionId, session.id), eq(productVariants.orgId, org.id)))
    .orderBy(productVariants.id); // ascending variant_id: deadlock-free multi-line reserve
  if (items.length === 0)
    throw new StageError({ ok: false, code: 'EMPTY_CART', message: 'Your cart is empty.' });

  // Validate availability / pre-order windows / price drift.
  const windowIds = [
    ...new Set(items.map((i) => i.product.preorderWindowId).filter((x): x is string => !!x)),
  ];
  const windows = windowIds.length
    ? await tx.select().from(preorderWindows).where(inArray(preorderWindows.id, windowIds))
    : [];
  const now = new Date();
  let priceChanged = false;
  for (const { item, variant, product } of items) {
    if (product.status !== 'active' || !variant.active) {
      throw new StageError({
        ok: false,
        code: 'UNAVAILABLE',
        message: `${product.name} is no longer available. Remove it to continue.`,
      });
    }
    const money = resolveMoney(product, variant);
    if (money.unitPriceCents !== item.unitPriceCentsShown) {
      priceChanged = true;
      await tx
        .update(checkoutItems)
        .set({ unitPriceCentsShown: money.unitPriceCents })
        .where(eq(checkoutItems.id, item.id));
    }
    if (product.saleMode === 'preorder') {
      const w = windows.find((x) => x.id === product.preorderWindowId);
      if (!w || w.status !== 'open' || now < w.opensAt || now > w.closesAt) {
        throw new StageError({
          ok: false,
          code: 'PREORDER_CLOSED',
          message: `Pre-orders for ${product.name} are closed.`,
        });
      }
    }
  }
  if (priceChanged) {
    throw new StageError({
      ok: false,
      code: 'PRICE_CHANGED',
      message: 'Some prices changed while you were shopping. Review your cart and try again.',
    });
  }

  // Fulfillment details.
  let classroomId: string | null = null;
  let teacherName: string | null = null;
  let grade: string | null = null;
  let pickupEventId: string | null = null;
  if (input.fulfillmentMethod === 'classroom') {
    const [c] = await tx
      .select()
      .from(classrooms)
      .where(
        and(eq(classrooms.id, input.classroomId), eq(classrooms.orgId, org.id), eq(classrooms.active, true))
      );
    if (!c)
      throw new StageError({ ok: false, code: 'INVALID', message: 'Pick a teacher for classroom delivery.' });
    classroomId = c.id;
    teacherName = c.teacherName;
    grade = c.grade;
  } else {
    const [ev] = await tx
      .select()
      .from(events)
      .where(and(eq(events.id, input.pickupEventId), eq(events.orgId, org.id), eq(events.active, true)));
    if (!ev || ev.kind === 'sale')
      throw new StageError({ ok: false, code: 'INVALID', message: 'Pick a pickup event.' });
    pickupEventId = ev.id;
  }

  // Reserve stock lines (pre-order lines never touch counters).
  for (const { item, variant, product } of items) {
    if (product.saleMode === 'preorder') continue;
    const r = await reserveStock(tx, {
      orgId: org.id,
      variantId: variant.id,
      quantity: item.quantity,
      referenceType: 'checkout_session',
      referenceId: session.id,
    });
    if (!r.ok) {
      throw new StageError({
        ok: false,
        code: 'OUT_OF_STOCK',
        message:
          r.available > 0
            ? `Only ${r.available} left of ${product.name} (${variant.label}).`
            : `${product.name} (${variant.label}) just sold out.`,
        details: { variantId: variant.id, available: r.available },
      });
    }
  }

  // Money + order.
  const moneyLines = items.map(({ item, variant, product }) => ({
    ...resolveMoney(product, variant),
    quantity: item.quantity,
  }));
  const totals = computeTotals(moneyLines, org.taxRateBps);
  if (totals.totalCents <= 0)
    throw new StageError({ ok: false, code: 'INVALID', message: 'Order total must be greater than zero.' });

  const orderNumber = await nextOrderNumber(tx, org.id);
  const publicToken = randomBytes(18).toString('base64url');
  const [order] = await tx
    .insert(orders)
    .values({
      orgId: org.id,
      orderNumber,
      status: 'pending',
      channel: 'online',
      checkoutSessionId: session.id,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      feeCents: totals.feeCents,
      totalCents: totals.totalCents,
      fulfillmentMethod: input.fulfillmentMethod,
      classroomId,
      teacherName,
      grade,
      studentName: input.studentName || null,
      pickupEventId,
      publicToken,
      notes: input.notes || null,
    })
    .returning({ id: orders.id });

  const ruleCache = new Map<string, RuleSnapshot>();
  const lineValues: (typeof orderLines.$inferInsert)[] = [];
  for (const { item, variant, product } of items) {
    const money = resolveMoney(product, variant);
    const snap = await snapshotRuleForProduct(tx, org.id, product.id, org.allocationBasis, ruleCache);
    lineValues.push({
      orgId: org.id,
      orderId: order.id,
      variantId: variant.id,
      productId: product.id,
      sku: variant.sku,
      productName: product.name,
      variantLabel: variant.label,
      quantity: item.quantity,
      unitPriceCents: money.unitPriceCents,
      unitCogsCents: money.unitCogsCents,
      unitMsrpCents: money.unitMsrpCents,
      lineSubtotalCents: money.unitPriceCents * item.quantity,
      isPreorder: product.saleMode === 'preorder',
      preorderWindowId: product.saleMode === 'preorder' ? product.preorderWindowId : null,
      allocationBasis: snap.basis,
      allocationRuleId: snap.ruleId,
      allocationRuleSnapshot: snap,
    });
  }
  await tx.insert(orderLines).values(lineValues);

  const [payment] = await tx
    .insert(payments)
    .values({
      orgId: org.id,
      orderId: order.id,
      tender: 'card',
      status: 'pending',
      amountCents: totals.totalCents,
      runMid: org.runMid,
      nameOnCard: input.nameOnCard || null,
      idempotencyKey: input.idempotencyKey,
    })
    .returning({ id: payments.id });

  await tx
    .update(checkoutSessions)
    .set({
      status: 'paying',
      reservedUntil: new Date(Date.now() + ONLINE_RESERVATION_MS),
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
    })
    .where(eq(checkoutSessions.id, session.id));

  return {
    orderId: order.id,
    orderNumber,
    publicToken,
    paymentId: payment.id,
    sessionId: session.id,
    totalCents: totals.totalCents,
    lines: items.map(({ item, variant, product }) => ({
      variantId: variant.id,
      quantity: item.quantity,
      isPreorder: product.saleMode === 'preorder',
    })),
    customer: { name: input.customerName, email: input.customerEmail, phone: input.customerPhone },
  };
}

async function settle(
  tx: Tx,
  org: Org,
  staged: Staged,
  response: ChargeResponse | null,
  chargeError: unknown
): Promise<PlaceOrderResult> {
  const [payment] = await tx.select().from(payments).where(eq(payments.id, staged.paymentId)).for('update');
  if (!payment) throw new Error('settle: payment row missing');
  if (payment.status !== 'pending') return outcomeFromPayment(payment); // already settled (retry)

  if (response && isApproved(response)) {
    const paidAt = new Date();
    await tx
      .update(payments)
      .set({
        status: 'approved',
        runTransId: response.trans_id,
        runAuthcode: response.authcode ?? null,
        runResult: response.result,
        runRespCode: response.resp_code,
        runRespText: response.resp_text,
        cardLast4: last4(response.card_number),
        cardBrand: response.card_type ?? response.card_brand ?? null,
        avsResp: response.avs_resp ?? null,
        cvvResp: response.cvv_resp ?? null,
        rawResponse: response,
        approvedAt: paidAt,
      })
      .where(eq(payments.id, payment.id));

    await tx
      .update(orders)
      .set({ status: 'paid', paidAt, paidCents: staged.totalCents })
      .where(eq(orders.id, staged.orderId));

    for (const line of staged.lines) {
      if (line.isPreorder) continue;
      await commitStock(tx, {
        orgId: org.id,
        variantId: line.variantId,
        quantity: line.quantity,
        referenceType: 'order',
        referenceId: staged.orderId,
      });
    }

    await writeSaleAllocations(tx, {
      orgId: org.id,
      orderId: staged.orderId,
      effectiveAt: paidAt,
      orgBasis: org.allocationBasis,
    });

    await tx
      .update(checkoutSessions)
      .set({ status: 'completed', reservedUntil: null })
      .where(eq(checkoutSessions.id, staged.sessionId));

    const customerId = await upsertCustomer(tx, org.id, staged.customer);
    await tx.update(orders).set({ customerId }).where(eq(orders.id, staged.orderId));

    await audit(tx, {
      orgId: org.id,
      actorType: 'shopper',
      action: 'order.paid',
      entityType: 'order',
      entityId: staged.orderId,
      after: { orderNumber: staged.orderNumber, totalCents: staged.totalCents, transId: response.trans_id },
    });
    return {
      ok: true,
      orderId: staged.orderId,
      orderNumber: staged.orderNumber,
      publicToken: staged.publicToken,
    };
  }

  if (response) {
    // Gateway answered but did not approve: shopper may retry with another card.
    await tx
      .update(payments)
      .set({
        status: response.result === 'E' ? 'error' : 'declined',
        runResult: response.result,
        runRespCode: response.resp_code,
        runRespText: response.resp_text,
        runTransId: response.trans_id,
        rawResponse: response,
      })
      .where(eq(payments.id, payment.id));
    await tx
      .update(checkoutSessions)
      .set({ status: 'reserved', reservedUntil: new Date(Date.now() + RETRY_EXTENSION_MS) })
      .where(eq(checkoutSessions.id, staged.sessionId));
    return { ok: false, code: 'DECLINED', message: DECLINE_MESSAGE };
  }

  // No response at all (timeout / network / auth / 5xx): outcome unknown. Hold the order.
  const err =
    chargeError instanceof RunApiError
      ? `${chargeError.name}: ${chargeError.message}`
      : chargeError instanceof Error
        ? chargeError.message
        : 'unknown error';
  await tx
    .update(payments)
    .set({ status: 'unknown', runRespText: err.slice(0, 500) })
    .where(eq(payments.id, payment.id));
  return { ok: false, code: 'PAYMENT_UNCERTAIN', message: UNCERTAIN_MESSAGE };
}

async function upsertCustomer(
  tx: Tx,
  orgId: string,
  c: { name: string; email: string; phone: string }
): Promise<string> {
  const [existing] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), sql`lower(${customers.email}) = ${c.email.toLowerCase()}`));
  if (existing) {
    await tx.update(customers).set({ name: c.name, phone: c.phone }).where(eq(customers.id, existing.id));
    return existing.id;
  }
  const [row] = await tx
    .insert(customers)
    .values({ orgId, email: c.email.toLowerCase(), name: c.name, phone: c.phone })
    .returning({ id: customers.id });
  return row.id;
}

function outcomeFromPayment(p: typeof payments.$inferSelect): PlaceOrderResult {
  if (p.status === 'approved') {
    return { ok: true, orderId: p.orderId, orderNumber: '', publicToken: '' };
  }
  if (p.status === 'declined' || p.status === 'error')
    return { ok: false, code: 'DECLINED', message: DECLINE_MESSAGE };
  return { ok: false, code: 'PAYMENT_UNCERTAIN', message: UNCERTAIN_MESSAGE };
}

function last4(masked: string | null | undefined): string | null {
  if (!masked) return null;
  const digits = masked.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === '23505';
}
