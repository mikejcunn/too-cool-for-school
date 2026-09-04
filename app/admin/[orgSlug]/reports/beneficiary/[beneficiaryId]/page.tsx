import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { db } from '@/lib/db';
import { beneficiaries } from '@/lib/db/schema';
import { beneficiaryDrilldown } from '@/lib/allocation/report-queries';
import { formatCents } from '@/lib/money';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parseRange } from '../../page';

export default async function BeneficiaryReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; beneficiaryId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { orgSlug, beneficiaryId } = await params;
  const sp = await searchParams;
  const { org } = await requireMember(orgSlug, 'viewer');
  const [b] = await db
    .select()
    .from(beneficiaries)
    .where(and(eq(beneficiaries.id, beneficiaryId), eq(beneficiaries.orgId, org.id)));
  if (!b) notFound();
  const { from, to, fromStr, toStr } = parseRange(sp);
  const rows = await beneficiaryDrilldown(org.id, b.id, from, to);
  const total = rows.reduce((n, r) => n + r.amountCents, 0);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: org.timezone });
  return (
    <div className="grid gap-4">
      <div>
        <Link
          href={`/admin/${org.slug}/reports?from=${fromStr}&to=${toStr}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Reports
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{b.name}</h1>
        <p className="text-sm text-muted-foreground">
          {fromStr} to {toStr} · net {formatCents(total)}
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-nowrap">{fmt(r.effectiveAt)}</TableCell>
                <TableCell>
                  <Link href={`/admin/${org.slug}/orders/${r.orderId}`} className="hover:underline">
                    {r.orderNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  {r.productName} <span className="text-muted-foreground">· {r.variantLabel}</span>
                </TableCell>
                <TableCell className="text-right">{r.quantity}</TableCell>
                <TableCell className="capitalize">{r.kind}</TableCell>
                <TableCell className={`text-right ${r.amountCents < 0 ? 'text-destructive' : ''}`}>
                  {formatCents(r.amountCents)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nothing in this range.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
