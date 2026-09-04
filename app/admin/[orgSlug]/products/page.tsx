import Link from 'next/link';
import { requireMember } from '@/lib/tenant/context';
import { listProductsAdmin } from '@/lib/catalog/queries';
import { formatCents } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ archived?: string }>;
}) {
  const { orgSlug } = await params;
  const { archived } = await searchParams;
  const { org } = await requireMember(orgSlug);
  const products = await listProductsAdmin(org.id, archived === '1');
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <div className="flex gap-2">
          <Button
            nativeButton={false}
            render={<Link href={`/admin/${org.slug}/products?archived=${archived === '1' ? '0' : '1'}`} />}
            variant="ghost"
            size="sm"
          >
            {archived === '1' ? 'Hide archived' : 'Show archived'}
          </Button>
          <Button nativeButton={false} render={<Link href={`/admin/${org.slug}/products/new`} />}>
            New product
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">COGS</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">MSRP</TableHead>
              <TableHead className="text-right">Variants</TableHead>
              <TableHead className="text-right">Available</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/admin/${org.slug}/products/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  {p.category && <div className="text-xs text-muted-foreground">{p.category}</div>}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      p.status === 'active' ? 'default' : p.status === 'draft' ? 'outline' : 'secondary'
                    }
                    className="capitalize"
                  >
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="capitalize">
                  {p.saleMode === 'preorder' ? 'Pre-order' : 'Stock'}
                </TableCell>
                <TableCell className="text-right">{formatCents(p.priceCents)}</TableCell>
                <TableCell className="text-right">{formatCents(p.cogsCents)}</TableCell>
                <TableCell className="text-right">
                  {formatCents(p.priceCents - p.cogsCents)}
                  {p.priceCents > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({Math.round(((p.priceCents - p.cogsCents) / p.priceCents) * 100)}%)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {p.msrpCents != null ? formatCents(p.msrpCents) : '—'}
                </TableCell>
                <TableCell className="text-right">{p.variants.filter((v) => v.active).length}</TableCell>
                <TableCell className="text-right">
                  {p.saleMode === 'preorder' ? '—' : p.totalAvailable}
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No products yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
