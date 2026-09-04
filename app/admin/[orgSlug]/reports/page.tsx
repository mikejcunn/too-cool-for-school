import Link from 'next/link';
import { requireMember } from '@/lib/tenant/context';
import { beneficiaryEarnings, unallocatedCents } from '@/lib/allocation/report-queries';
import { periodTotals, posSessionSummaries, salesByProduct, tenderSummary } from '@/lib/reports/queries';
import { formatCents } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReportRange } from '@/components/admin/ReportRange';

export function parseRange(sp: { from?: string; to?: string }): {
  from: Date;
  to: Date;
  fromStr: string;
  toStr: string;
} {
  const today = new Date();
  const defFrom = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? new Date(sp.from + 'T00:00:00') : defFrom;
  const toInclusive = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? new Date(sp.to + 'T00:00:00') : today;
  const to = new Date(toInclusive.getFullYear(), toInclusive.getMonth(), toInclusive.getDate() + 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from, to, fromStr: iso(from), toStr: iso(toInclusive) };
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireMember(orgSlug, 'viewer');
  const { from, to, fromStr, toStr } = parseRange(sp);
  const [totals, bens, unalloc, prods, tenders, sessions] = await Promise.all([
    periodTotals(org.id, from, to),
    beneficiaryEarnings(org.id, from, to),
    unallocatedCents(org.id, from, to),
    salesByProduct(org.id, from, to),
    tenderSummary(org.id, from, to),
    posSessionSummaries(org.id, from, to),
  ]);
  const net = totals.grossCents - totals.refundedCents;
  const csv = (report: string) =>
    `/admin/${org.slug}/reports/csv?report=${report}&from=${fromStr}&to=${toStr}`;
  const fmt = (d: Date) =>
    d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: org.timezone });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Paid orders by paid date. Refunds reduce the period they were issued in.
          </p>
        </div>
        <ReportRange orgSlug={org.slug} from={fromStr} to={toStr} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Orders" value={String(totals.orders)} />
        <Stat
          label="Net sales"
          value={formatCents(net)}
          sub={totals.refundedCents ? `after ${formatCents(totals.refundedCents)} refunds` : undefined}
        />
        <Stat label="Cost of goods" value={formatCents(totals.cogsCents)} />
        <Stat
          label="Margin"
          value={formatCents(net - totals.cogsCents)}
          sub={net > 0 ? `${Math.round(((net - totals.cogsCents) / net) * 100)}%` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Beneficiary earnings
            <Link
              href={csv('beneficiaries')}
              className="text-sm font-normal text-muted-foreground hover:underline"
            >
              CSV
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Beneficiary</TableHead>
                <TableHead className="text-right">From sales</TableHead>
                <TableHead className="text-right">Refunds</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bens.map((b) => (
                <TableRow key={b.beneficiaryId}>
                  <TableCell>
                    <Link
                      href={`/admin/${org.slug}/reports/beneficiary/${b.beneficiaryId}?from=${fromStr}&to=${toStr}`}
                      className="hover:underline"
                    >
                      {b.name}
                    </Link>
                    {!b.active && <span className="ml-2 text-xs text-muted-foreground">inactive</span>}
                  </TableCell>
                  <TableCell className="text-right">{formatCents(b.saleCents)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {b.refundCents ? `−${formatCents(-b.refundCents)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCents(b.netCents)}</TableCell>
                </TableRow>
              ))}
              {unalloc > 0 && (
                <TableRow className="text-amber-800">
                  <TableCell>Unallocated (items sold with no rule)</TableCell>
                  <TableCell className="text-right">{formatCents(unalloc)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right">{formatCents(unalloc)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Sales by product
            <Link
              href={csv('products')}
              className="text-sm font-normal text-muted-foreground hover:underline"
            >
              CSV
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Refunds</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prods.map((p) => (
                <TableRow key={p.productId}>
                  <TableCell>
                    {p.productName}
                    {p.saleMode === 'preorder' && (
                      <span className="ml-1 text-xs text-muted-foreground">pre-order</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.units - p.refundedUnits}
                    {p.refundedUnits > 0 && (
                      <span className="text-xs text-muted-foreground"> ({p.refundedUnits} ref.)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatCents(p.grossCents)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {p.refundedCents ? `−${formatCents(p.refundedCents)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCents(p.cogsCents)}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCents(p.marginCents)}</TableCell>
                </TableRow>
              ))}
              {prods.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No paid orders in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payments by tender</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tender</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Refunded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenders.map((t) => (
                  <TableRow key={t.tender}>
                    <TableCell className="capitalize">{t.tender}</TableCell>
                    <TableCell className="text-right">{t.count}</TableCell>
                    <TableCell className="text-right">{formatCents(t.salesCents)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {t.refundsCents ? `−${formatCents(t.refundsCents)}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>POS sessions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <div className="font-medium">{s.eventName ?? 'No event'}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmt(s.openedAt)}
                    {s.closedAt ? ` → ${fmt(s.closedAt)}` : ' · open'} · {s.openedBy}
                  </div>
                </div>
                <div className="text-right">
                  <div>
                    {s.orders} sales · {formatCents(s.salesCents)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    cash {formatCents(s.cashCents)}
                    {s.endingCashCents != null && (
                      <>
                        {' '}
                        · counted {formatCents(s.endingCashCents)} vs{' '}
                        {formatCents(s.startingCashCents + s.cashCents)} expected
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {sessions.length === 0 && <p className="text-muted-foreground">No POS sessions in this range.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
