import Link from 'next/link';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { db } from '@/lib/db';
import { orders, productVariants, products } from '@/lib/db/schema';
import { listOrders } from '@/lib/orders/queries';
import { formatCents } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrdersTable } from '@/components/admin/OrdersTable';

export default async function AdminDashboard({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireMember(orgSlug);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [[today], [unf], lowStock, recent] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${orders.paidCents} - ${orders.refundedCents}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.orgId, org.id),
          inArray(orders.status, ['paid', 'partially_refunded']),
          gte(orders.paidAt, start)
        )
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.orgId, org.id),
          inArray(orders.status, ['paid', 'partially_refunded']),
          inArray(orders.fulfillmentStatus, ['unfulfilled', 'partial'])
        )
      ),
    db
      .select({
        sku: productVariants.sku,
        label: productVariants.label,
        name: products.name,
        available: sql<number>`${productVariants.onHand} - ${productVariants.reserved}`,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(productVariants.orgId, org.id),
          eq(productVariants.active, true),
          eq(products.saleMode, 'stock'),
          eq(products.status, 'active'),
          lte(sql`${productVariants.onHand} - ${productVariants.reserved}`, productVariants.lowStockThreshold)
        )
      )
      .limit(8),
    listOrders(org.id, { limit: 8 }),
  ]);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Sales today"
          value={formatCents(today?.cents ?? 0)}
          sub={`${today?.n ?? 0} paid orders`}
        />
        <Stat
          label="To fulfil"
          value={String(unf?.n ?? 0)}
          sub="paid orders not yet delivered"
          href={`/admin/${org.slug}/orders?fulfillment=unfulfilled`}
        />
        <Stat
          label="Low stock"
          value={String(lowStock.length)}
          sub="variants at or below threshold"
          href={`/admin/${org.slug}/inventory`}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-baseline justify-between">
            Recent orders
            <Link
              href={`/admin/${org.slug}/orders`}
              className="text-sm font-normal text-muted-foreground hover:underline"
            >
              All orders
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OrdersTable orgSlug={org.slug} rows={recent} timezone={org.timezone} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, href }: { label: string; value: string; sub: string; href?: string }) {
  const body = (
    <Card className={href ? 'transition-colors hover:bg-muted/40' : ''}>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
