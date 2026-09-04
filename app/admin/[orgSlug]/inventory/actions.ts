'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireMember } from '@/lib/tenant/context';
import { adjustStock, receiveStock, reconcileInventory, type ReconcileRow } from '@/lib/inventory';

const receiveSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100_000),
  note: z.string().trim().max(200).optional(),
});
const adjustSchema = z.object({
  variantId: z.string().uuid(),
  delta: z
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((n) => n !== 0, 'Enter a non-zero change'),
  note: z.string().trim().min(1, 'A reason is required').max(200),
});

export type StockActionResult =
  { ok: true; onHand: number; reserved: number } | { ok: false; message: string };

export async function receiveStockAction(orgSlug: string, input: unknown): Promise<StockActionResult> {
  const { org, user } = await requireMember(orgSlug, 'volunteer');
  const p = receiveSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const r = await db.transaction((tx) =>
      receiveStock(tx, { orgId: org.id, ...p.data, referenceType: 'manual', createdBy: user.id })
    );
    revalidate(orgSlug);
    return { ok: true, onHand: r.onHand, reserved: r.reserved };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function adjustStockAction(orgSlug: string, input: unknown): Promise<StockActionResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  const p = adjustSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const r = await db.transaction((tx) =>
      adjustStock(tx, { orgId: org.id, ...p.data, referenceType: 'manual', createdBy: user.id })
    );
    if (!r.ok) return { ok: false, message: 'That would take on-hand below what is currently reserved.' };
    revalidate(orgSlug);
    return { ok: true, onHand: r.onHand, reserved: r.reserved };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function verifyLedgerAction(orgSlug: string): Promise<ReconcileRow[]> {
  const { org } = await requireMember(orgSlug, 'viewer');
  return db.transaction((tx) => reconcileInventory(tx, org.id));
}

function revalidate(orgSlug: string) {
  revalidatePath(`/admin/${orgSlug}/inventory`);
  revalidatePath(`/admin/${orgSlug}`);
  revalidatePath(`/s/${orgSlug}`, 'layout');
}
