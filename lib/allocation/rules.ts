/* Resolve which allocation rule applies to a product and snapshot it. */
import { and, eq, isNull } from 'drizzle-orm';
import { allocationRuleSplits, allocationRules } from '@/lib/db/schema';
import type { Tx } from '@/lib/db';
import type { AllocationBasis, RuleSnapshot, SplitSnapshot } from './types';

export interface RuleWithSplits {
  rule: typeof allocationRules.$inferSelect;
  splits: SplitSnapshot[];
}

async function loadRule(tx: Tx, ruleId: string): Promise<SplitSnapshot[]> {
  const rows = await tx
    .select()
    .from(allocationRuleSplits)
    .where(eq(allocationRuleSplits.ruleId, ruleId))
    .orderBy(allocationRuleSplits.position);
  return rows.map((r) => ({
    beneficiaryId: r.beneficiaryId,
    kind: r.kind,
    percentBps: r.percentBps,
    fixedCentsPerUnit: r.fixedCentsPerUnit,
    position: r.position,
  }));
}

/** Per-product active rule, else the org default, else null. */
export async function findRuleForProduct(
  tx: Tx,
  orgId: string,
  productId: string
): Promise<RuleWithSplits | null> {
  const [specific] = await tx
    .select()
    .from(allocationRules)
    .where(
      and(
        eq(allocationRules.orgId, orgId),
        eq(allocationRules.productId, productId),
        eq(allocationRules.active, true)
      )
    );
  const rule =
    specific ??
    (
      await tx
        .select()
        .from(allocationRules)
        .where(
          and(
            eq(allocationRules.orgId, orgId),
            isNull(allocationRules.productId),
            eq(allocationRules.active, true)
          )
        )
    )[0];
  if (!rule) return null;
  return { rule, splits: await loadRule(tx, rule.id) };
}

/** Snapshot to store on order_lines; an empty-split snapshot means "unallocated". */
export async function snapshotRuleForProduct(
  tx: Tx,
  orgId: string,
  productId: string,
  orgBasis: AllocationBasis,
  cache?: Map<string, RuleSnapshot>
): Promise<RuleSnapshot> {
  const hit = cache?.get(productId);
  if (hit) return hit;
  const found = await findRuleForProduct(tx, orgId, productId);
  const snap: RuleSnapshot = found
    ? { ruleId: found.rule.id, basis: found.rule.basis ?? orgBasis, splits: found.splits }
    : { ruleId: null, basis: orgBasis, splits: [] };
  cache?.set(productId, snap);
  return snap;
}

export function parseSnapshot(value: unknown, fallbackBasis: AllocationBasis): RuleSnapshot {
  const v = (value ?? {}) as Partial<RuleSnapshot>;
  return {
    ruleId: v.ruleId ?? null,
    basis: v.basis === 'gross' || v.basis === 'margin' ? v.basis : fallbackBasis,
    splits: Array.isArray(v.splits) ? v.splits : [],
  };
}
