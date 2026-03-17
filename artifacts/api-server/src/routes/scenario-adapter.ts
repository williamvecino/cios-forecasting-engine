import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable, actorsTable, AGENT_ARCHETYPES } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runForecastEngine } from "../lib/forecast-engine.js";
import { simulateAgents } from "../lib/agent-engine.js";
import { getLrCorrections, computeDecay } from "../lib/calibration-utils.js";
import { computeHierarchicalCalibration } from "../lib/calibration-fallback.js";
import { deriveQuestionType } from "../lib/case-context.js";

const router = Router();

router.post("/cases/:caseId/scenario-simulate", async (req, res) => {
  const { excludeSignalIds = [] } = req.body as { excludeSignalIds?: string[] };

  const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  if (!caseRow[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRow[0];

  const allSignals = await db.select().from(signalsTable).where(eq(signalsTable.caseId, req.params.caseId));
  const actors = await db.select().from(actorsTable).where(eq(actorsTable.specialtyProfile, "General")).orderBy(actorsTable.slotIndex);
  if (actors.length === 0) return res.status(400).json({ error: "No actors configured." });

  const corrections = await getLrCorrections();
  const now = Date.now();

  const applyLrAdjustments = (signals: typeof allSignals) =>
    signals.map((s) => {
      const correction = corrections[s.signalType ?? ""] ?? 1.0;
      const ageMonths = s.createdAt
        ? (now - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
        : 0;
      const decayFactor = computeDecay(s.signalType ?? "", ageMonths);
      const adjusted = (s.likelihoodRatio ?? 1) * correction * decayFactor;
      return { ...s, likelihoodRatio: Number(adjusted.toFixed(4)) };
    });

  const actorConfigs = actors.map((a) => ({
    actorName: a.actorName,
    influenceWeight: a.influenceWeight,
    positiveResponseFactor: a.positiveResponseFactor,
    negativeResponseFactor: a.negativeResponseFactor,
    outcomeOrientation: a.outcomeOrientation,
    slotIndex: a.slotIndex,
  }));

  const therapyArea = caseData.therapeuticArea ?? null;
  const questionType = deriveQuestionType(caseData.strategicQuestion ?? null);

  const runScenario = async (signals: typeof allSignals) => {
    const adjusted = applyLrAdjustments(signals);
    let agentSim: Parameters<typeof runForecastEngine>[8] = undefined;
    if (adjusted.length > 0) {
      const { agentResults, agentDerivedActorTranslation } = simulateAgents(adjusted);
      const enriched = agentResults.map((r) => {
        const arch = AGENT_ARCHETYPES.find((a) => a.id === r.agentId);
        return { ...r, influenceScore: arch?.influenceScore ?? 1 };
      });
      agentSim = { agentDerivedActorTranslation, agentResults: enriched };
    }

    const result = runForecastEngine(
      req.params.caseId,
      caseData.priorProbability,
      adjusted,
      actorConfigs,
      caseData.primarySpecialtyProfile ?? "General",
      caseData.payerEnvironment ?? "Balanced",
      caseData.guidelineLeverage ?? "Medium",
      caseData.competitorProfile ?? "Entrenched standard of care",
      agentSim
    );

    const cal = await computeHierarchicalCalibration(result.currentProbability, therapyArea, questionType);
    return cal.calibratedProbability;
  };

  const baseProbability = await runScenario(allSignals);
  const scenarioSignals = allSignals.filter((s) => !excludeSignalIds.includes(s.signalId));
  const scenarioProbability = await runScenario(scenarioSignals);

  res.json({
    baseProbability,
    scenarioProbability,
    delta: scenarioProbability - baseProbability,
    excludedCount: excludeSignalIds.length,
    totalSignals: allSignals.length,
    scenarioSignals: scenarioSignals.length,
  });
});

export default router;
