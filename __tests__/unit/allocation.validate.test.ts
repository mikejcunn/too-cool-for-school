import { describe, expect, it } from 'vitest';
import { validateSplits } from '@/lib/allocation/validate';

describe('validateSplits', () => {
  it('accepts a 60/40 split', () => {
    expect(
      validateSplits([
        { beneficiaryId: 'a', kind: 'percent', percentBps: 6000, position: 0 },
        { beneficiaryId: 'b', kind: 'percent', percentBps: 4000, position: 1 },
      ]).ok
    ).toBe(true);
  });
  it('rejects percentages that do not total 100', () => {
    const v = validateSplits([{ beneficiaryId: 'a', kind: 'percent', percentBps: 9000, position: 0 }]);
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/100%/);
  });
  it('requires at least one percent split', () => {
    expect(
      validateSplits([{ beneficiaryId: 'a', kind: 'fixed', fixedCentsPerUnit: 100, position: 0 }]).ok
    ).toBe(false);
  });
  it('rejects duplicate beneficiary/kind pairs', () => {
    const v = validateSplits([
      { beneficiaryId: 'a', kind: 'percent', percentBps: 5000, position: 0 },
      { beneficiaryId: 'a', kind: 'percent', percentBps: 5000, position: 1 },
    ]);
    expect(v.ok).toBe(false);
  });
});
