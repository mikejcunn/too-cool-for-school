import { requireOrg } from '@/lib/tenant/context';
import { loadCart } from '@/lib/checkout/cart';
import { CartView } from '@/components/store/CartView';

export const metadata = { title: 'Cart' };

export default async function CartPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await requireOrg(orgSlug);
  const cart = await loadCart(org.id);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
      <CartView
        orgSlug={org.slug}
        lines={cart.lines.filter((l) => l.active)}
        subtotalCents={cart.subtotalCents}
      />
    </div>
  );
}
