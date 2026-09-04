/* Runner.js (Run Payments browser tokenization) configuration.
 * CardPointe gateway only; the same public key routes per `mid`. */

export const RUNNER_VERSION = process.env.NEXT_PUBLIC_RUNNER_VERSION || '1.5.4';

export function runnerScriptUrl(): string {
  return (
    process.env.NEXT_PUBLIC_RUN_SCRIPT_URL ||
    `https://javelin.runpayments.io/javascripts/${RUNNER_VERSION}/runner.js`
  );
}

export type RunnerEnv = 'local' | 'staging' | 'production';

export function runnerEnv(): RunnerEnv {
  const e = process.env.NEXT_PUBLIC_RUNNER_ENV;
  if (e === 'local' || e === 'staging' || e === 'production') return e;
  return 'production';
}

export interface RunnerInitOpts {
  /** DOM id selector (with #) of the card-field container. */
  element: string;
  publicKey: string;
  mid: string;
}

export function getRunnerInit(opts: RunnerInitOpts): Record<string, unknown> {
  return {
    element: opts.element,
    publicKey: opts.publicKey,
    mid: opts.mid,
    env: runnerEnv(),
    useExpiry: true,
    useCvv: true,
    cardLabel: 'Card number',
    expiryLabel: 'Expiration',
    cvvLabel: 'CVC',
    cardPlaceholder: '1234 1234 1234 1234',
    cvvPlaceholder: 'CVC',
  };
}

/** Load runner.js once; resolves when window.Runner is available. */
export function loadRunnerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (window.Runner) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-runner]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Runner.js failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = runnerScriptUrl();
    s.async = true;
    s.dataset.runner = 'true';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Runner.js failed to load'));
    document.head.appendChild(s);
  });
}
