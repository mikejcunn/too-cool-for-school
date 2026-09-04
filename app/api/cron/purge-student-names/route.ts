import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
const RETENTION_DAYS = Number(process.env.STUDENT_NAME_RETENTION_DAYS || 90);

/** Student names are PII about minors: drop them once an order has been delivered for a while. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const purged = await db
    .update(orders)
    .set({ studentName: null, notes: sql`coalesce(${orders.notes}, '') || ' [student name purged]'` })
    .where(
      and(
        eq(orders.fulfillmentStatus, 'fulfilled'),
        isNotNull(orders.studentName),
        lt(orders.fulfilledAt, cutoff)
      )
    )
    .returning({ id: orders.id });
  return NextResponse.json({ ok: true, purged: purged.length, cutoff: cutoff.toISOString() });
}
