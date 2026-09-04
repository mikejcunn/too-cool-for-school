import { requireMember } from '@/lib/tenant/context';
import { listOrders, type Order, type OrderFilters } from '@/lib/orders/queries';

type OrderStatus = Order['status'];
import { OrdersTable } from '@/components/admin/OrdersTable';
import { OrdersFilters } from '@/components/admin/OrdersFilters';

type Search = { q?: string; status?: string; method?: string; fulfillment?: string; channel?: string };

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Search>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireMember(orgSlug);

  const filters: OrderFilters = { q: sp.q || undefined, limit: 200 };
  if (sp.status === 'open') filters.status = 'open';
  else if (sp.status && sp.status !== 'all') filters.status = [sp.status as OrderStatus];
  else if (!sp.status) filters.status = 'open';
  if (sp.method === 'classroom' || sp.method === 'pickup' || sp.method === 'in_person')
    filters.fulfillmentMethod = sp.method;
  if (sp.fulfillment === 'unfulfilled' || sp.fulfillment === 'partial' || sp.fulfillment === 'fulfilled')
    filters.fulfillmentStatus = sp.fulfillment;
  if (sp.channel === 'online' || sp.channel === 'pos') filters.channel = sp.channel;

  const rows = await listOrders(org.id, filters);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
      <OrdersFilters
        orgSlug={org.slug}
        values={{
          q: sp.q ?? '',
          status: sp.status ?? 'open',
          method: sp.method ?? '',
          fulfillment: sp.fulfillment ?? '',
          channel: sp.channel ?? '',
        }}
      />
      <OrdersTable orgSlug={org.slug} rows={rows} timezone={org.timezone} />
      <p className="text-xs text-muted-foreground">
        {rows.length} order{rows.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}
