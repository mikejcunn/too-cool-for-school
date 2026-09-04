import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/tenant/context';
import { getWindowDetail } from '@/lib/purchasing/windows';
import { formatCents } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreatePoDialog, WindowDialog, WindowStatusButtons } from '@/components/admin/PreorderWindows';

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default async function WindowDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; windowId: string }>;
}) {
  const { orgSlug, windowId } = await params;
  const { org } = await requireMember(orgSlug, 'admin');
  const d = await getWindowDetail(org.id, windowId);
  if (!d) notFound();
  const { window: w, demand, purchaseOrders: pos } = d;
  const fmt = (x: Date) =>
    x.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: org.timezone });
  const needed = demand.reduce((n, r) => n + Math.max(0, r.demandQty - r.orderedQty), 0);
  const totalUnits = demand.reduce((n, r) => n + r.demandQty, 0);
  const totalCost = demand.reduce((n, r) => n + r.demandQty * r.unitCogsCents, 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/admin/${org.slug}/preorders`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Pre-orders
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            {w.name}
            <Badge variant={w.status === 'open' ? 'default' : 'outline'} className="capitalize">
              {w.status}
            </Badge>
          </h1>
          <div className="text-sm text-muted-foreground">
            {fmt(w.opensAt)} → {fmt(w.closesAt)}
            {w.expectedDeliveryOn ? ` · expected delivery ${w.expectedDeliveryOn}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <WindowDialog
            orgSlug={org.slug}
            initial={{
              id: w.id,
              name: w.name,
              opensAt: local(w.opensAt),
              closesAt: local(w.closesAt),
              expectedDeliveryOn: w.expectedDeliveryOn ?? '',
              notes: w.notes ?? '',
            }}
            trigger={
              <Button variant="outline" size="sm">
                Edit
              </Button>
            }
          />
          <WindowStatusButtons orgSlug={org.slug} windowId={w.id} status={w.status} />
          <CreatePoDialog
            orgSlug={org.slug}
            windowId={w.id}
            unitsNeeded={needed}
            disabled={needed === 0 || w.status === 'open' || w.status === 'draft' || w.status === 'cancelled'}
          />
        </div>
      </div>
      {w.status === 'open' && needed > 0 && (
        <p className="text-sm text-amber-700">
          Close the window before creating a purchase order so late orders are not missed.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Orders" value={String(d.orderCount)} />
        <Stat label="Units pre-ordered" value={String(totalUnits)} />
        <Stat label="Estimated cost" value={formatCents(totalCost)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Demand by variant</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Ordered by families</TableHead>
                <TableHead className="text-right">On POs</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demand.map((r) => (
                <TableRow key={r.variantId} className={r.demandQty === 0 ? 'text-muted-foreground' : ''}>
                  <TableCell>
                    {r.productName} <span className="text-muted-foreground">· {r.variantLabel}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="text-right font-medium">{r.demandQty}</TableCell>
                  <TableCell className="text-right">{r.orderedQty}</TableCell>
                  <TableCell className="text-right">{r.receivedQty}</TableCell>
                  <TableCell className="text-right">{formatCents(r.unitCogsCents)}</TableCell>
                </TableRow>
              ))}
              {demand.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No products are assigned to this window yet. Set a product&apos;s sale mode to Pre-order
                    and pick this window.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase orders</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {pos.map((po) => (
            <Link
              key={po.id}
              href={`/admin/${org.slug}/purchase-orders/${po.id}`}
              className="flex items-center justify-between rounded-md border p-3 hover:bg-muted"
            >
              <span>
                <span className="font-medium">{po.vendorName}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {po.lineCount} lines · {fmt(po.createdAt)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span>{formatCents(po.totalCostCents)}</span>
                <Badge variant="outline" className="capitalize">
                  {po.status.replace('_', ' ')}
                </Badge>
              </span>
            </Link>
          ))}
          {pos.length === 0 && <p className="text-muted-foreground">None yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
