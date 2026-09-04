import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { requireOrg } from '@/lib/tenant/context';
import { loadCart, pruneInactiveLines } from '@/lib/checkout/cart';
import { computeTotals } from '@/lib/pricing/totals';
import { db } from '@/lib/db';
import { classrooms, events } from '@/lib/db/schema';
import { CheckoutForm } from '@/components/store/CheckoutForm';

export const metadata = { title: 'Checkout' };

export default async function CheckoutPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await requireOrg(orgSlug);
  const cart = await loadCart(org.id);
  if (!cart.session || cart.lines.length === 0) redirect(`/s/${org.slug}/cart`);
  const lines = await pruneInactiveLines(cart.session.id, cart.lines);
  if (lines.length === 0) redirect(`/s/${org.slug}/cart`);

  const [rooms, evs] = await Promise.all([
    db
      .select()
      .from(classrooms)
      .where(and(eq(classrooms.orgId, org.id), eq(classrooms.active, true)))
      .orderBy(asc(classrooms.sortOrder), asc(classrooms.teacherName)),
    db
      .select()
      .from(events)
      .where(
        and(
          eq(events.orgId, org.id),
          eq(events.active, true),
          inArray(events.kind, ['pickup', 'both']),
          gte(events.startsAt, new Date(Date.now() - 86_400_000))
        )
      )
      .orderBy(asc(events.startsAt)),
  ]);
  const totals = computeTotals(lines, org.taxRateBps);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: org.timezone,
    });

  return (
    <div className="grid gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
        <Link href={`/s/${org.slug}/cart`} className="text-sm text-muted-foreground hover:underline">
          Edit cart
        </Link>
      </div>
      <CheckoutForm
        orgSlug={org.slug}
        lines={lines}
        subtotalCents={totals.subtotalCents}
        taxCents={totals.taxCents}
        totalCents={totals.totalCents}
        classrooms={rooms.map((c) => ({
          id: c.id,
          label: `${c.teacherName}${c.grade ? ` (Grade ${c.grade})` : ''}`,
        }))}
        events={evs.map((e) => ({ id: e.id, label: `${e.name} · ${fmt(e.startsAt)}` }))}
        publicKey={org.runPublicKey}
        mid={org.runMid}
        mockMode={
          process.env.NEXT_PUBLIC_RUN_MOCK_GATEWAY === 'true' && process.env.NODE_ENV !== 'production'
        }
        recaptchaEnabled={!!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
      />
    </div>
  );
}
