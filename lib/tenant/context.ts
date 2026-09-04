/* Tenant resolution and membership enforcement (ADR-0003).
 * Every server action / route handler starts with one of these. */
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { memberships, organizations, users } from '@/lib/db/schema';

export type Role = 'viewer' | 'volunteer' | 'admin';
const ROLE_RANK: Record<Role, number> = { viewer: 0, volunteer: 1, admin: 2 };

export type Org = typeof organizations.$inferSelect;

/** Request-cached org lookup by slug; null when missing. */
export const getOrgBySlug = cache(async (slug: string): Promise<Org | null> => {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.slug, slug) });
  return org ?? null;
});

/** Public (storefront) entry: 404 if the org is missing or suspended. */
export async function requireOrg(slug: string): Promise<Org> {
  const org = await getOrgBySlug(slug);
  if (!org || org.status !== 'active') notFound();
  return org;
}

export interface MemberContext {
  org: Org;
  user: { id: string; email: string | null; name: string | null; isPlatformAdmin: boolean };
  role: Role;
}

/**
 * Authenticated entry for /admin and /pos. Redirects anonymous users to login;
 * non-members get a 404 so foreign org slugs are indistinguishable from missing ones.
 */
export async function requireMember(
  slug: string,
  minRole: Role = 'viewer',
  nextPath?: string
): Promise<MemberContext> {
  const org = await requireOrg(slug);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/login?next=${encodeURIComponent(nextPath ?? `/admin/${slug}`)}`);

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) redirect('/login');

  if (user.isPlatformAdmin) {
    return { org, user: pick(user), role: 'admin' };
  }

  const m = await db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, org.id), eq(memberships.userId, userId)),
  });
  if (!m || ROLE_RANK[m.role] < ROLE_RANK[minRole]) notFound();
  return { org, user: pick(user), role: m.role };
}

function pick(u: typeof users.$inferSelect): MemberContext['user'] {
  return { id: u.id, email: u.email, name: u.name, isPlatformAdmin: u.isPlatformAdmin };
}

export function hasRole(role: Role, minRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}
