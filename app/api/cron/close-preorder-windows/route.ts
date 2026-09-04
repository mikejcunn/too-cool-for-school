import { NextResponse, type NextRequest } from 'next/server';
import { closeDueWindows } from '@/lib/purchasing/windows';
import { notifyWindowClosed } from '@/lib/email/preorder';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const closed = await closeDueWindows();
  for (const c of closed)
    await notifyWindowClosed(c.orgId, c.windowId).catch((e) => console.error('[cron] notify failed', e));
  return NextResponse.json({ ok: true, closed: closed.length, at: new Date().toISOString() });
}
