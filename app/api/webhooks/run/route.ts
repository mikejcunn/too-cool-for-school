/* Run Payments transaction webhooks. Verifies the HMAC signature, dedupes on the
 * idempotency key, and resolves payments whose outcome we never recorded. Our
 * /charge requests send `order_id = order_number` and custom_02 = order id, so
 * `payload.order_id` maps back to the order. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, payments, webhookEvents } from '@/lib/db/schema';
import { resolvePayment } from '@/lib/checkout/resolve-payment';

export const dynamic = 'force-dynamic';

interface RunWebhook {
  event_type: string;
  source_id?: number;
  timestamp?: string;
  payload: {
    mid?: string;
    trans_id?: string;
    original_trans_id?: string;
    order_id?: string;
    amount?: number | string;
    auth_code?: string | null;
    response_code?: string;
    response_text?: string;
    card_number?: string;
    [k: string]: unknown;
  };
  metadata?: { webhook_id?: string; attempt?: number; idempotency_key?: string };
}

function verify(raw: string, header: string | null): boolean {
  const secret = process.env.RUN_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production'; // dev without a secret: accept
  if (!header) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const got = header.replace(/^sha256=/, '').trim();
  return (
    got.length === expected.length && timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(expected, 'hex'))
  );
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get('x-webhook-signature-256')))
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  let evt: RunWebhook;
  try {
    evt = JSON.parse(raw) as RunWebhook;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const key =
    evt.metadata?.idempotency_key ||
    req.headers.get('x-idempotency-key') ||
    `${evt.event_type}-${evt.source_id ?? ''}-${evt.timestamp ?? ''}`;

  // Dedupe: a repeat delivery is acknowledged without re-processing.
  const inserted = await db
    .insert(webhookEvents)
    .values({ provider: 'run', idempotencyKey: key, eventType: evt.event_type, payload: evt })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) return NextResponse.json({ ok: true, duplicate: true });
  const eventId = inserted[0].id;

  let note = 'ignored';
  try {
    if (evt.event_type === 'transaction.entered' || evt.event_type === 'transaction.decline') {
      note = await handleTransaction(evt);
    }
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, eventId));
    return NextResponse.json({ ok: true, note });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(webhookEvents)
      .set({ error: msg.slice(0, 500) })
      .where(eq(webhookEvents.id, eventId));
    console.error('[webhook/run] failed', msg);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}

async function handleTransaction(evt: RunWebhook): Promise<string> {
  const p = evt.payload;
  const orderNumber = p.order_id;
  if (!orderNumber) return 'no order_id';

  // Find the order by number, then any payment still awaiting an outcome.
  const rows = await db
    .select({ order: orders, payment: payments })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(and(eq(orders.orderNumber, orderNumber), inArray(payments.status, ['pending', 'unknown'])));
  if (rows.length === 0) return `no unresolved payment for ${orderNumber}`;
  const { order, payment } = rows[0];
  if (p.mid && payment.runMid && p.mid !== payment.runMid) return 'mid mismatch';

  // `transaction.entered` fires for approvals and declines alike; use the response code.
  const approved =
    evt.event_type === 'transaction.entered' &&
    (p.response_code === '00' || p.response_code === '000' || /approv/i.test(p.response_text ?? ''));
  if (approved && p.trans_id) {
    const r = await resolvePayment(
      order.orgId,
      payment.id,
      {
        kind: 'approved',
        transId: p.trans_id,
        authcode: p.auth_code ?? null,
        cardLast4: p.card_number?.replace(/\D/g, '').slice(-4) ?? null,
        raw: evt.payload,
      },
      null,
      'webhook'
    );
    return r.ok ? `approved ${orderNumber}` : `approve failed: ${r.message}`;
  }
  if (evt.event_type === 'transaction.decline' || (!approved && p.response_code)) {
    const r = await resolvePayment(
      order.orgId,
      payment.id,
      { kind: 'declined', respText: p.response_text ?? null, raw: evt.payload },
      null,
      'webhook'
    );
    return r.ok ? `declined ${orderNumber}` : `decline failed: ${r.message}`;
  }
  return 'no decision';
}
