'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { VariantView } from '@/lib/catalog/queries';
import { formatCents } from '@/lib/money';
import { setCartQuantityAction } from '@/app/(store)/s/[orgSlug]/actions';

export function AddToCart({
  orgSlug,
  variants,
  isPreorder,
  orderable,
}: {
  orgSlug: string;
  variants: VariantView[];
  isPreorder: boolean;
  orderable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = variants.filter((v) => v.active);
  const [variantId, setVariantId] = useState<string>(active.length === 1 ? active[0].id : '');
  const [qty, setQty] = useState(1);
  const selected = active.find((v) => v.id === variantId);
  const soldOut = !!selected && !isPreorder && selected.available === 0;
  const canAdd = orderable && !!selected && !soldOut && !pending;

  const sizes = [...new Set(active.map((v) => v.size).filter(Boolean))] as string[];
  const colors = [...new Set(active.map((v) => v.color).filter(Boolean))] as string[];
  const [size, setSize] = useState<string>(sizes.length === 1 ? sizes[0] : '');
  const [color, setColor] = useState<string>(colors.length === 1 ? colors[0] : '');

  function pick(nextSize: string, nextColor: string) {
    setSize(nextSize);
    setColor(nextColor);
    const v = active.find(
      (x) => (sizes.length ? x.size === nextSize : true) && (colors.length ? x.color === nextColor : true)
    );
    setVariantId(v?.id ?? '');
  }

  function add() {
    if (!selected) return;
    start(async () => {
      const res = await setCartQuantityAction(orgSlug, { variantId: selected.id, quantity: qty });
      if (res.ok) {
        toast.success('Added to cart', {
          action: { label: 'View cart', onClick: () => router.push(`/s/${orgSlug}/cart`) },
        });
        router.refresh();
      } else toast.error(res.message);
    });
  }

  return (
    <div className="grid gap-4">
      {colors.length > 1 && (
        <div className="grid gap-2">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <Button
                key={c}
                type="button"
                variant={color === c ? 'default' : 'outline'}
                size="sm"
                onClick={() => pick(size, c)}
              >
                {c}
              </Button>
            ))}
          </div>
        </div>
      )}
      {sizes.length > 1 && (
        <div className="grid gap-2">
          <Label>Size</Label>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const v = active.find((x) => x.size === s && (colors.length ? x.color === color : true));
              const out = !!v && !isPreorder && v.available === 0;
              return (
                <Button
                  key={s}
                  type="button"
                  variant={size === s ? 'default' : 'outline'}
                  size="sm"
                  disabled={out || (colors.length > 0 && !color)}
                  onClick={() => pick(s, color)}
                >
                  {s}
                  {out ? ' ·  sold out' : ''}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      {active.length > 1 && (sizes.length === 0 || colors.length === 0) && !selected && (
        <p className="text-sm text-muted-foreground">Choose an option above.</p>
      )}
      <div className="flex items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="qty">Qty</Label>
          <div className="flex items-center rounded-md border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Decrease"
            >
              −
            </Button>
            <span id="qty" className="w-8 text-center text-sm">
              {qty}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setQty((q) => Math.min(selected && !isPreorder ? Math.max(1, selected.available) : 50, q + 1))
              }
              aria-label="Increase"
            >
              +
            </Button>
          </div>
        </div>
        <Button type="button" className="flex-1" size="lg" disabled={!canAdd} onClick={add}>
          {!orderable
            ? isPreorder
              ? 'Pre-orders closed'
              : 'Unavailable'
            : soldOut
              ? 'Sold out'
              : isPreorder
                ? 'Pre-order'
                : 'Add to cart'}
          {selected && canAdd ? ` · ${formatCents(selected.unitPriceCents * qty)}` : ''}
        </Button>
      </div>
      {selected && !isPreorder && selected.available > 0 && selected.available <= 5 && (
        <p className="text-xs text-amber-700">Only {selected.available} left.</p>
      )}
    </div>
  );
}
