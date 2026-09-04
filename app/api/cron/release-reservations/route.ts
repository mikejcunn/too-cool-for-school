import { NextResponse, type NextRequest } from 'next/server';
import { releaseExpiredReservationsAllOrgs } from '@/lib/checkout/release-expired';

export const dynamic = 'force-dynamic';

/** Vercel Cron (or any scheduler) hits this every 5 minutes with the shared secret. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const summary = await releaseExpiredReservationsAllOrgs();
  return NextResponse.json({ ok: true, ...summary, at: new Date().toISOString() });
}
