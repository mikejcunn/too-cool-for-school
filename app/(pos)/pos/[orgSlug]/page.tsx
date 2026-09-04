import Link from 'next/link';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { listOpenPosSessions } from '@/lib/pos/queries';
import { OpenSessionForm } from '@/components/pos/OpenSessionForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function PosIndex({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org, user } = await requireMember(orgSlug, 'volunteer', `/pos/${orgSlug}`);
  const [open, evs] = await Promise.all([
    listOpenPosSessions(org.id),
    db
      .select()
      .from(events)
      .where(
        and(
          eq(events.orgId, org.id),
          eq(events.active, true),
          inArray(events.kind, ['sale', 'both']),
          gte(events.startsAt, new Date(Date.now() - 2 * 86_400_000))
        )
      )
      .orderBy(asc(events.startsAt)),
  ]);
  const fmt = (d: Date) =>
    d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: org.timezone });
  return (
    <div className="mx-auto grid max-w-lg gap-6 p-4">
      {open.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Open sessions</CardTitle>
            <CardDescription>Resume a register that is already open.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {open.map(({ session, eventName, openedByEmail }) => (
              <Link
                key={session.id}
                href={`/pos/${org.slug}/${session.id}`}
                className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
              >
                <span>
                  <span className="font-medium">{eventName ?? 'No event'}</span>
                  <span className="block text-xs text-muted-foreground">
                    Opened {fmt(session.openedAt)} by {openedByEmail === user.email ? 'you' : openedByEmail}
                  </span>
                </span>
                <span className="text-primary">Resume →</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Open a register</CardTitle>
          <CardDescription>Pick the event and count the starting cash.</CardDescription>
        </CardHeader>
        <CardContent>
          <OpenSessionForm
            orgSlug={org.slug}
            events={evs.map((e) => ({ id: e.id, label: `${e.name} · ${fmt(e.startsAt)}` }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
