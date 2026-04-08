import { Router } from "express";
import { runCaseScoringEngine } from "../services/recalculateCaseScore.js";
import { logAudit } from "../lib/audit-service.js";
import { db, signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runCompletenessCheck } from "../lib/signal-completeness-check.js";

const router = Router();

router.post("/cases/:caseId/recalculate", async (req, res) => {
  try {
    const { caseId } = req.params;

    const signals = await db.select().from(signalsTable).where(eq(signalsTable.caseId, caseId));
    const completeness = runCompletenessCheck(signals as any[]);
    if (completeness.hardBlocked) {
      const missing = completeness.tier1.filter(c => !c.present).map(c => c.message);
      res.status(422).json({
        ok: false,
        blocked: true,
        reason: "clinical_evidence_missing",
        messages: missing,
        completeness,
      });
      return;
    }

    const result = await runCaseScoringEngine(caseId);

    await logAudit({
      objectType: "case",
      objectId: caseId,
      action: "recalculated",
      performedByType: req.body?.performedByType || "human",
      performedById: req.body?.performedById || null,
      afterState: {
        score: result.score,
        forecastId: result.forecastId,
        signalCount: result.signalCount,
      },
    });

    res.json({
      ok: true,
      caseId,
      score: result.score,
      calculatedAt: result.calculatedAt,
      signalCount: result.signalCount,
      forecastId: result.forecastId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to recalculate case";
    res.status(500).json({ error: message });
  }
});

export default router;
