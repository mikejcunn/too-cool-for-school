/* Create/update a product and its variants. Variants are never deleted (order lines
 * reference them); removed ones are deactivated. Initial stock for new variants is
 * written through lib/inventory so the ledger stays complete. */
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { productImages, productVariants, products } from '@/lib/db/schema';
import { receiveStock } from '@/lib/inventory';
import { audit } from '@/lib/audit';
import { slugify } from './slug';

const cents = z.number().int().min(0).max(100_000_00);
const optCents = cents.nullable().optional();

export const variantInputSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(1, 'SKU required').max(40),
  size: z.string().trim().max(20).nullable().optional(),
  color: z.string().trim().max(30).nullable().optional(),
  label: z.string().trim().min(1).max(80),
  priceCentsOverride: optCents,
  cogsCentsOverride: optCents,
  msrpCentsOverride: optCents,
  /** Only honoured for new variants; existing stock changes go through the inventory page. */
  initialOnHand: z.number().int().min(0).max(100_000).optional(),
  lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().default(true),
});

export const productInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Name required').max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']),
  saleMode: z.enum(['stock', 'preorder']),
  preorderWindowId: z.string().uuid().nullable().optional(),
  priceCents: cents,
  cogsCents: cents,
  msrpCents: optCents,
  imageUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  variants: z.array(variantInputSchema).min(1, 'Add at least one variant'),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;

export type SaveProductResult = { ok: true; productId: string } | { ok: false; message: string };

export async function saveProduct(
  orgId: string,
  actorUserId: string,
  raw: unknown
): Promise<SaveProductResult> {
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  const input = parsed.data;
  if (input.saleMode === 'preorder' && !input.preorderWindowId)
    return { ok: false, message: 'Pick a pre-order window.' };
  const skus = input.variants.map((v) => v.sku.toUpperCase());
  if (new Set(skus).size !== skus.length)
    return { ok: false, message: 'SKUs must be unique within the product.' };

  try {
    const productId = await db.transaction(async (tx) => {
      let id = input.id;
      const fields = {
        name: input.name,
        description: input.description || null,
        category: input.category || null,
        status: input.status,
        saleMode: input.saleMode,
        preorderWindowId: input.saleMode === 'preorder' ? (input.preorderWindowId ?? null) : null,
        priceCents: input.priceCents,
        cogsCents: input.cogsCents,
        msrpCents: input.msrpCents ?? null,
        hasVariants: input.variants.filter((v) => v.active).length > 1,
      };

      if (id) {
        const [before] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, id), eq(products.orgId, orgId)));
        if (!before) throw new Error('Product not found');
        await tx.update(products).set(fields).where(eq(products.id, id));
        await audit(tx, {
          orgId,
          actorUserId,
          action: 'product.update',
          entityType: 'product',
          entityId: id,
          before,
          after: fields,
        });
      } else {
        const slug = await uniqueSlug(tx, orgId, slugify(input.name));
        const [row] = await tx
          .insert(products)
          .values({ orgId, slug, ...fields })
          .returning({ id: products.id });
        id = row.id;
        await audit(tx, {
          orgId,
          actorUserId,
          action: 'product.create',
          entityType: 'product',
          entityId: id,
          after: fields,
        });
      }

      // Single primary image for now.
      await tx.delete(productImages).where(eq(productImages.productId, id));
      if (input.imageUrl)
        await tx
          .insert(productImages)
          .values({ productId: id, url: input.imageUrl, alt: input.name, position: 0 });

      const existing = await tx
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.orgId, orgId), eq(productVariants.productId, id)));
      const keep = new Set<string>();
      for (const [i, v] of input.variants.entries()) {
        const sku = v.sku.toUpperCase();
        const [clash] = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.orgId, orgId),
              eq(productVariants.sku, sku),
              ne(productVariants.productId, id)
            )
          );
        if (clash) throw new Error(`SKU ${sku} is already used by another product.`);

        const common = {
          sku,
          size: v.size || null,
          color: v.color || null,
          label: v.label,
          priceCentsOverride: v.priceCentsOverride ?? null,
          cogsCentsOverride: v.cogsCentsOverride ?? null,
          msrpCentsOverride: v.msrpCentsOverride ?? null,
          lowStockThreshold: v.lowStockThreshold ?? 0,
          active: v.active,
          position: i,
        };
        const match = v.id ? existing.find((e) => e.id === v.id) : existing.find((e) => e.sku === sku);
        if (match) {
          keep.add(match.id);
          await tx.update(productVariants).set(common).where(eq(productVariants.id, match.id));
        } else {
          const [created] = await tx
            .insert(productVariants)
            .values({ orgId, productId: id, ...common })
            .returning({ id: productVariants.id });
          keep.add(created.id);
          if (v.initialOnHand && v.initialOnHand > 0) {
            await receiveStock(tx, {
              orgId,
              variantId: created.id,
              quantity: v.initialOnHand,
              referenceType: 'manual',
              note: 'Opening stock',
              createdBy: actorUserId,
            });
          }
        }
      }
      for (const e of existing) {
        if (!keep.has(e.id) && e.active)
          await tx.update(productVariants).set({ active: false }).where(eq(productVariants.id, e.id));
      }
      return id;
    });
    return { ok: true, productId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not save product.';
    if (/product_variants_product_size_color_uq/.test(msg))
      return { ok: false, message: 'Two variants share the same size and color.' };
    if (/product_variants_org_sku_uq/.test(msg)) return { ok: false, message: 'A SKU is already in use.' };
    return { ok: false, message: msg };
  }
}

async function uniqueSlug(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orgId: string,
  base: string
): Promise<string> {
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const [hit] = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.slug, slug)));
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}
