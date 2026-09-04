'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseDollarsToCents } from '@/lib/money';
import { openPosSessionAction } from '@/app/(pos)/pos/[orgSlug]/actions';

export function OpenSessionForm({
  orgSlug,
  events,
}: {
  orgSlug: string;
  events: { id: string; label: string }[];
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [cash, setCash] = useState('0');
  const [pending, start] = useTransition();
  const cents = parseDollarsToCents(cash);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(() =>
          openPosSessionAction(orgSlug, { eventId: eventId || null, startingCashCents: cents ?? 0 })
        );
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="ev">Event</Label>
        <select
          id="ev"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          <option value="">No specific event</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cash">Starting cash (USD)</Label>
        <Input id="cash" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
      </div>
      <Button type="submit" size="lg" disabled={cents == null || pending}>
        {pending ? 'Opening…' : 'Open register'}
      </Button>
    </form>
  );
}
