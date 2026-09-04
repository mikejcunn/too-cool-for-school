/* POS checkout: the volunteer's device holds the cart; on "charge" we materialise it as a
 * checkout_session (channel = pos) and run the shared engine. */
import { randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  checkoutItems,
  checkoutSessions,
  organizations,
  posSessions,
  productVariants,
  products,
} from '@/lib/db/schema';
import { resolveMoney } from '@/lib/pricing/resolve-price';
import { POS_RESERVATION_MS, runCheckout } from './place-order';
import { emailSchema, phoneSchema, type PlaceOrderResult } from './schemas';

export const posOrderInputSchema = z.object({
  posSessionId: z.string().uuid(),
  lines: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(200) }))
    .min(1, 'Add something to the sale first.'),
  tender: z.enum(['card', 'cash', 'venmo', 'check']),
  reference: z.string().trim().max(120).optional().or(z.literal('')),
  /** Cash handed over, for the change display; stored in the audit trail only. */
  amountTenderedCents: z.number().int().min(0).optional(),
  customerName: z.string().trim().max(120).optional().or(z.literal('')),
  customerEmail: emailSchema.optional().or(z.literal('')),
  customerPhone: phoneSchema.optional().or(z.literal('')),
  fulfillmentMethod: z.enum(['in_person', 'classroom', 'pickup']).default('in_person'),
  classroomId: z.string().uuid().optional().or(z.literal('')),
  studentName: z.string().trim().max(120).optional().or(z.literal('')),
  pickupEventId: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  accountToken: z.string().optional(),
  expiration: z.string().optional(),
  nameOnCard: z.string().trim().max(120).optional(),
  idempotencyKey: z.string().uuid(),
});
export type PosOrderInput = z.infer<typeof posOrderInputSchema>;

export async function placePosOrder(
  orgId: string,
  actorUserId: string,
  raw: unknown
): Promise<PlaceOrderResult> {
  const parsed = posOrderInputSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, code: 'INVALID', message: parsed.error.issues[0]?.message ?? 'Check the sale.' };
  const input = parsed.data;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return { ok: false, code: 'ERROR', message: 'Organization not found.' };
  const [pos] = await db
    .select()
    .from(posSessions)
    .where(and(eq(posSessions.id, input.posSessionId), eq(posSessions.orgId, orgId)));
  if (!pos || pos.closedAt)
    return { ok: false, code: 'INVALID', message: 'This POS session is closed. Open a new one.' };
  if (input.tender === 'card' && !input.accountToken)
    return { ok: false, code: 'INVALID', message: 'Card details are missing.' };

  // Materialise the device cart as a session so reservations/settlement work exactly as online.
  const variantIds = input.lines.map((l) => l.variantId);
  const rows = await db
    .select({ variant: productVariants, product: products })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.orgId, orgId), inArray(productVariants.id, variantIds)));
  if (rows.length !== variantIds.length)
    return { ok: false, code: 'UNAVAILABLE', message: 'An item in this sale no longer exists.' };

  const [session] = await db
    .insert(checkoutSessions)
    .values({
      orgId,
      status: 'open',
      channel: 'pos',
      posSessionId: pos.id,
      cookieToken: `pos_${randomBytes(18).toString('base64url')}`,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      customerName: input.customerName || null,
      customerEmail: input.customerEmail || null,
      customerPhone: input.customerPhone || null,
    })
    .returning();
  await db.insert(checkoutItems).values(
    input.lines.map((l) => {
      const r = rows.find((x) => x.variant.id === l.variantId)!;
      return {
        sessionId: session.id,
        variantId: l.variantId,
        quantity: l.quantity,
        unitPriceCentsShown: resolveMoney(r.product, r.variant).unitPriceCents,
      };
    })
  );

  const reference = [
    input.reference?.trim(),
    input.tender === 'cash' && input.amountTenderedCents
      ? `tendered ${(input.amountTenderedCents / 100).toFixed(2)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return runCheckout(org, session, {
    channel: 'pos',
    posSessionId: pos.id,
    actorUserId,
    customerName: input.customerName || null,
    customerEmail: input.customerEmail || null,
    customerPhone: input.customerPhone || null,
    fulfillmentMethod: input.fulfillmentMethod,
    classroomId: input.classroomId || null,
    studentName: input.studentName || null,
    pickupEventId: input.pickupEventId || null,
    notes: input.notes || null,
    tender: input.tender,
    reference: reference || null,
    card:
      input.tender === 'card'
        ? { accountToken: input.accountToken!, expiration: input.expiration, nameOnCard: input.nameOnCard }
        : undefined,
    idempotencyKey: input.idempotencyKey,
    reservationMs: POS_RESERVATION_MS,
  });
}
