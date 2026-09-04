'use client';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface OrdersFilterValues {
  q: string;
  status: string;
  method: string;
  fulfillment: string;
  channel: string;
}

const sel = 'h-8 rounded-md border bg-background px-2 text-sm';

export function OrdersFilters({ orgSlug, values }: { orgSlug: string; values: OrdersFilterValues }) {
  const router = useRouter();
  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const qs = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (typeof v === 'string' && v) qs.set(k, v);
    router.push(`/admin/${orgSlug}/orders?${qs.toString()}`);
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === 'SELECT') submit(e.currentTarget);
      }}
    >
      <Input
        name="q"
        defaultValue={values.q}
        placeholder="Search order #, name, email, student, teacher"
        className="w-72"
      />
      <select name="status" defaultValue={values.status} className={sel} aria-label="Status">
        <option value="open">Paid (open)</option>
        <option value="all">All statuses</option>
        <option value="pending">Pending</option>
        <option value="paid">Paid</option>
        <option value="partially_refunded">Partially refunded</option>
        <option value="refunded">Refunded</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select name="fulfillment" defaultValue={values.fulfillment} className={sel} aria-label="Fulfilment">
        <option value="">Any fulfilment</option>
        <option value="unfulfilled">Unfulfilled</option>
        <option value="partial">Partial</option>
        <option value="fulfilled">Fulfilled</option>
      </select>
      <select name="method" defaultValue={values.method} className={sel} aria-label="Delivery method">
        <option value="">Any delivery</option>
        <option value="classroom">Classroom</option>
        <option value="pickup">Pickup</option>
        <option value="in_person">In person</option>
      </select>
      <select name="channel" defaultValue={values.channel} className={sel} aria-label="Channel">
        <option value="">Any channel</option>
        <option value="online">Online</option>
        <option value="pos">POS</option>
      </select>
      <Button type="submit" size="sm" variant="outline">
        Search
      </Button>
    </form>
  );
}
