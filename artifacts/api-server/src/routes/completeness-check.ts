import { Router } from "express";
import { db, signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runCompletenessCheck } from "../lib/signal-completeness-check.js";

const router = Router();

router.get("/cases/:caseId/completeness-check", async (req, res) => {
  try {
    const { caseId } = req.params;
    const signals = await db.select().from(signalsTable).where(eq(signalsTable.caseId, caseId));
    const result = runCompletenessCheck(signals as any[]);
    res.json({ caseId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run completeness check";
    res.status(500).json({ error: message });
  }
});

router.get("/completeness-check/all", async (_req, res) => {
  try {
    const allSignals = await db.select().from(signalsTable);
    const byCaseId: Record<string, any[]> = {};
    for (const s of allSignals) {
      const cid = (s as any).caseId;
      if (!byCaseId[cid]) byCaseId[cid] = [];
      byCaseId[cid].push(s);
    }

    const { casesTable } = await import("@workspace/db");
    const cases = await db.select().from(casesTable);
    const results = cases.map((c: any) => {
      const caseSignals = byCaseId[c.caseId] || [];
      const check = runCompletenessCheck(caseSignals as any[]);
      return {
        caseId: c.caseId,
        assetName: c.assetName || c.caseId,
        ...check,
      };
    });

    res.json({ cases: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run completeness check";
    res.status(500).json({ error: message });
  }
});

export default router;
