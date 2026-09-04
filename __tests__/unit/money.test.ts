import { describe, expect, it } from 'vitest';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { fromRunAmount, toRunAmount } from '@/lib/run-api/amount';
import { computeTotals } from '@/lib/pricing/totals';
import { resolveMoney } from '@/lib/pricing/resolve-price';

describe('money', () => {
  it('formats cents', () => {
    expect(formatCents(1800)).toBe('$18.00');
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-5)).toBe('-$0.05');
  });
  it('parses dollars', () => {
    expect(parseDollarsToCents('18')).toBe(1800);
    expect(parseDollarsToCents('18.5')).toBe(1850);
    expect(parseDollarsToCents('$1,234.56')).toBe(123456);
    expect(parseDollarsToCents('abc')).toBeNull();
    expect(parseDollarsToCents('1.234')).toBeNull();
  });
});

describe('toRunAmount', () => {
  it('dollars convention sends a 2-decimal string', () => expect(toRunAmount(1234, 'dollars')).toBe('12.34'));
  it('cents convention sends the integer', () => expect(toRunAmount(1234, 'cents')).toBe(1234));
  it('rejects non-integer or negative', () => {
    expect(() => toRunAmount(12.5, 'dollars')).toThrow();
    expect(() => toRunAmount(-1, 'cents')).toThrow();
  });
  it('parses back', () => {
    expect(fromRunAmount('12.34', 'dollars')).toBe(1234);
    expect(fromRunAmount(1234, 'cents')).toBe(1234);
    expect(fromRunAmount(null, 'dollars')).toBeNull();
  });
});

describe('pricing', () => {
  it('variant overrides win', () => {
    expect(
      resolveMoney(
        { priceCents: 1800, cogsCents: 700, msrpCents: 2200 },
        { priceCentsOverride: 2000, cogsCentsOverride: null, msrpCentsOverride: null }
      )
    ).toEqual({ unitPriceCents: 2000, unitCogsCents: 700, unitMsrpCents: 2200 });
  });
  it('totals with tax bps', () => {
    expect(computeTotals([{ unitPriceCents: 1800, quantity: 2 }], 625)).toEqual({
      subtotalCents: 3600,
      taxCents: 225,
      feeCents: 0,
      totalCents: 3825,
    });
  });
});
