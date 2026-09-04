import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { memberships, organizations, users } from '@/lib/db/schema';

/** /admin with no org: send the user to the first org they belong to. */
export default async function AdminIndex() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?next=/admin');
  // Prefer an org the user actually belongs to; platform admins with no membership get the oldest org.
  const [m] = await db
    .select({ slug: organizations.slug })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, session.user.id))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  if (m) redirect(`/admin/${m.slug}`);
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (user?.isPlatformAdmin) {
    const [org] = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    redirect(org ? `/admin/${org.slug}` : '/platform/orgs');
  }
  redirect('/login?error=NoMembership');
}
