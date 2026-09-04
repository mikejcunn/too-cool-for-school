/* Server-side reCAPTCHA v3 verification (copied from run-payment-page/utils/recaptcha.ts).
 * Fails closed in production when no secret is configured; fails open elsewhere. */

export interface RecaptchaResult {
  success: boolean;
  score?: number;
  error?: string;
}

export async function verifyRecaptchaToken(
  token: string,
  expectedAction: string,
  minScore = 0.5
): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { success: false, error: 'reCAPTCHA secret not configured' };
    }
    return { success: true, score: 1 };
  }
  if (!token) return { success: false, error: 'Missing reCAPTCHA token' };

  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }).toString(),
    });
    const data = (await res.json()) as {
      success: boolean;
      score?: number;
      action?: string;
      'error-codes'?: string[];
    };
    if (!data.success) {
      return { success: false, error: (data['error-codes'] || []).join(', ') || 'verification failed' };
    }
    if (data.action && data.action !== expectedAction) {
      return { success: false, score: data.score, error: 'action mismatch' };
    }
    if (typeof data.score === 'number' && data.score < minScore) {
      return { success: false, score: data.score, error: 'score below threshold' };
    }
    return { success: true, score: data.score };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'verification error' };
  }
}
