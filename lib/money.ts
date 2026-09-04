/* All money in this app is integer cents. These helpers are the only place
 * dollars appear. */

export function formatCents(cents: number, opts: { showZeroCents?: boolean } = {}): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  if (!opts.showZeroCents && rem === 0 && opts.showZeroCents === false)
    return `${sign}$${dollars.toLocaleString('en-US')}`;
  return `${sign}$${dollars.toLocaleString('en-US')}.${String(rem).padStart(2, '0')}`;
}

/** Parse a user-typed dollar string ("18", "18.5", "$1,234.56") to cents. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
