'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCents } from '@/lib/money';
import { saveBeneficiaryAction } from '@/app/admin/[orgSlug]/beneficiaries/actions';

export interface BeneficiaryRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  netCents: number;
}

export function BeneficiariesEditor({ orgSlug, rows }: { orgSlug: string; rows: BeneficiaryRow[] }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      <ul className="divide-y rounded-md border text-sm">
        {rows.map((b) => (
          <li
            key={b.id}
            className={`flex items-center justify-between gap-3 px-3 py-2 ${b.active ? '' : 'opacity-50'}`}
          >
            <div>
              <div className="font-medium">{b.name}</div>
              {b.description && <div className="text-muted-foreground">{b.description}</div>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">{formatCents(b.netCents)} all time</span>
              <Button
                variant="ghost"
                size="xs"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await saveBeneficiaryAction(orgSlug, {
                      id: b.id,
                      name: b.name,
                      description: b.description ?? '',
                      active: !b.active,
                    });
                    if (!r.ok) toast.error(r.message);
                  })
                }
              >
                {b.active ? 'Deactivate' : 'Reactivate'}
              </Button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-2 text-muted-foreground">No beneficiaries yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveBeneficiaryAction(orgSlug, { name, description, active: true });
            if (r.ok) {
              setName('');
              setDescription('');
              toast.success('Beneficiary added');
            } else toast.error(r.message);
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="bn">Name</Label>
          <Input id="bn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Math Club" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bd">Description</Label>
          <Input
            id="bd"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-64"
          />
        </div>
        <Button type="submit" variant="outline" disabled={!name.trim() || pending}>
          Add beneficiary
        </Button>
      </form>
    </div>
  );
}
