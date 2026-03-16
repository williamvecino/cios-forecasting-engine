import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { computeDecisionPaths, getArchetypeDefinitions } from "../lib/decision-path-engine.js";
import type { SignalInput } from "../lib/decision-path-engine.js";

const router = Router();

router.post("/cases/:caseId/decision-paths", async (req, res) => {
  try {
    const { caseId } = req.params;

    const signals = await db
      .select()
      .from(signalsTable)
      .where(eq(signalsTable.caseId, caseId));

    if (signals.length === 0) {
      return res.status(404).json({ error: "No signals found for case" });
    }

    const signalInputs: SignalInput[] = signals.map((s) => ({
      signalId: s.signalId,
      signalType: s.signalType,
      direction: s.direction,
      strengthScore: s.strengthScore,
      reliabilityScore: s.reliabilityScore,
      likelihoodRatio: Number(s.likelihoodRatio) || 1,
      scope: s.scope,
      timing: s.timing,
    }));

    const results = computeDecisionPaths(signalInputs);

    const summary = {
      totalArchetypes: results.length,
      activated: results.filter((r) => r.actionThresholdCrossed).length,
      nearThreshold: results.filter(
        (r) => !r.actionThresholdCrossed && r.convictionLevel >= r.actionThreshold - 0.10
      ).length,
      signalCount: signals.length,
    };

    res.json({
      caseId,
      signalCount: signals.length,
      archetypes: results,
      summary,
      computedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[decision-paths] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/decision-paths/archetypes", async (_req, res) => {
  res.json(getArchetypeDefinitions());
});

export default router;
