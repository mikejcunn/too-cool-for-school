'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/lib/tenant/context';
import { clearProductRule, saveAllocationRule } from '@/lib/allocation/save-rule';

export type ActionResult = { ok: true } | { ok: false; message: string };

const schema = z.object({
  productId: z.string().uuid().nullable(),
  basis: z.enum(['margin', 'gross']).nullable(),
  name: z.string().trim().max(120).nullable().optional(),
  splits: z
    .array(
      z.object({
        beneficiaryId: z.string().uuid(),
        kind: z.enum(['percent', 'fixed']),
        percentBps: z.number().int().min(0).max(10000).nullable().optional(),
        fixedCentsPerUnit: z.number().int().min(0).nullable().optional(),
        position: z.number().int().min(0),
      })
    )
    .min(1, 'Add at least one split'),
});

export async function saveAllocationRuleAction(orgSlug: string, input: unknown): Promise<ActionResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Check the form' };
  const r = await saveAllocationRule(org.id, user.id, p.data);
  if (!r.ok) return r;
  revalidatePath(`/admin/${orgSlug}/allocations`);
  return { ok: true };
}

export async function clearProductRuleAction(orgSlug: string, productId: string): Promise<ActionResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  await clearProductRule(org.id, user.id, productId);
  revalidatePath(`/admin/${orgSlug}/allocations`);
  return { ok: true };
}
