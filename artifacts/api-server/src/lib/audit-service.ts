import { randomUUID } from "crypto";
import { db, auditLogsTable } from "@workspace/db";

export async function logAudit(params: {
  objectType: string;
  objectId: string;
  action: string;
  performedByType?: string;
  performedById?: string | null;
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}) {
  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    objectType: params.objectType,
    objectId: params.objectId,
    action: params.action,
    performedByType: params.performedByType || "human",
    performedById: params.performedById || null,
    beforeStateJson: params.beforeState || null,
    afterStateJson: params.afterState || null,
    metadata: params.metadata || null,
  });
}
