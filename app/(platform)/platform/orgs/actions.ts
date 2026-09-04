'use server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  allocationRuleSplits,
  allocationRules,
  beneficiaries,
  memberships,
  organizations,
  users,
} from '@/lib/db/schema';
import { slugify } from '@/lib/catalog/slug';
import { audit } from '@/lib/audit';

export async function requirePlatformAdmin() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?next=/platform/orgs');
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user?.isPlatformAdmin) redirect('/admin');
  return user;
}

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,60}$/, 'Slug: lowercase letters, numbers, dashes')
    .optional()
    .or(z.literal('')),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminName: z.string().trim().max(80).optional().or(z.literal('')),
  orderPrefix: z.string().trim().min(1).max(5).toUpperCase().default('W'),
});

export async function createOrgAction(
  input: unknown
): Promise<{ ok: true; slug: string } | { ok: false; message: string }> {
  const actor = await requirePlatformAdmin();
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Check the form' };
  const slug = p.data.slug || slugify(p.data.name);
  try {
    await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: p.data.name, slug, orderPrefix: p.data.orderPrefix })
        .returning();
      let [u] = await tx.select().from(users).where(eq(users.email, p.data.adminEmail));
      if (!u)
        [u] = await tx
          .insert(users)
          .values({ email: p.data.adminEmail, name: p.data.adminName || null })
          .returning();
      await tx
        .insert(memberships)
        .values({ orgId: org.id, userId: u.id, role: 'admin', invitedBy: actor.id });
      const [gf] = await tx
        .insert(beneficiaries)
        .values({ orgId: org.id, name: 'General Fund', slug: 'general-fund', sortOrder: 0 })
        .returning();
      const [rule] = await tx
        .insert(allocationRules)
        .values({ orgId: org.id, productId: null, name: 'Org default' })
        .returning();
      await tx
        .insert(allocationRuleSplits)
        .values({ ruleId: rule.id, beneficiaryId: gf.id, kind: 'percent', percentBps: 10000, position: 0 });
      await audit(tx, {
        orgId: org.id,
        actorUserId: actor.id,
        action: 'org.create',
        entityType: 'organization',
        entityId: org.id,
        after: { name: p.data.name, slug, adminEmail: p.data.adminEmail },
      });
    });
  } catch (e) {
    if (String(e).includes('organizations_slug_unique')) return { ok: false, message: 'That slug is taken.' };
    return { ok: false, message: e instanceof Error ? e.message : 'Could not create org' };
  }
  return { ok: true, slug };
}
