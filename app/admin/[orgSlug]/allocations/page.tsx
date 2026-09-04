import Link from 'next/link';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { requireMember } from '@/lib/tenant/context';
import { db } from '@/lib/db';
import { allocationRuleSplits, allocationRules, beneficiaries, products } from '@/lib/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AllocationEditor, type RuleView } from '@/components/admin/AllocationEditor';

export default async function AllocationsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireMember(orgSlug, 'admin');
  const [bens, rules, prods] = await Promise.all([
    db
      .select()
      .from(beneficiaries)
      .where(and(eq(beneficiaries.orgId, org.id), eq(beneficiaries.active, true)))
      .orderBy(asc(beneficiaries.sortOrder), asc(beneficiaries.name)),
    db
      .select()
      .from(allocationRules)
      .where(and(eq(allocationRules.orgId, org.id), eq(allocationRules.active, true))),
    db
      .select()
      .from(products)
      .where(and(eq(products.orgId, org.id), inArray(products.status, ['draft', 'active'])))
      .orderBy(asc(products.sortOrder), asc(products.name)),
  ]);
  const splits = rules.length
    ? await db
        .select()
        .from(allocationRuleSplits)
        .where(
          inArray(
            allocationRuleSplits.ruleId,
            rules.map((r) => r.id)
          )
        )
        .orderBy(asc(allocationRuleSplits.position))
    : [];
  const view = (ruleId: string | null): RuleView | null => {
    const r = rules.find((x) => x.id === ruleId);
    if (!r) return null;
    return {
      ruleId: r.id,
      basis: r.basis,
      splits: splits
        .filter((s) => s.ruleId === r.id)
        .map((s) => ({
          beneficiaryId: s.beneficiaryId,
          kind: s.kind,
          percentBps: s.percentBps,
          fixedCentsPerUnit: s.fixedCentsPerUnit,
          position: s.position,
        })),
    };
  };
  const defaultRule = view(rules.find((r) => r.productId === null)?.id ?? null);
  const nameOf = (id: string) => bens.find((b) => b.id === id)?.name ?? 'Inactive beneficiary';
  const describe = (r: RuleView | null) =>
    r
      ? r.splits
          .map(
            (s) =>
              `${nameOf(s.beneficiaryId)} ${s.kind === 'percent' ? `${(s.percentBps ?? 0) / 100}%` : `$${((s.fixedCentsPerUnit ?? 0) / 100).toFixed(2)}/unit`}`
          )
          .join(' · ')
      : 'Not set — sales are unallocated';
  const benOptions = bens.map((b) => ({ id: b.id, name: b.name }));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Allocations</h1>
        <p className="text-sm text-muted-foreground">
          Who benefits from each sale. The pool is the{' '}
          {org.allocationBasis === 'margin' ? 'margin (price − cost)' : 'full price'} by default (change in
          Settings).{' '}
          <Link href={`/admin/${org.slug}/beneficiaries`} className="underline">
            Manage beneficiaries
          </Link>
        </p>
      </div>
      {bens.length === 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Add at least one beneficiary before setting allocations.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Default for all items</CardTitle>
          <CardDescription>Applies to any product without its own rule.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>{describe(defaultRule)}</span>
          <AllocationEditor
            orgSlug={org.slug}
            productId={null}
            title="Default allocation"
            orgBasis={org.allocationBasis}
            samplePriceCents={1800}
            sampleCogsCents={700}
            beneficiaries={benOptions}
            current={defaultRule}
            trigger={
              <Button size="sm" variant="outline" disabled={bens.length === 0}>
                {defaultRule ? 'Edit' : 'Set default'}
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per product</CardTitle>
          <CardDescription>
            Override the default for specific items, e.g. hoodies fund the football team.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {prods.map((p) => {
            const own = view(rules.find((r) => r.productId === p.id)?.id ?? null);
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <div className="font-medium">
                    {p.name}{' '}
                    {own ? (
                      <Badge variant="secondary" className="ml-1">
                        Custom
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="ml-1">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground">{own ? describe(own) : describe(defaultRule)}</div>
                </div>
                <AllocationEditor
                  orgSlug={org.slug}
                  productId={p.id}
                  title={`${p.name} allocation`}
                  orgBasis={org.allocationBasis}
                  samplePriceCents={p.priceCents}
                  sampleCogsCents={p.cogsCents}
                  beneficiaries={benOptions}
                  current={own ?? defaultRule}
                  inheritsDefault={!own}
                  trigger={
                    <Button size="sm" variant="ghost" disabled={bens.length === 0}>
                      {own ? 'Edit' : 'Override'}
                    </Button>
                  }
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
