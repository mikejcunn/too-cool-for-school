import Link from 'next/link';
import { requireMember } from '@/lib/tenant/context';
import { listWindows } from '@/lib/purchasing/windows';
import { formatCents } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { WindowDialog } from '@/components/admin/PreorderWindows';

export default async function PreordersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireMember(orgSlug, 'admin');
  const wins = await listWindows(org.id);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: org.timezone });
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pre-orders</h1>
          <p className="text-sm text-muted-foreground">
            Collect orders during a window, then buy exactly what was sold.
          </p>
        </div>
        <WindowDialog orgSlug={org.slug} trigger={<Button>New window</Button>} />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Window</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opens</TableHead>
              <TableHead>Closes</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Sales</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wins.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <Link href={`/admin/${org.slug}/preorders/${w.id}`} className="font-medium hover:underline">
                    {w.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={w.status === 'open' ? 'default' : 'outline'} className="capitalize">
                    {w.status}
                  </Badge>
                </TableCell>
                <TableCell>{fmt(w.opensAt)}</TableCell>
                <TableCell>{fmt(w.closesAt)}</TableCell>
                <TableCell className="text-right">{w.productCount}</TableCell>
                <TableCell className="text-right">{w.orderCount}</TableCell>
                <TableCell className="text-right">{w.demandUnits}</TableCell>
                <TableCell className="text-right">{formatCents(w.demandCents)}</TableCell>
              </TableRow>
            ))}
            {wins.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No pre-order windows yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
