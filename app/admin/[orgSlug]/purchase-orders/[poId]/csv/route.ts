import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/tenant/context';
import { getPurchaseOrder } from '@/lib/purchasing/windows';

export async function GET(_req: Request, ctx: { params: Promise<{ orgSlug: string; poId: string }> }) {
  const { orgSlug, poId } = await ctx.params;
  const { org } = await requireMember(orgSlug, 'viewer');
  const d = await getPurchaseOrder(org.id, poId);
  if (!d) return new NextResponse('Not found', { status: 404 });
  const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['SKU', 'Product', 'Variant', 'Quantity', 'Unit cost (USD)', 'Line cost (USD)'],
    ...d.lines.map((l) => [
      l.sku,
      l.productName,
      l.label,
      l.quantityOrdered,
      (l.unitCostCents / 100).toFixed(2),
      ((l.unitCostCents * l.quantityOrdered) / 100).toFixed(2),
    ]),
  ];
  const body = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const name = `${org.slug}-PO-${d.po.createdAt.toISOString().slice(0, 10)}-${d.po.id.slice(0, 8)}.csv`;
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
