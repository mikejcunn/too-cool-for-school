'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCents } from '@/lib/money';
import { receivePoAction, updatePoAction } from '@/app/admin/[orgSlug]/purchase-orders/actions';

export interface PoLineView {
  id: string;
  productName: string;
  label: string;
  sku: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCostCents: number;
}

export function PoLinesReceive({
  orgSlug,
  poId,
  lines,
  canReceive,
  canEdit,
  status,
}: {
  orgSlug: string;
  poId: string;
  lines: PoLineView[];
  canReceive: boolean;
  canEdit: boolean;
  status: string;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const anyOpen = lines.some((l) => l.quantityReceived < l.quantityOrdered);
  const total = lines.reduce((n, l) => n + l.quantityOrdered * l.unitCostCents, 0);

  function fillRemaining() {
    setQty(
      Object.fromEntries(
        lines.map((l) => [l.id, String(Math.max(0, l.quantityOrdered - l.quantityReceived))])
      )
    );
  }
  function receive() {
    const payload = lines
      .map((l) => ({ lineId: l.id, quantity: Number(qty[l.id]) || 0 }))
      .filter((x) => x.quantity > 0);
    if (!payload.length) return toast.error('Enter quantities received');
    start(async () => {
      const r = await receivePoAction(orgSlug, poId, payload);
      if (r.ok) {
        toast.success('Stock received');
        setQty({});
      } else toast.error(r.message);
    });
  }
  const setStatus = (s: 'submitted' | 'cancelled' | 'draft') =>
    start(async () => {
      const r = await updatePoAction(orgSlug, poId, { status: s });
      if (r.ok) toast.success(`Marked ${s}`);
      else toast.error(r.message);
    });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {canEdit && status === 'draft' && (
          <Button size="sm" onClick={() => setStatus('submitted')} disabled={pending}>
            Mark as sent to vendor
          </Button>
        )}
        {canEdit && (status === 'draft' || status === 'submitted') && (
          <Button size="sm" variant="ghost" onClick={() => setStatus('cancelled')} disabled={pending}>
            Cancel PO
          </Button>
        )}
        <a
          href={`/admin/${orgSlug}/purchase-orders/${poId}/csv`}
          className="inline-flex h-7 items-center rounded-md border px-2.5 text-[0.8rem] hover:bg-muted"
        >
          Download CSV for vendor
        </a>
        {canReceive && anyOpen && status !== 'cancelled' && (
          <Button size="sm" variant="outline" onClick={fillRemaining} className="ml-auto">
            Fill remaining
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Unit cost</TableHead>
              <TableHead className="text-right">Line</TableHead>
              {canReceive && anyOpen && status !== 'cancelled' && (
                <TableHead className="text-right">Receive now</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  {l.productName} <span className="text-muted-foreground">· {l.label}</span>
                </TableCell>
                <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                <TableCell className="text-right">{l.quantityOrdered}</TableCell>
                <TableCell
                  className={`text-right ${l.quantityReceived >= l.quantityOrdered ? 'text-green-700' : ''}`}
                >
                  {l.quantityReceived}
                </TableCell>
                <TableCell className="text-right">{formatCents(l.unitCostCents)}</TableCell>
                <TableCell className="text-right">
                  {formatCents(l.unitCostCents * l.quantityOrdered)}
                </TableCell>
                {canReceive && anyOpen && status !== 'cancelled' && (
                  <TableCell className="text-right">
                    {l.quantityReceived < l.quantityOrdered ? (
                      <Input
                        className="ml-auto w-20"
                        inputMode="numeric"
                        value={qty[l.id] ?? ''}
                        onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">complete</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Total cost {formatCents(total)}</span>
        {canReceive && anyOpen && status !== 'cancelled' && (
          <Button onClick={receive} disabled={pending}>
            {pending ? 'Receiving…' : 'Receive into stock'}
          </Button>
        )}
      </div>
    </div>
  );
}
