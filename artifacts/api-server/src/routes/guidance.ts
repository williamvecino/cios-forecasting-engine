import { Router } from "express";
import { db } from "@workspace/db";
import { guidanceTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

router.get("/guidance", async (req, res) => {
  const caseId = req.query.caseId as string | undefined;
  const rows = caseId
    ? await db.select().from(guidanceTable).where(eq(guidanceTable.caseId, caseId))
    : await db.select().from(guidanceTable);
  res.json(rows);
});

router.post("/guidance", async (req, res) => {
  const body = req.body;
  const [created] = await db.insert(guidanceTable).values({
    id: randomUUID(),
    guidanceId: `GUID-${Date.now()}`,
    caseId: body.caseId,
    keyRiskDriver: body.keyRiskDriver,
    recommendedAction: body.recommendedAction,
    targetAudience: body.targetAudience,
    priorityLevel: body.priorityLevel || "Medium",
    linkedSignalId: body.linkedSignalId,
  }).returning();
  res.status(201).json(created);
});

export default router;
