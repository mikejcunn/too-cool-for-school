/* Refunds: card refunds go through Javelin void-or-refund; other tenders are recorded.
 * On approval: line/order amounts, optional restock, negative allocation entries. */
import { and, eq, inArray } from 'drizzle-orm';
import { db, type Tx } from '@/lib/db';
import { orderLines, orders, organizations, payments, refundLines, refunds } from '@/lib/db/schema';
import { audit } from '@/lib/audit';
import { writeRefundAllocations } from '@/lib/allocation/entries';
import { receiveStock } from '@/lib/inventory';
import { voidOrRefund } from '@/lib/run-api';
import { toRunAmount } from '@/lib/run-api/amount';
import { isApproved, type VoidOrRefundResponse } from '@/types/run';

export interface RefundLineInput {
  orderLineId: string;
  quantity: number;
}

export interface RefundInput {
  orgId: string;
  orderId: string;
  /** Whole-unit refunds by line. */
  lines?: RefundLineInput[];
  /** Custom amount in cents (when not refunding whole units). Ignored if `lines` given and non-empty. */
  amountCents?: number;
  restock: boolean;
  reason?: string;
  actorUserId: string;
}

export type RefundResult =
  | { ok: true; refundId: string; amountCents: number }
  | { ok: false; code: 'INVALID' | 'NOT_REFUNDABLE' | 'DECLINED' | 'ERROR'; message: string };

export async function refundOrder(input: RefundInput): Promise<RefundResult> {
  // ── Stage: validate and create the refund row ──────────────────────────────
  let staged: {
    refundId: string;
    amountCents: number;
    payment: typeof payments.$inferSelect;
    org: typeof organizations.$inferSelect;
    unitsByLine: Map<string, number>;
    amountByLine: Map<string, number>;
    fullOrder: boolean;
  };
  try {
    staged = await db.transaction(async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, input.orgId));
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, input.orderId), eq(orders.orgId, input.orgId)))
        .for('update');
      if (!org || !order) throw new RefundError({ ok: false, code: 'INVALID', message: 'Order not found.' });
      if (!['paid', 'partially_refunded'].includes(order.status)) {
        throw new RefundError({
          ok: false,
          code: 'NOT_REFUNDABLE',
          message: `Order is ${order.status}; nothing to refund.`,
        });
      }
      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.status, 'approved')));
      if (!payment)
        throw new RefundError({
          ok: false,
          code: 'NOT_REFUNDABLE',
          message: 'No approved payment on this order.',
        });

      const remaining = order.paidCents - order.refundedCents;
      const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id));
      const unitsByLine = new Map<string, number>();
      const amountByLine = new Map<string, number>();
      let amountCents = 0;

      if (input.lines && input.lines.length) {
        for (const l of input.lines) {
          const line = lines.find((x) => x.id === l.orderLineId);
          if (!line) throw new RefundError({ ok: false, code: 'INVALID', message: 'Unknown order line.' });
          const refundable = line.quantity - line.refundedQuantity;
          if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > refundable) {
            throw new RefundError({
              ok: false,
              code: 'INVALID',
              message: `Refund quantity for ${line.productName} must be 1–${refundable}.`,
            });
          }
          unitsByLine.set(line.id, l.quantity);
          amountCents += line.unitPriceCents * l.quantity;
        }
        // Tax on refunded units, proportionally.
        if (order.taxCents > 0 && order.subtotalCents > 0) {
          amountCents += Math.round((amountCents / order.subtotalCents) * order.taxCents);
        }
      } else if (input.amountCents && input.amountCents > 0) {
        amountCents = Math.round(input.amountCents);
        // Spread a custom amount across lines by their share of the subtotal (for allocation reversal only).
        const openLines = lines.filter((l) => l.lineSubtotalCents - l.refundedCents > 0);
        const base = openLines.reduce((n, l) => n + l.lineSubtotalCents, 0) || 1;
        for (const l of openLines)
          amountByLine.set(l.id, Math.round((l.lineSubtotalCents / base) * amountCents));
      } else {
        throw new RefundError({ ok: false, code: 'INVALID', message: 'Choose items or enter an amount.' });
      }
      amountCents = Math.min(amountCents, remaining);
      if (amountCents <= 0)
        throw new RefundError({ ok: false, code: 'NOT_REFUNDABLE', message: 'Nothing left to refund.' });

      const [r] = await tx
        .insert(refunds)
        .values({
          orgId: org.id,
          orderId: order.id,
          paymentId: payment.id,
          amountCents,
          reason: input.reason ?? null,
          restock: input.restock,
          status: 'pending',
          tender: payment.tender,
          createdBy: input.actorUserId,
        })
        .returning({ id: refunds.id });
      if (unitsByLine.size) {
        await tx.insert(refundLines).values(
          [...unitsByLine.entries()].map(([orderLineId, quantity]) => {
            const line = lines.find((x) => x.id === orderLineId)!;
            return { refundId: r.id, orderLineId, quantity, amountCents: line.unitPriceCents * quantity };
          })
        );
      }
      return {
        refundId: r.id,
        amountCents,
        payment,
        org,
        unitsByLine,
        amountByLine,
        fullOrder: amountCents === remaining,
      };
    });
  } catch (e) {
    if (e instanceof RefundError) return e.result;
    console.error('[refundOrder] stage failed', e);
    return { ok: false, code: 'ERROR', message: 'Could not start the refund.' };
  }

  // ── Gateway ────────────────────────────────────────────────────────────────
  let response: VoidOrRefundResponse | null = null;
  if (staged.payment.tender === 'card') {
    if (!staged.payment.runTransId || !staged.payment.runMid) {
      await db
        .update(refunds)
        .set({ status: 'error', runRespText: 'Payment has no trans_id' })
        .where(eq(refunds.id, staged.refundId));
      return { ok: false, code: 'ERROR', message: 'This payment has no gateway transaction id.' };
    }
    try {
      response = await voidOrRefund({
        trans_id: staged.payment.runTransId,
        mid: staged.payment.runMid,
        ...(staged.fullOrder ? {} : { amount: toRunAmount(staged.amountCents) }),
        user_identifier: input.actorUserId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'gateway error';
      await db
        .update(refunds)
        .set({ status: 'error', runRespText: msg.slice(0, 500) })
        .where(eq(refunds.id, staged.refundId));
      return { ok: false, code: 'ERROR', message: `Gateway error: ${msg}` };
    }
    if (!isApproved(response)) {
      await db
        .update(refunds)
        .set({
          status: 'declined',
          runRespCode: response.resp_code,
          runRespText: response.resp_text,
          rawResponse: response,
        })
        .where(eq(refunds.id, staged.refundId));
      return {
        ok: false,
        code: 'DECLINED',
        message: response.resp_text || 'The gateway declined the refund.',
      };
    }
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  await db.transaction((tx) => applyRefund(tx, input, staged, response));
  return { ok: true, refundId: staged.refundId, amountCents: staged.amountCents };
}

class RefundError extends Error {
  constructor(public readonly result: RefundResult) {
    super('refund');
  }
}

async function applyRefund(
  tx: Tx,
  input: RefundInput,
  staged: {
    refundId: string;
    amountCents: number;
    payment: typeof payments.$inferSelect;
    unitsByLine: Map<string, number>;
    amountByLine: Map<string, number>;
  },
  response: VoidOrRefundResponse | null
): Promise<void> {
  const now = new Date();
  await tx
    .update(refunds)
    .set({
      status: 'approved',
      runTransId: response?.trans_id ?? null,
      runRespCode: response?.resp_code ?? null,
      runRespText: response?.resp_text ?? null,
      rawResponse: response ?? null,
    })
    .where(eq(refunds.id, staged.refundId));

  const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for('update');
  const refundedCents = order.refundedCents + staged.amountCents;
  const fully = refundedCents >= order.paidCents;
  await tx
    .update(orders)
    .set({ refundedCents, status: fully ? 'refunded' : 'partially_refunded' })
    .where(eq(orders.id, order.id));
  await tx
    .update(payments)
    .set({ status: fully ? 'refunded' : 'partially_refunded' })
    .where(eq(payments.id, staged.payment.id));

  if (staged.unitsByLine.size) {
    const ids = [...staged.unitsByLine.keys()];
    const lines = await tx.select().from(orderLines).where(inArray(orderLines.id, ids));
    for (const line of lines) {
      const qty = staged.unitsByLine.get(line.id)!;
      await tx
        .update(orderLines)
        .set({
          refundedQuantity: line.refundedQuantity + qty,
          refundedCents: line.refundedCents + line.unitPriceCents * qty,
        })
        .where(eq(orderLines.id, line.id));
      if (input.restock && !line.isPreorder) {
        await receiveStock(tx, {
          orgId: input.orgId,
          variantId: line.variantId,
          quantity: qty,
          type: 'return',
          referenceType: 'refund',
          referenceId: staged.refundId,
          createdBy: input.actorUserId,
        });
      }
    }
  } else {
    for (const [lineId, cents] of staged.amountByLine) {
      const [line] = await tx.select().from(orderLines).where(eq(orderLines.id, lineId));
      if (line)
        await tx
          .update(orderLines)
          .set({ refundedCents: line.refundedCents + cents })
          .where(eq(orderLines.id, lineId));
    }
  }

  await writeRefundAllocations(tx, {
    orgId: input.orgId,
    orderId: input.orderId,
    refundId: staged.refundId,
    effectiveAt: now,
    unitsByLine: staged.unitsByLine,
    amountByLine: staged.amountByLine,
  });

  await audit(tx, {
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: 'order.refund',
    entityType: 'order',
    entityId: input.orderId,
    after: {
      refundId: staged.refundId,
      amountCents: staged.amountCents,
      restock: input.restock,
      transId: response?.trans_id ?? null,
    },
  });
}
