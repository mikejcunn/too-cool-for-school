'use server';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/tenant/context';
import { markFulfilled } from '@/lib/orders/queries';
import { refundOrder, type RefundResult } from '@/lib/checkout/refund';

export async function markFulfilledAction(
  orgSlug: string,
  orderId: string,
  fulfilled: boolean
): Promise<void> {
  const { org, user } = await requireMember(orgSlug, 'volunteer');
  await markFulfilled(org.id, orderId, user.id, fulfilled);
  revalidatePath(`/admin/${orgSlug}/orders/${orderId}`);
  revalidatePath(`/admin/${orgSlug}/orders`);
}

export interface RefundActionInput {
  lines?: { orderLineId: string; quantity: number }[];
  amountCents?: number;
  restock: boolean;
  reason?: string;
}

export async function refundOrderAction(
  orgSlug: string,
  orderId: string,
  input: RefundActionInput
): Promise<RefundResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  const res = await refundOrder({ orgId: org.id, orderId, actorUserId: user.id, ...input });
  revalidatePath(`/admin/${orgSlug}/orders/${orderId}`);
  revalidatePath(`/admin/${orgSlug}/orders`);
  return res;
}
