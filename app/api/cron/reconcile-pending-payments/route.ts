import { NextResponse, type NextRequest } from 'next/server';
import { reconcileUnknownPayments } from '@/lib/checkout/resolve-payment';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const r = await reconcileUnknownPayments();
  return NextResponse.json({ ok: true, ...r, at: new Date().toISOString() });
}
