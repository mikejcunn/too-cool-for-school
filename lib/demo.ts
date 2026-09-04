/* Demo mode: no real payments, no reCAPTCHA, one-click sign-in. Safe to run on a
 * hosted preview because every "charge" is simulated inside lib/run-api. */

/** Server-side check. */
export function isDemo(): boolean {
  return process.env.DEMO_MODE === 'true' || process.env.RUN_MOCK_GATEWAY === 'true';
}

/** Client-safe check (NEXT_PUBLIC_ vars are inlined at build time). */
export function isDemoClient(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || process.env.NEXT_PUBLIC_RUN_MOCK_GATEWAY === 'true';
}
