/* Javelin Payments API client (Run Payments).
 * Adapted from run-payment-page/lib/run-api/index.ts: an always-on token, no
 * api_key refresh dance, plus void-or-refund and a hard request timeout. */
import type { ChargeBody, ChargeResponse, VoidOrRefundBody, VoidOrRefundResponse } from '@/types/run';

const RUN_BASE = process.env.RUN_API_BASE_URL || 'https://javelin.runpayments.io/api/v1';
const TIMEOUT_MS = Number(process.env.RUN_API_TIMEOUT_MS || 30_000);

function token(): string {
  const t = process.env.RUN_GOD_MODE_TOKEN || process.env.RUN_API_KEY || '';
  if (!t) throw new Error('RUN_GOD_MODE_TOKEN (or RUN_API_KEY) is not set');
  return t;
}

export class RunApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'RunApiError';
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${RUN_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new RunApiError(`Run API returned non-JSON (${res.status})`, res.status);
  }
  if (res.status === 401 || res.status === 403) {
    throw new RunApiError(`Run API auth failed (${res.status})`, res.status);
  }
  if (res.status >= 500) {
    throw new RunApiError(`Run API server error (${res.status})`, res.status);
  }
  return data as T;
}

/**
 * Auth + capture a tokenized card. Throws on network/timeout/auth/5xx (caller
 * treats that as "outcome unknown"); resolves with the gateway's decision
 * otherwise, including declines.
 */
export function charge(body: ChargeBody): Promise<ChargeResponse> {
  return postJson<ChargeResponse>('/charge', { capture: 'Y', currency: 'USD', ...body });
}

/** Void (unsettled) or refund (settled) a prior transaction; Javelin decides which. */
export function voidOrRefund(body: VoidOrRefundBody): Promise<VoidOrRefundResponse> {
  return postJson<VoidOrRefundResponse>('/void-or-refund', body);
}
