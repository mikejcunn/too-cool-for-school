'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/lib/tenant/context';
import { resolvePayment, type ResolveResult } from '@/lib/checkout/resolve-payment';

const schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('approved'),
    transId: z.string().trim().min(3).max(60),
    authcode: z.string().trim().max(20).optional().or(z.literal('')),
    cardLast4: z
      .string()
      .trim()
      .regex(/^\d{4}$/)
      .optional()
      .or(z.literal('')),
  }),
  z.object({
    kind: z.literal('declined'),
    respText: z.string().trim().max(200).optional().or(z.literal('')),
  }),
]);

export async function resolvePaymentAction(
  orgSlug: string,
  orderId: string,
  paymentId: string,
  input: unknown
): Promise<ResolveResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Check the form' };
  const outcome =
    p.data.kind === 'approved'
      ? {
          kind: 'approved' as const,
          transId: p.data.transId,
          authcode: p.data.authcode || null,
          cardLast4: p.data.cardLast4 || null,
        }
      : { kind: 'declined' as const, respText: p.data.respText || null };
  const r = await resolvePayment(org.id, paymentId, outcome, user.id, 'admin');
  revalidatePath(`/admin/${orgSlug}/orders/${orderId}`);
  revalidatePath(`/admin/${orgSlug}/orders`);
  return r;
}
