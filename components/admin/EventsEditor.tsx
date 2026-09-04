'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { saveEventAction, toggleEventAction } from '@/app/admin/[orgSlug]/events/actions';

export interface EventRow {
  id: string;
  name: string;
  startsAt: string; // ISO
  endsAt: string | null;
  location: string | null;
  kind: 'pickup' | 'sale' | 'both';
  active: boolean;
  notes: string | null;
}

const sel = 'h-8 w-full rounded-md border bg-background px-2 text-sm';
const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

function EventDialog({
  orgSlug,
  initial,
  trigger,
}: {
  orgSlug: string;
  initial?: EventRow;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    name: initial?.name ?? '',
    startsAt: toLocal(initial?.startsAt ?? null),
    endsAt: toLocal(initial?.endsAt ?? null),
    location: initial?.location ?? '',
    kind: initial?.kind ?? 'both',
    notes: initial?.notes ?? '',
  });
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit event' : 'New event'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <F label="Name">
            <Input value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Fall Festival" />
          </F>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Starts">
              <Input
                type="datetime-local"
                value={v.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            </F>
            <F label="Ends (optional)">
              <Input type="datetime-local" value={v.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
            </F>
          </div>
          <F label="Location">
            <Input value={v.location} onChange={(e) => set('location', e.target.value)} />
          </F>
          <F label="Used for">
            <select className={sel} value={v.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="both">Pickup and in-person sales</option>
              <option value="pickup">Order pickup only</option>
              <option value="sale">In-person sales only (POS)</option>
            </select>
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
            disabled={!v.name.trim() || !v.startsAt || pending}
            onClick={() =>
              start(async () => {
                const r = await saveEventAction(orgSlug, {
                  id: initial?.id,
                  name: v.name,
                  startsAt: new Date(v.startsAt),
                  endsAt: v.endsAt ? new Date(v.endsAt) : null,
                  location: v.location,
                  kind: v.kind,
                  active: initial?.active ?? true,
                  notes: v.notes,
                });
                if (r.ok) {
                  toast.success('Event saved');
                  setOpen(false);
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

export function EventsEditor({
  orgSlug,
  rows,
  timezone,
}: {
  orgSlug: string;
  rows: EventRow[];
  timezone: string;
}) {
  const [pending, start] = useTransition();
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });
  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <EventDialog orgSlug={orgSlug} trigger={<Button>New event</Button>} />
      </div>
      <ul className="divide-y rounded-md border text-sm">
        {rows.map((e) => (
          <li
            key={e.id}
            className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${e.active ? '' : 'opacity-50'}`}
          >
            <div>
              <div className="font-medium">
                {e.name}
                <Badge variant="outline" className="ml-2 capitalize">
                  {e.kind === 'both' ? 'pickup + sales' : e.kind}
                </Badge>
              </div>
              <div className="text-muted-foreground">
                {fmt(e.startsAt)}
                {e.endsAt
                  ? ` – ${new Date(e.endsAt).toLocaleTimeString('en-US', { timeStyle: 'short', timeZone: timezone })}`
                  : ''}
                {e.location ? ` · ${e.location}` : ''}
              </div>
            </div>
            <div className="flex gap-1">
              <EventDialog
                orgSlug={orgSlug}
                initial={e}
                trigger={
                  <Button variant="outline" size="xs">
                    Edit
                  </Button>
                }
              />
              <Button
                variant="ghost"
                size="xs"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await toggleEventAction(orgSlug, e.id, !e.active);
                    if (!r.ok) toast.error(r.message);
                  })
                }
              >
                {e.active ? 'Deactivate' : 'Reactivate'}
              </Button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-2 text-muted-foreground">No events yet.</li>}
      </ul>
    </div>
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
