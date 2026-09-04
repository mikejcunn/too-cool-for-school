import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { memberships, organizations, users } from '@/lib/db/schema';

/** /admin with no org: send the user to the first org they belong to. */
export default async function AdminIndex() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?next=/admin');
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (user?.isPlatformAdmin) {
    const [org] = await db.select({ slug: organizations.slug }).from(organizations).limit(1);
    redirect(org ? `/admin/${org.slug}` : '/platform/orgs');
  }
  const [m] = await db
    .select({ slug: organizations.slug })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, session.user.id))
    .limit(1);
  if (!m) redirect('/login?error=NoMembership');
  redirect(`/admin/${m.slug}`);
}
