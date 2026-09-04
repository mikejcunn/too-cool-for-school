'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { classrooms, memberships, organizations, users } from '@/lib/db/schema';
import { requireMember } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';

export type ActionResult = { ok: true } | { ok: false; message: string };

const orgSchema = z.object({
  name: z.string().trim().min(1).max(120),
  shortName: z.string().trim().max(20).nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional().or(z.literal('')),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #1d4ed8')
    .nullable()
    .optional()
    .or(z.literal('')),
  logoUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  timezone: z.string().trim().min(1).max(60),
  runMid: z.string().trim().max(40).nullable().optional().or(z.literal('')),
  runPublicKey: z.string().trim().max(120).nullable().optional().or(z.literal('')),
  allocationBasis: z.enum(['margin', 'gross']),
  taxRateBps: z.number().int().min(0).max(3000),
  orderPrefix: z.string().trim().min(1).max(5).toUpperCase(),
});

export async function saveOrgSettingsAction(orgSlug: string, input: unknown): Promise<ActionResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  const p = orgSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Check the form' };
  const d = p.data;
  const set = {
    name: d.name,
    shortName: d.shortName || null,
    contactEmail: d.contactEmail || null,
    brandColor: d.brandColor || null,
    logoUrl: d.logoUrl || null,
    timezone: d.timezone,
    runMid: d.runMid || null,
    runPublicKey: d.runPublicKey || null,
    allocationBasis: d.allocationBasis,
    taxRateBps: d.taxRateBps,
    orderPrefix: d.orderPrefix,
  };
  await db.transaction(async (tx) => {
    await tx.update(organizations).set(set).where(eq(organizations.id, org.id));
    await audit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: 'org.update',
      entityType: 'organization',
      entityId: org.id,
      before: pickOrg(org),
      after: set,
    });
  });
  revalidatePath(`/admin/${orgSlug}`, 'layout');
  revalidatePath(`/s/${orgSlug}`, 'layout');
  return { ok: true };
}

function pickOrg(o: typeof organizations.$inferSelect) {
  const {
    name,
    shortName,
    contactEmail,
    brandColor,
    logoUrl,
    timezone,
    runMid,
    allocationBasis,
    taxRateBps,
    orderPrefix,
  } = o;
  return {
    name,
    shortName,
    contactEmail,
    brandColor,
    logoUrl,
    timezone,
    runMid,
    allocationBasis,
    taxRateBps,
    orderPrefix,
  };
}

const classroomSchema = z.object({
  id: z.string().uuid().optional(),
  teacherName: z.string().trim().min(1).max(80),
  grade: z.string().trim().max(10).nullable().optional().or(z.literal('')),
  room: z.string().trim().max(20).nullable().optional().or(z.literal('')),
  active: z.boolean().default(true),
});

export async function saveClassroomAction(orgSlug: string, input: unknown): Promise<ActionResult> {
  const { org } = await requireMember(orgSlug, 'admin');
  const p = classroomSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Check the form' };
  const d = {
    teacherName: p.data.teacherName,
    grade: p.data.grade || null,
    room: p.data.room || null,
    active: p.data.active,
  };
  if (p.data.id)
    await db
      .update(classrooms)
      .set(d)
      .where(and(eq(classrooms.id, p.data.id), eq(classrooms.orgId, org.id)));
  else await db.insert(classrooms).values({ orgId: org.id, ...d, sortOrder: gradeOrder(d.grade) });
  revalidatePath(`/admin/${orgSlug}/settings`);
  return { ok: true };
}

function gradeOrder(grade: string | null): number {
  if (!grade) return 99;
  const g = grade.toUpperCase();
  if (g.startsWith('PK') || g === 'PRE-K') return -1;
  if (g === 'K') return 0;
  const n = parseInt(g, 10);
  return Number.isFinite(n) ? n : 50;
}

const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(80).optional(),
  role: z.enum(['admin', 'volunteer', 'viewer']),
});

export async function addMemberAction(orgSlug: string, input: unknown): Promise<ActionResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  const p = memberSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Check the form' };
  await db.transaction(async (tx) => {
    let [u] = await tx.select().from(users).where(eq(users.email, p.data.email));
    if (!u)
      [u] = await tx
        .insert(users)
        .values({ email: p.data.email, name: p.data.name || null })
        .returning();
    await tx
      .insert(memberships)
      .values({ orgId: org.id, userId: u.id, role: p.data.role, invitedBy: user.id })
      .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: p.data.role } });
    await audit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: 'member.upsert',
      entityType: 'user',
      entityId: u.id,
      after: { email: p.data.email, role: p.data.role },
    });
  });
  revalidatePath(`/admin/${orgSlug}/settings`);
  return { ok: true };
}

export async function removeMemberAction(orgSlug: string, userId: string): Promise<ActionResult> {
  const { org, user } = await requireMember(orgSlug, 'admin');
  if (userId === user.id) return { ok: false, message: 'You cannot remove yourself.' };
  await db.delete(memberships).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, userId)));
  revalidatePath(`/admin/${orgSlug}/settings`);
  return { ok: true };
}
