'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { beneficiaries } from '@/lib/db/schema';
import { requireMember } from '@/lib/tenant/context';
import { slugify } from '@/lib/catalog/slug';

export type ActionResult = { ok: true } | { ok: false; message: string };

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Name required').max(80),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  active: z.boolean().default(true),
});

export async function saveBeneficiaryAction(orgSlug: string, input: unknown): Promise<ActionResult> {
  const { org } = await requireMember(orgSlug, 'admin');
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Check the form' };
  const d = { name: p.data.name, description: p.data.description || null, active: p.data.active };
  try {
    if (p.data.id)
      await db
        .update(beneficiaries)
        .set(d)
        .where(and(eq(beneficiaries.id, p.data.id), eq(beneficiaries.orgId, org.id)));
    else await db.insert(beneficiaries).values({ orgId: org.id, slug: slugify(p.data.name), ...d });
  } catch (e) {
    if (String(e).includes('beneficiaries_org_slug_uq'))
      return { ok: false, message: 'A beneficiary with that name already exists.' };
    throw e;
  }
  revalidatePath(`/admin/${orgSlug}/beneficiaries`);
  revalidatePath(`/admin/${orgSlug}/allocations`);
  return { ok: true };
}
