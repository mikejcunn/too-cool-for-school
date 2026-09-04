import Link from 'next/link';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { memberships, orders, organizations } from '@/lib/db/schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreateOrgForm } from '@/components/platform/CreateOrgForm';
import { requirePlatformAdmin } from './actions';

export default async function PlatformOrgsPage() {
  await requirePlatformAdmin();
  const rows = await db
    .select({
      org: organizations,
      members: sql<number>`(select count(*) from ${memberships} m where m.org_id = ${organizations.id})::int`,
      paidOrders: sql<number>`(select count(*) from ${orders} o where o.org_id = ${organizations.id} and o.status in ('paid','partially_refunded','refunded'))::int`,
    })
    .from(organizations)
    .orderBy(asc(organizations.createdAt));
  void eq;
  return (
    <div className="mx-auto grid max-w-3xl gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-sm text-muted-foreground">
          Every school / PTO on the platform. Platform admins only.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Schools</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {rows.map(({ org, members, paidOrders }) => (
            <div
              key={org.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div>
                <div className="font-medium">
                  {org.name} <span className="text-muted-foreground">/{org.slug}</span>
                  {org.status !== 'active' && (
                    <Badge variant="outline" className="ml-2 capitalize">
                      {org.status}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {members} member{members === 1 ? '' : 's'} · {paidOrders} paid orders · MID{' '}
                  {org.runMid ?? 'not set'}
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <Link href={`/admin/${org.slug}`} className="hover:underline">
                  Admin
                </Link>
                <Link href={`/s/${org.slug}`} className="hover:underline">
                  Store
                </Link>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add a school</CardTitle>
          <CardDescription>
            Creates the org with a General Fund beneficiary, a 100% default allocation, and the first admin
            (they sign in with a magic link).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrgForm />
        </CardContent>
      </Card>
    </div>
  );
}
