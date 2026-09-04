import type { Metadata } from 'next';
import { requireOrg } from '@/lib/tenant/context';
import { listActiveProducts } from '@/lib/catalog/queries';
import { ProductCard } from '@/components/store/ProductCard';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const org = await requireOrg(orgSlug);
  return { title: `${org.name} Store` };
}

export default async function StorefrontPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await requireOrg(orgSlug);
  const products = await listActiveProducts(org.id);
  const categories = [...new Set(products.map((p) => p.category ?? 'Other'))];

  return (
    <div className="grid gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Spirit wear &amp; merch</h1>
        <p className="mt-1 text-muted-foreground">Every purchase supports programs at our school.</p>
      </section>
      {products.length === 0 ? (
        <p className="text-muted-foreground">Nothing for sale right now. Check back soon!</p>
      ) : (
        categories.map((cat) => (
          <section key={cat} className="grid gap-3">
            {categories.length > 1 && <h2 className="text-lg font-medium">{cat}</h2>}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products
                .filter((p) => (p.category ?? 'Other') === cat)
                .map((p) => (
                  <ProductCard key={p.id} orgSlug={org.slug} product={p} />
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
