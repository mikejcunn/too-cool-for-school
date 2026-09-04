'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { saveProduct, type SaveProductResult } from '@/lib/catalog/save-product';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';

export async function saveProductAction(orgSlug: string, input: unknown): Promise<SaveProductResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  const res = await saveProduct(org.id, user.id, input);
  revalidatePath(`/admin/${orgSlug}/products`);
  revalidatePath(`/s/${orgSlug}`, 'layout');
  return res;
}

export async function setProductStatusAction(
  orgSlug: string,
  productId: string,
  status: 'draft' | 'active' | 'archived'
): Promise<void> {
  const { org } = await requireMember(orgSlug, 'admin');
  await db
    .update(products)
    .set({ status })
    .where(and(eq(products.id, productId), eq(products.orgId, org.id)));
  revalidatePath(`/admin/${orgSlug}/products`);
  revalidatePath(`/s/${orgSlug}`, 'layout');
}
