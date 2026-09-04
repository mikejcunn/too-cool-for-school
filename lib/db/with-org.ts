import { sql } from 'drizzle-orm';
import { db, type Tx } from './index';

/**
 * Run `fn` in a transaction with `app.org_id` set for the transaction. Today this is
 * a convention only; it lets Postgres RLS be enabled later (ADR-0003) with no
 * call-site changes.
 */
export function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
