import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember, hasRole } from '@/lib/tenant/context';
import { getOrderDetail } from '@/lib/orders/queries';
import { formatCents } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { statusVariant } from '@/components/admin/OrdersTable';
import { FulfilButton } from '@/components/admin/FulfilButton';
import { RefundDialog } from '@/components/admin/RefundDialog';
import { ResolvePaymentDialog } from '@/components/admin/ResolvePaymentDialog';

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; orderId: string }>;
}) {
  const { orgSlug, orderId } = await params;
  const { org, role } = await requireMember(orgSlug);
  const d = await getOrderDetail(org.id, orderId);
  if (!d) notFound();
  const { order, lines, payments, refunds, allocations, pickupEvent } = d;
  const fmt = (x: Date) =>
    x.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: org.timezone });
  const refundable =
    ['paid', 'partially_refunded'].includes(order.status) && order.paidCents - order.refundedCents > 0;
  const allocByLine = new Map<string, { name: string; cents: number }[]>();
  for (const a of allocations) {
    const arr = allocByLine.get(a.orderLineId) ?? [];
    const hit = arr.find((x) => x.name === a.beneficiaryName);
    if (hit) hit.cents += a.amountCents;
    else arr.push({ name: a.beneficiaryName, cents: a.amountCents });
    allocByLine.set(a.orderLineId, arr);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/admin/${org.slug}/orders`} className="text-sm text-muted-foreground hover:underline">
            ← Orders
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            {order.orderNumber}
            <Badge variant={statusVariant(order.status)} className="capitalize">
              {order.status.replace('_', ' ')}
            </Badge>
            {order.channel === 'pos' && <Badge variant="outline">POS</Badge>}
          </h1>
          <div className="text-sm text-muted-foreground">
            Placed {fmt(order.createdAt)}
            {order.paidAt ? ` · paid ${fmt(order.paidAt)}` : ''}
          </div>
        </div>
        <div className="flex gap-2">
          {['paid', 'partially_refunded'].includes(order.status) && hasRole(role, 'volunteer') && (
            <FulfilButton
              orgSlug={org.slug}
              orderId={order.id}
              fulfilled={order.fulfillmentStatus === 'fulfilled'}
            />
          )}
          {refundable && hasRole(role, 'admin') && (
            <RefundDialog
              orgSlug={org.slug}
              orderId={order.id}
              remainingCents={order.paidCents - order.refundedCents}
              tender={
                payments.find((p) => ['approved', 'partially_refunded', 'refunded'].includes(p.status))
                  ?.tender ?? 'card'
              }
              lines={lines.map((l) => ({
                id: l.id,
                label: `${l.productName} (${l.variantLabel})`,
                unitPriceCents: l.unitPriceCents,
                refundable: l.quantity - l.refundedQuantity,
                isPreorder: l.isPreorder,
              }))}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Line</TableHead>
                    <TableHead>Beneficiaries</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium">{l.productName}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.variantLabel} · {l.sku}
                          {l.isPreorder && (
                            <Badge variant="secondary" className="ml-2">
                              Pre-order
                            </Badge>
                          )}
                          {l.refundedQuantity > 0 && (
                            <span className="ml-2 text-destructive">{l.refundedQuantity} refunded</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{l.quantity}</TableCell>
                      <TableCell className="text-right">{formatCents(l.unitPriceCents)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCents(l.unitCogsCents)}
                      </TableCell>
                      <TableCell className="text-right">{formatCents(l.lineSubtotalCents)}</TableCell>
                      <TableCell className="text-xs">
                        {(allocByLine.get(l.id) ?? []).map((a) => (
                          <div key={a.name}>
                            {a.name}: {formatCents(a.cents)}
                          </div>
                        ))}
                        {!allocByLine.get(l.id)?.length && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 grid justify-end gap-1 text-sm">
                <Row label="Subtotal" value={formatCents(order.subtotalCents)} />
                {order.taxCents > 0 && <Row label="Tax" value={formatCents(order.taxCents)} />}
                <Row label="Total" value={formatCents(order.totalCents)} strong />
                {order.refundedCents > 0 && (
                  <Row label="Refunded" value={`−${formatCents(order.refundedCents)}`} />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div>
                    <span className="capitalize">{p.tender}</span>
                    {p.cardBrand && ` · ${p.cardBrand}`}
                    {p.cardLast4 && ` •••• ${p.cardLast4}`}
                    {p.reference && ` · ${p.reference}`}
                    <div className="text-xs text-muted-foreground">
                      {fmt(p.createdAt)}
                      {p.runTransId && ` · ${p.runTransId}`}
                      {p.runRespText && ` · ${p.runRespText}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {(p.status === 'unknown' || p.status === 'pending') && hasRole(role, 'admin') && (
                      <ResolvePaymentDialog
                        orgSlug={org.slug}
                        orderId={order.id}
                        paymentId={p.id}
                        status={p.status}
                      />
                    )}
                    <Badge
                      variant={
                        p.status === 'approved'
                          ? 'default'
                          : p.status === 'pending' || p.status === 'unknown'
                            ? 'outline'
                            : 'secondary'
                      }
                      className="capitalize"
                    >
                      {p.status.replace('_', ' ')}
                    </Badge>
                    <span className="font-medium">{formatCents(p.amountCents)}</span>
                  </div>
                </div>
              ))}
              {refunds.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-3"
                >
                  <div>
                    Refund{r.reason ? ` · ${r.reason}` : ''}
                    <div className="text-xs text-muted-foreground">
                      {fmt(r.createdAt)}
                      {r.runTransId && ` · ${r.runTransId}`}
                      {r.restock ? ' · restocked' : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={r.status === 'approved' ? 'secondary' : 'outline'} className="capitalize">
                      {r.status}
                    </Badge>
                    <span className="font-medium">−{formatCents(r.amountCents)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <div className="font-medium">{order.customerName ?? '—'}</div>
              {order.customerEmail && (
                <a className="hover:underline" href={`mailto:${order.customerEmail}`}>
                  {order.customerEmail}
                </a>
              )}
              {order.customerPhone && <div>{order.customerPhone}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Fulfilment
                {['paid', 'partially_refunded'].includes(order.status) && (
                  <Badge
                    variant={order.fulfillmentStatus === 'fulfilled' ? 'secondary' : 'outline'}
                    className="capitalize"
                  >
                    {order.fulfillmentStatus}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {order.fulfillmentMethod === 'classroom' ? (
                <>
                  <div>Classroom delivery</div>
                  <div className="font-medium">{order.studentName}</div>
                  <div className="text-muted-foreground">
                    {order.teacherName}
                    {order.grade ? ` · Grade ${order.grade}` : ''}
                  </div>
                </>
              ) : order.fulfillmentMethod === 'pickup' ? (
                <>
                  <div>Event pickup</div>
                  <div className="font-medium">{pickupEvent?.name ?? '—'}</div>
                  {pickupEvent && <div className="text-muted-foreground">{fmt(pickupEvent.startsAt)}</div>}
                </>
              ) : (
                <div>Handed over in person</div>
              )}
              {order.fulfilledAt && (
                <div className="text-xs text-muted-foreground">Fulfilled {fmt(order.fulfilledAt)}</div>
              )}
              {order.notes && <div className="mt-2 rounded bg-muted p-2 text-xs">{order.notes}</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex w-64 justify-between ${strong ? 'font-semibold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
