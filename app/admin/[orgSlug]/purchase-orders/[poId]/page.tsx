import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasRole, requireMember } from '@/lib/tenant/context';
import { getPurchaseOrder } from '@/lib/purchasing/windows';
import { Badge } from '@/components/ui/badge';
import { PoLinesReceive } from '@/components/admin/PurchaseOrderView';

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ orgSlug: string; poId: string }>;
}) {
  const { orgSlug, poId } = await params;
  const { org, role } = await requireMember(orgSlug, 'volunteer');
  const d = await getPurchaseOrder(org.id, poId);
  if (!d) notFound();
  const fmt = (x: Date) =>
    x.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: org.timezone });
  return (
    <div className="grid gap-4">
      <div>
        {d.window ? (
          <Link
            href={`/admin/${org.slug}/preorders/${d.window.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {d.window.name}
          </Link>
        ) : (
          <Link
            href={`/admin/${org.slug}/preorders`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Pre-orders
          </Link>
        )}
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          Purchase order · {d.po.vendorName}
          <Badge variant="outline" className="capitalize">
            {d.po.status.replace('_', ' ')}
          </Badge>
        </h1>
        <div className="text-sm text-muted-foreground">
          Created {fmt(d.po.createdAt)}
          {d.po.submittedAt ? ` · sent ${fmt(d.po.submittedAt)}` : ''}
          {d.po.receivedAt ? ` · received ${fmt(d.po.receivedAt)}` : ''}
          {d.po.vendorContact ? ` · ${d.po.vendorContact}` : ''}
        </div>
        {d.po.notes && <p className="mt-1 text-sm">{d.po.notes}</p>}
      </div>
      <PoLinesReceive
        orgSlug={org.slug}
        poId={d.po.id}
        lines={d.lines}
        canReceive={hasRole(role, 'volunteer')}
        canEdit={hasRole(role, 'admin')}
        status={d.po.status}
      />
    </div>
  );
}
