import { Router } from "express";
import { db } from "@workspace/db";
import { goldSetCasesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

router.get("/gold-set", async (_req, res) => {
  try {
    const cases = await db.select().from(goldSetCasesTable);
    res.json(cases);
  } catch (err) {
    console.error("Failed to fetch gold set cases:", err);
    res.status(500).json({ error: "Failed to fetch gold set cases" });
  }
});

router.get("/gold-set/:id", async (req, res) => {
  try {
    const [c] = await db.select().from(goldSetCasesTable).where(eq(goldSetCasesTable.id, req.params.id));
    if (!c) return res.status(404).json({ error: "Gold set case not found" });
    res.json(c);
  } catch (err) {
    console.error("Failed to fetch gold set case:", err);
    res.status(500).json({ error: "Failed to fetch gold set case" });
  }
});

router.post("/gold-set", async (req, res) => {
  try {
    const id = req.body.id || `gs-${randomUUID().slice(0, 8)}`;
    const [created] = await db.insert(goldSetCasesTable).values({
      id,
      caseName: req.body.caseName,
      sourceType: req.body.sourceType,
      sourceReference: req.body.sourceReference || null,
      sourceText: req.body.sourceText || null,
      expectedDecisionClassification: req.body.expectedDecisionClassification || null,
      expectedPrimaryQuestion: req.body.expectedPrimaryQuestion || null,
      expectedTopSignalFamilies: req.body.expectedTopSignalFamilies || [],
      expectedStrongSignals: req.body.expectedStrongSignals || [],
      expectedDuplicateTraps: req.body.expectedDuplicateTraps || [],
      expectedNoiseSignals: req.body.expectedNoiseSignals || [],
      expectedNotes: req.body.expectedNotes || null,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("Failed to create gold set case:", err);
    res.status(500).json({ error: "Failed to create gold set case" });
  }
});

export default router;
