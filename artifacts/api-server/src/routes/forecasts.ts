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

const router = Router();

router.get("/cases/:caseId/forecast", async (req, res) => {
  const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  if (!caseRow[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRow[0];

  const allSignals = await db.select().from(signalsTable).where(
    and(eq(signalsTable.caseId, req.params.caseId), eq(signalsTable.status, "active"))
  );
  const actors = await db.select().from(actorsTable).where(eq(actorsTable.specialtyProfile, "General")).orderBy(actorsTable.slotIndex);

  if (actors.length === 0) {
    return res.status(400).json({ error: "No actors configured. Please seed the database first." });
  }

  // ── Apply target-scope eligibility filter ─────────────────────────────────
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

  // ── Apply LR corrections and freshness decay ─────────────────────────────
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

  // ── Run agent simulation ─────────────────────────────────────────────────
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
    req.params.caseId,
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

  // ── Apply hierarchical calibration fallback ──────────────────────────────
  const rawProbability = result.currentProbability;
  const therapyArea = caseData.therapeuticArea ?? null;
  const questionType = deriveQuestionType(caseData.strategicQuestion ?? null);

  const hierarchicalCalibration = await computeHierarchicalCalibration(
    rawProbability,
    therapyArea,
    questionType,
  );
  const calibrationConfidence = await computeSegmentConfidence(
    hierarchicalCalibration,
    therapyArea,
  );
  const calibratedProbability = hierarchicalCalibration.calibratedProbability;

  // Keep bucket field for backward compatibility with downstream consumers
  const bucket = getBucket(rawProbability);

  const finalResult = {
    ...result,
    currentProbability: calibratedProbability,
    rawProbability,
    bucketCorrectionApplied: hierarchicalCalibration.correctionAppliedPp !== 0
      ? { bucket, correctionPp: hierarchicalCalibration.correctionAppliedPp }
      : null,
    hierarchicalCalibration,
    calibrationConfidence,
    // ── Case context metadata (embedded for validation + trace integrity) ───
    _caseContext: {
      caseId: req.params.caseId,
      therapeuticArea: caseData.therapeuticArea ?? null,
      diseaseState: caseData.diseaseState ?? null,
      specialty: caseData.specialty ?? null,
      strategicQuestion: caseData.strategicQuestion ?? null,
      timeHorizon: caseData.timeHorizon ?? "12 months",
      caseMode: caseData.isDemo === "true" ? "demo" : "live",
      actorContext: {
        payerEnvironment: caseData.payerEnvironment ?? "Balanced",
        guidelineLeverage: caseData.guidelineLeverage ?? "Medium",
        competitorProfile: caseData.competitorProfile ?? "Entrenched standard of care",
        primarySpecialtyProfile: caseData.primarySpecialtyProfile ?? "General",
      },
      forecastDate: new Date().toISOString(),
    },
    _targetFiltering: {
      caseTargetType: caseTargetContext.targetType,
      totalSignals: allSignals.length,
      eligibleSignals: eligibleSignals.length,
      filteredOut: allSignals.length - eligibleSignals.length,
    },
  };

  await db.update(casesTable).set({
    currentProbability: calibratedProbability,
    confidenceLevel: result.confidenceLevel,
    topSupportiveActor: result.topSupportiveActor,
    topConstrainingActor: result.topConstrainingActor,
    miosRoutingCheck: result.interpretation.miosRoutingCheck,
    ohosRoutingCheck: result.interpretation.ohosRoutingCheck,
    lastUpdate: new Date(),
  }).where(eq(casesTable.caseId, req.params.caseId));

  const forecastId = `FCAST-${Date.now()}`;
  await db.insert(calibrationLogTable).values({
    id: randomUUID(),
    forecastId,
    caseId: req.params.caseId,
    predictedProbability: calibratedProbability,
    snapshotJson: JSON.stringify(finalResult),
  }).onConflictDoNothing();

  res.json({ ...finalResult, forecastId, savedAt: new Date().toISOString() });
});

export default router;
