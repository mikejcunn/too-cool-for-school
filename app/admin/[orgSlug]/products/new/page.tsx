import Link from 'next/link';
import { requireMember } from '@/lib/tenant/context';
import { listPreorderWindows } from '@/lib/catalog/queries';
import { ProductForm, emptyProduct } from '@/components/admin/ProductForm';

export default async function NewProductPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireMember(orgSlug, 'admin');
  const windows = await listPreorderWindows(org.id);
  return (
    <div className="grid gap-4">
      <div>
        <Link href={`/admin/${org.slug}/products`} className="text-sm text-muted-foreground hover:underline">
          ← Products
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
      </div>
      <ProductForm
        orgSlug={org.slug}
        initial={emptyProduct}
        windows={windows.map((w) => ({ id: w.id, label: `${w.name} (${w.status})` }))}
      />
    </div>
  );
}
