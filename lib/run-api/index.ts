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
  if (mockEnabled()) return mockCharge(body);
  return postJson<ChargeResponse>('/charge', { capture: 'Y', currency: 'USD', ...body });
}

/** Void (unsettled) or refund (settled) a prior transaction; Javelin decides which. */
export function voidOrRefund(body: VoidOrRefundBody): Promise<VoidOrRefundResponse> {
  if (mockEnabled()) return mockVoidOrRefund(body);
  return postJson<VoidOrRefundResponse>('/void-or-refund', body);
}

// ─── Dev-only mock gateway ─────────────────────────────────────────────────────
// RUN_MOCK_GATEWAY=true (never honoured in production). Tokens starting with
// "mock_decline" are declined; "mock_error" throws like a network failure; anything
// else is approved. Lets local dev and e2e run without Run UAT credentials.
export function mockEnabled(): boolean {
  return process.env.RUN_MOCK_GATEWAY === 'true' && process.env.NODE_ENV !== 'production';
}

async function mockCharge(body: ChargeBody): Promise<ChargeResponse> {
  await new Promise((r) => setTimeout(r, 150));
  if (body.account_token.startsWith('mock_error')) throw new RunApiError('mock network failure');
  const declined = body.account_token.startsWith('mock_decline');
  const last4 = body.account_token.replace(/\D/g, '').slice(-4) || '4242';
  return {
    result: declined ? 'C' : 'A',
    trans_id: declined ? null : `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    resp_code: declined ? '051' : '000',
    resp_text: declined ? 'Insufficient funds (mock)' : 'Approval (mock)',
    amount: body.amount,
    authcode: declined ? null : 'MOCK01',
    card_number: `9${'x'.repeat(11)}${last4}`,
    card_type: 'VISA',
    avs_resp: 'Y',
    cvv_resp: 'M',
  };
}

async function mockVoidOrRefund(body: VoidOrRefundBody): Promise<VoidOrRefundResponse> {
  await new Promise((r) => setTimeout(r, 100));
  return {
    result: 'A',
    trans_id: `mock-refund-${Date.now()}`,
    resp_code: '000',
    resp_text: 'Approval (mock)',
    amount: body.amount ?? null,
  };
}
