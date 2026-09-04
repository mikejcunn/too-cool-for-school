'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { markManyFulfilledAction } from '@/app/admin/[orgSlug]/fulfillment/actions';

export interface FulfillmentOrder {
  id: string;
  orderNumber: string;
  customerName: string | null;
  studentName: string | null;
  teacherName: string | null;
  grade: string | null;
  classroomId: string | null;
  pickupEventId: string | null;
  pickupEventName: string | null;
  fulfillmentMethod: 'classroom' | 'pickup' | 'in_person';
  fulfillmentStatus: 'unfulfilled' | 'partial' | 'fulfilled';
  items: { label: string; quantity: number; isPreorder: boolean; fulfilledQuantity: number }[];
}

export function FulfillmentBoard({
  orgSlug,
  orders,
  showFulfilled,
}: {
  orgSlug: string;
  orders: FulfillmentOrder[];
  showFulfilled: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const groups = useMemo(() => {
    const map = new Map<string, { title: string; subtitle: string; orders: FulfillmentOrder[] }>();
    for (const o of orders) {
      const key =
        o.fulfillmentMethod === 'classroom'
          ? `c:${o.classroomId}`
          : o.fulfillmentMethod === 'pickup'
            ? `e:${o.pickupEventId}`
            : 'p';
      const title =
        o.fulfillmentMethod === 'classroom'
          ? (o.teacherName ?? 'Unknown teacher')
          : o.fulfillmentMethod === 'pickup'
            ? (o.pickupEventName ?? 'Pickup')
            : 'In person';
      const subtitle =
        o.fulfillmentMethod === 'classroom'
          ? o.grade
            ? `Grade ${o.grade}`
            : ''
          : o.fulfillmentMethod === 'pickup'
            ? 'Event pickup'
            : '';
      const g = map.get(key) ?? { title, subtitle, orders: [] };
      g.orders.push(o);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [orders]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleGroup(ids: string[]) {
    setSelected((s) => {
      const n = new Set(s);
      const all = ids.every((i) => n.has(i));
      ids.forEach((i) => (all ? n.delete(i) : n.add(i)));
      return n;
    });
  }
  function mark(fulfilled: boolean) {
    start(async () => {
      const r = await markManyFulfilledAction(orgSlug, [...selected], fulfilled);
      if (r.ok) {
        toast.success(
          `${r.count} order${r.count === 1 ? '' : 's'} marked ${fulfilled ? 'delivered' : 'not delivered'}`
        );
        setSelected(new Set());
      } else toast.error(r.message);
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button size="sm" disabled={selected.size === 0 || pending} onClick={() => mark(true)}>
          Mark {selected.size || ''} delivered
        </Button>
        {showFulfilled && (
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0 || pending}
            onClick={() => mark(false)}
          >
            Undo delivered
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => window.print()}>
          <Printer /> Print packing lists
        </Button>
        <Link
          href={`/admin/${orgSlug}/fulfillment${showFulfilled ? '' : '?all=1'}`}
          className="ml-auto text-sm text-muted-foreground hover:underline"
        >
          {showFulfilled ? 'Hide delivered' : 'Show delivered too'}
        </Link>
      </div>
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing waiting to be delivered. 🎉</p>
      )}
      {groups.map((g) => {
        const ids = g.orders.map((o) => o.id);
        const units = g.orders.reduce((n, o) => n + o.items.reduce((m, i) => m + i.quantity, 0), 0);
        return (
          <section key={g.title + g.subtitle} className="break-inside-avoid rounded-lg border bg-background">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
              <div>
                <h2 className="font-medium">{g.title}</h2>
                <div className="text-xs text-muted-foreground">
                  {g.subtitle}
                  {g.subtitle ? ' · ' : ''}
                  {g.orders.length} order{g.orders.length === 1 ? '' : 's'} · {units} item
                  {units === 1 ? '' : 's'}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs print:hidden">
                <input
                  type="checkbox"
                  checked={ids.every((i) => selected.has(i))}
                  onChange={() => toggleGroup(ids)}
                />{' '}
                Select all
              </label>
            </header>
            <ul className="divide-y">
              {g.orders.map((o) => (
                <li key={o.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 print:hidden"
                    checked={selected.has(o.id)}
                    onChange={() => toggle(o.id)}
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {o.fulfillmentMethod === 'classroom' ? o.studentName : o.customerName}
                      </span>
                      <Link
                        href={`/admin/${orgSlug}/orders/${o.id}`}
                        className="text-xs text-muted-foreground hover:underline print:hidden"
                      >
                        {o.orderNumber}
                      </Link>
                      <span className="hidden text-xs text-muted-foreground print:inline">
                        {o.orderNumber}
                      </span>
                      {o.fulfillmentStatus === 'fulfilled' && <Badge variant="secondary">Delivered</Badge>}
                      {o.fulfillmentStatus === 'partial' && <Badge variant="outline">Partial</Badge>}
                    </div>
                    <ul className="text-muted-foreground">
                      {o.items.map((i, idx) => (
                        <li key={idx}>
                          {i.quantity} × {i.label}
                          {i.isPreorder && <span className="ml-1 text-xs">(pre-order)</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
