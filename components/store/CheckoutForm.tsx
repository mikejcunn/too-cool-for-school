'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useReCaptcha } from 'next-recaptcha-v3';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RunnerCardFields, type CardFieldsHandle } from '@/components/payments/RunnerCardFields';
import { emailSchema, phoneSchema } from '@/lib/checkout/schemas';
import { formatCents } from '@/lib/money';
import type { CartLine } from '@/lib/checkout/cart';
import { placeOrderAction } from '@/app/(store)/s/[orgSlug]/checkout/actions';

export interface ClassroomOption {
  id: string;
  label: string;
}
export interface EventOption {
  id: string;
  label: string;
}

const formSchema = z.object({
  customerName: z.string().trim().min(1, 'Enter your name'),
  customerEmail: emailSchema,
  customerPhone: phoneSchema,
  fulfillmentMethod: z.enum(['classroom', 'pickup']),
  classroomId: z.string().optional(),
  studentName: z.string().trim().optional(),
  pickupEventId: z.string().optional(),
  nameOnCard: z.string().trim().optional(),
  billingZip: z.string().trim().optional(),
  notes: z.string().trim().max(500).optional(),
});
type FormValues = z.infer<typeof formSchema>;

export function CheckoutForm(props: {
  orgSlug: string;
  lines: CartLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  classrooms: ClassroomOption[];
  events: EventOption[];
  publicKey: string | null;
  mid: string | null;
  mockMode: boolean;
  recaptchaEnabled: boolean;
}) {
  const router = useRouter();
  const { executeRecaptcha } = useReCaptcha();
  const card = useRef<CardFieldsHandle>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; body: string; fatal?: boolean } | null>(null);
  const [cardReady, setCardReady] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fulfillmentMethod: props.events.length && !props.classrooms.length ? 'pickup' : 'classroom',
    },
  });
  const method = form.watch('fulfillmentMethod');
  const hasPre = useMemo(() => props.lines.some((l) => l.isPreorder), [props.lines]);
  const hasNow = useMemo(() => props.lines.some((l) => !l.isPreorder), [props.lines]);

  async function onSubmit(values: FormValues) {
    setError(null);
    if (values.fulfillmentMethod === 'classroom') {
      if (!values.classroomId) return form.setError('classroomId', { message: 'Pick a teacher' });
      if (!values.studentName) return form.setError('studentName', { message: "Enter the student's name" });
    } else if (!values.pickupEventId) {
      return form.setError('pickupEventId', { message: 'Pick an event' });
    }
    setSubmitting(true);
    try {
      let recaptchaToken = '';
      if (props.recaptchaEnabled) {
        try {
          recaptchaToken = (await executeRecaptcha?.('checkout_submit')) || '';
        } catch {
          recaptchaToken = '';
        }
      }
      const tok = await card.current!.tokenize();
      const result = await placeOrderAction(props.orgSlug, {
        ...values,
        notes: values.notes || '',
        accountToken: tok.account_token,
        expiration: tok.expiry,
        recaptchaToken,
        idempotencyKey,
      });
      if (result.ok) {
        router.push(`/s/${props.orgSlug}/orders/${result.orderId}?t=${result.publicToken}&new=1`);
        return;
      }
      switch (result.code) {
        case 'DECLINED':
          setIdempotencyKey(crypto.randomUUID());
          setError({ title: 'Card not approved', body: result.message });
          break;
        case 'PAYMENT_UNCERTAIN':
          setError({ title: 'Payment pending', body: result.message, fatal: true });
          break;
        case 'OUT_OF_STOCK':
        case 'PRICE_CHANGED':
        case 'UNAVAILABLE':
        case 'PREORDER_CLOSED':
        case 'EMPTY_CART':
          setError({ title: 'Your cart changed', body: result.message });
          router.refresh();
          break;
        default:
          setIdempotencyKey(crypto.randomUUID());
          setError({ title: 'Something went wrong', body: result.message });
      }
    } catch (e) {
      setError({
        title: 'Check your card details',
        body: e instanceof Error ? e.message : 'Could not read card details.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const f = form.register;
  const err = (k: keyof FormValues) => form.formState.errors[k]?.message as string | undefined;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div className="grid gap-8">
        <section className="grid gap-4">
          <h2 className="text-lg font-medium">Contact</h2>
          <Field id="customerName" label="Your name" error={err('customerName')}>
            <Input autoComplete="name" id="customerName" {...f('customerName')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="customerEmail" label="Email" error={err('customerEmail')} hint="Receipt goes here">
              <Input
                type="email"
                autoComplete="email"
                inputMode="email"
                id="customerEmail"
                {...f('customerEmail')}
              />
            </Field>
            <Field id="customerPhone" label="Phone" error={err('customerPhone')}>
              <Input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                id="customerPhone"
                {...f('customerPhone')}
              />
            </Field>
          </div>
        </section>

        <section className="grid gap-4">
          <h2 className="text-lg font-medium">How should we get this to you?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${method === 'classroom' ? 'border-primary bg-primary/5' : ''} ${!props.classrooms.length ? 'opacity-50' : ''}`}
            >
              <input
                type="radio"
                value="classroom"
                disabled={!props.classrooms.length}
                id="fulfillment-classroom"
                {...f('fulfillmentMethod')}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Deliver to classroom</span>
                <span className="block text-sm text-muted-foreground">
                  We hand it to your student at school.
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${method === 'pickup' ? 'border-primary bg-primary/5' : ''} ${!props.events.length ? 'opacity-50' : ''}`}
            >
              <input
                type="radio"
                value="pickup"
                disabled={!props.events.length}
                id="fulfillment-pickup"
                {...f('fulfillmentMethod')}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Pick up at an event</span>
                <span className="block text-sm text-muted-foreground">Grab it at the table.</span>
              </span>
            </label>
          </div>
          {method === 'classroom' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="classroomId" label="Teacher" error={err('classroomId')}>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  defaultValue=""
                  id="classroomId"
                  {...f('classroomId')}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {props.classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="studentName" label="Student's name" error={err('studentName')}>
                <Input autoComplete="off" id="studentName" {...f('studentName')} />
              </Field>
            </div>
          ) : (
            <Field id="pickupEventId" label="Event" error={err('pickupEventId')}>
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                defaultValue=""
                id="pickupEventId"
                {...f('pickupEventId')}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {props.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {hasPre && hasNow && (
            <p className="text-sm text-amber-700">
              In-stock items arrive first; pre-ordered items follow after the pre-order window closes.
            </p>
          )}
          <Field id="notes" label="Notes (optional)" error={err('notes')}>
            <Textarea rows={2} id="notes" {...f('notes')} />
          </Field>
        </section>

        <section className="grid gap-4">
          <h2 className="text-lg font-medium">Payment</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="nameOnCard" label="Name on card" error={err('nameOnCard')}>
              <Input autoComplete="cc-name" id="nameOnCard" {...f('nameOnCard')} />
            </Field>
            <Field id="billingZip" label="Billing ZIP" error={err('billingZip')}>
              <Input autoComplete="postal-code" inputMode="numeric" id="billingZip" {...f('billingZip')} />
            </Field>
          </div>
          <RunnerCardFields
            ref={card}
            publicKey={props.publicKey}
            mid={props.mid}
            mockMode={props.mockMode}
            onReadyChange={setCardReady}
          />
        </section>

        {error && (
          <Alert variant={error.fatal ? 'default' : 'destructive'}>
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription>{error.body}</AlertDescription>
          </Alert>
        )}
      </div>

      <aside className="grid content-start gap-3 rounded-lg border p-4 md:sticky md:top-4">
        <h2 className="font-medium">Order summary</h2>
        <ul className="grid gap-2 text-sm">
          {props.lines.map((l) => (
            <li key={l.itemId} className="flex justify-between gap-2">
              <span>
                {l.quantity} × {l.productName}{' '}
                <span className="text-muted-foreground">({l.variantLabel})</span>
                {l.isPreorder && <span className="ml-1 text-xs text-muted-foreground">pre-order</span>}
              </span>
              <span>{formatCents(l.lineSubtotalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCents(props.subtotalCents)}</span>
          </div>
          {props.taxCents > 0 && (
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatCents(props.taxCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatCents(props.totalCents)}</span>
          </div>
        </div>
        <Button type="submit" size="lg" disabled={submitting || !cardReady || !!error?.fatal}>
          {submitting ? 'Processing…' : `Pay ${formatCents(props.totalCents)}`}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Card details are encrypted by Run Payments and never touch our servers.
        </p>
      </aside>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
