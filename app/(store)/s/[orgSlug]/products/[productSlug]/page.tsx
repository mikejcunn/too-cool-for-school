import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { requireOrg } from '@/lib/tenant/context';
import { getActiveProductBySlug, preorderOpen, preorderState } from '@/lib/catalog/queries';
import { AddToCart } from '@/components/store/AddToCart';
import { Price } from '@/components/store/Price';

export default async function ProductPage({
  params,
}: {
  params: Promise<{ orgSlug: string; productSlug: string }>;
}) {
  const { orgSlug, productSlug } = await params;
  const org = await requireOrg(orgSlug);
  const product = await getActiveProductBySlug(org.id, productSlug);
  if (!product) notFound();
  const isPre = product.saleMode === 'preorder';
  const orderable = isPre ? preorderOpen(product) : product.totalAvailable > 0;
  const img = product.images[0];
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: org.timezone });

  return (
    <div className="grid gap-6">
      <Link
        href={`/s/${org.slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> All items
      </Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-lg bg-muted">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.url} alt={img.alt ?? product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl text-muted-foreground/30">
              {product.name.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="grid content-start gap-5">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
              {isPre && <Badge variant="secondary">Pre-order</Badge>}
            </div>
            <Price cents={product.fromPriceCents} compareAtCents={product.msrpCents} className="text-xl" />
            {product.description && <p className="text-muted-foreground">{product.description}</p>}
          </div>
          {isPre && product.window && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              {preorderOpen(product) ? (
                <>
                  Pre-orders close <strong>{fmt(product.window.closesAt)}</strong>.
                  {product.window.expectedDeliveryOn && (
                    <>
                      {' '}
                      Expected delivery around{' '}
                      <strong>
                        {new Date(product.window.expectedDeliveryOn + 'T12:00:00').toLocaleDateString(
                          'en-US',
                          { month: 'short', day: 'numeric' }
                        )}
                      </strong>
                      .
                    </>
                  )}
                </>
              ) : preorderState(product) === 'upcoming' ? (
                <>
                  Pre-orders open <strong>{fmt(product.window.opensAt)}</strong> and close{' '}
                  <strong>{fmt(product.window.closesAt)}</strong>.
                </>
              ) : (
                <>Pre-orders for this item are closed.</>
              )}
            </div>
          )}
          <AddToCart
            orgSlug={org.slug}
            variants={product.variants}
            isPreorder={isPre}
            orderable={orderable}
            unavailableLabel={preorderState(product) === 'upcoming' ? 'Not open yet' : undefined}
          />
        </div>
      </div>
    </div>
  );
}
