import { desc, eq } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { db } from '@/lib/db';
import { auditLog, users } from '@/lib/db/schema';
import { Badge } from '@/components/ui/badge';

export default async function AuditPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireMember(orgSlug, 'admin');
  const rows = await db
    .select({ a: auditLog, actor: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(eq(auditLog.orgId, org.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(300);
  const fmt = (d: Date) =>
    d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: org.timezone });
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">Who changed what. Last 300 entries.</p>
      </div>
      <ul className="divide-y rounded-md border text-sm">
        {rows.map(({ a, actor }) => (
          <li key={a.id} className="grid gap-1 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{fmt(a.createdAt)}</span>
              <Badge variant="outline">{a.action}</Badge>
              <span className="text-muted-foreground">
                {a.entityType}
                {a.entityId ? ` ${a.entityId.slice(0, 8)}` : ''}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">{actor ?? a.actorType}</span>
            </div>
            {(a.before != null || a.after != null) && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">details</summary>
                <pre className="mt-1 overflow-x-auto rounded bg-muted p-2">
                  {JSON.stringify({ before: a.before ?? undefined, after: a.after ?? undefined }, null, 2)}
                </pre>
              </details>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-2 text-muted-foreground">Nothing yet.</li>}
      </ul>
    </div>
  );
}
