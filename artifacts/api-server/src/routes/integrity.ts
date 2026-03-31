import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { integrityTestResultsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

router.get("/integrity/cases/:caseId", async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(integrityTestResultsTable)
      .where(eq(integrityTestResultsTable.caseId, req.params.caseId))
      .orderBy(desc(integrityTestResultsTable.createdAt))
      .limit(50);

    const latestRunId = rows[0]?.runId ?? null;
    const latestResults = latestRunId
      ? rows.filter(r => r.runId === latestRunId)
      : [];

    const coreInvariants = [
      "threshold_monotonicity",
      "positive_signal_response",
      "negative_signal_response",
      "reproducibility",
    ];

    const coreFailures = latestResults
      .filter(r => !r.passed && coreInvariants.includes(r.invariantName))
      .map(r => r.invariantName);

    res.json({
      caseId: req.params.caseId,
      latestRunId,
      totalTests: latestResults.length,
      passed: latestResults.filter(r => r.passed).length,
      failed: latestResults.filter(r => !r.passed).length,
      coreFailures,
      stabilityWarning: coreFailures.length > 0,
      unreliableFlag: coreFailures.length >= 2,
      results: latestResults,
      allRuns: [...new Set(rows.map(r => r.runId))],
    });
  } catch (err) {
    console.error("[integrity] Failed to fetch results:", err);
    res.status(500).json({ error: "Failed to fetch integrity results" });
  }
});

router.get("/integrity/cases/:caseId/runs/:runId", async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(integrityTestResultsTable)
      .where(
        and(
          eq(integrityTestResultsTable.caseId, req.params.caseId),
          eq(integrityTestResultsTable.runId, req.params.runId),
        )
      )
      .orderBy(integrityTestResultsTable.invariantName);

    res.json({
      caseId: req.params.caseId,
      runId: req.params.runId,
      results: rows,
    });
  } catch (err) {
    console.error("[integrity] Failed to fetch run:", err);
    res.status(500).json({ error: "Failed to fetch integrity run" });
  }
});

export default router;
