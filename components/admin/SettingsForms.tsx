'use client';
import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  addMemberAction,
  removeMemberAction,
  saveClassroomAction,
  saveOrgSettingsAction,
} from '@/app/admin/[orgSlug]/settings/actions';

const sel = 'h-8 rounded-md border bg-background px-2 text-sm';

export interface OrgSettingsValues {
  name: string;
  shortName: string;
  contactEmail: string;
  brandColor: string;
  logoUrl: string;
  timezone: string;
  runMid: string;
  runPublicKey: string;
  allocationBasis: 'margin' | 'gross';
  taxRateBps: number;
  orderPrefix: string;
}

export function OrgSettingsForm({ orgSlug, initial }: { orgSlug: string; initial: OrgSettingsValues }) {
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof OrgSettingsValues>(k: K, val: OrgSettingsValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveOrgSettingsAction(orgSlug, v);
          if (r.ok) toast.success('Settings saved');
          else toast.error(r.message);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Organization name">
          <Input value={v.name} onChange={(e) => set('name', e.target.value)} />
        </F>
        <F label="Short name">
          <Input value={v.shortName} onChange={(e) => set('shortName', e.target.value)} placeholder="FOW" />
        </F>
        <F label="Contact email (shown to shoppers)">
          <Input type="email" value={v.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
        </F>
        <F label="Timezone">
          <Input value={v.timezone} onChange={(e) => set('timezone', e.target.value)} />
        </F>
        <F label="Brand color (hex)">
          <div className="flex gap-2">
            <Input
              value={v.brandColor}
              onChange={(e) => set('brandColor', e.target.value)}
              placeholder="#1d4ed8"
            />
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(v.brandColor) ? v.brandColor : '#1d4ed8'}
              onChange={(e) => set('brandColor', e.target.value)}
              className="h-8 w-10 rounded border"
              aria-label="Pick color"
            />
          </div>
        </F>
        <F label="Logo URL">
          <Input value={v.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://…" />
        </F>
      </div>
      <h3 className="mt-2 font-medium">Payments (Run Payments)</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Credit card MID">
          <Input value={v.runMid} onChange={(e) => set('runMid', e.target.value)} />
        </F>
        <F label="Runner.js public key">
          <Input value={v.runPublicKey} onChange={(e) => set('runPublicKey', e.target.value)} />
        </F>
      </div>
      <h3 className="mt-2 font-medium">Money rules</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <F label="Beneficiary pool">
          <select
            className={sel}
            value={v.allocationBasis}
            onChange={(e) => set('allocationBasis', e.target.value as 'margin' | 'gross')}
          >
            <option value="margin">Margin (price − cost)</option>
            <option value="gross">Gross (full price)</option>
          </select>
        </F>
        <F label="Sales tax (basis points)" hint="0 = no tax. 625 = 6.25%">
          <Input
            inputMode="numeric"
            value={String(v.taxRateBps)}
            onChange={(e) => set('taxRateBps', Number(e.target.value) || 0)}
          />
        </F>
        <F label="Order number prefix">
          <Input
            value={v.orderPrefix}
            onChange={(e) => set('orderPrefix', e.target.value.toUpperCase())}
            maxLength={5}
          />
        </F>
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}

export interface ClassroomRow {
  id: string;
  teacherName: string;
  grade: string | null;
  room: string | null;
  active: boolean;
}

export function ClassroomsEditor({ orgSlug, rows }: { orgSlug: string; rows: ClassroomRow[] }) {
  const [teacher, setTeacher] = useState('');
  const [grade, setGrade] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3">
      <ul className="divide-y rounded-md border text-sm">
        {rows.map((c) => (
          <li
            key={c.id}
            className={`flex items-center justify-between gap-2 px-3 py-2 ${c.active ? '' : 'opacity-50'}`}
          >
            <span>
              {c.teacherName}
              {c.grade ? <span className="text-muted-foreground"> · Grade {c.grade}</span> : null}
              {c.room ? <span className="text-muted-foreground"> · Rm {c.room}</span> : null}
            </span>
            <Button
              variant="ghost"
              size="xs"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveClassroomAction(orgSlug, { ...c, active: !c.active });
                  if (!r.ok) toast.error(r.message);
                })
              }
            >
              {c.active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-2 text-muted-foreground">No classrooms yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveClassroomAction(orgSlug, {
              teacherName: teacher,
              grade: grade || null,
              active: true,
            });
            if (r.ok) {
              setTeacher('');
              setGrade('');
              toast.success('Classroom added');
            } else toast.error(r.message);
          });
        }}
      >
        <F label="Teacher">
          <Input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Ms. Alvarez" />
        </F>
        <F label="Grade">
          <Input className="w-20" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="K" />
        </F>
        <Button type="submit" variant="outline" disabled={!teacher.trim() || pending}>
          Add classroom
        </Button>
      </form>
    </div>
  );
}

export interface MemberRow {
  userId: string;
  email: string | null;
  name: string | null;
  role: 'admin' | 'volunteer' | 'viewer';
  isSelf: boolean;
}

export function TeamEditor({ orgSlug, rows }: { orgSlug: string; rows: MemberRow[] }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberRow['role']>('volunteer');
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3">
      <ul className="divide-y rounded-md border text-sm">
        {rows.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2">
            <span>
              {m.name ? `${m.name} · ` : ''}
              {m.email}
              <Badge variant="outline" className="ml-2 capitalize">
                {m.role}
              </Badge>
              {m.isSelf && <span className="ml-2 text-xs text-muted-foreground">you</span>}
            </span>
            {!m.isSelf && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await removeMemberAction(orgSlug, m.userId);
                    if (!r.ok) toast.error(r.message);
                  })
                }
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addMemberAction(orgSlug, { email, name: name || undefined, role });
            if (r.ok) {
              setEmail('');
              setName('');
              toast.success('Member added; they can sign in with a magic link');
            } else toast.error(r.message);
          });
        }}
      >
        <F label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="volunteer@example.org"
          />
        </F>
        <F label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </F>
        <F label="Role">
          <select className={sel} value={role} onChange={(e) => setRole(e.target.value as MemberRow['role'])}>
            <option value="volunteer">Volunteer (POS, fulfil, receive stock)</option>
            <option value="admin">Admin (everything)</option>
            <option value="viewer">Viewer (read only)</option>
          </select>
        </F>
        <Button type="submit" variant="outline" disabled={!email.trim() || pending}>
          Add member
        </Button>
      </form>
    </div>
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
