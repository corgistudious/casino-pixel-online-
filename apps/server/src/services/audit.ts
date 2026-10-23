import type { DbOrTx } from '../db/client';
import { auditLogs } from '../db/schema';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string | number;
  details?: Record<string, unknown>;
  ip?: string;
}

/** Appends to the immutable audit trail. Call inside the same transaction as the change. */
export async function audit(db: DbOrTx, e: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: e.actorId ?? null,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId === undefined ? null : String(e.targetId),
    details: e.details ?? null,
    ip: e.ip ?? null,
  });
}
