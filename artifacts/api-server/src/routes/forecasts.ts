import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable, actorsTable, calibrationLogTable, forecastLedgerTable, AGENT_ARCHETYPES } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { runDependencyAnalysis, computeNaiveVsCompressed } from "../lib/signal-dependency-engine.js";
import { runForecastEngine } from "../lib/forecast-engine.js";
import { simulateAgents } from "../lib/agent-engine.js";
import { getLrCorrections, getBucket, computeDecay } from "../lib/calibration-utils.js";
import { computeHierarchicalCalibration, computeSegmentConfidence } from "../lib/calibration-fallback.js";
import { deriveQuestionType } from "../lib/case-context.js";
import { filterEligibleSignals, applyEventFamilyGuardrail } from "../lib/signal-eligibility.js";
import {
  computeEnvironmentAdjustments,
  applyEnvironmentToProbability,
  type ActorEnvironmentConfig,
  type SpecialtyActorProfile,
  type PayerEnvironment,
  type GuidelineLeverage,
  type CompetitiveLandscape,
  type AdoptionPhase,
  type ForecastHorizonMonths,
} from "../lib/forecast-environment.js";
import {
  runAllPreEngineGuardrails,
  runAllPostEngineGuardrails,
  computeStateHash,
  getCachedResult,
  setCachedResult,
  type GuardrailLog,
  type GateStatus,
} from "../lib/engine-guardrails.js";

function resolveSpecialtyProfile(raw: string | null): SpecialtyActorProfile {
  const map: Record<string, SpecialtyActorProfile> = {
    "general": "general",
    "early adopter": "early_adopter_specialty",
    "conservative": "conservative_specialty",
    "cost sensitive": "cost_sensitive_specialty",
    "procedural": "procedural_specialty",
  };
  return map[(raw ?? "").toLowerCase()] ?? "general";
}

function resolvePayerEnv(raw: string | null): PayerEnvironment {
  const map: Record<string, PayerEnvironment> = {
    "favorable": "favorable",
    "balanced": "balanced",
    "restrictive": "restrictive",
  };
  return map[(raw ?? "").toLowerCase()] ?? "balanced";
}

function resolveGuidelineLeverage(raw: string | null): GuidelineLeverage {
  const map: Record<string, GuidelineLeverage> = { "low": "low", "medium": "medium", "high": "high" };
  return map[(raw ?? "").toLowerCase()] ?? "medium";
}

function resolveCompetitiveLandscape(raw: string | null): CompetitiveLandscape {
  const map: Record<string, CompetitiveLandscape> = {
    "open market": "open_market",
    "moderate competition": "moderate_competition",
    "entrenched standard of care": "entrenched_standard_of_care",
  };
  return map[(raw ?? "").toLowerCase()] ?? "entrenched_standard_of_care";
}

function resolveHorizonMonths(raw: string | null): ForecastHorizonMonths {
  const months = parseInt((raw ?? "12").replace(/[^0-9]/g, ""), 10);
  if (months <= 6) return 6;
  if (months <= 12) return 12;
  if (months <= 24) return 24;
  return 36;
}

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

  // ── GUARDRAIL: State hash for recalculation consistency (Rule 6) ──────
  const guardrailLog: GuardrailLog = {
    duplicate_driver_detected: [],
    duplicate_driver_removed: [],
    driver_shift_capped: [],
    total_shift_normalized: false,
    probability_limited_by_gate: false,
    relevance_penalty_applied: [],
    recalculation_skipped: false,
    input_validation_errors: [],
    diagnostics: {
      driver_count: 0,
      duplicate_drivers_detected: 0,
      largest_single_shift: 0,
      total_shift: 0,
      gating_constraints_triggered: [],
      final_probability_limit_reason: null,
    },
  };

  const stateHash = computeStateHash({
    caseId: req.params.caseId,
    prior: caseData.priorProbability,
    specialty: caseData.primarySpecialtyProfile,
    payer: caseData.payerEnvironment,
    guideline: caseData.guidelineLeverage,
    competitor: caseData.competitorProfile,
    timeHorizon: caseData.timeHorizon,
    therapeuticArea: caseData.therapeuticArea,
    signals: allSignals
      .map((s) => ({
        id: s.signalId,
        lr: s.likelihoodRatio,
        str: s.strengthScore,
        rel: s.reliabilityScore,
        dir: s.direction,
      }))
      .sort((a, b) => (a.id ?? "").localeCompare(b.id ?? "")),
  });

  const cached = getCachedResult(stateHash);
  if (cached) {
    guardrailLog.recalculation_skipped = true;
    return res.json({ ...cached, _guardrailLog: guardrailLog, _stateHash: stateHash });
  }

  // ── GUARDRAIL: Pre-engine validation, dedup, relevance penalty (Rules 1,5,7) ──
  const preResult = runAllPreEngineGuardrails(caseData.priorProbability, allSignals, guardrailLog);
  if (!preResult.valid) {
    return res.status(400).json({
      error: "INVALID DRIVER INPUT",
      validation_errors: guardrailLog.input_validation_errors,
    });
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
  const eligibleSignals = filterEligibleSignals(preResult.signals, caseTargetContext);
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

  // ── Apply environment adjustments (bounded, post-calibration) ────────────
  const envConfig: ActorEnvironmentConfig = {
    specialtyActorProfile: resolveSpecialtyProfile(caseData.primarySpecialtyProfile),
    payerEnvironment: resolvePayerEnv(caseData.payerEnvironment),
    guidelineLeverage: resolveGuidelineLeverage(caseData.guidelineLeverage),
    competitiveLandscape: resolveCompetitiveLandscape(caseData.competitorProfile),
    accessFrictionIndex: caseData.accessFrictionIndex ?? 0.5,
    adoptionPhase: (caseData.adoptionPhase ?? "early_adoption") as AdoptionPhase,
    forecastHorizonMonths: resolveHorizonMonths(caseData.timeHorizon),
  };
  const envAdjustments = computeEnvironmentAdjustments(envConfig);
  let environmentAdjustedProbability = applyEnvironmentToProbability(calibratedProbability, envAdjustments);

  // ── GUARDRAIL: Post-engine constraints (Rules 2,3,4) ──────────────────────
  const eventGates: GateStatus[] = (caseData as any).eventGates ?? [];
  const guardrailedProbability = runAllPostEngineGuardrails(
    caseData.priorProbability,
    environmentAdjustedProbability,
    result.signalDetails?.map((sd: any) => ({
      signalId: sd.signalId,
      likelihoodRatio: sd.likelihoodRatio,
      effectiveLikelihoodRatio: sd.effectiveLikelihoodRatio,
      description: sd.description,
    })) ?? [],
    eventGates,
    guardrailLog,
  );
  environmentAdjustedProbability = guardrailedProbability;

  // Keep bucket field for backward compatibility with downstream consumers
  const bucket = getBucket(rawProbability);

  const finalResult = {
    ...result,
    currentProbability: environmentAdjustedProbability,
    rawProbability,
    bucketCorrectionApplied: hierarchicalCalibration.correctionAppliedPp !== 0
      ? { bucket, correctionPp: hierarchicalCalibration.correctionAppliedPp }
      : null,
    calibratedProbability,
    hierarchicalCalibration,
    calibrationConfidence,
    environmentAdjustments: {
      priorMultiplier: envAdjustments.priorMultiplier,
      posteriorMultiplier: envAdjustments.posteriorMultiplier,
      explanation: envAdjustments.explanation,
      config: envAdjustments.normalizedConfig,
    },
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
    currentProbability: environmentAdjustedProbability,
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
    predictedProbability: environmentAdjustedProbability,
    snapshotJson: JSON.stringify(finalResult),
  }).onConflictDoNothing();

  try {
    const currentCaseId = req.params.caseId;
    const prevVersionRows = await db.select({
      updateVersion: forecastLedgerTable.updateVersion,
      predictionId: forecastLedgerTable.predictionId,
    })
      .from(forecastLedgerTable)
      .where(eq(forecastLedgerTable.caseId, currentCaseId))
      .orderBy(desc(forecastLedgerTable.updateVersion))
      .limit(1);
    const nextVersion = (prevVersionRows[0]?.updateVersion ?? 0) + 1;
    const previousPredictionId = prevVersionRows[0]?.predictionId ?? null;

    const predictionId = `PRED-${Date.now()}`;
    const pctBucket = Math.floor(environmentAdjustedProbability * 100 / 10) * 10;
    const calibrationBucket = `${pctBucket}–${pctBucket + 10}%`;

    let depSnapshot: Record<string, any> = {};
    try {
      if (eligibleSignals.length > 0) {
        const priorProb = caseData.priorProbability ?? 0.3;
        const analysis = runDependencyAnalysis(eligibleSignals);
        const comparison = computeNaiveVsCompressed(eligibleSignals, analysis, priorProb);

        depSnapshot = {
          evidenceDiversityScore: analysis.metrics.evidenceDiversityScore,
          posteriorFragilityScore: analysis.metrics.posteriorFragilityScore,
          concentrationPenalty: analysis.metrics.concentrationPenalty,
          independentEvidenceFamilyCount: analysis.independentSignals.length,
          rawSignalCount: eligibleSignals.length,
          compressedSignalCount: analysis.compressedSignals.length,
          confidenceCeilingApplied: analysis.confidenceCeiling.maxAllowedProbability < 1 ? analysis.confidenceCeiling.maxAllowedProbability : null,
          confidenceCeilingReason: analysis.confidenceCeiling.maxAllowedProbability < 1 ? (analysis.confidenceCeiling.reason ?? null) : null,
          keyDriversSummary: JSON.stringify(
            eligibleSignals.filter(s => (s.likelihoodRatio ?? 1) > 1)
              .sort((a, b) => (b.likelihoodRatio ?? 1) - (a.likelihoodRatio ?? 1))
              .slice(0, 5)
              .map(s => ({ desc: s.signalDescription?.slice(0, 120) ?? "", lr: s.likelihoodRatio ?? 1 }))
          ),
          counterSignalsSummary: JSON.stringify(
            eligibleSignals.filter(s => (s.likelihoodRatio ?? 1) < 1)
              .sort((a, b) => (a.likelihoodRatio ?? 1) - (b.likelihoodRatio ?? 1))
              .slice(0, 5)
              .map(s => ({ desc: s.signalDescription?.slice(0, 120) ?? "", lr: s.likelihoodRatio ?? 1 }))
          ),
          topLineageClusters: JSON.stringify(
            analysis.clusters.map(cl => ({
              rootDesc: cl.rootSignal.signal.signalDescription?.slice(0, 120) ?? "",
              cluster: cl.rootSignal.sourceCluster,
              count: cl.clusterSignalCount,
              compressed: cl.compressedSignalCount,
              echoes: cl.echoCount,
              translations: cl.translationCount,
            }))
          ),
          snapshotJson: JSON.stringify({
            metrics: analysis.metrics,
            confidenceCeiling: analysis.confidenceCeiling,
            warnings: analysis.warnings,
            comparison,
            clusterCount: analysis.clusters.length,
            independentCount: analysis.independentSignals.length,
          }),
        };
      }
    } catch (depErr) {
      console.error("Failed to compute dependency snapshot for ledger:", depErr);
    }

    await db.insert(forecastLedgerTable).values({
      id: randomUUID(),
      predictionId,
      caseId: currentCaseId,
      strategicQuestion: caseData.strategicQuestion ?? "Unspecified question",
      decisionDomain: caseData.therapeuticArea ?? null,
      forecastProbability: environmentAdjustedProbability,
      forecastDate: new Date(),
      timeHorizon: caseData.timeHorizon || "12 months",
      priorProbability: caseData.priorProbability,
      confidenceLevel: result.confidenceLevel,
      updateVersion: nextVersion,
      previousPredictionId,
      updateRationale: nextVersion === 1 ? "Initial forecast" : "Forecast updated",
      resolutionStatus: "open",
      calibrationBucket,
      ...depSnapshot,
    }).onConflictDoNothing();
  } catch (ledgerErr) {
    console.error("Failed to auto-save to forecast ledger:", ledgerErr);
  }

  const responsePayload = {
    ...finalResult,
    forecastId,
    savedAt: new Date().toISOString(),
    _guardrailLog: guardrailLog,
    _stateHash: stateHash,
  };

  setCachedResult(stateHash, responsePayload);
  res.json(responsePayload);
});

export default router;
