/* Outbound email via Resend. Silently logs instead of sending when no key is configured. */
import { Resend } from 'resend';
import type { ReactElement } from 'react';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';

const key = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM || 'School Store <store@example.org>';
const client = key ? new Resend(key) : null;

export interface SendArgs {
  to: string;
  subject: string;
  react: ReactElement;
  orgId?: string | null;
  orderId?: string | null;
  type: 'receipt' | 'refund' | 'preorder_update' | 'magic_link';
}

export async function sendEmail(args: SendArgs): Promise<{ id: string | null }> {
  let id: string | null = null;
  let status = 'sent';
  let error: string | null = null;
  if (!client) {
    console.log(`[email] (not configured) would send "${args.subject}" to ${args.to}`);
    status = 'skipped';
  } else {
    const res = await client.emails.send({ from, to: args.to, subject: args.subject, react: args.react });
    if (res.error) {
      status = 'error';
      error = res.error.message;
      console.error('[email] send failed', res.error);
    } else {
      id = res.data?.id ?? null;
    }
  }
  await db
    .insert(notifications)
    .values({
      orgId: args.orgId ?? null,
      orderId: args.orderId ?? null,
      type: args.type,
      toEmail: args.to,
      providerMessageId: id,
      status,
      error,
    })
    .catch((e) => console.error('[email] notification log failed', e));
  return { id };
}
