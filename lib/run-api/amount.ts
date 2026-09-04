/**
 * Converts integer cents (our internal money type) to the `amount` value the
 * Javelin API expects.
 *
 * OPEN QUESTION (plan §Open questions #1): swagger says integer cents, but the
 * shipped apps (carols-cookies, run-payment-page) send a decimal-dollar string
 * such as "12.34". Until a UAT probe settles it, RUN_AMOUNT_UNITS controls the
 * behaviour; default is the format the shipped apps use.
 */
export type RunAmountUnits = 'dollars' | 'cents';

export function runAmountUnits(): RunAmountUnits {
  return process.env.RUN_AMOUNT_UNITS === 'cents' ? 'cents' : 'dollars';
}

export function toRunAmount(cents: number, units: RunAmountUnits = runAmountUnits()): string | number {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`toRunAmount: invalid cents ${cents}`);
  if (units === 'cents') return cents;
  return (cents / 100).toFixed(2);
}

/** Parse an API-reported amount (either convention) back to integer cents. */
export function fromRunAmount(
  value: string | number | null | undefined,
  units: RunAmountUnits = runAmountUnits()
): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return units === 'cents' ? Math.round(n) : Math.round(n * 100);
}
