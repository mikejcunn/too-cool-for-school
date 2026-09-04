import { NextResponse, type NextRequest } from 'next/server';
import { requireMember } from '@/lib/tenant/context';
import { beneficiaryEarnings } from '@/lib/allocation/report-queries';
import { salesByProduct } from '@/lib/reports/queries';
import { parseRange } from '../page';

const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const dollars = (c: number) => (c / 100).toFixed(2);

export async function GET(req: NextRequest, ctx: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await ctx.params;
  const { org } = await requireMember(orgSlug, 'viewer');
  const sp = req.nextUrl.searchParams;
  const { from, to, fromStr, toStr } = parseRange({
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
  });
  const report = sp.get('report');
  let rows: (string | number | null)[][];
  if (report === 'beneficiaries') {
    const data = await beneficiaryEarnings(org.id, from, to);
    rows = [
      ['Beneficiary', 'From sales (USD)', 'Refunds (USD)', 'Net (USD)'],
      ...data.map((b) => [b.name, dollars(b.saleCents), dollars(b.refundCents), dollars(b.netCents)]),
    ];
  } else if (report === 'products') {
    const data = await salesByProduct(org.id, from, to);
    rows = [
      ['Product', 'Units', 'Refunded units', 'Gross (USD)', 'Refunds (USD)', 'COGS (USD)', 'Margin (USD)'],
      ...data.map((p) => [
        p.productName,
        p.units,
        p.refundedUnits,
        dollars(p.grossCents),
        dollars(p.refundedCents),
        dollars(p.cogsCents),
        dollars(p.marginCents),
      ]),
    ];
  } else {
    return new NextResponse('Unknown report', { status: 400 });
  }
  const body = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${org.slug}-${report}-${fromStr}-to-${toStr}.csv"`,
    },
  });
}
