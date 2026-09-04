import { asc, eq } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { db } from '@/lib/db';
import { classrooms, memberships, users } from '@/lib/db/schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClassroomsEditor, OrgSettingsForm, TeamEditor } from '@/components/admin/SettingsForms';

export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org, user } = await requireMember(orgSlug, 'admin');
  const [rooms, team] = await Promise.all([
    db
      .select()
      .from(classrooms)
      .where(eq(classrooms.orgId, org.id))
      .orderBy(asc(classrooms.sortOrder), asc(classrooms.teacherName)),
    db
      .select({ userId: memberships.userId, role: memberships.role, email: users.email, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, org.id))
      .orderBy(asc(users.email)),
  ]);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Store branding, payment account, and money rules.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrgSettingsForm
            orgSlug={org.slug}
            initial={{
              name: org.name,
              shortName: org.shortName ?? '',
              contactEmail: org.contactEmail ?? '',
              brandColor: org.brandColor ?? '',
              logoUrl: org.logoUrl ?? '',
              timezone: org.timezone,
              runMid: org.runMid ?? '',
              runPublicKey: org.runPublicKey ?? '',
              allocationBasis: org.allocationBasis,
              taxRateBps: org.taxRateBps,
              orderPrefix: org.orderPrefix,
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Classrooms</CardTitle>
          <CardDescription>Shown to shoppers who choose classroom delivery.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClassroomsEditor orgSlug={org.slug} rows={rooms} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>
            Volunteers and admins who can sign in. They log in with a magic link sent to their email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamEditor orgSlug={org.slug} rows={team.map((m) => ({ ...m, isSelf: m.userId === user.id }))} />
        </CardContent>
      </Card>
    </div>
  );
}
