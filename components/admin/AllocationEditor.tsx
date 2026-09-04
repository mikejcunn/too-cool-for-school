'use client';
import { useMemo, useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { allocateCents, poolCents } from '@/lib/allocation/compute';
import { validateSplits } from '@/lib/allocation/validate';
import type { SplitSnapshot } from '@/lib/allocation/types';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { clearProductRuleAction, saveAllocationRuleAction } from '@/app/admin/[orgSlug]/allocations/actions';

export interface BeneficiaryOption {
  id: string;
  name: string;
}
export interface RuleView {
  ruleId: string | null;
  basis: 'margin' | 'gross' | null;
  splits: SplitSnapshot[];
}
interface Row {
  beneficiaryId: string;
  kind: 'percent' | 'fixed';
  value: string; // percent as "60" or dollars as "1.50"
}

const sel = 'h-8 rounded-md border bg-background px-2 text-sm';

export function AllocationEditor(props: {
  orgSlug: string;
  productId: string | null;
  title: string;
  orgBasis: 'margin' | 'gross';
  samplePriceCents: number;
  sampleCogsCents: number;
  beneficiaries: BeneficiaryOption[];
  current: RuleView | null;
  inheritsDefault?: boolean;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState<'inherit' | 'margin' | 'gross'>(props.current?.basis ?? 'inherit');
  const [rows, setRows] = useState<Row[]>(
    props.current?.splits.length
      ? props.current.splits.map((s) => ({
          beneficiaryId: s.beneficiaryId,
          kind: s.kind,
          value:
            s.kind === 'percent'
              ? String((s.percentBps ?? 0) / 100)
              : ((s.fixedCentsPerUnit ?? 0) / 100).toFixed(2),
        }))
      : [{ beneficiaryId: props.beneficiaries[0]?.id ?? '', kind: 'percent', value: '100' }]
  );
  const [pending, start] = useTransition();

  const splits: SplitSnapshot[] = useMemo(
    () =>
      rows.map((r, i) => ({
        beneficiaryId: r.beneficiaryId,
        kind: r.kind,
        percentBps: r.kind === 'percent' ? Math.round(Number(r.value) * 100) : null,
        fixedCentsPerUnit: r.kind === 'fixed' ? (parseDollarsToCents(r.value) ?? 0) : null,
        position: i,
      })),
    [rows]
  );
  const validation = validateSplits(splits);
  const effBasis = basis === 'inherit' ? props.orgBasis : basis;
  const pool = poolCents(effBasis, props.samplePriceCents, props.sampleCogsCents, 1);
  const preview = validation.ok ? allocateCents(pool, splits, 1) : [];
  const nameOf = (id: string) => props.beneficiaries.find((b) => b.id === id)?.name ?? '?';

  function save() {
    start(async () => {
      const r = await saveAllocationRuleAction(props.orgSlug, {
        productId: props.productId,
        basis: basis === 'inherit' ? null : basis,
        splits,
      });
      if (r.ok) {
        toast.success('Allocation saved');
        setOpen(false);
      } else toast.error(r.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={props.trigger} />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>
            Percentages split the pool for each unit sold; fixed amounts come off the top first. Changes apply
            to future sales only.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Pool</Label>
            <select className={sel} value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)}>
              {props.productId && (
                <option value="inherit">
                  Use organization setting ({props.orgBasis === 'margin' ? 'margin' : 'gross'})
                </option>
              )}
              {!props.productId && (
                <option value="inherit">
                  Organization setting ({props.orgBasis === 'margin' ? 'margin' : 'gross'})
                </option>
              )}
              <option value="margin">Margin (price − cost)</option>
              <option value="gross">Gross (full price)</option>
            </select>
          </div>
          <div className="grid gap-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                <select
                  className={sel}
                  value={r.beneficiaryId}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, beneficiaryId: e.target.value } : x)))
                  }
                >
                  {props.beneficiaries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select
                  className={sel}
                  value={r.kind}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              kind: e.target.value as Row['kind'],
                              value: e.target.value === 'percent' ? '0' : '0.00',
                            }
                          : x
                      )
                    )
                  }
                >
                  <option value="percent">% of pool</option>
                  <option value="fixed">$ per unit</option>
                </select>
                <Input
                  className="w-24"
                  inputMode="decimal"
                  value={r.value}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove"
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  disabled={rows.length === 1}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                setRows([
                  ...rows,
                  { beneficiaryId: props.beneficiaries[0]?.id ?? '', kind: 'percent', value: '0' },
                ])
              }
            >
              <Plus /> Add split
            </Button>
          </div>
          {!validation.ok && <p className="text-sm text-destructive">{validation.errors[0]}</p>}
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="mb-1 font-medium">
              Preview for one unit at {formatCents(props.samplePriceCents)} (cost{' '}
              {formatCents(props.sampleCogsCents)}) → pool {formatCents(pool)}
            </div>
            {preview.map((p) => (
              <div key={p.beneficiaryId} className="flex justify-between">
                <span>{nameOf(p.beneficiaryId)}</span>
                <span>{formatCents(p.amountCents)}</span>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          {props.productId && props.current && !props.inheritsDefault && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await clearProductRuleAction(props.orgSlug, props.productId!);
                  if (r.ok) {
                    toast.success('Product now uses the default allocation');
                    setOpen(false);
                  } else toast.error(r.message);
                })
              }
            >
              Use default instead
            </Button>
          )}
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!validation.ok || pending || props.beneficiaries.length === 0}>
            {pending ? 'Saving…' : 'Save allocation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
