'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { posSessions } from '@/lib/db/schema';
import { requireMember } from '@/lib/tenant/context';
import { placePosOrder } from '@/lib/checkout/pos-order';
import type { PlaceOrderResult } from '@/lib/checkout/schemas';
import { sendReceipt } from '@/lib/email/receipt';
import { getPosSummary, type PosSummary } from '@/lib/pos/queries';
import { audit } from '@/lib/audit';

const openSchema = z.object({
  eventId: z.string().uuid().nullable().optional().or(z.literal('')),
  startingCashCents: z.number().int().min(0).max(1_000_000),
});

export async function openPosSessionAction(orgSlug: string, input: unknown): Promise<never> {
  const { org, user } = await requireMember(orgSlug, 'volunteer', `/pos/${orgSlug}`);
  const p = openSchema.safeParse(input);
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? 'Invalid');
  const [row] = await db
    .insert(posSessions)
    .values({
      orgId: org.id,
      eventId: p.data.eventId || null,
      openedBy: user.id,
      startingCashCents: p.data.startingCashCents,
    })
    .returning({ id: posSessions.id });
  redirect(`/pos/${orgSlug}/${row.id}`);
}

export async function placePosOrderAction(orgSlug: string, input: unknown): Promise<PlaceOrderResult> {
  const { org, user } = await requireMember(orgSlug, 'volunteer', `/pos/${orgSlug}`);
  const res = await placePosOrder(org.id, user.id, input);
  if (res.ok) {
    const orderId = res.orderId;
    after(() => sendReceipt(org.id, orderId));
    revalidatePath(`/admin/${orgSlug}`, 'layout');
  }
  return res;
}

const closeSchema = z.object({
  endingCashCents: z.number().int().min(0).max(10_000_000).nullable(),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export async function closePosSessionAction(
  orgSlug: string,
  posSessionId: string,
  input: unknown
): Promise<{ ok: true; summary: PosSummary } | { ok: false; message: string }> {
  const { org, user } = await requireMember(orgSlug, 'volunteer', `/pos/${orgSlug}`);
  const p = closeSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Invalid' };
  await db.transaction(async (tx) => {
    await tx
      .update(posSessions)
      .set({ closedAt: new Date(), endingCashCents: p.data.endingCashCents, notes: p.data.notes || null })
      .where(and(eq(posSessions.id, posSessionId), eq(posSessions.orgId, org.id)));
    await audit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: 'pos_session.close',
      entityType: 'pos_session',
      entityId: posSessionId,
      after: p.data,
    });
  });
  const summary = await getPosSummary(org.id, posSessionId);
  if (!summary) return { ok: false, message: 'Session not found' };
  revalidatePath(`/pos/${orgSlug}`);
  return { ok: true, summary };
}

export async function posSummaryAction(orgSlug: string, posSessionId: string): Promise<PosSummary | null> {
  const { org } = await requireMember(orgSlug, 'volunteer', `/pos/${orgSlug}`);
  return getPosSummary(org.id, posSessionId);
}
