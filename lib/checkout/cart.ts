/* Server-side cart = checkout_sessions + checkout_items keyed by an opaque cookie token.
 * Prices shown are stored per item only to detect PRICE_CHANGED at checkout. */
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkoutItems, checkoutSessions, productVariants, products } from '@/lib/db/schema';
import { resolveMoney } from '@/lib/pricing/resolve-price';

const SESSION_DAYS = 7;

export function cartCookieName(orgId: string): string {
  return `wt_cart_${orgId.slice(0, 8)}`;
}

export type CartSession = typeof checkoutSessions.$inferSelect;

export interface CartLine {
  itemId: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  unitMsrpCents: number | null;
  lineSubtotalCents: number;
  isPreorder: boolean;
  available: number | null; // null for pre-order lines
  active: boolean;
}

export interface Cart {
  session: CartSession | null;
  lines: CartLine[];
  subtotalCents: number;
  itemCount: number;
}

/** Read the shopper's open session for this org (no side effects). */
export async function getCartSession(orgId: string): Promise<CartSession | null> {
  const jar = await cookies();
  const token = jar.get(cartCookieName(orgId))?.value;
  if (!token) return null;
  const [s] = await db
    .select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.cookieToken, token), eq(checkoutSessions.orgId, orgId)));
  if (!s) return null;
  if (s.status === 'completed' || s.status === 'expired' || s.status === 'abandoned') return null;
  if (s.expiresAt < new Date()) return null;
  return s;
}

/** Get or create the session and set the cookie (server actions / route handlers only). */
export async function ensureCartSession(orgId: string): Promise<CartSession> {
  const existing = await getCartSession(orgId);
  if (existing) return existing;
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const [s] = await db
    .insert(checkoutSessions)
    .values({ orgId, cookieToken: token, expiresAt, status: 'open', channel: 'online' })
    .returning();
  const jar = await cookies();
  jar.set(cartCookieName(orgId), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
  return s;
}

export async function loadCart(orgId: string, session?: CartSession | null): Promise<Cart> {
  const s = session === undefined ? await getCartSession(orgId) : session;
  if (!s) return { session: null, lines: [], subtotalCents: 0, itemCount: 0 };
  const lines = await loadCartLines(orgId, s.id);
  return {
    session: s,
    lines,
    subtotalCents: lines.reduce((n, l) => n + l.lineSubtotalCents, 0),
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
  };
}

export async function loadCartLines(orgId: string, sessionId: string): Promise<CartLine[]> {
  const rows = await db
    .select({
      item: checkoutItems,
      variant: productVariants,
      product: products,
    })
    .from(checkoutItems)
    .innerJoin(productVariants, eq(productVariants.id, checkoutItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(checkoutItems.sessionId, sessionId), eq(productVariants.orgId, orgId)))
    .orderBy(checkoutItems.createdAt);

  return rows.map(({ item, variant, product }) => {
    const money = resolveMoney(product, variant);
    const isPreorder = product.saleMode === 'preorder';
    return {
      itemId: item.id,
      variantId: variant.id,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      variantLabel: variant.label,
      sku: variant.sku,
      quantity: item.quantity,
      unitPriceCents: money.unitPriceCents,
      unitMsrpCents: money.unitMsrpCents,
      lineSubtotalCents: money.unitPriceCents * item.quantity,
      isPreorder,
      available: isPreorder ? null : Math.max(0, variant.onHand - variant.reserved),
      active: product.status === 'active' && variant.active,
    };
  });
}

/** Set a line's quantity (0 removes). Caps at what is available for stock items. */
export async function setCartQuantity(
  orgId: string,
  variantId: string,
  quantity: number
): Promise<{ ok: true; quantity: number } | { ok: false; message: string }> {
  const session = await ensureCartSession(orgId);
  if (session.status !== 'open' && session.status !== 'reserved') {
    return { ok: false, message: 'This cart is being checked out. Refresh the page.' };
  }
  const [row] = await db
    .select({ variant: productVariants, product: products })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.id, variantId), eq(productVariants.orgId, orgId)));
  if (!row || !row.variant.active || row.product.status !== 'active') {
    return { ok: false, message: 'That item is no longer available.' };
  }

  if (quantity <= 0) {
    await db
      .delete(checkoutItems)
      .where(and(eq(checkoutItems.sessionId, session.id), eq(checkoutItems.variantId, variantId)));
    return { ok: true, quantity: 0 };
  }

  let qty = Math.min(quantity, 50);
  if (row.product.saleMode === 'stock') {
    const available = Math.max(0, row.variant.onHand - row.variant.reserved);
    if (available === 0) return { ok: false, message: 'Sold out.' };
    qty = Math.min(qty, available);
  }
  const price = resolveMoney(row.product, row.variant).unitPriceCents;
  await db
    .insert(checkoutItems)
    .values({ sessionId: session.id, variantId, quantity: qty, unitPriceCentsShown: price })
    .onConflictDoUpdate({
      target: [checkoutItems.sessionId, checkoutItems.variantId],
      set: { quantity: qty, unitPriceCentsShown: price },
    });
  return { ok: true, quantity: qty };
}

export async function clearCartCookie(orgId: string): Promise<void> {
  const jar = await cookies();
  jar.delete(cartCookieName(orgId));
}

/** Remove lines whose products vanished (admin archived them mid-shop). */
export async function pruneInactiveLines(sessionId: string, lines: CartLine[]): Promise<CartLine[]> {
  const dead = lines.filter((l) => !l.active).map((l) => l.itemId);
  if (dead.length) await db.delete(checkoutItems).where(inArray(checkoutItems.id, dead));
  return lines.filter((l) => l.active);
}
