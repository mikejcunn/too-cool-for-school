import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/tenant/context';
import { getProductAdmin, listPreorderWindows } from '@/lib/catalog/queries';
import { ProductForm, type ProductFormValues } from '@/components/admin/ProductForm';
import { Badge } from '@/components/ui/badge';

const dollars = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ orgSlug: string; productId: string }>;
}) {
  const { orgSlug, productId } = await params;
  const { org } = await requireMember(orgSlug, 'admin');
  const [p, windows] = await Promise.all([getProductAdmin(org.id, productId), listPreorderWindows(org.id)]);
  if (!p) notFound();
  const initial: ProductFormValues = {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    category: p.category ?? '',
    status: p.status,
    saleMode: p.saleMode,
    preorderWindowId: p.preorderWindowId ?? '',
    price: dollars(p.priceCents),
    cogs: dollars(p.cogsCents),
    msrp: dollars(p.msrpCents),
    imageUrl: p.images[0]?.url ?? '',
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      size: v.size ?? '',
      color: v.color ?? '',
      label: v.label,
      price: dollars(v.priceCentsOverride),
      cogs: dollars(v.cogsCentsOverride),
      msrp: dollars(v.msrpCentsOverride),
      initialOnHand: '0',
      lowStockThreshold: String(v.lowStockThreshold),
      onHand: v.onHand,
      active: v.active,
      isNew: false,
    })),
  };
  return (
    <div className="grid gap-4">
      <div>
        <Link href={`/admin/${org.slug}/products`} className="text-sm text-muted-foreground hover:underline">
          ← Products
        </Link>
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          {p.name}
          <Badge variant="outline" className="capitalize">
            {p.status}
          </Badge>
          <Link
            href={`/s/${org.slug}/products/${p.slug}`}
            target="_blank"
            className="text-sm font-normal text-muted-foreground hover:underline"
          >
            View in store ↗
          </Link>
        </h1>
      </div>
      <ProductForm
        orgSlug={org.slug}
        initial={initial}
        windows={windows.map((w) => ({ id: w.id, label: `${w.name} (${w.status})` }))}
      />
    </div>
  );
}
