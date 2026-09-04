/* Save an allocation rule (org default when productId is null). History stays intact:
 * the previous active rule is deactivated, never edited, because order lines reference it. */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { allocationRuleSplits, allocationRules, beneficiaries } from '@/lib/db/schema';
import { audit } from '@/lib/audit';
import type { SplitSnapshot } from './types';
import { validateSplits } from './validate';

export interface SaveRuleInput {
  productId: string | null;
  basis: 'margin' | 'gross' | null;
  name?: string | null;
  splits: SplitSnapshot[];
}

export async function saveAllocationRule(
  orgId: string,
  actorUserId: string,
  input: SaveRuleInput
): Promise<{ ok: true; ruleId: string } | { ok: false; message: string }> {
  const v = validateSplits(input.splits);
  if (!v.ok) return { ok: false, message: v.errors[0] };
  const ids = [...new Set(input.splits.map((s) => s.beneficiaryId))];
  const known = await db
    .select({ id: beneficiaries.id })
    .from(beneficiaries)
    .where(
      and(eq(beneficiaries.orgId, orgId), inArray(beneficiaries.id, ids), eq(beneficiaries.active, true))
    );
  if (known.length !== ids.length)
    return { ok: false, message: 'Pick active beneficiaries from this organization.' };

  const ruleId = await db.transaction(async (tx) => {
    const scope = input.productId
      ? and(
          eq(allocationRules.orgId, orgId),
          eq(allocationRules.productId, input.productId),
          eq(allocationRules.active, true)
        )
      : and(
          eq(allocationRules.orgId, orgId),
          isNull(allocationRules.productId),
          eq(allocationRules.active, true)
        );
    await tx.update(allocationRules).set({ active: false }).where(scope);
    const [rule] = await tx
      .insert(allocationRules)
      .values({
        orgId,
        productId: input.productId,
        basis: input.basis,
        name: input.name ?? null,
        active: true,
      })
      .returning({ id: allocationRules.id });
    await tx.insert(allocationRuleSplits).values(
      input.splits.map((s, i) => ({
        ruleId: rule.id,
        beneficiaryId: s.beneficiaryId,
        kind: s.kind,
        percentBps: s.kind === 'percent' ? (s.percentBps ?? 0) : null,
        fixedCentsPerUnit: s.kind === 'fixed' ? (s.fixedCentsPerUnit ?? 0) : null,
        position: i,
      }))
    );
    await audit(tx, {
      orgId,
      actorUserId,
      action: 'allocation_rule.save',
      entityType: 'allocation_rule',
      entityId: rule.id,
      after: input,
    });
    return rule.id;
  });
  return { ok: true, ruleId };
}

/** Remove a product-specific rule so the product inherits the org default again. */
export async function clearProductRule(orgId: string, actorUserId: string, productId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(allocationRules)
      .set({ active: false })
      .where(
        and(
          eq(allocationRules.orgId, orgId),
          eq(allocationRules.productId, productId),
          eq(allocationRules.active, true)
        )
      );
    await audit(tx, {
      orgId,
      actorUserId,
      action: 'allocation_rule.clear',
      entityType: 'product',
      entityId: productId,
    });
  });
}
