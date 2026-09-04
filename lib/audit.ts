import { auditLog } from '@/lib/db/schema';
import type { Tx } from '@/lib/db';

export interface AuditInput {
  orgId?: string | null;
  actorUserId?: string | null;
  actorType?: 'user' | 'shopper' | 'system';
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function audit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.insert(auditLog).values({
    orgId: input.orgId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? (input.actorUserId ? 'user' : 'system'),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}
