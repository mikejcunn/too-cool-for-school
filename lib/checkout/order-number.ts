import { eq, sql } from 'drizzle-orm';
import { organizations } from '@/lib/db/schema';
import type { Tx } from '@/lib/db';

/** Atomically take the next order number for an org, e.g. "W-1042". */
export async function nextOrderNumber(tx: Tx, orgId: string): Promise<string> {
  const [row] = await tx
    .update(organizations)
    .set({ nextOrderNumber: sql`${organizations.nextOrderNumber} + 1` })
    .where(eq(organizations.id, orgId))
    .returning({ next: organizations.nextOrderNumber, prefix: organizations.orderPrefix });
  if (!row) throw new Error('nextOrderNumber: org not found');
  return `${row.prefix}-${row.next - 1}`;
}
