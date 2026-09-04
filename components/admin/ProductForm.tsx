'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { skuStem } from '@/lib/catalog/slug';
import { saveProductAction } from '@/app/admin/[orgSlug]/products/actions';

export interface WindowOption {
  id: string;
  label: string;
}

export interface VariantRow {
  id?: string;
  sku: string;
  size: string;
  color: string;
  label: string;
  price: string; // dollars, '' = inherit
  cogs: string;
  msrp: string;
  initialOnHand: string;
  lowStockThreshold: string;
  onHand?: number; // existing only, read-only display
  active: boolean;
  isNew: boolean;
}

export interface ProductFormValues {
  id?: string;
  name: string;
  description: string;
  category: string;
  status: 'draft' | 'active' | 'archived';
  saleMode: 'stock' | 'preorder';
  preorderWindowId: string;
  price: string;
  cogs: string;
  msrp: string;
  imageUrl: string;
  variants: VariantRow[];
}

export const emptyProduct: ProductFormValues = {
  name: '',
  description: '',
  category: 'Apparel',
  status: 'draft',
  saleMode: 'stock',
  preorderWindowId: '',
  price: '',
  cogs: '',
  msrp: '',
  imageUrl: '',
  variants: [],
};

const sel = 'h-8 w-full rounded-md border bg-background px-2 text-sm';

export function ProductForm({
  orgSlug,
  initial,
  windows,
}: {
  orgSlug: string;
  initial: ProductFormValues;
  windows: WindowOption[];
}) {
  const router = useRouter();
  const [v, setV] = useState<ProductFormValues>(initial);
  const [sizes, setSizes] = useState('YS, YM, YL, AS, AM, AL, AXL');
  const [colors, setColors] = useState('');
  const [pending, start] = useTransition();
  const set = <K extends keyof ProductFormValues>(k: K, val: ProductFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));
  const setVar = (i: number, patch: Partial<VariantRow>) =>
    setV((p) => ({ ...p, variants: p.variants.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const price = parseDollarsToCents(v.price) ?? 0;
  const cogs = parseDollarsToCents(v.cogs) ?? 0;

  function generate() {
    const sz = sizes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const cl = colors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const stem = skuStem(v.name || 'ITEM');
    const combos: { size: string; color: string }[] = [];
    for (const color of cl.length ? cl : [''])
      for (const size of sz.length ? sz : ['']) combos.push({ size, color });
    const rows = combos
      .filter((c) => !v.variants.some((r) => r.size === c.size && r.color === c.color))
      .map<VariantRow>((c) => ({
        sku: [stem, c.color ? c.color.slice(0, 3).toUpperCase() : null, c.size ? c.size.toUpperCase() : null]
          .filter(Boolean)
          .join('-'),
        size: c.size,
        color: c.color,
        label: [c.size, c.color].filter(Boolean).join(' / ') || 'One size',
        price: '',
        cogs: '',
        msrp: '',
        initialOnHand: '0',
        lowStockThreshold: '3',
        active: true,
        isNew: true,
      }));
    if (!rows.length) return toast.info('Those variants already exist.');
    set('variants', [...v.variants, ...rows]);
  }

  function addBlank() {
    set('variants', [
      ...v.variants,
      {
        sku: skuStem(v.name || 'ITEM'),
        size: '',
        color: '',
        label: 'One size',
        price: '',
        cogs: '',
        msrp: '',
        initialOnHand: '0',
        lowStockThreshold: '3',
        active: true,
        isNew: true,
      },
    ]);
  }

  function submit() {
    if (!v.name.trim()) return toast.error('Name is required');
    if (parseDollarsToCents(v.price) == null) return toast.error('Enter a price');
    if (parseDollarsToCents(v.cogs) == null) return toast.error('Enter the cost (COGS)');
    const variants = v.variants.map((r) => ({
      id: r.id,
      sku: r.sku,
      size: r.size || null,
      color: r.color || null,
      label: r.label,
      priceCentsOverride: r.price ? parseDollarsToCents(r.price) : null,
      cogsCentsOverride: r.cogs ? parseDollarsToCents(r.cogs) : null,
      msrpCentsOverride: r.msrp ? parseDollarsToCents(r.msrp) : null,
      initialOnHand: r.isNew ? Number(r.initialOnHand) || 0 : undefined,
      lowStockThreshold: Number(r.lowStockThreshold) || 0,
      active: r.active,
    }));
    if (variants.length === 0) return toast.error('Add at least one variant (use Generate or Add row)');
    start(async () => {
      const res = await saveProductAction(orgSlug, {
        id: v.id,
        name: v.name,
        description: v.description || null,
        category: v.category || null,
        status: v.status,
        saleMode: v.saleMode,
        preorderWindowId: v.preorderWindowId || null,
        priceCents: parseDollarsToCents(v.price),
        cogsCents: parseDollarsToCents(v.cogs),
        msrpCents: v.msrp ? parseDollarsToCents(v.msrp) : null,
        imageUrl: v.imageUrl || null,
        variants,
      });
      if (res.ok) {
        toast.success('Saved');
        router.push(`/admin/${orgSlug}/products/${res.productId}`);
        router.refresh();
      } else toast.error(res.message);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Name">
              <Input
                value={v.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Winthrop Spirit Tee"
              />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={v.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <Input
                  value={v.category}
                  onChange={(e) => set('category', e.target.value)}
                  placeholder="Apparel"
                />
              </Field>
              <Field label="Image URL" hint="Paste a hosted image link for now">
                <Input
                  value={v.imageUrl}
                  onChange={(e) => set('imageUrl', e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Variants</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Sizes (comma separated)">
                <Input value={sizes} onChange={(e) => setSizes(e.target.value)} />
              </Field>
              <Field label="Colors (comma separated)">
                <Input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Navy, Grey" />
              </Field>
              <div className="flex items-end gap-2">
                <Button type="button" variant="outline" onClick={generate}>
                  <Wand2 /> Generate
                </Button>
                <Button type="button" variant="ghost" onClick={addBlank}>
                  <Plus /> Row
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Price*</TableHead>
                    <TableHead>COGS*</TableHead>
                    <TableHead>{v.variants.some((r) => r.isNew) ? 'Opening stock' : 'On hand'}</TableHead>
                    <TableHead>Low @</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.variants.map((r, i) => (
                    <TableRow key={r.id ?? `new-${i}`} className={r.active ? '' : 'opacity-50'}>
                      <TableCell>
                        <Input
                          className="w-28 font-mono text-xs"
                          value={r.sku}
                          onChange={(e) => setVar(i, { sku: e.target.value.toUpperCase() })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-16"
                          value={r.size}
                          onChange={(e) => setVar(i, { size: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-20"
                          value={r.color}
                          onChange={(e) => setVar(i, { color: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-28"
                          value={r.label}
                          onChange={(e) => setVar(i, { label: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-20"
                          placeholder={v.price || '—'}
                          value={r.price}
                          onChange={(e) => setVar(i, { price: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-20"
                          placeholder={v.cogs || '—'}
                          value={r.cogs}
                          onChange={(e) => setVar(i, { cogs: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        {r.isNew ? (
                          <Input
                            className="w-20"
                            inputMode="numeric"
                            value={r.initialOnHand}
                            onChange={(e) => setVar(i, { initialOnHand: e.target.value })}
                            disabled={v.saleMode === 'preorder'}
                          />
                        ) : (
                          <span className="text-sm">{r.onHand ?? 0}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-16"
                          inputMode="numeric"
                          value={r.lowStockThreshold}
                          onChange={(e) => setVar(i, { lowStockThreshold: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={r.active}
                          onChange={(e) => setVar(i, { active: e.target.checked })}
                        />
                      </TableCell>
                      <TableCell>
                        {r.isNew && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              set(
                                'variants',
                                v.variants.filter((_, j) => j !== i)
                              )
                            }
                            aria-label="Remove"
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {v.variants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                        No variants yet. Use Generate for a size × color matrix, or add a single row for
                        one-size items.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              * Leave blank to inherit the product price/COGS. Existing stock is changed on the Inventory
              page, not here.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Selling price (USD)">
              <Input
                inputMode="decimal"
                value={v.price}
                onChange={(e) => set('price', e.target.value)}
                placeholder="18.00"
              />
            </Field>
            <Field label="Cost / COGS (USD)">
              <Input
                inputMode="decimal"
                value={v.cogs}
                onChange={(e) => set('cogs', e.target.value)}
                placeholder="7.00"
              />
            </Field>
            <Field label="MSRP / compare-at (USD, optional)">
              <Input
                inputMode="decimal"
                value={v.msrp}
                onChange={(e) => set('msrp', e.target.value)}
                placeholder="22.00"
              />
            </Field>
            <div className="rounded-md bg-muted p-3 text-sm">
              Margin per unit: <strong>{formatCents(price - cogs)}</strong>
              {price > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  ({Math.round(((price - cogs) / price) * 100)}%)
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Availability</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Status">
              <select
                className={sel}
                value={v.status}
                onChange={(e) => set('status', e.target.value as ProductFormValues['status'])}
              >
                <option value="draft">Draft (hidden)</option>
                <option value="active">Active (on the store)</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Sale mode">
              <select
                className={sel}
                value={v.saleMode}
                onChange={(e) => set('saleMode', e.target.value as ProductFormValues['saleMode'])}
              >
                <option value="stock">In stock (sell what&apos;s on hand)</option>
                <option value="preorder">Pre-order (collect orders, buy later)</option>
              </select>
            </Field>
            {v.saleMode === 'preorder' && (
              <Field label="Pre-order window">
                <select
                  className={sel}
                  value={v.preorderWindowId}
                  onChange={(e) => set('preorderWindowId', e.target.value)}
                >
                  <option value="">Choose…</option>
                  {windows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </CardContent>
        </Card>

        <Button size="lg" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : v.id ? 'Save changes' : 'Create product'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
