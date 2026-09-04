import Link from 'next/link';
import { requireMember, hasRole } from '@/lib/tenant/context';
import { listProductsAdmin } from '@/lib/catalog/queries';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdjustDialog, ReceiveDialog, VerifyLedgerButton } from '@/components/admin/StockDialogs';

export default async function InventoryPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org, role } = await requireMember(orgSlug);
  const products = await listProductsAdmin(org.id);
  const stockProducts = products.filter((p) => p.saleMode === 'stock');
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <div className="flex gap-2">
          <VerifyLedgerButton orgSlug={org.slug} />
          <Link
            href={`/admin/${org.slug}/inventory/ledger`}
            className="inline-flex h-7 items-center rounded-md border px-2.5 text-[0.8rem] hover:bg-muted"
          >
            Ledger
          </Link>
        </div>
      </div>
      {stockProducts.map((p) => (
        <section key={p.id} className="grid gap-2">
          <h2 className="flex items-center gap-2 font-medium">
            <Link href={`/admin/${org.slug}/products/${p.id}`} className="hover:underline">
              {p.name}
            </Link>
            {p.status !== 'active' && (
              <Badge variant="outline" className="capitalize">
                {p.status}
              </Badge>
            )}
          </h2>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.variants.map((v) => {
                  const low = v.available <= v.lowStockThreshold;
                  const label = `${p.name} · ${v.label}`;
                  return (
                    <TableRow key={v.id} className={v.active ? '' : 'opacity-50'}>
                      <TableCell>
                        {v.label}
                        {!v.active && <span className="ml-2 text-xs text-muted-foreground">inactive</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                      <TableCell className="text-right">{v.onHand}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{v.reserved}</TableCell>
                      <TableCell className="text-right">
                        <span className={low ? 'font-medium text-amber-700' : ''}>{v.available}</span>
                        {v.available === 0 && (
                          <Badge variant="destructive" className="ml-2">
                            Sold out
                          </Badge>
                        )}
                        {low && v.available > 0 && (
                          <Badge variant="outline" className="ml-2">
                            Low
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {hasRole(role, 'volunteer') && (
                            <ReceiveDialog orgSlug={org.slug} variantId={v.id} label={label} />
                          )}
                          {hasRole(role, 'admin') && (
                            <AdjustDialog
                              orgSlug={org.slug}
                              variantId={v.id}
                              label={label}
                              onHand={v.onHand}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
      {stockProducts.length === 0 && (
        <p className="text-sm text-muted-foreground">No stocked products yet.</p>
      )}
    </div>
  );
}
