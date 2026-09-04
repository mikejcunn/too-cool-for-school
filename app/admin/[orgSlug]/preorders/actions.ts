'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { preorderWindows } from '@/lib/db/schema';
import { requireMember } from '@/lib/tenant/context';
import { createPurchaseOrderFromWindow, setWindowStatus, type WindowStatus } from '@/lib/purchasing/windows';
import { notifyWindowClosed } from '@/lib/email/preorder';

export type ActionResult = { ok: true; id?: string } | { ok: false; message: string };

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Name required').max(120),
  opensAt: z.coerce.date(),
  closesAt: z.coerce.date(),
  expectedDeliveryOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export async function saveWindowAction(orgSlug: string, input: unknown): Promise<ActionResult> {
  const { org } = await requireMember(orgSlug, 'admin');
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Check the form' };
  if (p.data.closesAt <= p.data.opensAt)
    return { ok: false, message: 'Close date must be after the open date.' };
  const d = {
    name: p.data.name,
    opensAt: p.data.opensAt,
    closesAt: p.data.closesAt,
    expectedDeliveryOn: p.data.expectedDeliveryOn || null,
    notes: p.data.notes || null,
  };
  let id = p.data.id;
  if (id)
    await db
      .update(preorderWindows)
      .set(d)
      .where(and(eq(preorderWindows.id, id), eq(preorderWindows.orgId, org.id)));
  else
    [{ id }] = await db
      .insert(preorderWindows)
      .values({ orgId: org.id, ...d, status: 'draft' })
      .returning({ id: preorderWindows.id });
  revalidatePath(`/admin/${orgSlug}/preorders`);
  revalidatePath(`/s/${orgSlug}`, 'layout');
  return { ok: true, id };
}

export async function setWindowStatusAction(
  orgSlug: string,
  windowId: string,
  status: WindowStatus
): Promise<ActionResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  await setWindowStatus(org.id, windowId, status, user.id);
  if (status === 'closed') after(() => notifyWindowClosed(org.id, windowId));
  revalidatePath(`/admin/${orgSlug}/preorders`);
  revalidatePath(`/s/${orgSlug}`, 'layout');
  return { ok: true };
}

const poSchema = z.object({
  vendorName: z.string().trim().min(1, 'Vendor name required').max(120),
  vendorContact: z.string().trim().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export async function createPurchaseOrderAction(
  orgSlug: string,
  windowId: string,
  input: unknown
): Promise<ActionResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  const p = poSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Check the form' };
  const r = await createPurchaseOrderFromWindow(org.id, windowId, user.id, {
    vendorName: p.data.vendorName,
    vendorContact: p.data.vendorContact || null,
    notes: p.data.notes || null,
  });
  if (!r.ok) return r;
  revalidatePath(`/admin/${orgSlug}/preorders`);
  return { ok: true, id: r.poId };
}
