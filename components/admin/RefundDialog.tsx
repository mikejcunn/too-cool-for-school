'use client';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { refundOrderAction } from '@/app/admin/[orgSlug]/orders/actions';

export interface RefundLineOption {
  id: string;
  label: string;
  unitPriceCents: number;
  refundable: number;
  isPreorder: boolean;
}

export function RefundDialog({
  orgSlug,
  orderId,
  remainingCents,
  tender,
  lines,
}: {
  orgSlug: string;
  orderId: string;
  remainingCents: number;
  tender: string;
  lines: RefundLineOption[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'full' | 'lines' | 'amount'>('full');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState('');
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();

  const linesTotal = useMemo(
    () => lines.reduce((n, l) => n + (qty[l.id] ?? 0) * l.unitPriceCents, 0),
    [lines, qty]
  );
  const amountCents =
    mode === 'full'
      ? remainingCents
      : mode === 'lines'
        ? Math.min(linesTotal, remainingCents)
        : (parseDollarsToCents(amount) ?? 0);
  const valid = amountCents > 0 && amountCents <= remainingCents;

  function submit() {
    start(async () => {
      const res = await refundOrderAction(orgSlug, orderId, {
        lines:
          mode === 'lines'
            ? Object.entries(qty)
                .filter(([, q]) => q > 0)
                .map(([orderLineId, quantity]) => ({ orderLineId, quantity }))
            : mode === 'full'
              ? lines
                  .filter((l) => l.refundable > 0)
                  .map((l) => ({ orderLineId: l.id, quantity: l.refundable }))
              : undefined,
        amountCents: mode === 'amount' ? amountCents : undefined,
        restock,
        reason: reason || undefined,
      });
      if (res.ok) {
        toast.success(`Refunded ${formatCents(res.amountCents)}`);
        setOpen(false);
      } else toast.error(res.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Refund</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund order</DialogTitle>
          <DialogDescription>
            {formatCents(remainingCents)} is refundable
            {tender === 'card'
              ? ' to the original card'
              : ` (paid by ${tender}; hand the money back yourself)`}
            .
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} /> Full refund (
              {formatCents(remainingCents)})
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === 'lines'} onChange={() => setMode('lines')} /> Specific
              items
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === 'amount'} onChange={() => setMode('amount')} /> Custom
              amount
            </label>
          </div>
          {mode === 'lines' && (
            <div className="grid gap-2 rounded-md border p-3 text-sm">
              {lines
                .filter((l) => l.refundable > 0)
                .map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2">
                    <span>
                      {l.label}{' '}
                      <span className="text-muted-foreground">· {formatCents(l.unitPriceCents)} ea</span>
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={l.refundable}
                      value={qty[l.id] ?? 0}
                      onChange={(e) =>
                        setQty({
                          ...qty,
                          [l.id]: Math.max(0, Math.min(l.refundable, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-20"
                    />
                  </div>
                ))}
              <div className="text-right font-medium">
                {formatCents(Math.min(linesTotal, remainingCents))}
              </div>
            </div>
          )}
          {mode === 'amount' && (
            <div className="grid gap-1.5">
              <Label htmlFor="refund-amount">Amount (USD)</Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          )}
          {mode !== 'amount' && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={restock} onCheckedChange={(v) => setRestock(v === true)} /> Return items to
              stock
            </label>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="refund-reason">Reason (optional)</Label>
            <Input
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Wrong size, duplicate order…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!valid || pending}>
            {pending ? 'Refunding…' : `Refund ${formatCents(amountCents)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
