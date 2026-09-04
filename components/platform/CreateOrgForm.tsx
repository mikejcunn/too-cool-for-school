'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { slugify } from '@/lib/catalog/slug';
import { createOrgAction } from '@/app/(platform)/platform/orgs/actions';

export function CreateOrgForm() {
  const router = useRouter();
  const [v, setV] = useState({ name: '', slug: '', adminEmail: '', adminName: '', orderPrefix: '' });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createOrgAction({
            ...v,
            slug: v.slug || slugify(v.name),
            orderPrefix:
              v.orderPrefix ||
              v.name
                .replace(/[^A-Za-z]/g, '')
                .slice(0, 1)
                .toUpperCase() ||
              'W',
          });
          if (r.ok) {
            toast.success('Organization created');
            router.push(`/admin/${r.slug}`);
          } else toast.error(r.message);
        });
      }}
    >
      <F label="School / PTO name">
        <Input value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Friends of Cutler" />
      </F>
      <F label="URL slug" hint={`/s/${v.slug || slugify(v.name || 'friends-of-cutler')}`}>
        <Input
          value={v.slug}
          onChange={(e) => set('slug', e.target.value)}
          placeholder={slugify(v.name || 'friends-of-cutler')}
        />
      </F>
      <F label="First admin email">
        <Input type="email" value={v.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} />
      </F>
      <F label="First admin name">
        <Input value={v.adminName} onChange={(e) => set('adminName', e.target.value)} />
      </F>
      <F label="Order number prefix">
        <Input
          value={v.orderPrefix}
          onChange={(e) => set('orderPrefix', e.target.value.toUpperCase())}
          maxLength={5}
          placeholder="W"
        />
      </F>
      <div className="flex items-end">
        <Button type="submit" disabled={!v.name.trim() || !v.adminEmail.trim() || pending}>
          {pending ? 'Creating…' : 'Create organization'}
        </Button>
      </div>
    </form>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
