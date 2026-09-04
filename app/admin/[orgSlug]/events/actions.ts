'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { requireMember } from '@/lib/tenant/context';

export type ActionResult = { ok: true } | { ok: false; message: string };

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Name required').max(120),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  kind: z.enum(['pickup', 'sale', 'both']),
  active: z.boolean().default(true),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export async function saveEventAction(orgSlug: string, input: unknown): Promise<ActionResult> {
  const { org } = await requireMember(orgSlug, 'admin');
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Check the form' };
  const d = {
    name: p.data.name,
    startsAt: p.data.startsAt,
    endsAt: p.data.endsAt ?? null,
    location: p.data.location || null,
    kind: p.data.kind,
    active: p.data.active,
    notes: p.data.notes || null,
  };
  if (p.data.id)
    await db
      .update(events)
      .set(d)
      .where(and(eq(events.id, p.data.id), eq(events.orgId, org.id)));
  else await db.insert(events).values({ orgId: org.id, ...d });
  revalidatePath(`/admin/${orgSlug}/events`);
  revalidatePath(`/s/${orgSlug}`, 'layout');
  return { ok: true };
}

export async function toggleEventAction(orgSlug: string, id: string, active: boolean): Promise<ActionResult> {
  const { org } = await requireMember(orgSlug, 'admin');
  await db
    .update(events)
    .set({ active })
    .where(and(eq(events.id, id), eq(events.orgId, org.id)));
  revalidatePath(`/admin/${orgSlug}/events`);
  return { ok: true };
}
