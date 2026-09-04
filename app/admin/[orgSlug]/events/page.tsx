import { desc, eq } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { EventsEditor } from '@/components/admin/EventsEditor';

export default async function EventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireMember(orgSlug, 'admin');
  const rows = await db.select().from(events).where(eq(events.orgId, org.id)).orderBy(desc(events.startsAt));
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-muted-foreground">
          Pickup days and in-person sale events. Shoppers see active pickup events at checkout; POS sessions
          attach to sale events.
        </p>
      </div>
      <EventsEditor
        orgSlug={org.slug}
        timezone={org.timezone}
        rows={rows.map((e) => ({
          id: e.id,
          name: e.name,
          startsAt: e.startsAt.toISOString(),
          endsAt: e.endsAt?.toISOString() ?? null,
          location: e.location,
          kind: e.kind,
          active: e.active,
          notes: e.notes,
        }))}
      />
    </div>
  );
}
