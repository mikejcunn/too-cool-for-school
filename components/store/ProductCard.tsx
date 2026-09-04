import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ProductView } from '@/lib/catalog/queries';
import { preorderState } from '@/lib/catalog/queries';
import { Price } from './Price';

export function ProductCard({ orgSlug, product }: { orgSlug: string; product: ProductView }) {
  const img = product.images[0];
  const isPre = product.saleMode === 'preorder';
  const soldOut = !isPre && product.totalAvailable === 0;
  const pre = preorderState(product);
  const preLabel =
    pre === 'open'
      ? 'Pre-order'
      : pre === 'upcoming'
        ? `Opens ${product.window!.opensAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'Pre-order closed';
  return (
    <Link href={`/s/${orgSlug}/products/${product.slug}`} className="group block">
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
        <div className="aspect-square bg-muted">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.url} alt={img.alt ?? product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl text-muted-foreground/40">
              {product.name.slice(0, 1)}
            </div>
          )}
        </div>
        <CardContent className="grid gap-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium leading-tight">{product.name}</h3>
            {isPre && <Badge variant={pre === 'open' ? 'secondary' : 'outline'}>{preLabel}</Badge>}
            {soldOut && <Badge variant="outline">Sold out</Badge>}
          </div>
          <Price cents={product.fromPriceCents} compareAtCents={product.msrpCents} className="text-sm" />
        </CardContent>
      </Card>
    </Link>
  );
}
