'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { requireMember } from '@/lib/tenant/context';
import { getPurchaseOrder, receivePurchaseOrderLines, updatePurchaseOrder } from '@/lib/purchasing/windows';
import { notifyItemsArrived } from '@/lib/email/preorder';

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function receivePoAction(orgSlug: string, poId: string, input: unknown): Promise<ActionResult> {
  const { org, user } = await requireMember(orgSlug, 'volunteer');
  const p = z
    .array(z.object({ lineId: z.string().uuid(), quantity: z.number().int().min(0).max(100_000) }))
    .safeParse(input);
  if (!p.success) return { ok: false, message: 'Invalid quantities' };
  const r = await receivePurchaseOrderLines(org.id, poId, user.id, p.data);
  if (!r.ok) return r;
  if (r.poStatus === 'received') {
    const po = await getPurchaseOrder(org.id, poId);
    if (po?.po.preorderWindowId) {
      const windowId = po.po.preorderWindowId;
      after(() => notifyItemsArrived(org.id, windowId));
    }
  }
  revalidatePath(`/admin/${orgSlug}`, 'layout');
  return { ok: true };
}

const patchSchema = z.object({
  vendorName: z.string().trim().min(1).max(120).optional(),
  vendorContact: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  shippingCents: z.number().int().min(0).optional(),
  status: z.enum(['draft', 'submitted', 'cancelled']).optional(),
});

export async function updatePoAction(orgSlug: string, poId: string, input: unknown): Promise<ActionResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  const p = patchSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Invalid' };
  await updatePurchaseOrder(org.id, poId, user.id, p.data);
  revalidatePath(`/admin/${orgSlug}/purchase-orders/${poId}`);
  revalidatePath(`/admin/${orgSlug}/preorders`);
  return { ok: true };
}
