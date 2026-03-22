import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";

const router = Router();

router.get("/audit-logs", async (req, res) => {
  const { objectType, objectId, action, limit: limitStr } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitStr || "100", 10), 500);

  let query = db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.timestamp)).limit(limit);

  if (objectType && objectId) {
    query = db.select().from(auditLogsTable)
      .where(and(eq(auditLogsTable.objectType, objectType), eq(auditLogsTable.objectId, objectId)))
      .orderBy(desc(auditLogsTable.timestamp))
      .limit(limit);
  } else if (objectType) {
    query = db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.objectType, objectType))
      .orderBy(desc(auditLogsTable.timestamp))
      .limit(limit);
  } else if (objectId) {
    query = db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.objectId, objectId))
      .orderBy(desc(auditLogsTable.timestamp))
      .limit(limit);
  }

  const logs = await query;
  res.json(logs);
});

export default router;
