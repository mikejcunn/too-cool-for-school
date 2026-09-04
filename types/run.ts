/* Types for the Run Payments (Javelin) Payments API.
 * Source of truth: dev-docs/fern/apis/payments/swagger.yml */

/** Body for POST /api/v1/charge (card via Runner.js account_token). */
export interface ChargeBody {
  mid: string;
  /** See lib/run-api/amount.ts for the unit convention. */
  amount: string | number;
  account_token: string;
  expiration?: string;
  /** 'Y' = auth + capture (default for this app). */
  capture?: 'Y' | 'N';
  currency?: string;
  /** Card-not-present origin: E = ecommerce, T = telephone, R = recurring. */
  com_ind?: 'E' | 'T' | 'R';
  order_id?: string;
  invoice_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
  region?: string;
  account_zip?: string;
  country?: string;
  user_identifier?: string;
  custom_01?: string;
  custom_02?: string;
  custom_03?: string;
  custom_04?: string;
  custom_05?: string;
}

/**
 * Subset of the /charge response we consume. `result` is 'A' when approved;
 * anything else is treated as not approved. Swagger documents A/B/C, shipped
 * apps have also seen D (declined) and E (error).
 */
export interface ChargeResponse {
  result: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  trans_id: string | null;
  resp_code: string | null;
  resp_text: string | null;
  amount: string | number | null;
  authcode?: string | null;
  /** Masked PAN; take the last 4. */
  card_number?: string | null;
  card_type?: string | null;
  card_brand?: string | null;
  avs_resp?: string | null;
  cvv_resp?: string | null;
  fee_amount?: string | null;
  [k: string]: unknown;
}

/** Body for POST /api/v1/void-or-refund. Omit amount for a full void/refund. */
export interface VoidOrRefundBody {
  trans_id: string;
  mid: string;
  amount?: string | number;
  user_identifier?: string;
}

export interface VoidOrRefundResponse {
  result: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  trans_id: string | null;
  resp_code: string | null;
  resp_text: string | null;
  amount?: string | number | null;
  [k: string]: unknown;
}

export function isApproved(r: { result: string | null; trans_id: string | null }): boolean {
  return r.result === 'A' && !!r.trans_id;
}
