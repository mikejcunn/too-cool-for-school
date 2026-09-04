import type { SplitSnapshot } from './types';

export interface SplitValidation {
  ok: boolean;
  errors: string[];
}

/** Rule-save validation: percent splits must sum to exactly 10000 bps and there must be at least one. */
export function validateSplits(splits: SplitSnapshot[]): SplitValidation {
  const errors: string[] = [];
  const pct = splits.filter((s) => s.kind === 'percent');
  if (pct.length === 0) errors.push('Add at least one percentage split.');
  const sum = pct.reduce((n, s) => n + (s.percentBps ?? 0), 0);
  if (pct.length > 0 && sum !== 10000)
    errors.push(`Percentages must total 100% (currently ${(sum / 100).toFixed(2)}%).`);
  for (const s of splits) {
    if (s.kind === 'percent' && (s.percentBps == null || s.percentBps < 0 || s.percentBps > 10000))
      errors.push('Each percentage must be between 0% and 100%.');
    if (s.kind === 'fixed' && (s.fixedCentsPerUnit == null || s.fixedCentsPerUnit < 0))
      errors.push('Fixed amounts must be zero or more.');
  }
  const seen = new Set<string>();
  for (const s of splits) {
    const key = `${s.beneficiaryId}:${s.kind}`;
    if (seen.has(key)) errors.push('A beneficiary appears more than once with the same split type.');
    seen.add(key);
  }
  return { ok: errors.length === 0, errors };
}
