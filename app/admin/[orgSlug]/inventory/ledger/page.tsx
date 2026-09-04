import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { db } from '@/lib/db';
import { inventoryMovements, productVariants, products, users } from '@/lib/db/schema';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { orgSlug } = await params;
  const { variant } = await searchParams;
  const { org } = await requireMember(orgSlug);
  const rows = await db
    .select({
      m: inventoryMovements,
      sku: productVariants.sku,
      label: productVariants.label,
      product: products.name,
      by: users.email,
    })
    .from(inventoryMovements)
    .innerJoin(productVariants, eq(productVariants.id, inventoryMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(users, eq(users.id, inventoryMovements.createdBy))
    .where(
      variant
        ? and(eq(inventoryMovements.orgId, org.id), eq(inventoryMovements.variantId, variant))
        : eq(inventoryMovements.orgId, org.id)
    )
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(300);
  const fmt = (d: Date) =>
    d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: org.timezone });
  return (
    <div className="grid gap-4">
      <div>
        <Link href={`/admin/${org.slug}/inventory`} className="text-sm text-muted-foreground hover:underline">
          ← Inventory
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory ledger</h1>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">On hand after</TableHead>
              <TableHead className="text-right">Reserved after</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ m, sku, label, product, by }) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{fmt(m.createdAt)}</TableCell>
                <TableCell>
                  {product} <span className="text-muted-foreground">· {label}</span>
                  <div className="font-mono text-xs text-muted-foreground">{sku}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {m.type.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className={`text-right ${m.quantity < 0 ? 'text-destructive' : ''}`}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </TableCell>
                <TableCell className="text-right">{m.onHandAfter}</TableCell>
                <TableCell className="text-right text-muted-foreground">{m.reservedAfter}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {m.referenceType}
                  {m.note ? ` · ${m.note}` : ''}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{by ?? 'system'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
