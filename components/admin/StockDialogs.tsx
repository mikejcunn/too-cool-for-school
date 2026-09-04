'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import {
  adjustStockAction,
  receiveStockAction,
  verifyLedgerAction,
} from '@/app/admin/[orgSlug]/inventory/actions';

export function ReceiveDialog({
  orgSlug,
  variantId,
  label,
}: {
  orgSlug: string;
  variantId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const n = Number(qty);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="xs" />}>Receive</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rq">Quantity received</Label>
            <Input
              id="rq"
              inputMode="numeric"
              autoFocus
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rn">Note (optional)</Label>
            <Input
              id="rn"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Vendor delivery 9/12"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!Number.isInteger(n) || n <= 0 || pending}
            onClick={() =>
              start(async () => {
                const r = await receiveStockAction(orgSlug, {
                  variantId,
                  quantity: n,
                  note: note || undefined,
                });
                if (r.ok) {
                  toast.success(`On hand is now ${r.onHand}`);
                  setOpen(false);
                  setQty('');
                  setNote('');
                } else toast.error(r.message);
              })
            }
          >
            {pending ? 'Saving…' : 'Receive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustDialog({
  orgSlug,
  variantId,
  label,
  onHand,
}: {
  orgSlug: string;
  variantId: string;
  label: string;
  onHand: number;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(String(onHand));
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const t = Number(target);
  const delta = Number.isInteger(t) ? t - onHand : 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setTarget(String(onHand));
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="xs" />}>Adjust</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust count</DialogTitle>
          <DialogDescription>
            {label} · currently {onHand} on hand
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="at">New on-hand count</Label>
            <Input
              id="at"
              inputMode="numeric"
              autoFocus
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Change: {delta > 0 ? `+${delta}` : delta}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="an">Reason</Label>
            <Input
              id="an"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Recount, damaged, lost…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={delta === 0 || !note.trim() || pending}
            onClick={() =>
              start(async () => {
                const r = await adjustStockAction(orgSlug, { variantId, delta, note });
                if (r.ok) {
                  toast.success(`On hand is now ${r.onHand}`);
                  setOpen(false);
                  setNote('');
                } else toast.error(r.message);
              })
            }
          >
            {pending ? 'Saving…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VerifyLedgerButton({ orgSlug }: { orgSlug: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const rows = await verifyLedgerAction(orgSlug);
          const bad = rows.filter((r) => !r.ok);
          if (bad.length === 0) toast.success(`Ledger matches counters for all ${rows.length} variants`);
          else toast.error(`${bad.length} variant(s) out of sync: ${bad.map((b) => b.sku).join(', ')}`);
        })
      }
    >
      {pending ? 'Checking…' : 'Verify ledger'}
    </Button>
  );
}
