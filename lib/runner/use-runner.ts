'use client';
/* Runner.js lifecycle as a hook: load script, init iframe fields, tokenize with retry.
 * Shared by the online checkout and the POS card tender. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getRunnerInit, loadRunnerScript } from './index';

export interface TokenizeResult {
  account_token: string;
  expiry?: string;
}

export interface UseRunnerArgs {
  publicKey: string | null | undefined;
  mid: string | null | undefined;
  /** DOM id (without #) of the container the iframe renders into. */
  elementId: string;
  enabled?: boolean;
}

export interface UseRunner {
  ready: boolean;
  error: string | null;
  tokenize: () => Promise<TokenizeResult>;
}

export function useRunner({ publicKey, mid, elementId, enabled = true }: UseRunnerArgs): UseRunner {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runnerRef = useRef<InstanceType<NonNullable<typeof window.Runner>> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!publicKey || !mid) {
      setError('Payments are not configured for this store yet.');
      return;
    }
    let cancelled = false;
    setReady(false);
    setError(null);
    loadRunnerScript()
      .then(() => {
        if (cancelled || !window.Runner) return;
        const runner = new window.Runner();
        runnerRef.current = runner;
        runner.init(getRunnerInit({ element: `#${elementId}`, publicKey, mid }));
        runner.onLoaded(() => {
          if (!cancelled) setReady(true);
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Payment fields failed to load.');
      });
    return () => {
      cancelled = true;
      runnerRef.current = null;
    };
  }, [enabled, publicKey, mid, elementId]);

  const tokenize = useCallback((): Promise<TokenizeResult> => {
    const attempt = () =>
      new Promise<TokenizeResult>((resolve, reject) => {
        const runner = runnerRef.current;
        if (!runner) return reject(new Error('Payment fields are not ready.'));
        runner.tokenize((res, err) => {
          if (err) return reject(err instanceof Error ? err : new Error('Could not read card details.'));
          if (res?.account_token) return resolve({ account_token: res.account_token, expiry: res.expiry });
          reject(new Error('Check the card number, expiration and CVC.'));
        });
      });
    // Runner occasionally returns an empty token on the first call right after typing; retry twice.
    return attempt()
      .catch(() => attempt())
      .catch(() => attempt());
  }, []);

  return { ready, error, tokenize };
}
