import { describe, expect, it } from 'vitest';
import {
  allocateCents,
  computeLineAllocation,
  poolCents,
  reverseLineAllocation,
  reverseProportional,
} from '@/lib/allocation/compute';
import type { SplitSnapshot } from '@/lib/allocation/types';

const pct = (id: string, bps: number, position = 0): SplitSnapshot => ({
  beneficiaryId: id,
  kind: 'percent',
  percentBps: bps,
  position,
});
const fixed = (id: string, cents: number, position = 0): SplitSnapshot => ({
  beneficiaryId: id,
  kind: 'fixed',
  fixedCentsPerUnit: cents,
  position,
});
const sum = (xs: { amountCents: number }[]) => xs.reduce((n, a) => n + a.amountCents, 0);

describe('poolCents', () => {
  it('margin = (price - cogs) * qty', () => expect(poolCents('margin', 1800, 700, 3)).toBe(3300));
  it('gross = price * qty', () => expect(poolCents('gross', 1800, 700, 3)).toBe(5400));
  it('never negative', () => expect(poolCents('margin', 500, 700, 2)).toBe(0));
});

describe('allocateCents', () => {
  it('sums exactly to the pool for a 3-way 33.33/33.33/33.34 split on odd cents', () => {
    const splits = [pct('a', 3333, 0), pct('b', 3333, 1), pct('c', 3334, 2)];
    for (const pool of [1, 2, 100, 101, 999, 1234567]) {
      const out = allocateCents(pool, splits, 1);
      expect(sum(out)).toBe(pool);
    }
  });

  it('gives leftover cents to the largest fractional remainders, ties by position', () => {
    // 100 cents / 3 equal shares -> 33,33,34; remainders all equal -> position 0 gets the cent? No:
    // exact shares are 33.33 each; leftover = 1 cent; all remainders equal, so position 0 wins.
    const out = allocateCents(100, [pct('a', 3333, 0), pct('b', 3333, 1), pct('c', 3334, 2)], 1);
    const byId = Object.fromEntries(out.map((o) => [o.beneficiaryId, o.amountCents]));
    // shares: a=33.33, b=33.33, c=33.34 -> floors 33,33,33; leftover 1 -> c has largest remainder (.34)
    expect(byId).toEqual({ a: 33, b: 33, c: 34 });
  });

  it('takes fixed per-unit splits first, capped at the pool', () => {
    const out = allocateCents(1000, [fixed('f', 300, 0), pct('a', 5000, 1), pct('b', 5000, 2)], 2);
    const byId = Object.fromEntries(out.map((o) => [o.beneficiaryId, o.amountCents]));
    expect(byId).toEqual({ f: 600, a: 200, b: 200 });
    expect(sum(out)).toBe(1000);
  });

  it('caps fixed splits when the pool is too small and leaves percent splits at zero', () => {
    const out = allocateCents(500, [fixed('f', 300, 0), pct('a', 10000, 1)], 2);
    const byId = Object.fromEntries(out.map((o) => [o.beneficiaryId, o.amountCents]));
    expect(byId).toEqual({ f: 500, a: 0 });
  });

  it('handles a zero pool', () => {
    const out = allocateCents(0, [pct('a', 6000), pct('b', 4000, 1)], 5);
    expect(sum(out)).toBe(0);
    expect(out).toHaveLength(2);
  });

  it('is deterministic', () => {
    const splits = [pct('x', 1250, 0), pct('y', 1250, 1), pct('z', 7500, 2)];
    expect(allocateCents(777, splits, 3)).toEqual(allocateCents(777, splits, 3));
  });

  it('still distributes exactly when percentages do not sum to 100 (scaled)', () => {
    const out = allocateCents(1000, [pct('a', 5000), pct('b', 2500, 1)], 1);
    expect(sum(out)).toBe(1000);
  });

  it('merges repeated beneficiaries', () => {
    const out = allocateCents(1000, [fixed('a', 100, 0), pct('a', 5000, 1), pct('b', 5000, 2)], 1);
    expect(out).toHaveLength(2);
    expect(sum(out)).toBe(1000);
  });
});

describe('computeLineAllocation / reverseLineAllocation', () => {
  const line = {
    unitPriceCents: 1800,
    unitCogsCents: 700,
    quantity: 3,
    basis: 'margin' as const,
    splits: [pct('football', 6000, 0), pct('general', 4000, 1)],
  };

  it('allocates margin across beneficiaries', () => {
    const { pool, amounts } = computeLineAllocation(line);
    expect(pool).toBe(3300);
    expect(sum(amounts)).toBe(3300);
    expect(Object.fromEntries(amounts.map((a) => [a.beneficiaryId, a.amountCents]))).toEqual({
      football: 1980,
      general: 1320,
    });
  });

  it('a full refund mirrors the sale exactly', () => {
    const sale = computeLineAllocation(line);
    const refund = reverseLineAllocation(line, 3);
    expect(refund.pool).toBe(-sale.pool);
    for (const s of sale.amounts) {
      const r = refund.amounts.find((a) => a.beneficiaryId === s.beneficiaryId)!;
      expect(r.amountCents).toBe(-s.amountCents);
    }
  });

  it('a partial refund reverses only the refunded units', () => {
    const refund = reverseLineAllocation(line, 1);
    expect(sum(refund.amounts)).toBe(-1100);
  });

  it('reverseProportional splits a custom amount by sale proportions', () => {
    const sale = computeLineAllocation(line).amounts;
    const out = reverseProportional(sale, 1000);
    expect(sum(out)).toBe(-1000);
  });
});
