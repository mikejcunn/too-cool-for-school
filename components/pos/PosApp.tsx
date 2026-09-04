'use client';
/* Touch-first register: product grid -> cart -> tender sheet -> done. The device holds
 * the cart; the server materialises it as a checkout session when charging. */
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RunnerCardFields, type CardFieldsHandle } from '@/components/payments/RunnerCardFields';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { computeTotals } from '@/lib/pricing/totals';
import { closePosSessionAction, placePosOrderAction } from '@/app/(pos)/pos/[orgSlug]/actions';
import type { PosSummary } from '@/lib/pos/queries';

export interface PosVariant {
  id: string;
  label: string;
  sku: string;
  unitPriceCents: number;
  available: number | null; // null = pre-order
}
export interface PosProduct {
  id: string;
  name: string;
  category: string | null;
  imageUrl: string | null;
  isPreorder: boolean;
  variants: PosVariant[];
}
interface Line {
  product: PosProduct;
  variant: PosVariant;
  quantity: number;
}
type Tender = 'cash' | 'card' | 'venmo' | 'check';

const sel = 'h-9 w-full rounded-md border bg-background px-2 text-sm';

export function PosApp(props: {
  orgSlug: string;
  posSessionId: string;
  catalog: PosProduct[];
  classrooms: { id: string; label: string }[];
  events: { id: string; label: string }[];
  publicKey: string | null;
  mid: string | null;
  mockMode: boolean;
  taxRateBps: number;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [picker, setPicker] = useState<PosProduct | null>(null);
  const [tenderOpen, setTenderOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [done, setDone] = useState<{
    orderNumber: string;
    totalCents: number;
    changeCents: number | null;
    tender: Tender;
  } | null>(null);
  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((l) => ({ unitPriceCents: l.variant.unitPriceCents, quantity: l.quantity })),
        props.taxRateBps
      ),
    [lines, props.taxRateBps]
  );
  const hasPreorder = lines.some((l) => l.product.isPreorder);

  function add(product: PosProduct, variant: PosVariant) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variant.id === variant.id);
      if (i >= 0) {
        const cap = variant.available ?? 999;
        if (prev[i].quantity + 1 > cap) {
          toast.error(`Only ${cap} available`);
          return prev;
        }
        return prev.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      }
      if (variant.available === 0) {
        toast.error('Sold out');
        return prev;
      }
      return [...prev, { product, variant, quantity: 1 }];
    });
    setPicker(null);
  }
  function setQty(variantId: string, q: number) {
    setLines((prev) =>
      prev
        .map((l) =>
          l.variant.id === variantId ? { ...l, quantity: Math.min(q, l.variant.available ?? 999) } : l
        )
        .filter((l) => l.quantity > 0)
    );
  }

  const categories = [...new Set(props.catalog.map((p) => p.category ?? 'Other'))];

  if (done) {
    return (
      <div className="mx-auto grid max-w-md gap-4 p-6 text-center">
        <div className="text-5xl">✅</div>
        <h1 className="text-2xl font-semibold">Sale complete</h1>
        <p className="text-muted-foreground">Order {done.orderNumber}</p>
        <div className="rounded-lg border bg-background p-4">
          <div className="text-3xl font-semibold">{formatCents(done.totalCents)}</div>
          <div className="text-sm capitalize text-muted-foreground">{done.tender}</div>
          {done.changeCents != null && done.changeCents > 0 && (
            <div className="mt-2 text-xl">
              Change due: <strong>{formatCents(done.changeCents)}</strong>
            </div>
          )}
        </div>
        <Button size="lg" onClick={() => setDone(null)}>
          New sale
        </Button>
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100dvh-41px)] grid-cols-1 md:grid-cols-[1fr_360px]">
      <section className="overflow-y-auto p-3">
        {categories.map((cat) => (
          <div key={cat} className="mb-4">
            {categories.length > 1 && (
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {cat}
              </h2>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {props.catalog
                .filter((p) => (p.category ?? 'Other') === cat)
                .map((p) => {
                  const soldOut = !p.isPreorder && p.variants.every((v) => (v.available ?? 0) === 0);
                  const from = Math.min(...p.variants.map((v) => v.unitPriceCents));
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={soldOut}
                      onClick={() => (p.variants.length === 1 ? add(p, p.variants[0]) : setPicker(p))}
                      className="flex min-h-24 flex-col items-start justify-between rounded-lg border bg-background p-3 text-left shadow-sm active:scale-[0.98] disabled:opacity-40"
                    >
                      <span className="font-medium leading-tight">{p.name}</span>
                      <span className="mt-2 flex w-full items-center justify-between text-sm">
                        <span>{formatCents(from)}</span>
                        {p.isPreorder ? (
                          <Badge variant="secondary">Pre-order</Badge>
                        ) : soldOut ? (
                          <Badge variant="outline">Sold out</Badge>
                        ) : p.variants.length > 1 ? (
                          <span className="text-xs text-muted-foreground">{p.variants.length} options</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {p.variants[0].available} left
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </section>

      <aside className="flex flex-col border-t bg-background md:border-l md:border-t-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="font-medium">Sale</h2>
          <div className="flex gap-1">
            {lines.length > 0 && (
              <Button variant="ghost" size="xs" onClick={() => setLines([])}>
                Clear
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={() => setCloseOpen(true)}>
              Close register
            </Button>
          </div>
        </div>
        <ul className="flex-1 divide-y overflow-y-auto">
          {lines.map((l) => (
            <li key={l.variant.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <div className="flex-1">
                <div className="font-medium">{l.product.name}</div>
                <div className="text-xs text-muted-foreground">
                  {l.variant.label} · {formatCents(l.variant.unitPriceCents)}
                  {l.product.isPreorder && ' · pre-order'}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setQty(l.variant.id, l.quantity - 1)}
                  aria-label="Less"
                >
                  <Minus />
                </Button>
                <span className="w-6 text-center">{l.quantity}</span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setQty(l.variant.id, l.quantity + 1)}
                  aria-label="More"
                >
                  <Plus />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setQty(l.variant.id, 0)}
                  aria-label="Remove"
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="w-16 text-right font-medium">
                {formatCents(l.variant.unitPriceCents * l.quantity)}
              </div>
            </li>
          ))}
          {lines.length === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">Tap items to add them.</li>
          )}
        </ul>
        <div className="grid gap-2 border-t p-4">
          {totals.taxCents > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tax</span>
              <span>{formatCents(totals.taxCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{formatCents(totals.totalCents)}</span>
          </div>
          <Button
            size="lg"
            className="h-14 text-lg"
            disabled={lines.length === 0}
            onClick={() => setTenderOpen(true)}
          >
            Charge {formatCents(totals.totalCents)}
          </Button>
        </div>
      </aside>

      <Dialog open={!!picker} onOpenChange={(o) => !o && setPicker(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{picker?.name}</DialogTitle>
            <DialogDescription>Choose an option</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {picker?.variants.map((v) => (
              <Button
                key={v.id}
                variant="outline"
                className="h-14 flex-col"
                disabled={v.available === 0}
                onClick={() => picker && add(picker, v)}
              >
                <span>{v.label}</span>
                <span className="text-xs text-muted-foreground">
                  {formatCents(v.unitPriceCents)}
                  {v.available != null ? ` · ${v.available} left` : ''}
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {tenderOpen && (
        <TenderSheet
          {...props}
          lines={lines}
          totalCents={totals.totalCents}
          hasPreorder={hasPreorder}
          onClose={() => setTenderOpen(false)}
          onDone={(d) => {
            setTenderOpen(false);
            setLines([]);
            setDone(d);
            router.refresh(); // refresh availability counts
          }}
        />
      )}

      <CloseRegisterDialog
        orgSlug={props.orgSlug}
        posSessionId={props.posSessionId}
        open={closeOpen}
        onOpenChange={setCloseOpen}
      />
    </div>
  );
}

function TenderSheet(props: {
  orgSlug: string;
  posSessionId: string;
  lines: Line[];
  totalCents: number;
  hasPreorder: boolean;
  classrooms: { id: string; label: string }[];
  events: { id: string; label: string }[];
  publicKey: string | null;
  mid: string | null;
  mockMode: boolean;
  onClose: () => void;
  onDone: (d: {
    orderNumber: string;
    totalCents: number;
    changeCents: number | null;
    tender: Tender;
  }) => void;
}) {
  const [tender, setTender] = useState<Tender>('cash');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<'classroom' | 'pickup'>('classroom');
  const [classroomId, setClassroomId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [pickupEventId, setPickupEventId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [pending, start] = useTransition();
  const card = useRef<CardFieldsHandle>(null);

  const tenderedCents = parseDollarsToCents(tendered);
  const change = tender === 'cash' && tenderedCents != null ? tenderedCents - props.totalCents : null;
  const quick = [props.totalCents, ...[2000, 5000, 10000].filter((q) => q > props.totalCents)];
  const canSubmit =
    !pending &&
    (tender !== 'cash' || (tenderedCents != null && tenderedCents >= props.totalCents)) &&
    (tender !== 'card' || cardReady) &&
    (!props.hasPreorder || (method === 'classroom' ? classroomId && studentName : pickupEventId));

  function submit() {
    setError(null);
    start(async () => {
      try {
        let accountToken: string | undefined;
        let expiration: string | undefined;
        if (tender === 'card') {
          const tok = await card.current!.tokenize();
          accountToken = tok.account_token;
          expiration = tok.expiry;
        }
        const res = await placePosOrderAction(props.orgSlug, {
          posSessionId: props.posSessionId,
          lines: props.lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity })),
          tender,
          reference,
          amountTenderedCents: tender === 'cash' ? (tenderedCents ?? undefined) : undefined,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          fulfillmentMethod: props.hasPreorder ? method : 'in_person',
          classroomId: props.hasPreorder && method === 'classroom' ? classroomId : '',
          studentName: props.hasPreorder && method === 'classroom' ? studentName : '',
          pickupEventId: props.hasPreorder && method === 'pickup' ? pickupEventId : '',
          accountToken,
          expiration,
          idempotencyKey,
        });
        if (res.ok) {
          props.onDone({
            orderNumber: res.orderNumber,
            totalCents: props.totalCents,
            changeCents: change,
            tender,
          });
          return;
        }
        if (res.code === 'DECLINED' || res.code === 'ERROR') setIdempotencyKey(crypto.randomUUID());
        setError(res.message);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read card details.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-dvh w-full max-w-lg overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Take {formatCents(props.totalCents)}</h2>
          <Button variant="ghost" size="icon-sm" onClick={props.onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {(['cash', 'card', 'venmo', 'check'] as Tender[]).map((t) => (
            <Button
              key={t}
              variant={tender === t ? 'default' : 'outline'}
              className="h-12 capitalize"
              onClick={() => setTender(t)}
            >
              {t}
            </Button>
          ))}
        </div>

        {tender === 'cash' && (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {quick.map((q) => (
                <Button key={q} variant="outline" size="sm" onClick={() => setTendered((q / 100).toFixed(2))}>
                  {q === props.totalCents ? 'Exact' : formatCents(q)}
                </Button>
              ))}
            </div>
            <F label="Cash received">
              <Input
                inputMode="decimal"
                className="h-12 text-lg"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder={(props.totalCents / 100).toFixed(2)}
              />
            </F>
            {change != null && (
              <div className={`text-lg ${change < 0 ? 'text-destructive' : ''}`}>
                {change < 0 ? `Short ${formatCents(-change)}` : `Change due ${formatCents(change)}`}
              </div>
            )}
          </div>
        )}
        {tender === 'card' && (
          <RunnerCardFields
            ref={card}
            publicKey={props.publicKey}
            mid={props.mid}
            mockMode={props.mockMode}
            elementId="pos-run-form"
            onReadyChange={setCardReady}
          />
        )}
        {tender === 'venmo' && (
          <F label="Venmo note / last 4 of phone (optional)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </F>
        )}
        {tender === 'check' && (
          <F label="Check number">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </F>
        )}

        {props.hasPreorder && (
          <div className="mt-4 grid gap-3 rounded-md border p-3">
            <div className="text-sm font-medium">Pre-order items: how will they get it?</div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={method === 'classroom' ? 'default' : 'outline'}
                onClick={() => setMethod('classroom')}
              >
                Classroom
              </Button>
              <Button
                variant={method === 'pickup' ? 'default' : 'outline'}
                onClick={() => setMethod('pickup')}
                disabled={!props.events.length}
              >
                Event pickup
              </Button>
            </div>
            {method === 'classroom' ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <select className={sel} value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
                  <option value="">Teacher…</option>
                  {props.classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Student's name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>
            ) : (
              <select
                className={sel}
                value={pickupEventId}
                onChange={(e) => setPickupEventId(e.target.value)}
              >
                <option value="">Event…</option>
                {props.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <details className="mt-4 rounded-md border p-3 text-sm" open={props.hasPreorder}>
          <summary className="cursor-pointer font-medium">Customer &amp; receipt (optional)</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              type="email"
              placeholder="Email for receipt"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input type="tel" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </details>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <Button size="lg" className="mt-4 h-14 w-full text-lg" disabled={!canSubmit} onClick={submit}>
          {pending
            ? 'Processing…'
            : tender === 'card'
              ? `Charge card ${formatCents(props.totalCents)}`
              : `Record ${tender} ${formatCents(props.totalCents)}`}
        </Button>
      </div>
    </div>
  );
}

function CloseRegisterDialog({
  orgSlug,
  posSessionId,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  posSessionId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState<PosSummary | null>(null);
  const [pending, start] = useTransition();
  const countedCents = parseDollarsToCents(counted);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{summary ? 'Register closed' : 'Close register'}</DialogTitle>
          <DialogDescription>
            {summary
              ? 'Totals for this session.'
              : 'Count the cash drawer, then close. You can reopen a new register any time.'}
          </DialogDescription>
        </DialogHeader>
        {summary ? (
          <div className="grid gap-2 text-sm">
            {summary.totals.map((t) => (
              <div key={t.tender} className="flex justify-between">
                <span className="capitalize">
                  {t.tender} <span className="text-muted-foreground">({t.count})</span>
                </span>
                <span>
                  {formatCents(t.salesCents)}
                  {t.refundsCents > 0 && (
                    <span className="text-muted-foreground"> − {formatCents(t.refundsCents)}</span>
                  )}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Net sales</span>
              <span>{formatCents(summary.netCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Expected cash in drawer</span>
              <span>{formatCents(summary.expectedCashCents)}</span>
            </div>
            {summary.session.endingCashCents != null && (
              <div
                className={`flex justify-between ${summary.session.endingCashCents !== summary.expectedCashCents ? 'text-amber-700' : ''}`}
              >
                <span>Counted</span>
                <span>
                  {formatCents(summary.session.endingCashCents)} (
                  {summary.session.endingCashCents - summary.expectedCashCents >= 0 ? '+' : ''}
                  {formatCents(summary.session.endingCashCents - summary.expectedCashCents)})
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <F label="Cash counted in drawer (USD)">
              <Input
                inputMode="decimal"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0.00"
              />
            </F>
            <F label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </F>
          </div>
        )}
        <DialogFooter>
          {summary ? (
            <Button onClick={() => router.push(`/pos/${orgSlug}`)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await closePosSessionAction(orgSlug, posSessionId, {
                      endingCashCents: countedCents,
                      notes,
                    });
                    if (r.ok) setSummary(r.summary);
                    else toast.error(r.message);
                  })
                }
              >
                {pending ? 'Closing…' : 'Close register'}
              </Button>
            </>
          )}
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
