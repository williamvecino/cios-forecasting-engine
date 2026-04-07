import { db } from "@workspace/db";
import { casesTable, signalsTable, actorsTable, calibrationLogTable, forecastLedgerTable, AGENT_ARCHETYPES } from "@workspace/db";
import { desc } from "drizzle-orm";
import { eq, and } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { runForecastEngine } from "../lib/forecast-engine.js";
import { simulateAgents } from "../lib/agent-engine.js";
import { getLrCorrections, getBucket, computeDecay } from "../lib/calibration-utils.js";
import { computeHierarchicalCalibration } from "../lib/calibration-fallback.js";
import { deriveQuestionType } from "../lib/case-context.js";
import { filterEligibleSignals, applyEventFamilyGuardrail } from "../lib/signal-eligibility.js";
import { runDependencyAnalysis, applyCompressionToSignals } from "../lib/signal-dependency-engine.js";
import {
  runAllPostEngineGuardrails,
  type GateStatus,
} from "../lib/engine-guardrails.js";
import { runCalibrationChecks } from "../lib/calibration-checks.js";
import { getProfileForQuestion } from "../lib/case-type-router.js";
import { computeDistributionForecast } from "../lib/adoption-distribution.js";
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
import { lookupPrecedentLr, ENGINE_VERSION, PRECEDENT_LIBRARY_VERSION, SIGNAL_SET_VERSION, CALCULATION_RULE_VERSION } from "../lib/precedent-lookup.js";

const MAX_ACTIVE_SIGNALS = 25;

const recalcCache = new Map<string, { hash: string; result: RecalcResult }>();

function computeInputHash(
  caseId: string,
  priorProb: number,
  signals: any[],
  envFields: Record<string, any>,
): string {
  const sortedSignals = [...signals]
    .sort((a, b) => (a.signalId ?? "").localeCompare(b.signalId ?? ""))
    .map(s => ({
      id: s.signalId,
      lr: s.likelihoodRatio,
      type: s.signalType ?? "",
      direction: s.direction ?? "",
    }));
  const input = JSON.stringify({ caseId, priorProb, signals: sortedSignals, env: envFields });
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function deduplicateSignals<T extends { signalId: string }>(signals: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const s of signals) {
    if (!seen.has(s.signalId)) {
      seen.add(s.signalId);
      result.push(s);
    } else {
      console.log(`[recalc-perf] duplicate_removed signalId=${s.signalId}`);
    }
  }
  return result;
}

function computeCalibrationBucket(probability: number): string {
  const pct = probability * 100;
  const lower = Math.floor(pct / 10) * 10;
  const upper = lower + 10;
  return `${lower}–${upper}%`;
}

function enforceSignalLimit<T extends { likelihoodRatio?: number | null }>(signals: T[]): T[] {
  if (signals.length <= MAX_ACTIVE_SIGNALS) return signals;
  const sorted = [...signals].sort((a, b) =>
    Math.abs((b.likelihoodRatio ?? 1) - 1) - Math.abs((a.likelihoodRatio ?? 1) - 1)
  );
  console.log(`[recalc-perf] signal_limit_enforced kept=${MAX_ACTIVE_SIGNALS} archived=${signals.length - MAX_ACTIVE_SIGNALS}`);
  return sorted.slice(0, MAX_ACTIVE_SIGNALS);
}

function resolveSpecialtyProfile(raw: string | null): SpecialtyActorProfile {
  const map: Record<string, SpecialtyActorProfile> = {
    "general": "general", "early adopter": "early_adopter_specialty",
    "conservative": "conservative_specialty", "cost sensitive": "cost_sensitive_specialty",
    "procedural": "procedural_specialty",
  };
  return map[(raw ?? "").toLowerCase()] ?? "general";
}
function resolvePayerEnv(raw: string | null): PayerEnvironment {
  const map: Record<string, PayerEnvironment> = { "favorable": "favorable", "balanced": "balanced", "restrictive": "restrictive" };
  return map[(raw ?? "").toLowerCase()] ?? "balanced";
}
function resolveGuidelineLeverage(raw: string | null): GuidelineLeverage {
  const map: Record<string, GuidelineLeverage> = { "low": "low", "medium": "medium", "high": "high" };
  return map[(raw ?? "").toLowerCase()] ?? "medium";
}
function resolveCompetitiveLandscape(raw: string | null): CompetitiveLandscape {
  const map: Record<string, CompetitiveLandscape> = {
    "open market": "open_market", "moderate competition": "moderate_competition",
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

export type RecalcResult = {
  score: number;
  calculatedAt: string;
  signalCount: number;
  forecastId: string;
};

export async function runCaseScoringEngine(caseId: string): Promise<RecalcResult> {
  const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRow[0]) throw new Error(`Case not found: ${caseId}`);
  const caseData = caseRow[0];

  const missingCaseFields: string[] = [];
  if (!caseData.strategicQuestion) missingCaseFields.push("Decision Question");
  if (!caseData.outcomeDefinition) missingCaseFields.push("Outcome Variable");
  if (!caseData.outcomeThreshold) missingCaseFields.push("Threshold");
  if (!caseData.timeHorizon) missingCaseFields.push("Time Horizon");
  if (!caseData.priorProbability && caseData.priorProbability !== 0) missingCaseFields.push("Base Prior");
  const hasSegment = caseData.specialty || caseData.targetType || caseData.geography;
  if (!hasSegment) missingCaseFields.push("Segment Definition");
  if (missingCaseFields.length > 0) {
    throw new Error(`Case definition incomplete — forecast blocked (Rule 3). Missing: ${missingCaseFields.join(", ")}`);
  }

  const allSignals = await db.select().from(signalsTable).where(
    and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active"))
  );

  const posteriorEligible = allSignals.filter(s => s.countTowardPosterior === true);
  const excludedFromPosterior = allSignals.filter(s => s.countTowardPosterior !== true);
  if (excludedFromPosterior.length > 0) {
    console.log(`[recalc-evidence-gate] caseId=${caseId} total=${allSignals.length} posteriorEligible=${posteriorEligible.length} excluded=${excludedFromPosterior.length} (${excludedFromPosterior.map(s => s.evidenceClass).join(",")})`);
  }

  const actors = await db.select().from(actorsTable).where(eq(actorsTable.specialtyProfile, "General")).orderBy(actorsTable.slotIndex);

  if (actors.length === 0) throw new Error("No actors configured.");

  const caseTargetContext = {
    targetType: caseData.targetType ?? "market",
    targetId: caseData.targetId ?? null,
    specialty: caseData.specialty ?? null,
    subspecialty: caseData.subspecialty ?? null,
    institutionName: caseData.institutionName ?? null,
    geography: caseData.geography ?? null,
  };
  const eligibleSignals = filterEligibleSignals(posteriorEligible, caseTargetContext);
  const guardedSignals = applyEventFamilyGuardrail(eligibleSignals);
  const dedupedSignals = deduplicateSignals(guardedSignals);
  const limitedSignals = enforceSignalLimit(dedupedSignals);

  const dependencyAnalysis = runDependencyAnalysis(limitedSignals);
  const signals = applyCompressionToSignals(limitedSignals, dependencyAnalysis);

  if (dependencyAnalysis.warnings.length > 0) {
    console.log(`[recalc-dependency] caseId=${caseId} clusters=${dependencyAnalysis.metrics.clusterCount} compressed=${dependencyAnalysis.compressedSignals.filter(c => c.compressionFactor < 1).length} warnings=${dependencyAnalysis.warnings.length} diversity=${dependencyAnalysis.metrics.evidenceDiversityScore} fragility=${dependencyAnalysis.metrics.posteriorFragilityScore}`);
  }

  persistDependencyTagsBackground(dependencyAnalysis);

  const corrections = await getLrCorrections();
  const now = Date.now();
  const precedentMappings: Array<{ signalId: string; originalLr: number; precedentLr: number; precedentType: string; tier: string; matched: boolean; directionCorrected: boolean }> = [];
  const signalsWithAdjustedLR = signals.map((s) => {
    const correction = corrections[s.signalType ?? ""] ?? 1.0;
    const ageMonths = s.createdAt
      ? (now - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
      : 0;
    const decayFactor = computeDecay(s.signalType ?? "", ageMonths);

    const precedent = lookupPrecedentLr(s.signalType ?? "", s.direction ?? "negative");
    const baseLr = precedent.matched ? precedent.assignedLr : (s.likelihoodRatio ?? 1);
    const adjusted = baseLr * correction * decayFactor;

    precedentMappings.push({
      signalId: s.signalId,
      originalLr: s.likelihoodRatio ?? 1,
      precedentLr: precedent.assignedLr,
      precedentType: precedent.precedentType,
      tier: precedent.reliabilityTier,
      matched: precedent.matched,
      directionCorrected: precedent.directionCorrected,
    });

    return { ...s, likelihoodRatio: Number(adjusted.toFixed(4)) };
  });

  if (precedentMappings.some(p => p.matched)) {
    const matchCount = precedentMappings.filter(p => p.matched).length;
    console.log(`[recalc-precedent] caseId=${caseId} matched=${matchCount}/${precedentMappings.length} engine=${ENGINE_VERSION} library=${PRECEDENT_LIBRARY_VERSION}`);
  }

  const envHashFields = {
    specialty: caseData.primarySpecialtyProfile,
    payer: caseData.payerEnvironment,
    guideline: caseData.guidelineLeverage,
    competitor: caseData.competitorProfile,
    accessFriction: caseData.accessFrictionIndex,
    adoptionPhase: caseData.adoptionPhase,
    timeHorizon: caseData.timeHorizon,
    therapeuticArea: caseData.therapeuticArea,
  };
  const inputHash = computeInputHash(caseId, caseData.priorProbability, signalsWithAdjustedLR, envHashFields);
  const cached = recalcCache.get(caseId);
  if (cached && cached.hash === inputHash) {
    console.log(`[recalc-perf] cache_hit caseId=${caseId} hash=${inputHash}`);
    return cached.result;
  }

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

  const eventGates: GateStatus[] = (caseData as any).eventGates ?? [];
  const guardrailLog: import("../lib/engine-guardrails.js").GuardrailLog = {
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
    { skipGateConstraint: true },
  );
  environmentAdjustedProbability = guardrailedProbability;

  const caseTypeProfile = getProfileForQuestion(caseData.strategicQuestion ?? "", caseData.caseType ?? undefined);
  const isRegulatory = caseTypeProfile.caseType === "regulatory_approval";
  if (isRegulatory) {
    const safetyKeywords = ["safety", "adverse", "side effect", "toxicity", "risk", "aria", "amyloid-related", "edema", "hemorrhage", "death", "mortality", "black box", "warning", "contraindication"];
    const resolvedStatuses = ["resolved", "invalidated", "superseded", "archived"];
    const unresolvedSafety = allSignals.filter(s => {
      const dir = (s.direction ?? "").toLowerCase();
      if (dir !== "negative") return false;
      const st = (s.status ?? "").toLowerCase();
      if (resolvedStatuses.includes(st)) return false;
      const strength = s.strengthScore ?? 0;
      if (strength < 0.5) return false;
      const desc = (s.signalDescription ?? "").toLowerCase();
      const cat = (s.category ?? "").toLowerCase();
      const type = (s.signalType ?? "").toLowerCase();
      return safetyKeywords.some(kw => desc.includes(kw) || cat.includes(kw) || type.includes(kw));
    });
    if (unresolvedSafety.length > 0) {
      const highStrength = unresolvedSafety.filter(s => (s.strengthScore ?? 0) >= 0.8);
      const safetyCeiling = highStrength.length >= 2 ? 0.55 : highStrength.length === 1 ? 0.65 : 0.75;
      environmentAdjustedProbability = Math.min(environmentAdjustedProbability, safetyCeiling);
    }
  }

  const calibrationChecks = runCalibrationChecks(
    signalsWithAdjustedLR,
    caseData.priorProbability ?? 0.5,
    environmentAdjustedProbability,
    caseData.strategicQuestion ?? "",
  );
  if (calibrationChecks.adjustedProbability !== environmentAdjustedProbability) {
    environmentAdjustedProbability = calibrationChecks.adjustedProbability;
  }

  const signalFamilies = new Set(signalsWithAdjustedLR.map(s => (s as any).signalFamily ?? s.signalType ?? "unknown"));
  const signalCategories = new Set(signalsWithAdjustedLR.map(s => (s as any).category ?? s.signalType ?? "unknown"));
  const diversityScore = Math.min(1, (signalFamilies.size + signalCategories.size) / 10);

  const distributionGates: Array<{ gate_id: string; gate_label: string; status: "unresolved" | "weak" | "moderate" | "strong"; constrains_probability_to: number }> =
    (eventGates as any[]).map((g: any) => ({
      gate_id: g.gate_id ?? g.gateId ?? "",
      gate_label: g.gate_label ?? g.gateLabel ?? "",
      status: (g.status ?? "moderate") as "unresolved" | "weak" | "moderate" | "strong",
      constrains_probability_to: g.constrains_probability_to ?? g.constrainsProbabilityTo ?? 0.5,
    }));

  const distributionResult = computeDistributionForecast(
    environmentAdjustedProbability,
    result.confidenceLevel,
    signalsWithAdjustedLR.length,
    diversityScore,
    distributionGates,
    caseData.outcomeThreshold,
  );

  let finalProbability = environmentAdjustedProbability;

  const calculatedAt = new Date();

  await db.update(casesTable).set({
    currentProbability: finalProbability,
    confidenceLevel: result.confidenceLevel,
    topSupportiveActor: result.topSupportiveActor,
    topConstrainingActor: result.topConstrainingActor,
    miosRoutingCheck: result.interpretation.miosRoutingCheck,
    ohosRoutingCheck: result.interpretation.ohosRoutingCheck,
    engineVersion: ENGINE_VERSION,
    lastUpdate: calculatedAt,
  }).where(eq(casesTable.caseId, caseId));

  const forecastId = `FCAST-${Date.now()}`;

  const largestShift = signalsWithAdjustedLR.length > 0
    ? Math.max(...signalsWithAdjustedLR.map(s => Math.abs((s.likelihoodRatio ?? 1) - 1)))
    : 0;

  const posteriorProbability = environmentAdjustedProbability;
  const snapshotForLog = {
    ...result,
    posteriorProbability,
    probabilityDiagnostic: {
      posteriorProbability: Number(posteriorProbability.toFixed(6)),
      thresholdProbability: Number(distributionResult.thresholdProbability.toFixed(6)),
      distributionComputed: true,
      metricsIdentical: Math.abs(posteriorProbability - distributionResult.thresholdProbability) < 0.001,
      separation: Number(Math.abs(posteriorProbability - distributionResult.thresholdProbability).toFixed(6)),
    },
    _perfSummary: {
      timestamp: calculatedAt.toISOString(),
      driverCount: signalsWithAdjustedLR.length,
      largestShift: Number(largestShift.toFixed(4)),
      finalProbability,
    },
    _engineVersion: {
      engine: ENGINE_VERSION,
      precedentLibrary: PRECEDENT_LIBRARY_VERSION,
      signalSet: SIGNAL_SET_VERSION,
      calculationRules: CALCULATION_RULE_VERSION,
    },
    _precedentMappings: precedentMappings,
    _dependencyAnalysis: {
      metrics: dependencyAnalysis.metrics,
      warnings: dependencyAnalysis.warnings,
      confidenceCeiling: dependencyAnalysis.confidenceCeiling,
      clusterCount: dependencyAnalysis.clusters.length,
      compressedCount: dependencyAnalysis.compressedSignals.filter(c => c.compressionFactor < 1).length,
      rawVsCompressedSignalCount: {
        raw: limitedSignals.length,
        compressed: dependencyAnalysis.compressedSignals.filter(c => c.compressionFactor < 1).length,
        unchanged: dependencyAnalysis.compressedSignals.filter(c => c.compressionFactor >= 1).length,
      },
      clusterDetails: dependencyAnalysis.clusters.map(cl => ({
        rootEvidenceId: cl.rootEvidenceId,
        rootDescription: cl.rootSignal.signal.signalDescription?.slice(0, 100),
        rootSourceCluster: cl.rootSignal.sourceCluster,
        signalCount: cl.clusterSignalCount,
        echoCount: cl.echoCount,
        translationCount: cl.translationCount,
      })),
      independentFamilyCount: dependencyAnalysis.independentSignals.length,
    },
  };

  await db.insert(calibrationLogTable).values({
    id: randomUUID(),
    forecastId,
    caseId,
    predictedProbability: finalProbability,
    snapshotJson: JSON.stringify(snapshotForLog),
  }).onConflictDoNothing();

  try {
    const prevVersionRows = await db.select({ updateVersion: forecastLedgerTable.updateVersion, predictionId: forecastLedgerTable.predictionId })
      .from(forecastLedgerTable)
      .where(eq(forecastLedgerTable.caseId, caseId))
      .orderBy(desc(forecastLedgerTable.updateVersion))
      .limit(1);
    const nextVersion = (prevVersionRows[0]?.updateVersion ?? 0) + 1;
    const previousPredictionId = prevVersionRows[0]?.predictionId ?? null;

    const topPositiveDrivers = signalsWithAdjustedLR
      .filter(s => (s.likelihoodRatio ?? 1) > 1)
      .sort((a, b) => (b.likelihoodRatio ?? 1) - (a.likelihoodRatio ?? 1))
      .slice(0, 5)
      .map(s => ({ type: s.signalType, desc: s.signalDescription?.slice(0, 80), lr: s.likelihoodRatio }));
    const topNegativeDrivers = signalsWithAdjustedLR
      .filter(s => (s.likelihoodRatio ?? 1) < 1)
      .sort((a, b) => (a.likelihoodRatio ?? 1) - (b.likelihoodRatio ?? 1))
      .slice(0, 5)
      .map(s => ({ type: s.signalType, desc: s.signalDescription?.slice(0, 80), lr: s.likelihoodRatio }));

    const topClusters = dependencyAnalysis.clusters
      .sort((a, b) => b.clusterSignalCount - a.clusterSignalCount)
      .slice(0, 5)
      .map(cl => ({
        rootId: cl.rootEvidenceId,
        rootDesc: cl.rootSignal.signal.signalDescription?.slice(0, 80),
        cluster: cl.rootSignal.sourceCluster,
        count: cl.clusterSignalCount,
        echoes: cl.echoCount,
        translations: cl.translationCount,
      }));

    const bucket = computeCalibrationBucket(finalProbability);

    await db.insert(forecastLedgerTable).values({
      id: randomUUID(),
      predictionId: forecastId,
      caseId,
      strategicQuestion: caseData.strategicQuestion ?? "Unspecified question",
      decisionDomain: caseData.therapeuticArea ?? null,
      forecastProbability: finalProbability,
      forecastDate: calculatedAt,
      timeHorizon: caseData.timeHorizon ?? "12 months",
      forecastHorizonMonths: caseData.forecastHorizonMonths ?? 12,
      priorProbability: caseData.priorProbability,
      confidenceLevel: result.confidenceLevel,
      confidenceCeilingApplied: dependencyAnalysis.confidenceCeiling.maxAllowedProbability < 1.0 ? dependencyAnalysis.confidenceCeiling.maxAllowedProbability : null,
      confidenceCeilingReason: dependencyAnalysis.confidenceCeiling.maxAllowedProbability < 1.0 ? dependencyAnalysis.confidenceCeiling.reason : null,
      evidenceDiversityScore: dependencyAnalysis.metrics.evidenceDiversityScore,
      posteriorFragilityScore: dependencyAnalysis.metrics.posteriorFragilityScore,
      concentrationPenalty: dependencyAnalysis.metrics.concentrationPenalty,
      independentEvidenceFamilyCount: dependencyAnalysis.metrics.independentEvidenceFamilies,
      rawSignalCount: limitedSignals.length,
      compressedSignalCount: dependencyAnalysis.compressedSignals.filter(c => c.compressionFactor < 1).length,
      keyDriversSummary: JSON.stringify(topPositiveDrivers),
      topLineageClusters: JSON.stringify(topClusters),
      counterSignalsSummary: JSON.stringify(topNegativeDrivers),
      environmentAdjustments: JSON.stringify(envAdjustments),
      updateVersion: nextVersion,
      previousPredictionId,
      resolutionStatus: "open",
      calibrationBucket: bucket,
      snapshotJson: JSON.stringify(snapshotForLog),
    }).onConflictDoNothing();
  } catch (ledgerErr) {
    console.error(`[recalc-ledger] failed to save ledger entry for caseId=${caseId}:`, ledgerErr);
  }

  const recalcResult: RecalcResult = {
    score: finalProbability,
    calculatedAt: calculatedAt.toISOString(),
    signalCount: signalsWithAdjustedLR.length,
    forecastId,
  };

  recalcCache.set(caseId, { hash: inputHash, result: recalcResult });

  console.log(`[recalc-perf] computed caseId=${caseId} drivers=${signalsWithAdjustedLR.length} largest_shift=${largestShift.toFixed(4)} final_prob=${finalProbability.toFixed(4)}`);

  return recalcResult;
}

function persistDependencyTagsBackground(
  analysis: ReturnType<typeof runDependencyAnalysis>
) {
  const updates: Array<{ id: string; rootEvidenceId: string; sourceCluster: string; dependencyRole: string; echoVsTranslation: string; novelInformationFlag: string; lineageConfidence: string }> = [];

  for (const cl of analysis.clusters) {
    updates.push({
      id: cl.rootSignal.signal.id,
      rootEvidenceId: cl.rootEvidenceId,
      sourceCluster: cl.rootSignal.sourceCluster,
      dependencyRole: cl.rootSignal.dependencyRole,
      echoVsTranslation: cl.rootSignal.echoVsTranslation,
      novelInformationFlag: cl.rootSignal.novelInformationFlag,
      lineageConfidence: cl.rootSignal.lineageConfidence,
    });
    for (const d of cl.descendants) {
      updates.push({
        id: d.signal.id,
        rootEvidenceId: cl.rootEvidenceId,
        sourceCluster: d.sourceCluster,
        dependencyRole: d.dependencyRole,
        echoVsTranslation: d.echoVsTranslation,
        novelInformationFlag: d.novelInformationFlag,
        lineageConfidence: d.lineageConfidence,
      });
    }
  }

  for (const ind of analysis.independentSignals) {
    updates.push({
      id: ind.signal.id,
      rootEvidenceId: ind.rootEvidenceId,
      sourceCluster: ind.sourceCluster,
      dependencyRole: ind.dependencyRole,
      echoVsTranslation: ind.echoVsTranslation,
      novelInformationFlag: ind.novelInformationFlag,
      lineageConfidence: ind.lineageConfidence,
    });
  }

  if (updates.length === 0) return;

  (async () => {
    const overriddenRows = await db.select({ id: signalsTable.id })
      .from(signalsTable)
      .where(eq(signalsTable.lineageOverride, true));
    const overriddenIds = new Set(overriddenRows.map(r => r.id));

    let updated = 0;
    for (const u of updates) {
      if (overriddenIds.has(u.id)) continue;
      try {
        await db.update(signalsTable).set({
          rootEvidenceId: u.rootEvidenceId,
          sourceCluster: u.sourceCluster,
          dependencyRole: u.dependencyRole,
          echoVsTranslation: u.echoVsTranslation,
          novelInformationFlag: u.novelInformationFlag,
          lineageConfidence: u.lineageConfidence,
          updatedAt: new Date(),
        }).where(eq(signalsTable.id, u.id));
        updated++;
      } catch (err) {
        console.error(`[persist-lineage-bg] Failed to update signal ${u.id}:`, err);
      }
    }
    console.log(`[persist-lineage-bg] Updated ${updated}/${updates.length} signals (${overriddenIds.size} overrides preserved)`);
  })().catch(err => console.error("[persist-lineage-bg] Background persist failed:", err));
}
