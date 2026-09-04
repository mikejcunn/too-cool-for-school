import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { OrderListRow } from '@/lib/orders/queries';
import { formatCents } from '@/lib/money';

export function statusVariant(
  s: OrderListRow['status']
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (s) {
    case 'paid':
      return 'default';
    case 'pending':
      return 'outline';
    case 'cancelled':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function OrdersTable({
  orgSlug,
  rows,
  timezone,
}: {
  orgSlug: string;
  rows: OrderListRow[];
  timezone: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No orders yet.</p>;
  const fmt = (d: Date) =>
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    });
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Placed</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Delivery</TableHead>
            <TableHead>Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Fulfilment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((o) => (
            <TableRow key={o.id}>
              <TableCell>
                <Link href={`/admin/${orgSlug}/orders/${o.id}`} className="font-medium hover:underline">
                  {o.orderNumber}
                </Link>
                {o.channel === 'pos' && <span className="ml-1 text-xs text-muted-foreground">POS</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{fmt(o.createdAt)}</TableCell>
              <TableCell>
                <div>{o.customerName ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{o.customerEmail}</div>
              </TableCell>
              <TableCell className="text-sm">
                {o.fulfillmentMethod === 'classroom' ? (
                  <>
                    <div>{o.studentName}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.teacherName}
                      {o.grade ? ` · Gr ${o.grade}` : ''}
                    </div>
                  </>
                ) : o.fulfillmentMethod === 'pickup' ? (
                  'Pickup'
                ) : (
                  'In person'
                )}
              </TableCell>
              <TableCell>{o.itemCount}</TableCell>
              <TableCell className="text-right">
                {formatCents(o.totalCents)}
                {o.tender === 'card' && o.cardLast4 ? (
                  <div className="text-xs text-muted-foreground">•••• {o.cardLast4}</div>
                ) : o.tender ? (
                  <div className="text-xs capitalize text-muted-foreground">{o.tender}</div>
                ) : null}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant(o.status)} className="capitalize">
                  {o.status.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell>
                {['paid', 'partially_refunded'].includes(o.status) ? (
                  <Badge
                    variant={o.fulfillmentStatus === 'fulfilled' ? 'secondary' : 'outline'}
                    className="capitalize"
                  >
                    {o.fulfillmentStatus}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
