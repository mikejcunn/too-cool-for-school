'use client';
import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CartLine } from '@/lib/checkout/cart';
import { formatCents } from '@/lib/money';
import { setCartQuantityAction } from '@/app/(store)/s/[orgSlug]/actions';

export function CartView({
  orgSlug,
  lines,
  subtotalCents,
}: {
  orgSlug: string;
  lines: CartLine[];
  subtotalCents: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function set(variantId: string, quantity: number) {
    start(async () => {
      const res = await setCartQuantityAction(orgSlug, { variantId, quantity });
      if (!res.ok) toast.error(res.message);
      router.refresh();
    });
  }

  if (lines.length === 0) {
    return (
      <div className="grid justify-items-start gap-3">
        <p className="text-muted-foreground">Your cart is empty.</p>
        <Button nativeButton={false} render={<Link href={`/s/${orgSlug}`} />}>
          Browse items
        </Button>
      </div>
    );
  }

  const hasPre = lines.some((l) => l.isPreorder);
  const hasNow = lines.some((l) => !l.isPreorder);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_300px]">
      <ul className="divide-y rounded-lg border" aria-busy={pending}>
        {lines.map((l) => (
          <li key={l.itemId} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div>
              <Link href={`/s/${orgSlug}/products/${l.productSlug}`} className="font-medium hover:underline">
                {l.productName}
              </Link>
              <div className="text-sm text-muted-foreground">{l.variantLabel}</div>
              <div className="mt-1 flex gap-2">
                {l.isPreorder && <Badge variant="secondary">Pre-order</Badge>}
                {!l.isPreorder && l.available !== null && l.available < l.quantity && (
                  <Badge variant="destructive">Only {l.available} left</Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set(l.variantId, l.quantity - 1)}
                aria-label="Decrease"
              >
                −
              </Button>
              <span className="w-8 text-center text-sm">{l.quantity}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set(l.variantId, l.quantity + 1)}
                aria-label="Increase"
              >
                +
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set(l.variantId, 0)}
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-right font-medium sm:w-20">{formatCents(l.lineSubtotalCents)}</div>
          </li>
        ))}
      </ul>
      <aside className="grid content-start gap-3 rounded-lg border p-4">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span className="font-medium">{formatCents(subtotalCents)}</span>
        </div>
        <p className="text-xs text-muted-foreground">Delivery to classroom or event pickup is free.</p>
        {hasPre && hasNow && (
          <p className="text-xs text-amber-700">
            Your cart mixes in-stock and pre-order items; they arrive separately.
          </p>
        )}
        <Button
          nativeButton={false}
          render={<Link href={`/s/${orgSlug}/checkout`} />}
          size="lg"
          disabled={pending}
        >
          Check out
        </Button>
        <Button nativeButton={false} render={<Link href={`/s/${orgSlug}`} />} variant="ghost">
          Keep shopping
        </Button>
      </aside>
    </div>
  );
}
