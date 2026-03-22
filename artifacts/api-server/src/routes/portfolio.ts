import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable, actorsTable, AGENT_ARCHETYPES } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { runForecastEngine } from "../lib/forecast-engine.js";
import { simulateAgents } from "../lib/agent-engine.js";
import { getLrCorrections, computeDecay } from "../lib/calibration-utils.js";
import { computeHierarchicalCalibration, computeSegmentConfidence } from "../lib/calibration-fallback.js";
import { deriveQuestionType } from "../lib/case-context.js";
import {
  extractKeyDrivers,
  buildTraceSummary,
  buildPortfolioSummary,
  type PortfolioQuestion,
  type PortfolioQuestionResult,
  type PortfolioOutput,
} from "../lib/portfolio-engine.js";

const router = Router();

router.post("/cases/:caseId/portfolio", async (req, res) => {
  const { caseId } = req.params;
  const { questions } = req.body as { questions: PortfolioQuestion[] };

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "Request body must include a non-empty 'questions' array." });
  }
  if (questions.length > 10) {
    return res.status(400).json({ error: "Maximum 10 questions per portfolio request." });
  }
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.label || !q.strategicQuestion) {
      return res.status(400).json({ error: `Question ${i + 1}: label and strategicQuestion are required.` });
    }
    if (q.priorOverride !== undefined) {
      if (typeof q.priorOverride !== "number" || q.priorOverride < 0.01 || q.priorOverride > 0.99) {
        return res.status(400).json({ error: `Question ${i + 1}: priorOverride must be between 0.01 and 0.99.` });
      }
    }
  }

  const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRow[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRow[0];

  const signals = await db.select().from(signalsTable).where(
    and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active"))
  );
  const actors = await db.select().from(actorsTable).where(eq(actorsTable.specialtyProfile, "General")).orderBy(actorsTable.slotIndex);
  if (actors.length === 0) {
    return res.status(400).json({ error: "No actors configured. Please seed the database first." });
  }

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

  const actorConfigs = actors.map((a) => ({
    actorName: a.actorName,
    influenceWeight: a.influenceWeight,
    positiveResponseFactor: a.positiveResponseFactor,
    negativeResponseFactor: a.negativeResponseFactor,
    outcomeOrientation: a.outcomeOrientation,
    slotIndex: a.slotIndex,
  }));

  const therapyArea = caseData.therapeuticArea ?? null;

  const questionResults: PortfolioQuestionResult[] = [];

  for (const q of questions) {
    const prior = q.priorOverride ?? caseData.priorProbability;
    const questionType = deriveQuestionType(q.strategicQuestion);

    const result = runForecastEngine(
      caseId,
      prior,
      signalsWithAdjustedLR,
      actorConfigs,
      caseData.primarySpecialtyProfile ?? "General",
      caseData.payerEnvironment ?? "Balanced",
      caseData.guidelineLeverage ?? "Medium",
      caseData.competitorProfile ?? "Entrenched standard of care",
      agentSimulationResult,
    );

    const rawProbability = result.currentProbability;

    const hierarchicalCalibration = await computeHierarchicalCalibration(
      rawProbability,
      therapyArea,
      questionType,
    );
    const calibrationConfidence = await computeSegmentConfidence(
      hierarchicalCalibration,
      therapyArea,
    );

    const keyDrivers = extractKeyDrivers(result);
    const traceSummary = buildTraceSummary(
      q.label,
      questionType,
      rawProbability,
      hierarchicalCalibration.calibratedProbability,
      hierarchicalCalibration,
      calibrationConfidence,
    );

    questionResults.push({
      label: q.label,
      strategicQuestion: q.strategicQuestion,
      questionType,
      priorProbability: prior,
      rawProbability,
      calibratedProbability: hierarchicalCalibration.calibratedProbability,
      hierarchicalCalibration,
      calibrationConfidence,
      keyDrivers,
      traceSummary,
    });
  }

  const portfolioSummary = buildPortfolioSummary(questionResults);

  const output: PortfolioOutput = {
    caseId,
    questions: questionResults,
    portfolio: portfolioSummary,
    generatedAt: new Date().toISOString(),
  };

  res.json(output);
});

export default router;
