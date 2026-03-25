import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable, actorsTable, calibrationLogTable, AGENT_ARCHETYPES } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { runForecastEngine } from "../lib/forecast-engine.js";
import { simulateAgents } from "../lib/agent-engine.js";
import { getLrCorrections, getBucket, computeDecay } from "../lib/calibration-utils.js";
import { computeHierarchicalCalibration, computeSegmentConfidence } from "../lib/calibration-fallback.js";
import { deriveQuestionType } from "../lib/case-context.js";
import { filterEligibleSignals, applyEventFamilyGuardrail } from "../lib/signal-eligibility.js";
import { logAudit } from "../lib/audit-service.js";

const router = Router();

router.post("/cases/:caseId/recalculate", async (req, res) => {
  try {
    const { caseId } = req.params;

    const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
    if (!caseRow[0]) return res.status(404).json({ error: "Case not found" });
    const caseData = caseRow[0];

    const allSignals = await db.select().from(signalsTable).where(
      and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active"))
    );
    const actors = await db.select().from(actorsTable).where(eq(actorsTable.specialtyProfile, "General")).orderBy(actorsTable.slotIndex);

    if (actors.length === 0) {
      return res.status(400).json({ error: "No actors configured. Please seed the database first." });
    }

    const caseTargetContext = {
      targetType: caseData.targetType ?? "market",
      targetId: caseData.targetId ?? null,
      specialty: caseData.specialty ?? null,
      subspecialty: caseData.subspecialty ?? null,
      institutionName: caseData.institutionName ?? null,
      geography: caseData.geography ?? null,
    };
    const eligibleSignals = filterEligibleSignals(allSignals, caseTargetContext);
    const signals = applyEventFamilyGuardrail(eligibleSignals);

    const corrections = await getLrCorrections();
    const now = Date.now();
    const signalsWithAdjustedLR = signals.map((s) => {
      const correction = corrections[s.signalType ?? ""] ?? 1.0;
      const ageMonths = s.createdAt
        ? (now - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
        : 0;
      const decayFactor = computeDecay(s.signalType ?? "", ageMonths);
      const adjusted = (s.likelihoodRatio ?? 1) * correction * decayFactor;
      return { ...s, likelihoodRatio: Number(adjusted.toFixed(4)) };
    });

    let agentSimulationResult: Parameters<typeof runForecastEngine>[8] = undefined;
    if (signalsWithAdjustedLR.length > 0) {
      const { agentResults, agentDerivedActorTranslation } = simulateAgents(signalsWithAdjustedLR);
      const enrichedResults = agentResults.map((r) => {
        const arch = AGENT_ARCHETYPES.find((a) => a.id === r.agentId);
        return { ...r, influenceScore: arch?.influenceScore ?? 1 };
      });
      agentSimulationResult = { agentDerivedActorTranslation, agentResults: enrichedResults };
    }

    const result = runForecastEngine(
      caseId,
      caseData.priorProbability,
      signalsWithAdjustedLR,
      actors.map((a) => ({
        actorName: a.actorName,
        influenceWeight: a.influenceWeight,
        positiveResponseFactor: a.positiveResponseFactor,
        negativeResponseFactor: a.negativeResponseFactor,
        outcomeOrientation: a.outcomeOrientation,
        slotIndex: a.slotIndex,
      })),
      caseData.primarySpecialtyProfile ?? "General",
      caseData.payerEnvironment ?? "Balanced",
      caseData.guidelineLeverage ?? "Medium",
      caseData.competitorProfile ?? "Entrenched standard of care",
      agentSimulationResult
    );

    const rawProbability = result.currentProbability;
    const therapyArea = caseData.therapeuticArea ?? null;
    const questionType = deriveQuestionType(caseData.strategicQuestion ?? null);

    const hierarchicalCalibration = await computeHierarchicalCalibration(
      rawProbability,
      therapyArea,
      questionType,
    );
    const calibratedProbability = hierarchicalCalibration.calibratedProbability;

    const calculatedAt = new Date();

    await db.update(casesTable).set({
      currentProbability: calibratedProbability,
      confidenceLevel: result.confidenceLevel,
      topSupportiveActor: result.topSupportiveActor,
      topConstrainingActor: result.topConstrainingActor,
      miosRoutingCheck: result.interpretation.miosRoutingCheck,
      ohosRoutingCheck: result.interpretation.ohosRoutingCheck,
      lastUpdate: calculatedAt,
    }).where(eq(casesTable.caseId, caseId));

    const forecastId = `FCAST-${Date.now()}`;
    await db.insert(calibrationLogTable).values({
      id: randomUUID(),
      forecastId,
      caseId,
      predictedProbability: calibratedProbability,
      snapshotJson: JSON.stringify(result),
    }).onConflictDoNothing();

    await logAudit({
      objectType: "case",
      objectId: caseId,
      action: "recalculated",
      performedByType: req.body?.performedByType || "human",
      performedById: req.body?.performedById || null,
      afterState: {
        score: calibratedProbability,
        forecastId,
        signalCount: signalsWithAdjustedLR.length,
      },
    });

    res.json({
      ok: true,
      caseId,
      score: calibratedProbability,
      calculatedAt: calculatedAt.toISOString(),
      signalCount: signalsWithAdjustedLR.length,
      forecastId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to recalculate case";
    res.status(500).json({ error: message });
  }
});

export default router;
