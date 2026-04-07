import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable, actorsTable, calibrationLogTable, forecastLedgerTable, forecastSnapshotsTable, AGENT_ARCHETYPES } from "@workspace/db";
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
import { getProfileForQuestion } from "../lib/case-type-router.js";
import { runCalibrationChecks } from "../lib/calibration-checks.js";
import { buildForecastSnapshot, detectDrift, computeConsistencyFromHistory, type ForecastSnapshot } from "../lib/drift-detection.js";
import { buildCanonicalCase } from "../lib/canonical-case.js";
import { computeDistributionForecast, computeThresholdSensitivity, type DistributionResult } from "../lib/adoption-distribution.js";
import { runAllIntegrityTests, buildForecastSnapshotForIntegrity, type IntegrityRunSummary } from "../lib/integrity-tests.js";
import { integrityTestResultsTable } from "@workspace/db";

interface SafetyCeilingResult {
  applied: boolean;
  ceiling: number;
  reason: string | null;
  unresolvedSafetySignals: number;
}

function applySafetyCeiling(
  probability: number,
  signals: Array<{ direction?: string | null; strengthScore?: number | null; status?: string | null; signalType?: string | null; category?: string | null; signalDescription?: string | null }>,
  isRegulatory: boolean,
): SafetyCeilingResult {
  if (!isRegulatory) return { applied: false, ceiling: 1.0, reason: null, unresolvedSafetySignals: 0 };

  const safetyKeywords = ["safety", "adverse", "side effect", "toxicity", "risk", "aria", "amyloid-related", "edema", "hemorrhage", "death", "mortality", "black box", "warning", "contraindication"];
  const resolvedStatuses = ["resolved", "invalidated", "superseded", "archived"];

  const unresolvedSafety = signals.filter(s => {
    const dir = (s.direction ?? "").toLowerCase();
    if (dir !== "negative") return false;
    const st = (s.status ?? "").toLowerCase();
    if (resolvedStatuses.includes(st)) return false;
    const strength = s.strengthScore ?? 0;
    if (strength < 0.5) return false;
    const desc = (s.signalDescription ?? "").toLowerCase();
    const cat = (s.category ?? "").toLowerCase();
    const type = (s.signalType ?? "").toLowerCase();
    const isSafety = safetyKeywords.some(kw => desc.includes(kw) || cat.includes(kw) || type.includes(kw));
    return isSafety;
  });

  if (unresolvedSafety.length === 0) return { applied: false, ceiling: 1.0, reason: null, unresolvedSafetySignals: 0 };

  const highStrength = unresolvedSafety.filter(s => (s.strengthScore ?? 0) >= 0.8);
  let ceiling: number;
  if (highStrength.length >= 2) {
    ceiling = 0.55;
  } else if (highStrength.length === 1) {
    ceiling = 0.65;
  } else {
    ceiling = 0.75;
  }

  const capped = Math.min(probability, ceiling);
  return {
    applied: capped < probability,
    ceiling,
    reason: `${unresolvedSafety.length} unresolved safety signal(s) (${highStrength.length} high-strength) constrain forecast ceiling to ${Math.round(ceiling * 100)}%`,
    unresolvedSafetySignals: unresolvedSafety.length,
  };
}

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
  const s = (raw ?? "").toLowerCase();
  if (s.includes("favorable") || s.includes("open")) return "favorable";
  if (s.includes("restrictive") || s.includes("medicare-heavy") || s.includes("medicaid")) return "restrictive";
  return "balanced";
}

function resolveGuidelineLeverage(raw: string | null): GuidelineLeverage {
  const map: Record<string, GuidelineLeverage> = { "low": "low", "medium": "medium", "high": "high" };
  return map[(raw ?? "").toLowerCase()] ?? "medium";
}

function resolveCompetitiveLandscape(raw: string | null): CompetitiveLandscape {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("open") || s.includes("no direct") || s.includes("uncontested")) return "open_market";
  if (s.includes("crowded") || s.includes("multiple") || s.includes("moderate") || s.includes("generic")) return "moderate_competition";
  return "entrenched_standard_of_care";
}

function resolveHorizonMonths(raw: string | null): ForecastHorizonMonths {
  const months = parseInt((raw ?? "12").replace(/[^0-9]/g, ""), 10);
  if (months <= 6) return 6;
  if (months <= 12) return 12;
  if (months <= 24) return 24;
  return 36;
}

function parseThresholdNumber(threshold: string | null | undefined): number | null {
  if (!threshold) return null;
  const m = threshold.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

function applyThresholdToPrior(basePrior: number, threshold: string | null | undefined): number {
  const thresholdPct = parseThresholdNumber(threshold);
  if (thresholdPct === null) return basePrior;
  const REFERENCE_THRESHOLD = 30;
  const SENSITIVITY = 0.005;
  const adjustment = (REFERENCE_THRESHOLD - thresholdPct) * SENSITIVITY;
  return Math.max(0.05, Math.min(0.95, basePrior + adjustment));
}

const router = Router();

router.get("/cases/:caseId/forecast", async (req, res) => {
  const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  if (!caseRow[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRow[0];

  const allSignalsRaw = await db.select().from(signalsTable).where(
    and(eq(signalsTable.caseId, req.params.caseId), eq(signalsTable.status, "active"))
  ).orderBy(signalsTable.signalId);

  const allSignals = allSignalsRaw.filter(s => s.countTowardPosterior === true);
  const excludedSignals = allSignalsRaw.filter(s => s.countTowardPosterior !== true);

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
    outcomeThreshold: caseData.outcomeThreshold ?? null,
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
  // Neutral signals are forced to LR=1.0 (no directional impact); skip corrections/decay
  const corrections = await getLrCorrections();
  const now = Date.now();
  const signalsWithAdjustedLR = signals.map((s) => {
    if (s.direction === "Neutral") {
      return { ...s, likelihoodRatio: 1.0 };
    }
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

  // ── GUARDRAIL: Post-engine constraints (Rules 2,3) ──────────────────────
  // Gate constraints (Rule 4) are now handled by the distribution model
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
    { skipGateConstraint: true },
  );
  environmentAdjustedProbability = guardrailedProbability;

  const caseTypeProfile = getProfileForQuestion(caseData.strategicQuestion ?? "", caseData.caseType ?? undefined);
  const isRegulatory = caseTypeProfile.caseType === "regulatory_approval";
  const safetyCeiling = applySafetyCeiling(environmentAdjustedProbability, allSignals as any, isRegulatory);
  if (safetyCeiling.applied) {
    environmentAdjustedProbability = Math.min(environmentAdjustedProbability, safetyCeiling.ceiling);
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

  // Keep bucket field for backward compatibility with downstream consumers
  const bucket = getBucket(rawProbability);

  // ── Distribution-based forecast (replaces min-cap constraint model) ────────
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

  let distributionResult: ReturnType<typeof computeDistributionForecast> | null = null;
  let distributionComputed = false;
  try {
    distributionResult = computeDistributionForecast(
      environmentAdjustedProbability,
      result.confidenceLevel,
      signalsWithAdjustedLR.length,
      diversityScore,
      distributionGates,
      caseData.outcomeThreshold,
    );
    distributionComputed = true;
  } catch (err) {
    console.error("[forecast] Distribution computation failed:", err);
    distributionComputed = false;
  }

  const distributionProbability = distributionResult?.thresholdProbability ?? null;
  const thresholdSensitivity = distributionResult
    ? computeThresholdSensitivity(distributionResult.constrained, distributionResult.outcomeThreshold)
    : null;

  const posteriorProbability = environmentAdjustedProbability;
  const finalProbability = posteriorProbability;

  const metricsIdentical = distributionComputed && distributionProbability != null
    && Math.abs(posteriorProbability - distributionProbability) < 0.001;
  const probabilityDiagnostic = {
    posteriorProbability: Number(posteriorProbability.toFixed(6)),
    thresholdProbability: distributionProbability != null ? Number(distributionProbability.toFixed(6)) : null,
    distributionComputed,
    metricsIdentical,
    separation: distributionProbability != null
      ? Number(Math.abs(posteriorProbability - distributionProbability).toFixed(6))
      : null,
    posteriorDefinition: "How strong the therapy looks based on all signals and environment factors",
    thresholdDefinition: "Probability of meeting the defined outcome threshold after gate constraints",
  };

  const priorOddsValue = caseData.priorProbability / (1 - caseData.priorProbability);
  const signalLrProduct = result.priorOdds > 0
    ? (result.currentProbability / (1 - result.currentProbability)) / (priorOddsValue * (result.bayesianActorFactor ?? 1))
    : 1;
  const posteriorOdds = result.currentProbability / (1 - result.currentProbability);
  const calculationTrace = {
    _description: "Full intermediate value trace for calculation integrity audit",
    step1_prior: {
      label: "Prior Probability",
      value: Number(caseData.priorProbability.toFixed(6)),
      odds: Number(priorOddsValue.toFixed(6)),
      source: "Case definition (user-set or template-derived)",
    },
    step2_bayesianUpdate: {
      label: "Raw Bayesian Posterior",
      canonicalName: "RawPosteriorProbability",
      signalCount: signalsWithAdjustedLR.length,
      likelihoodRatioProduct: Number(signalLrProduct.toFixed(6)),
      actorAdjustmentFactor: Number((result.bayesianActorFactor ?? 1).toFixed(6)),
      posteriorOdds: Number(posteriorOdds.toFixed(6)),
      rawPosteriorProbability: Number(rawProbability.toFixed(6)),
      source: "Bayesian engine: prior_odds × LR_product × actor_factor → posterior_odds → probability",
    },
    step3_calibration: {
      label: "Calibrated Probability",
      calibratedProbability: Number(calibratedProbability.toFixed(6)),
      correctionApplied: hierarchicalCalibration.correctionAppliedPp !== 0,
      correctionPp: Number((hierarchicalCalibration.correctionAppliedPp ?? 0).toFixed(6)),
      source: "Hierarchical calibration (therapy area + question type bias correction)",
    },
    step4_environmentAdjustment: {
      label: "Environment-Adjusted Posterior",
      canonicalName: "EnvironmentAdjustedPosterior",
      uiLabel: "Signal Strength (Pre-Gate Estimate)",
      excelEquivalent: "PosteriorProbability — NOTE: This is NOT the raw Bayesian posterior (step 2). It is the posterior AFTER calibration (step 3) and environment adjustments (this step). The raw Bayesian posterior is 'RawPosteriorProbability' in step 2.",
      value: Number(posteriorProbability.toFixed(6)),
      inputFromStep3: Number(calibratedProbability.toFixed(6)),
      priorMultiplier: Number(envAdjustments.priorMultiplier.toFixed(6)),
      posteriorMultiplier: Number(envAdjustments.posteriorMultiplier.toFixed(6)),
      source: "Specialty, payer, guideline, competitive, access friction, adoption phase adjustments",
    },
    step5_distributionSimulation: distributionResult ? {
      label: "Threshold Probability (CDF-based)",
      inputPosterior: Number(posteriorProbability.toFixed(6)),
      outcomeThreshold: {
        numericValue: distributionResult.outcomeThreshold,
        rawInput: distributionResult.thresholdResolution.rawInput,
        source: distributionResult.thresholdResolution.source,
        explanation: distributionResult.thresholdResolution.explanation,
      },
      unconstrainedDistribution: {
        alpha: Number(distributionResult.unconstrained.alpha.toFixed(4)),
        beta: Number(distributionResult.unconstrained.beta.toFixed(4)),
        mean: Number(distributionResult.unconstrained.mean.toFixed(6)),
      },
      constrainedDistribution: {
        alpha: Number(distributionResult.constrained.alpha.toFixed(4)),
        beta: Number(distributionResult.constrained.beta.toFixed(4)),
        mean: Number(distributionResult.constrained.mean.toFixed(6)),
      },
      gateCount: distributionGates.length,
      achievableCeiling: Number(distributionResult.achievableCeiling.toFixed(6)),
      readinessScore: Number(distributionResult.readinessScore.toFixed(6)),
      thresholdProbability: Number(distributionResult.thresholdProbability.toFixed(6)),
      semanticMapping: "The adoption distribution models the full probability landscape for achieving the defined business outcome. ThresholdProbability = P(outcome_achievement >= threshold | constrained_distribution). For non-percentage outcomes (e.g., '≥4 Rx/quarter'), the distribution represents the probability of meeting that specific business criterion, not a generic market share.",
    } : {
      label: "Distribution Forecast FAILED",
      inputPosterior: Number(posteriorProbability.toFixed(6)),
      thresholdProbability: null,
      source: "Distribution simulation unavailable — threshold probability NOT computed, NOT mirrored from posterior",
    },
    step6_finalSeparation: {
      signalStrength_label: "Signal Strength (Pre-Gate Estimate)",
      signalStrength_canonicalName: "EnvironmentAdjustedPosterior",
      signalStrength_value: Number(posteriorProbability.toFixed(6)),
      signalStrength_excelEquivalent: "PosteriorProbability (after environment adjustments)",
      thresholdProbability_label: "Threshold Probability (Outcome Likelihood)",
      thresholdProbability_canonicalName: "ThresholdProbability",
      thresholdProbability_value: distributionProbability != null ? Number(distributionProbability.toFixed(6)) : null,
      thresholdProbability_excelEquivalent: "ThresholdProbability (Beta CDF evaluation)",
      separationPp: distributionProbability != null
        ? Number((Math.abs(posteriorProbability - distributionProbability) * 100).toFixed(2))
        : null,
      identical: metricsIdentical,
      verdict: metricsIdentical
        ? "WARNING: Metrics are identical — distribution model may not be producing meaningful separation"
        : distributionProbability == null
        ? "Threshold not computed — distribution unavailable"
        : "PASS: Metrics are derived from different calculation paths",
    },
  };

  function interpretFinalProbability(prob: number, prior: number): string {
    const delta = prob - prior;
    const absDelta = Math.abs(delta);
    const direction = delta > 0.005 ? "favorable" : delta < -0.005 ? "unfavorable" : "neutral";
    const magnitude = absDelta >= 0.15 ? "Strong" : absDelta >= 0.05 ? "Moderate" : "Marginal";
    const displayedPct = Math.round(prob * 100);
    if (displayedPct >= 75) return `${magnitude} ${direction} shift — high likelihood of reaching target`;
    if (displayedPct >= 60) return `${magnitude} ${direction} shift — outcome likely but not certain`;
    if (displayedPct >= 45) {
      if (direction === "neutral") return "Balanced case — outcome uncertain, no clear directional signal";
      return `Balanced case — outcome uncertain with ${direction} lean`;
    }
    if (displayedPct >= 30) {
      if (direction === "favorable") return `${magnitude} favorable shift — but significant barriers remain`;
      return `${magnitude} ${direction} pressure — significant barriers remain`;
    }
    if (direction === "favorable") return `Low probability despite ${magnitude.toLowerCase()} favorable shift — substantial obstacles remain`;
    return `Low probability — substantial obstacles to reaching target`;
  }

  const finalResult = {
    ...result,
    currentProbability: finalProbability,
    interpretation: {
      ...result.interpretation,
      primaryStatement: interpretFinalProbability(finalProbability, caseData.priorProbability),
    },
    rawProbability,
    posteriorProbability,
    thresholdProbability: distributionProbability,
    brandOutlookProbability: posteriorProbability,
    distributionComputed,
    probabilityDiagnostic,
    calculationTrace,
    outcomeThresholdResolution: distributionResult?.thresholdResolution ?? null,
    distributionForecast: distributionResult ? {
      unconstrained: distributionResult.unconstrained,
      constrained: distributionResult.constrained,
      outcomeThreshold: distributionResult.outcomeThreshold,
      thresholdProbability: distributionResult.thresholdProbability,
      thresholdResolution: distributionResult.thresholdResolution,
      gateAdjustments: distributionResult.gateAdjustments,
      thresholdSensitivity,
      readinessScore: distributionResult.readinessScore,
      achievableCeiling: distributionResult.achievableCeiling,
      gateDomination: distributionResult.gateDomination,
    } : null,
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
    outcomeThreshold: caseData.outcomeThreshold ?? null,
    _caseContext: {
      caseId: req.params.caseId,
      therapeuticArea: caseData.therapeuticArea ?? null,
      diseaseState: caseData.diseaseState ?? null,
      specialty: caseData.specialty ?? null,
      strategicQuestion: caseData.strategicQuestion ?? null,
      outcomeThreshold: caseData.outcomeThreshold ?? null,
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
    _safetyCeiling: safetyCeiling,
    _calibrationChecks: calibrationChecks,
  };

  await db.update(casesTable).set({
    currentProbability: finalProbability,
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
    predictedProbability: finalProbability,
    snapshotJson: JSON.stringify(finalResult),
  }).onConflictDoNothing();

  let consecutiveEqualityWarning: string | null = null;
  try {
    const recentLogs = await db.select({ snapshotJson: calibrationLogTable.snapshotJson })
      .from(calibrationLogTable)
      .where(eq(calibrationLogTable.caseId, req.params.caseId))
      .orderBy(desc(calibrationLogTable.createdAt))
      .limit(4);

    if (recentLogs.length >= 3) {
      let consecutiveEqual = 0;
      for (const log of recentLogs.slice(0, 3)) {
        try {
          const snap = typeof log.snapshotJson === "string" ? JSON.parse(log.snapshotJson) : log.snapshotJson;
          const diagPost = snap?.probabilityDiagnostic?.posteriorProbability ?? snap?.posteriorProbability;
          const diagThresh = snap?.probabilityDiagnostic?.thresholdProbability ?? snap?.distributionForecast?.thresholdProbability;
          if (diagPost != null && diagThresh != null && Math.abs(diagPost - diagThresh) < 0.001) {
            consecutiveEqual++;
          } else {
            break;
          }
        } catch { break; }
      }
      if (consecutiveEqual >= 3) {
        consecutiveEqualityWarning = `DIAGNOSTIC ALERT: PosteriorProbability and ThresholdProbability have been identical (within 0.1%) for ${consecutiveEqual} consecutive runs. This indicates the distribution model may not be producing meaningful separation. Review gate constraints and outcome threshold.`;
        console.warn(`[forecast][${req.params.caseId}] ${consecutiveEqualityWarning}`);
      }
    }
  } catch (diagErr) {
    console.warn("[forecast] Diagnostic equality check error:", diagErr);
  }

  (finalResult as any).consecutiveEqualityWarning = consecutiveEqualityWarning;

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
    const pctBucket = Math.floor(finalProbability * 100 / 10) * 10;
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
      forecastProbability: finalProbability,
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

  let driftResult: ReturnType<typeof detectDrift> | null = null;
  let consistencyResult: ReturnType<typeof computeConsistencyFromHistory> | null = null;

  try {
    const prevSnapRows = await db.select()
      .from(forecastSnapshotsTable)
      .where(eq(forecastSnapshotsTable.caseId, req.params.caseId))
      .orderBy(desc(forecastSnapshotsTable.snapshotVersion))
      .limit(10);

    const nextSnapshotVersion = (prevSnapRows[0]?.snapshotVersion ?? 0) + 1;

    const topDriverDescs = (result.signalDetails ?? [])
      .filter((sd: any) => (sd.likelihoodRatio ?? 1) > 1)
      .sort((a: any, b: any) => {
        const lrDiff = (b.likelihoodRatio ?? 1) - (a.likelihoodRatio ?? 1);
        if (Math.abs(lrDiff) > 0.0001) return lrDiff;
        return (a.signalId ?? "").localeCompare(b.signalId ?? "");
      })
      .slice(0, 3)
      .map((sd: any) => sd.description || "Unknown driver");

    const primaryConstraintDesc = (result.signalDetails ?? [])
      .filter((sd: any) => (sd.likelihoodRatio ?? 1) < 1)
      .sort((a: any, b: any) => {
        const lrDiff = (a.likelihoodRatio ?? 1) - (b.likelihoodRatio ?? 1);
        if (Math.abs(lrDiff) > 0.0001) return lrDiff;
        return (a.signalId ?? "").localeCompare(b.signalId ?? "");
      })
      .map((sd: any) => sd.description || "Unknown constraint")[0] ?? null;

    let actionReco: string | null = null;
    if (finalProbability >= 0.7) actionReco = "Plan for this outcome — shift resources toward execution.";
    else if (finalProbability >= 0.5) actionReco = "Cautiously favorable — maintain contingency planning.";
    else actionReco = "Significant headwinds — prioritize addressing barriers.";

    const currentSnapshot = buildForecastSnapshot(
      req.params.caseId,
      nextSnapshotVersion,
      {
        decisionPattern: caseTypeProfile.caseType ?? null,
        primaryConstraint: primaryConstraintDesc,
        topDriverDescriptions: topDriverDescs,
        baselinePrior: caseData.priorProbability,
        forecastProbability: finalProbability,
        recommendedAction: actionReco,
        signalCount: eligibleSignals.length,
        signalIds: eligibleSignals.map((s) => s.signalId ?? ""),
        canonicalFields: (caseData as any).canonicalFields ?? null,
      },
    );

    if (prevSnapRows.length > 0) {
      const previousSnapshot: ForecastSnapshot = {
        caseId: prevSnapRows[0].caseId,
        snapshotVersion: prevSnapRows[0].snapshotVersion,
        decisionPattern: prevSnapRows[0].decisionPattern,
        primaryConstraint: prevSnapRows[0].primaryConstraint,
        topDrivers: (prevSnapRows[0].topDrivers as string[]) ?? [],
        baselinePrior: prevSnapRows[0].baselinePrior ?? 0.45,
        forecastProbability: prevSnapRows[0].forecastProbability,
        forecastDirection: (prevSnapRows[0].forecastDirection as any) ?? "neutral",
        recommendedAction: prevSnapRows[0].recommendedAction,
        signalCount: prevSnapRows[0].signalCount ?? 0,
        signalHash: prevSnapRows[0].signalHash ?? "",
        canonicalHash: prevSnapRows[0].canonicalHash ?? "",
      };

      driftResult = detectDrift(previousSnapshot, currentSnapshot);

      const allSnapshots: ForecastSnapshot[] = prevSnapRows.reverse().map((r) => ({
        caseId: r.caseId,
        snapshotVersion: r.snapshotVersion,
        decisionPattern: r.decisionPattern,
        primaryConstraint: r.primaryConstraint,
        topDrivers: (r.topDrivers as string[]) ?? [],
        baselinePrior: r.baselinePrior ?? 0.45,
        forecastProbability: r.forecastProbability,
        forecastDirection: (r.forecastDirection as any) ?? "neutral",
        recommendedAction: r.recommendedAction,
        signalCount: r.signalCount ?? 0,
        signalHash: r.signalHash ?? "",
        canonicalHash: r.canonicalHash ?? "",
      }));
      allSnapshots.push(currentSnapshot);
      consistencyResult = computeConsistencyFromHistory(allSnapshots);
    } else {
      consistencyResult = { score: "high", details: "Initial run — no comparison available." };
    }

    await db.insert(forecastSnapshotsTable).values({
      id: randomUUID(),
      caseId: req.params.caseId,
      snapshotVersion: nextSnapshotVersion,
      decisionPattern: currentSnapshot.decisionPattern,
      primaryConstraint: currentSnapshot.primaryConstraint,
      topDrivers: currentSnapshot.topDrivers,
      baselinePrior: currentSnapshot.baselinePrior,
      forecastProbability: currentSnapshot.forecastProbability,
      forecastDirection: currentSnapshot.forecastDirection,
      recommendedAction: currentSnapshot.recommendedAction,
      signalCount: currentSnapshot.signalCount,
      signalHash: currentSnapshot.signalHash,
      canonicalHash: currentSnapshot.canonicalHash,
      canonicalSnapshot: (caseData as any).canonicalFields ?? null,
      driftDetected: driftResult?.hasMaterialDrift ? "true" : "false",
      driftFields: driftResult?.driftFields ?? null,
      consistencyScore: consistencyResult?.score ?? "high",
      fullSnapshot: {
        prior: caseData.priorProbability,
        posterior: finalProbability,
        signalCount: eligibleSignals.length,
        topDrivers: topDriverDescs,
        primaryConstraint: primaryConstraintDesc,
        confidenceLevel: result.confidenceLevel,
      },
    }).onConflictDoNothing();
  } catch (snapErr) {
    console.error("[forecast-snapshot] Failed to save snapshot:", snapErr);
  }

  let integrityReport: IntegrityRunSummary | null = null;
  try {
    const integritySnapshot = buildForecastSnapshotForIntegrity(
      req.params.caseId,
      caseData,
      finalResult,
      signalsWithAdjustedLR,
      eventGates,
    );
    integrityReport = runAllIntegrityTests(integritySnapshot);

    const integrityRows = integrityReport.allResults.map(r => ({
      id: r.id,
      caseId: r.caseId,
      runId: r.runId,
      invariantName: r.invariantName,
      passed: r.passed,
      expectedBehavior: r.expectedBehavior,
      actualBehavior: r.actualBehavior,
      details: r.details,
      forecastProbability: r.forecastProbability,
      createdAt: r.createdAt,
    }));
    if (integrityRows.length > 0) {
      db.insert(integrityTestResultsTable)
        .values(integrityRows)
        .onConflictDoNothing()
        .execute()
        .catch(err => console.error("[integrity] Failed to persist results:", err));
    }

    if (integrityReport.stabilityWarning) {
      console.warn(
        `[integrity] STABILITY WARNING for case ${req.params.caseId}: ` +
        `${integrityReport.failed}/${integrityReport.totalTests} tests failed. ` +
        `Core failures: ${integrityReport.coreFailures.join(", ")}`
      );
    }
  } catch (integrityErr) {
    console.error("[integrity] Test suite error:", integrityErr);
  }

  const responsePayload = {
    ...finalResult,
    forecastId,
    savedAt: new Date().toISOString(),
    _guardrailLog: guardrailLog,
    _stateHash: stateHash,
    _consistency: consistencyResult ?? { score: "high", details: "No snapshot history." },
    _drift: driftResult ?? null,
    _integrity: integrityReport ? {
      runId: integrityReport.runId,
      passed: integrityReport.passed,
      failed: integrityReport.failed,
      totalTests: integrityReport.totalTests,
      coreFailures: integrityReport.coreFailures,
      stabilityWarning: integrityReport.stabilityWarning,
      unreliableFlag: integrityReport.unreliableFlag,
      results: integrityReport.allResults.map(r => ({
        invariantName: r.invariantName,
        passed: r.passed,
        expectedBehavior: r.expectedBehavior,
        actualBehavior: r.actualBehavior,
      })),
    } : null,
  };

  setCachedResult(stateHash, responsePayload);
  res.json(responsePayload);
});

router.get("/cases/:caseId/snapshots", async (req, res) => {
  try {
    const rows = await db.select()
      .from(forecastSnapshotsTable)
      .where(eq(forecastSnapshotsTable.caseId, req.params.caseId))
      .orderBy(desc(forecastSnapshotsTable.snapshotVersion))
      .limit(20);

    const snapshots = rows.map((r) => ({
      id: r.id,
      caseId: r.caseId,
      version: r.snapshotVersion,
      decisionPattern: r.decisionPattern,
      primaryConstraint: r.primaryConstraint,
      topDrivers: r.topDrivers,
      baselinePrior: r.baselinePrior,
      forecastProbability: r.forecastProbability,
      forecastDirection: r.forecastDirection,
      recommendedAction: r.recommendedAction,
      signalCount: r.signalCount,
      driftDetected: r.driftDetected === "true",
      driftFields: r.driftFields,
      consistencyScore: r.consistencyScore,
      createdAt: r.createdAt,
    }));

    res.json({ snapshots });
  } catch (err) {
    console.error("[snapshots] Error:", err);
    res.status(500).json({ error: "Failed to fetch snapshots" });
  }
});

router.post("/forecast/recalculate", async (req, res) => {
  try {
    const { recalculateForecast } = await import("../lib/recalculation-controller.js");
    const result = await recalculateForecast(req.body);

    if (result.status === "error") {
      res.status(500).json({ error: result.errorMessage || "Recalculation failed" });
      return;
    }

    res.json(result.lastOutput);
  } catch (err: unknown) {
    console.error("[forecast/recalculate] Error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Recalculation failed" });
  }
});

router.get("/pipeline-reconciliation", async (_req, res) => {
  try {
    const { runCaseScoringEngine } = await import("../services/recalculateCaseScore.js");
    const cases = await db.select().from(casesTable);
    const rows: any[] = [];

    for (const c of cases) {
      const caseId = c.caseId;
      const storedBefore = c.currentProbability;

      const allSignalsRaw2 = await db.select().from(signalsTable).where(
        and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active"))
      );
      const allSignals = allSignalsRaw2.filter(s => s.countTowardPosterior === true);
      const actors = await db.select().from(actorsTable).where(eq(actorsTable.specialtyProfile, "General")).orderBy(actorsTable.slotIndex);
      if (actors.length === 0) continue;

      const corrections = await getLrCorrections();
      const now = Date.now();
      const adjusted = allSignals.map((s) => {
        const correction = corrections[s.signalType ?? ""] ?? 1.0;
        const ageMonths = s.createdAt ? (now - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30) : 0;
        const decayFactor = computeDecay(s.signalType ?? "", ageMonths);
        return { ...s, likelihoodRatio: Number(((s.likelihoodRatio ?? 1) * correction * decayFactor).toFixed(4)) };
      });

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
        caseId,
        c.priorProbability,
        adjusted,
        actors.map((a) => ({
          actorName: a.actorName, influenceWeight: a.influenceWeight,
          positiveResponseFactor: a.positiveResponseFactor, negativeResponseFactor: a.negativeResponseFactor,
          outcomeOrientation: a.outcomeOrientation, slotIndex: a.slotIndex,
        })),
        c.primarySpecialtyProfile ?? "General",
        c.payerEnvironment ?? "Balanced",
        c.guidelineLeverage ?? "Medium",
        c.competitorProfile ?? "Entrenched standard of care",
        agentSim
      );

      const prior = c.priorProbability;
      const priorOdds = prior / (1 - prior);
      const combinedLR = result.signalLrProduct;
      const actorFactor = result.actorAdjustmentFactor;
      const rawPosterior = result.currentProbability;
      const expectedPosteriorOdds = priorOdds * combinedLR * actorFactor;
      const expectedPosterior = expectedPosteriorOdds / (1 + expectedPosteriorOdds);
      const posteriorReconciles = Math.abs(expectedPosterior - rawPosterior) < 0.0001;

      const recalcResult = await runCaseScoringEngine(caseId);
      const liveScore = recalcResult.score;

      const [freshCase] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId));
      const storedAfter = freshCase?.currentProbability ?? null;

      const storedMatchesLive = Math.abs((storedAfter ?? 0) - liveScore) < 0.001;
      const driftFromPrior = storedBefore !== null ? Number(Math.abs(storedBefore - liveScore).toFixed(4)) : null;

      rows.push({
        caseId,
        brand: c.brand,
        signalCount: allSignals.length,
        prior: Number(prior.toFixed(4)),
        combinedLR: Number(combinedLR.toFixed(4)),
        actorFactor: Number(actorFactor.toFixed(4)),
        actorSource: result.actorSource,
        posterior: Number(rawPosterior.toFixed(4)),
        posteriorReconciles,
        targetLikelihood: Number(combinedLR.toFixed(4)),
        barrierAdjustedProbability: Number(liveScore.toFixed(4)),
        storedBeforeReconciliation: storedBefore ? Number(storedBefore.toFixed(4)) : null,
        storedAfterReconciliation: storedAfter ? Number(storedAfter.toFixed(4)) : null,
        driftFromPrior,
        pipelineSynchronized: posteriorReconciles && storedMatchesLive,
      });
    }

    const allSynced = rows.every((r) => r.pipelineSynchronized);

    res.json({
      status: allSynced ? "SYNCHRONIZED" : "DESYNCHRONIZED",
      cases: rows,
      summary: {
        totalCases: rows.length,
        synchronized: rows.filter((r) => r.pipelineSynchronized).length,
        desynchronized: rows.filter((r) => !r.pipelineSynchronized).length,
      },
    });
  } catch (err: unknown) {
    console.error("[pipeline-reconciliation] Error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to compute reconciliation" });
  }
});

router.get("/cases/:caseId/forecast-result", async (req, res) => {
  try {
    const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
    if (!caseRow[0]) return res.status(404).json({ error: "Case not found" });
    const caseData = caseRow[0];

    const allSignalsRaw = await db.select().from(signalsTable).where(
      and(eq(signalsTable.caseId, req.params.caseId), eq(signalsTable.status, "active"))
    ).orderBy(signalsTable.signalId);

    const signalsByClass = {
      DynamicSignal: allSignalsRaw.filter(s => s.evidenceClass === "DynamicSignal"),
      StructuralContext: allSignalsRaw.filter(s => s.evidenceClass === "StructuralContext"),
      InterpretationNote: allSignalsRaw.filter(s => s.evidenceClass === "InterpretationNote"),
      RejectedArtifact: allSignalsRaw.filter(s => s.evidenceClass === "RejectedArtifact"),
    };

    const posteriorSignals = allSignalsRaw.filter(s => s.countTowardPosterior === true);

    res.json({
      caseId: caseData.caseId,
      brand: caseData.brand,
      strategicQuestion: caseData.strategicQuestion,
      probability: caseData.currentProbability,
      priorProbability: caseData.priorProbability,
      confidenceLevel: caseData.confidenceLevel,
      lastUpdate: caseData.lastUpdate,
      evidenceGate: {
        totalSignals: allSignalsRaw.length,
        posteriorEligible: posteriorSignals.length,
        excluded: allSignalsRaw.length - posteriorSignals.length,
        byClass: {
          DynamicSignal: signalsByClass.DynamicSignal.length,
          StructuralContext: signalsByClass.StructuralContext.length,
          InterpretationNote: signalsByClass.InterpretationNote.length,
          RejectedArtifact: signalsByClass.RejectedArtifact.length,
        },
      },
      signals: allSignalsRaw.map(s => ({
        signalId: s.signalId,
        description: (s.signalDescription || "").slice(0, 120),
        direction: s.direction,
        signalType: s.signalType,
        evidenceClass: s.evidenceClass,
        countTowardPosterior: s.countTowardPosterior,
        likelihoodRatio: s.likelihoodRatio,
        strengthScore: s.strengthScore,
        reliabilityScore: s.reliabilityScore,
        evidenceStatus: s.evidenceStatus,
      })),
    });
  } catch (err: unknown) {
    console.error("[forecast-result] Error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get forecast result" });
  }
});

export default router;
