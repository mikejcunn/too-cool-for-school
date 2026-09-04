'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { resolvePaymentAction } from '@/app/admin/[orgSlug]/orders/resolve-actions';

export function ResolvePaymentDialog({
  orgSlug,
  orderId,
  paymentId,
  status,
}: {
  orgSlug: string;
  orderId: string;
  paymentId: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'approved' | 'declined'>('approved');
  const [transId, setTransId] = useState('');
  const [authcode, setAuthcode] = useState('');
  const [last4, setLast4] = useState('');
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Resolve payment</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve {status} payment</DialogTitle>
          <DialogDescription>
            Check Run Merchant for this order number. If the charge went through, enter its transaction id;
            otherwise mark it declined to release the stock.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={kind === 'approved'} onChange={() => setKind('approved')} /> The card
            was charged
          </label>
          {kind === 'approved' && (
            <div className="grid gap-2 pl-6">
              <div className="grid gap-1.5">
                <Label htmlFor="tid">Transaction id (trans_id)</Label>
                <Input id="tid" value={transId} onChange={(e) => setTransId(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="ac">Auth code</Label>
                  <Input id="ac" value={authcode} onChange={(e) => setAuthcode(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="l4">Card last 4</Label>
                  <Input
                    id="l4"
                    inputMode="numeric"
                    maxLength={4}
                    value={last4}
                    onChange={(e) => setLast4(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2">
            <input type="radio" checked={kind === 'declined'} onChange={() => setKind('declined')} /> No
            charge happened (release the order)
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || (kind === 'approved' && transId.trim().length < 3)}
            onClick={() =>
              start(async () => {
                const r = await resolvePaymentAction(
                  orgSlug,
                  orderId,
                  paymentId,
                  kind === 'approved' ? { kind, transId, authcode, cardLast4: last4 } : { kind }
                );
                if (r.ok) {
                  toast.success(`Order is now ${r.orderStatus}`);
                  setOpen(false);
                } else toast.error(r.message);
              })
            }
          >
            {pending ? 'Saving…' : kind === 'approved' ? 'Mark paid' : 'Mark declined'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
