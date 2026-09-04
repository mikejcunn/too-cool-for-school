'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOrg } from '@/lib/tenant/context';
import { setCartQuantity } from '@/lib/checkout/cart';

const schema = z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(0).max(50) });

export type CartActionResult = { ok: true; quantity: number } | { ok: false; message: string };

export async function setCartQuantityAction(
  orgSlug: string,
  input: { variantId: string; quantity: number }
): Promise<CartActionResult> {
  const org = await requireOrg(orgSlug);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid quantity.' };
  const res = await setCartQuantity(org.id, parsed.data.variantId, parsed.data.quantity);
  revalidatePath(`/s/${orgSlug}`, 'layout');
  return res;
}
