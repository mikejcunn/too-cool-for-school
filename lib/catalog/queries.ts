import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { preorderWindows, productImages, products, productVariants } from '@/lib/db/schema';
import { resolveMoney } from '@/lib/pricing/resolve-price';

export type Product = typeof products.$inferSelect;
export type Variant = typeof productVariants.$inferSelect;
export type PreorderWindow = typeof preorderWindows.$inferSelect;

export interface VariantView extends Variant {
  unitPriceCents: number;
  unitCogsCents: number;
  unitMsrpCents: number | null;
  available: number;
}

export interface ProductView extends Product {
  variants: VariantView[];
  images: (typeof productImages.$inferSelect)[];
  window: PreorderWindow | null;
  /** Lowest active variant price, for cards. */
  fromPriceCents: number;
  totalAvailable: number;
}

function view(
  product: Product,
  variants: Variant[],
  images: (typeof productImages.$inferSelect)[],
  window: PreorderWindow | null
): ProductView {
  const vs: VariantView[] = variants.map((v) => ({
    ...v,
    ...resolveMoney(product, v),
    available: Math.max(0, v.onHand - v.reserved),
  }));
  const activePrices = vs.filter((v) => v.active).map((v) => v.unitPriceCents);
  return {
    ...product,
    variants: vs,
    images,
    window,
    fromPriceCents: activePrices.length ? Math.min(...activePrices) : product.priceCents,
    totalAvailable: vs.reduce((n, v) => n + (v.active ? v.available : 0), 0),
  };
}

async function attach(orgId: string, rows: Product[]): Promise<ProductView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((p) => p.id);
  const [variants, images, windows] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.orgId, orgId), inArray(productVariants.productId, ids)))
      .orderBy(asc(productVariants.position), asc(productVariants.label)),
    db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(asc(productImages.position)),
    (async () => {
      const wids = [...new Set(rows.map((p) => p.preorderWindowId).filter((x): x is string => !!x))];
      return wids.length
        ? db
            .select()
            .from(preorderWindows)
            .where(and(eq(preorderWindows.orgId, orgId), inArray(preorderWindows.id, wids)))
        : [];
    })(),
  ]);
  return rows.map((p) =>
    view(
      p,
      variants.filter((v) => v.productId === p.id),
      images.filter((i) => i.productId === p.id),
      windows.find((w) => w.id === p.preorderWindowId) ?? null
    )
  );
}

/** Storefront: active products only. */
export async function listActiveProducts(orgId: string): Promise<ProductView[]> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.status, 'active')))
    .orderBy(asc(products.sortOrder), asc(products.name));
  return attach(orgId, rows);
}

export async function getActiveProductBySlug(orgId: string, slug: string): Promise<ProductView | null> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.slug, slug), eq(products.status, 'active')));
  const [v] = await attach(orgId, rows);
  return v ?? null;
}

/** Admin: everything except archived unless asked. */
export async function listProductsAdmin(orgId: string, includeArchived = false): Promise<ProductView[]> {
  const rows = await db
    .select()
    .from(products)
    .where(
      includeArchived
        ? eq(products.orgId, orgId)
        : and(eq(products.orgId, orgId), inArray(products.status, ['draft', 'active']))
    )
    .orderBy(asc(products.sortOrder), asc(products.name));
  return attach(orgId, rows);
}

export async function getProductAdmin(orgId: string, productId: string): Promise<ProductView | null> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.id, productId)));
  const [v] = await attach(orgId, rows);
  return v ?? null;
}

export async function listPreorderWindows(orgId: string): Promise<PreorderWindow[]> {
  return db
    .select()
    .from(preorderWindows)
    .where(eq(preorderWindows.orgId, orgId))
    .orderBy(asc(preorderWindows.closesAt));
}

/** 'upcoming' | 'open' | 'closed' | null (not a pre-order product). */
export function preorderState(p: ProductView, now = new Date()): 'upcoming' | 'open' | 'closed' | null {
  if (p.saleMode !== 'preorder') return null;
  const w = p.window;
  if (!w || w.status === 'cancelled' || (w.status !== 'draft' && w.status !== 'open')) return 'closed';
  if (now < w.opensAt) return 'upcoming';
  if (w.status === 'open' && now <= w.closesAt) return 'open';
  return 'closed';
}

/** Is this pre-order product currently orderable? */
export function preorderOpen(p: ProductView, now = new Date()): boolean {
  if (p.saleMode !== 'preorder') return false;
  const w = p.window;
  return !!w && w.status === 'open' && now >= w.opensAt && now <= w.closesAt;
}
