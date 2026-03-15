import { Router } from "express";
import { db } from "@workspace/db";
import { watchlistTable } from "@workspace/db";
import { randomUUID } from "crypto";

const router = Router();

router.get("/watchlist", async (_req, res) => {
  const rows = await db.select().from(watchlistTable).orderBy(watchlistTable.createdAt);
  res.json(rows);
});

router.post("/watchlist", async (req, res) => {
  const body = req.body;
  const [created] = await db.insert(watchlistTable).values({
    id: randomUUID(),
    signalId: `SIG-W-${Date.now()}`,
    signalName: body.signalName,
    signalType: body.signalType,
    expectedWindow: body.expectedWindow,
    owner: body.owner,
    expectedDirection: body.expectedDirection,
    estimatedImpact: body.estimatedImpact,
    evidenceSource: body.evidenceSource,
    status: body.status || "Pending",
    notes: body.notes,
  }).returning();
  res.status(201).json(created);
});

export default router;
