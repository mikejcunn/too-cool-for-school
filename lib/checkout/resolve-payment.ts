/* Human/webhook backstop for payments whose gateway outcome was not recorded in the
 * normal settle path (status pending or unknown). Approving commits stock, writes
 * allocations and marks the order paid; declining cancels the order and releases holds. */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkoutSessions, orderLines, orders, organizations, payments } from '@/lib/db/schema';
import { audit } from '@/lib/audit';
import { writeSaleAllocations } from '@/lib/allocation/entries';
import { commitStock, releaseStock, reserveStock } from '@/lib/inventory';
import { upsertCustomer } from './place-order';

export type ResolveOutcome =
  | {
      kind: 'approved';
      transId: string;
      authcode?: string | null;
      cardLast4?: string | null;
      cardBrand?: string | null;
      raw?: unknown;
    }
  | { kind: 'declined'; respText?: string | null; raw?: unknown };

export type ResolveResult = { ok: true; orderStatus: string } | { ok: false; message: string };

export async function resolvePayment(
  orgId: string,
  paymentId: string,
  outcome: ResolveOutcome,
  actorUserId: string | null,
  source: 'admin' | 'webhook' | 'cron'
): Promise<ResolveResult> {
  try {
    const status = await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.id, paymentId), eq(payments.orgId, orgId)))
        .for('update');
      if (!payment) throw new Error('Payment not found.');
      if (!['pending', 'unknown'].includes(payment.status))
        throw new Error(`Payment is already ${payment.status}.`);
      const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for('update');
      if (!order) throw new Error('Order not found.');
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
      const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id));
      const now = new Date();

      if (outcome.kind === 'approved') {
        // Guard against the same gateway transaction being attached twice.
        const [dup] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(and(eq(payments.runTransId, outcome.transId), eq(payments.orgId, orgId)));
        if (dup && dup.id !== payment.id)
          throw new Error('That transaction id is already attached to another payment.');

        await tx
          .update(payments)
          .set({
            status: 'approved',
            runTransId: outcome.transId,
            runAuthcode: outcome.authcode ?? null,
            runResult: 'A',
            cardLast4: outcome.cardLast4 ?? payment.cardLast4,
            cardBrand: outcome.cardBrand ?? payment.cardBrand,
            rawResponse: outcome.raw ?? payment.rawResponse,
            approvedAt: now,
            runRespText: `resolved via ${source}`,
          })
          .where(eq(payments.id, payment.id));

        const notes: string[] = [];
        for (const l of lines) {
          if (l.isPreorder) continue;
          if (order.status === 'pending') {
            await commitStock(tx, {
              orgId,
              variantId: l.variantId,
              quantity: l.quantity,
              referenceType: 'order',
              referenceId: order.id,
            }).catch(() => notes.push(`no reservation for ${l.sku}`));
          } else {
            // Reservation was already released (order cancelled): take stock now if we can.
            const r = await reserveStock(tx, {
              orgId,
              variantId: l.variantId,
              quantity: l.quantity,
              referenceType: 'order',
              referenceId: order.id,
            });
            if (r.ok)
              await commitStock(tx, {
                orgId,
                variantId: l.variantId,
                quantity: l.quantity,
                referenceType: 'order',
                referenceId: order.id,
              });
            else notes.push(`oversold: ${l.sku} x${l.quantity} (only ${r.available} left)`);
          }
        }
        await tx
          .update(orders)
          .set({
            status: 'paid',
            paidAt: now,
            paidCents: payment.amountCents,
            notes: notes.length
              ? [order.notes, ...notes.map((n) => `[${n}]`)].filter(Boolean).join(' ')
              : order.notes,
          })
          .where(eq(orders.id, order.id));
        await writeSaleAllocations(tx, {
          orgId,
          orderId: order.id,
          effectiveAt: now,
          orgBasis: org?.allocationBasis ?? 'margin',
        });
        if (order.checkoutSessionId)
          await tx
            .update(checkoutSessions)
            .set({ status: 'completed', reservedUntil: null })
            .where(eq(checkoutSessions.id, order.checkoutSessionId));
        if (order.customerEmail) {
          const customerId = await upsertCustomer(tx, orgId, {
            name: order.customerName,
            email: order.customerEmail,
            phone: order.customerPhone,
          });
          await tx.update(orders).set({ customerId }).where(eq(orders.id, order.id));
        }
        await audit(tx, {
          orgId,
          actorUserId,
          actorType: actorUserId ? 'user' : 'system',
          action: 'payment.resolve_approved',
          entityType: 'payment',
          entityId: payment.id,
          after: { source, transId: outcome.transId, notes },
        });
        return 'paid';
      }

      await tx
        .update(payments)
        .set({
          status: 'declined',
          runResult: 'D',
          runRespText: outcome.respText ?? `declined (resolved via ${source})`,
          rawResponse: outcome.raw ?? payment.rawResponse,
        })
        .where(eq(payments.id, payment.id));
      if (order.status === 'pending') {
        for (const l of lines) {
          if (l.isPreorder) continue;
          await releaseStock(tx, {
            orgId,
            variantId: l.variantId,
            quantity: l.quantity,
            referenceType: 'order',
            referenceId: order.id,
            note: 'payment declined',
          });
        }
        await tx
          .update(orders)
          .set({
            status: 'cancelled',
            notes: [order.notes, '[cancelled: payment declined]'].filter(Boolean).join(' '),
          })
          .where(eq(orders.id, order.id));
        if (order.checkoutSessionId)
          await tx
            .update(checkoutSessions)
            .set({ status: 'open', reservedUntil: null })
            .where(eq(checkoutSessions.id, order.checkoutSessionId));
      }
      await audit(tx, {
        orgId,
        actorUserId,
        actorType: actorUserId ? 'user' : 'system',
        action: 'payment.resolve_declined',
        entityType: 'payment',
        entityId: payment.id,
        after: { source },
      });
      return order.status === 'pending' ? 'cancelled' : order.status;
    });
    return { ok: true, orderStatus: status };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not resolve payment.' };
  }
}

/** Cron: payments left `unknown` whose stored raw response actually says approved. */
export async function reconcileUnknownPayments(): Promise<{ resolved: number; skipped: number }> {
  const rows = await db
    .select()
    .from(payments)
    .where(inArray(payments.status, ['unknown']));
  let resolved = 0;
  let skipped = 0;
  for (const p of rows) {
    const raw = p.rawResponse as {
      result?: string;
      trans_id?: string | null;
      authcode?: string | null;
      card_number?: string | null;
      card_type?: string | null;
    } | null;
    if (raw && raw.result === 'A' && raw.trans_id) {
      const r = await resolvePayment(
        p.orgId,
        p.id,
        {
          kind: 'approved',
          transId: raw.trans_id,
          authcode: raw.authcode ?? null,
          cardLast4: raw.card_number?.replace(/\D/g, '').slice(-4) ?? null,
          cardBrand: raw.card_type ?? null,
          raw,
        },
        null,
        'cron'
      );
      if (r.ok) resolved++;
      else skipped++;
    } else skipped++;
  }
  return { resolved, skipped };
}
