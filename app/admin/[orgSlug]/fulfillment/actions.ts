'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/lib/tenant/context';
import { markFulfilled } from '@/lib/orders/queries';

export async function markManyFulfilledAction(
  orgSlug: string,
  orderIds: unknown,
  fulfilled: boolean
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const { org, user } = await requireMember(orgSlug, 'volunteer');
  const ids = z.array(z.string().uuid()).min(1).safeParse(orderIds);
  if (!ids.success) return { ok: false, message: 'Select at least one order.' };
  for (const id of ids.data) await markFulfilled(org.id, id, user.id, fulfilled);
  revalidatePath(`/admin/${orgSlug}/fulfillment`);
  revalidatePath(`/admin/${orgSlug}/orders`);
  return { ok: true, count: ids.data.length };
}
