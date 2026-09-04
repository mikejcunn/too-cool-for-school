/* Pure allocation math (no DB). Deterministic; always sums exactly to the pool. */
import type { AllocationAmount, AllocationBasis, SplitSnapshot } from './types';

/** Pool of cents available to distribute for a line. Never negative. */
export function poolCents(
  basis: AllocationBasis,
  unitPriceCents: number,
  unitCogsCents: number,
  quantity: number
): number {
  const perUnit = basis === 'margin' ? unitPriceCents - unitCogsCents : unitPriceCents;
  return Math.max(0, perUnit * quantity);
}

/**
 * Distribute `pool` cents across `splits` for `quantity` units.
 * 1. Fixed per-unit splits are taken first, in position order, capped at what remains.
 * 2. Percent splits share the remainder: floor each share, then hand the leftover
 *    cents one at a time to the largest fractional remainders (ties by position).
 * Amounts for the same beneficiary are merged. Zero amounts are kept so reports stay complete.
 */
export function allocateCents(pool: number, splits: SplitSnapshot[], quantity: number): AllocationAmount[] {
  if (!Number.isInteger(pool) || pool < 0) throw new Error(`allocateCents: invalid pool ${pool}`);
  const ordered = [...splits].sort((a, b) => a.position - b.position);
  const amounts = new Map<string, number>();
  const add = (id: string, c: number) => amounts.set(id, (amounts.get(id) ?? 0) + c);

  let remaining = pool;
  for (const s of ordered) {
    if (s.kind !== 'fixed') continue;
    const want = Math.max(0, (s.fixedCentsPerUnit ?? 0) * quantity);
    const got = Math.min(want, remaining);
    remaining -= got;
    add(s.beneficiaryId, got);
  }

  const pct = ordered.filter((s) => s.kind === 'percent');
  const totalBps = pct.reduce((n, s) => n + Math.max(0, s.percentBps ?? 0), 0);
  if (pct.length > 0 && totalBps > 0) {
    // Scale by totalBps (not 10000) so a mis-summed rule still distributes exactly `remaining`.
    const raw = pct.map((s) => {
      const bps = Math.max(0, s.percentBps ?? 0);
      const exact = remaining * bps; // in units of 1/totalBps cents
      return { s, floor: Math.floor(exact / totalBps), frac: exact % totalBps };
    });
    let leftover = remaining - raw.reduce((n, r) => n + r.floor, 0);
    const byRemainder = [...raw].sort((a, b) => b.frac - a.frac || a.s.position - b.s.position);
    for (const r of byRemainder) {
      if (leftover <= 0) break;
      r.floor += 1;
      leftover -= 1;
    }
    for (const r of raw) add(r.s.beneficiaryId, r.floor);
  } else {
    // No percent splits: any remainder stays undistributed (reported as unallocated).
    for (const s of pct) add(s.beneficiaryId, 0);
  }

  return [...amounts.entries()].map(([beneficiaryId, amountCents]) => ({ beneficiaryId, amountCents }));
}

export interface LineForAllocation {
  unitPriceCents: number;
  unitCogsCents: number;
  quantity: number;
  basis: AllocationBasis;
  splits: SplitSnapshot[];
}

/** Sale-side allocation for a whole line. */
export function computeLineAllocation(line: LineForAllocation): {
  pool: number;
  amounts: AllocationAmount[];
} {
  const pool = poolCents(line.basis, line.unitPriceCents, line.unitCogsCents, line.quantity);
  return { pool, amounts: allocateCents(pool, line.splits, line.quantity) };
}

/**
 * Refund-side reversal for `refundedQuantity` units of a line: recompute the
 * allocation for that many units and negate it, so a full refund mirrors the sale exactly.
 */
export function reverseLineAllocation(
  line: LineForAllocation,
  refundedQuantity: number
): { pool: number; amounts: AllocationAmount[] } {
  const qty = Math.min(Math.max(0, refundedQuantity), line.quantity);
  const pool = poolCents(line.basis, line.unitPriceCents, line.unitCogsCents, qty);
  const amounts = allocateCents(pool, line.splits, qty).map((a) => ({ ...a, amountCents: -a.amountCents }));
  return { pool: -pool, amounts };
}

/**
 * Reverse an arbitrary cent amount (not aligned to units) proportionally across the
 * line's existing sale amounts, using the same largest-remainder routine.
 */
export function reverseProportional(
  saleAmounts: AllocationAmount[],
  refundPoolCents: number
): AllocationAmount[] {
  const total = saleAmounts.reduce((n, a) => n + a.amountCents, 0);
  if (total <= 0 || refundPoolCents <= 0) return saleAmounts.map((a) => ({ ...a, amountCents: 0 }));
  const splits: SplitSnapshot[] = saleAmounts.map((a, i) => ({
    beneficiaryId: a.beneficiaryId,
    kind: 'percent',
    percentBps: a.amountCents, // scaled by total inside allocateCents
    position: i,
  }));
  return allocateCents(Math.min(refundPoolCents, total), splits, 1).map((a) => ({
    ...a,
    amountCents: -a.amountCents,
  }));
}
