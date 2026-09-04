import { inArray, like } from 'drizzle-orm';
import { db } from '@/lib/db';
import { allocationRules, organizations, orders, purchaseOrders, users } from '@/lib/db/schema';

/** Remove every throwaway org (slug test-%) in FK-safe order, plus test users. */
export async function cleanupTestOrgs(): Promise<void> {
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(like(organizations.slug, 'test-%'));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.orgId, ids)); // cascades PO lines
    await db.delete(orders).where(inArray(orders.orgId, ids)); // cascades order lines, payments, refunds, allocation entries
    await db.delete(allocationRules).where(inArray(allocationRules.orgId, ids)); // cascades rule splits (they reference beneficiaries)
    await db.delete(organizations).where(inArray(organizations.id, ids)); // cascades products, variants, movements, sessions
  }
  await db.delete(users).where(like(users.email, 'test-%'));
}
