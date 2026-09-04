'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  createPurchaseOrderAction,
  saveWindowAction,
  setWindowStatusAction,
} from '@/app/admin/[orgSlug]/preorders/actions';

export interface WindowFormValues {
  id?: string;
  name: string;
  opensAt: string; // datetime-local
  closesAt: string;
  expectedDeliveryOn: string; // yyyy-mm-dd
  notes: string;
}

export function WindowDialog({
  orgSlug,
  initial,
  trigger,
}: {
  orgSlug: string;
  initial?: WindowFormValues;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<WindowFormValues>(
    initial ?? { name: '', opensAt: '', closesAt: '', expectedDeliveryOn: '', notes: '' }
  );
  const [pending, start] = useTransition();
  const set = (k: keyof WindowFormValues, val: string) => setV((p) => ({ ...p, [k]: val }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{v.id ? 'Edit pre-order window' : 'New pre-order window'}</DialogTitle>
          <DialogDescription>
            Products assigned to this window are sold as pre-orders while it is open.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <F label="Name">
            <Input
              value={v.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Fall Hoodie Pre-order"
            />
          </F>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Opens">
              <Input
                type="datetime-local"
                value={v.opensAt}
                onChange={(e) => set('opensAt', e.target.value)}
              />
            </F>
            <F label="Closes">
              <Input
                type="datetime-local"
                value={v.closesAt}
                onChange={(e) => set('closesAt', e.target.value)}
              />
            </F>
          </div>
          <F label="Expected delivery (optional)">
            <Input
              type="date"
              value={v.expectedDeliveryOn}
              onChange={(e) => set('expectedDeliveryOn', e.target.value)}
            />
          </F>
          <F label="Notes">
            <Input value={v.notes} onChange={(e) => set('notes', e.target.value)} />
          </F>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!v.name.trim() || !v.opensAt || !v.closesAt || pending}
            onClick={() =>
              start(async () => {
                const r = await saveWindowAction(orgSlug, {
                  id: v.id,
                  name: v.name,
                  opensAt: new Date(v.opensAt),
                  closesAt: new Date(v.closesAt),
                  expectedDeliveryOn: v.expectedDeliveryOn || null,
                  notes: v.notes,
                });
                if (r.ok) {
                  toast.success('Saved');
                  setOpen(false);
                  if (!v.id && r.id) router.push(`/admin/${orgSlug}/preorders/${r.id}`);
                } else toast.error(r.message);
              })
            }
          >
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WindowStatusButtons({
  orgSlug,
  windowId,
  status,
}: {
  orgSlug: string;
  windowId: string;
  status: string;
}) {
  const [pending, start] = useTransition();
  const go = (s: 'open' | 'closed' | 'cancelled' | 'fulfilled') =>
    start(async () => {
      const r = await setWindowStatusAction(orgSlug, windowId, s);
      if (r.ok) toast.success(`Window ${s}`);
      else toast.error(r.message);
    });
  return (
    <div className="flex flex-wrap gap-2">
      {status === 'draft' && (
        <Button size="sm" disabled={pending} onClick={() => go('open')}>
          Open for orders
        </Button>
      )}
      {status === 'open' && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => go('closed')}>
          Close window now
        </Button>
      )}
      {status === 'received' && (
        <Button size="sm" disabled={pending} onClick={() => go('fulfilled')}>
          Mark all delivered
        </Button>
      )}
      {(status === 'draft' || status === 'open' || status === 'closed') && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => go('cancelled')}>
          Cancel window
        </Button>
      )}
    </div>
  );
}

export function CreatePoDialog({
  orgSlug,
  windowId,
  unitsNeeded,
  disabled,
}: {
  orgSlug: string;
  windowId: string;
  unitsNeeded: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [vendorContact, setVendorContact] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" disabled={disabled} />}>Create purchase order</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create purchase order</DialogTitle>
          <DialogDescription>
            {unitsNeeded} unit{unitsNeeded === 1 ? '' : 's'} of pre-order demand are not yet on a purchase
            order. Unit costs default to each variant&apos;s COGS.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <F label="Vendor">
            <Input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="Acme Screen Printing"
            />
          </F>
          <F label="Vendor contact (email / phone)">
            <Input value={vendorContact} onChange={(e) => setVendorContact(e.target.value)} />
          </F>
          <F label="Notes for the order">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </F>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!vendorName.trim() || pending}
            onClick={() =>
              start(async () => {
                const r = await createPurchaseOrderAction(orgSlug, windowId, {
                  vendorName,
                  vendorContact,
                  notes,
                });
                if (r.ok && r.id) {
                  toast.success('Purchase order created');
                  setOpen(false);
                  router.push(`/admin/${orgSlug}/purchase-orders/${r.id}`);
                } else if (!r.ok) toast.error(r.message);
              })
            }
          >
            {pending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
