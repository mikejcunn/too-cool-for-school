import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { isDemo } from '@/lib/demo';
import { db } from '@/lib/db';
import { classrooms, events, posSessions } from '@/lib/db/schema';
import { listActiveProducts, preorderOpen } from '@/lib/catalog/queries';
import { PosApp, type PosProduct } from '@/components/pos/PosApp';

export default async function PosSessionPage({
  params,
}: {
  params: Promise<{ orgSlug: string; posSessionId: string }>;
}) {
  const { orgSlug, posSessionId } = await params;
  const { org } = await requireMember(orgSlug, 'volunteer', `/pos/${orgSlug}`);
  const [session] = await db
    .select()
    .from(posSessions)
    .where(and(eq(posSessions.id, posSessionId), eq(posSessions.orgId, org.id)));
  if (!session) notFound();
  if (session.closedAt) redirect(`/pos/${org.slug}`);

  const [products, rooms, evs] = await Promise.all([
    listActiveProducts(org.id),
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
  const catalog: PosProduct[] = products
    .filter((p) => p.saleMode === 'stock' || preorderOpen(p))
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      imageUrl: p.images[0]?.url ?? null,
      isPreorder: p.saleMode === 'preorder',
      variants: p.variants
        .filter((v) => v.active)
        .map((v) => ({
          id: v.id,
          label: v.label,
          sku: v.sku,
          unitPriceCents: v.unitPriceCents,
          available: p.saleMode === 'preorder' ? null : v.available,
        })),
    }));

  return (
    <PosApp
      orgSlug={org.slug}
      posSessionId={session.id}
      catalog={catalog}
      classrooms={rooms.map((c) => ({
        id: c.id,
        label: `${c.teacherName}${c.grade ? ` (Grade ${c.grade})` : ''}`,
      }))}
      events={evs.map((e) => ({ id: e.id, label: e.name }))}
      publicKey={org.runPublicKey}
      mid={org.runMid}
      mockMode={isDemo()}
      taxRateBps={org.taxRateBps}
    />
  );
}
