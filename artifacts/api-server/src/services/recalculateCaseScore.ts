import { db } from "@workspace/db";
import { casesTable, signalsTable, actorsTable, calibrationLogTable, AGENT_ARCHETYPES } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { runForecastEngine } from "../lib/forecast-engine.js";
import { simulateAgents } from "../lib/agent-engine.js";
import { getLrCorrections, getBucket, computeDecay } from "../lib/calibration-utils.js";
import { computeHierarchicalCalibration } from "../lib/calibration-fallback.js";
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

  const allSignals = await db.select().from(signalsTable).where(
    and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active"))
  );
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
  const eligibleSignals = filterEligibleSignals(allSignals, caseTargetContext);
  const guardedSignals = applyEventFamilyGuardrail(eligibleSignals);
  const dedupedSignals = deduplicateSignals(guardedSignals);
  const signals = enforceSignalLimit(dedupedSignals);

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
  const finalProbability = applyEnvironmentToProbability(calibratedProbability, envAdjustments);

  const calculatedAt = new Date();

  await db.update(casesTable).set({
    currentProbability: finalProbability,
    confidenceLevel: result.confidenceLevel,
    topSupportiveActor: result.topSupportiveActor,
    topConstrainingActor: result.topConstrainingActor,
    miosRoutingCheck: result.interpretation.miosRoutingCheck,
    ohosRoutingCheck: result.interpretation.ohosRoutingCheck,
    lastUpdate: calculatedAt,
  }).where(eq(casesTable.caseId, caseId));

  const forecastId = `FCAST-${Date.now()}`;

  const largestShift = signalsWithAdjustedLR.length > 0
    ? Math.max(...signalsWithAdjustedLR.map(s => Math.abs((s.likelihoodRatio ?? 1) - 1)))
    : 0;

  const snapshotForLog = {
    ...result,
    _perfSummary: {
      timestamp: calculatedAt.toISOString(),
      driverCount: signalsWithAdjustedLR.length,
      largestShift: Number(largestShift.toFixed(4)),
      finalProbability,
    },
  };

  await db.insert(calibrationLogTable).values({
    id: randomUUID(),
    forecastId,
    caseId,
    predictedProbability: finalProbability,
    snapshotJson: JSON.stringify(snapshotForLog),
  }).onConflictDoNothing();

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
