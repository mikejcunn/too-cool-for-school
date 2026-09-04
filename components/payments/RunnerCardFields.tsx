'use client';
/* Card entry. Real mode mounts the Runner.js iframe; mock mode (dev only) renders a
 * plain input and fabricates a token so the checkout flow can be exercised locally. */
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { useRunner, type TokenizeResult } from '@/lib/runner/use-runner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface CardFieldsHandle {
  tokenize: () => Promise<TokenizeResult>;
}

export interface RunnerCardFieldsProps {
  publicKey: string | null | undefined;
  mid: string | null | undefined;
  mockMode?: boolean;
  elementId?: string;
  onReadyChange?: (ready: boolean) => void;
}

export const RunnerCardFields = forwardRef<CardFieldsHandle, RunnerCardFieldsProps>(function RunnerCardFields(
  { publicKey, mid, mockMode = false, elementId = 'run-form', onReadyChange },
  ref
) {
  const [mockNumber, setMockNumber] = useState('');
  const runner = useRunner({ publicKey, mid, elementId, enabled: !mockMode });

  useImperativeHandle(
    ref,
    () => ({
      tokenize: async () => {
        if (mockMode) {
          const digits = mockNumber.replace(/\D/g, '');
          if (digits.length < 12)
            throw new Error('Enter a card number (any 12+ digits; 0000 at the end declines).');
          const prefix = digits.endsWith('0000')
            ? 'mock_decline'
            : digits.endsWith('9999')
              ? 'mock_error'
              : 'mock_ok';
          return { account_token: `${prefix}_${digits}`, expiry: '1229' };
        }
        return runner.tokenize();
      },
    }),
    [mockMode, mockNumber, runner]
  );

  const ready = mockMode ? true : runner.ready;
  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  if (mockMode) {
    return (
      <div className="grid gap-2">
        <Label htmlFor="mock-card">Card number</Label>
        <Input
          id="mock-card"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          value={mockNumber}
          onChange={(e) => setMockNumber(e.target.value)}
        />
        <p className="text-xs text-amber-700">
          Test mode: cards ending in <code>0000</code> decline, <code>9999</code> simulate a network failure.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label>Card details</Label>
      <div id={elementId} className="min-h-24 rounded-md border bg-background p-2" aria-busy={!ready} />
      {!ready && !runner.error && (
        <p className="text-xs text-muted-foreground">Loading secure card fields…</p>
      )}
      {runner.error && <p className="text-sm text-destructive">{runner.error}</p>}
    </div>
  );
});
