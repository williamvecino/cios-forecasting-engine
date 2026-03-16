import type { ForecastOutput } from "./forecast-engine.js";
import type { HierarchicalCalibrationResult, CalibrationConfidenceResult } from "./calibration-fallback.js";
import { deriveQuestionType, type QuestionType } from "./case-context.js";

export interface PortfolioQuestion {
  label: string;
  strategicQuestion: string;
  priorOverride?: number;
}

export interface PortfolioQuestionResult {
  label: string;
  strategicQuestion: string;
  questionType: QuestionType;
  priorProbability: number;
  rawProbability: number;
  calibratedProbability: number;
  hierarchicalCalibration: HierarchicalCalibrationResult;
  calibrationConfidence: CalibrationConfidenceResult;
  keyDrivers: {
    topPositive: Array<{ description: string; signalType: string; lr: number; absoluteImpact: number }>;
    topNegative: Array<{ description: string; signalType: string; lr: number; absoluteImpact: number }>;
    swingFactor: { description: string; direction: string; deltaIfReversed: number } | null;
  };
  traceSummary: string;
}

export interface PortfolioSummary {
  highestRisk: { label: string; calibratedProbability: number };
  highestUpside: { label: string; calibratedProbability: number };
  mostSensitive: { label: string; swingDelta: number; swingSignal: string } | null;
  crossQuestionConsistency: {
    rawSpreadPp: number;
    calibratedSpreadPp: number;
    note: string;
  };
  questionCount: number;
}

export interface PortfolioOutput {
  caseId: string;
  questions: PortfolioQuestionResult[];
  portfolio: PortfolioSummary;
  generatedAt: string;
}

export function extractKeyDrivers(forecast: ForecastOutput): PortfolioQuestionResult["keyDrivers"] {
  const details = forecast.signalDetails ?? [];
  const sorted = [...details].sort((a, b) => b.absoluteImpact - a.absoluteImpact);

  const topPositive = sorted
    .filter((s) => s.direction === "Positive")
    .slice(0, 3)
    .map((s) => ({ description: s.description, signalType: s.signalType, lr: s.likelihoodRatio, absoluteImpact: s.absoluteImpact }));

  const topNegative = sorted
    .filter((s) => s.direction === "Negative")
    .slice(0, 3)
    .map((s) => ({ description: s.description, signalType: s.signalType, lr: s.likelihoodRatio, absoluteImpact: s.absoluteImpact }));

  const swing = forecast.sensitivityAnalysis?.swingFactor;
  const swingFactor = swing
    ? { description: swing.description, direction: swing.direction, deltaIfReversed: swing.probabilityDeltaIfReversed }
    : null;

  return { topPositive, topNegative, swingFactor };
}

export function buildTraceSummary(
  label: string,
  questionType: QuestionType,
  rawP: number,
  calP: number,
  calibration: HierarchicalCalibrationResult,
  confidence: CalibrationConfidenceResult
): string {
  const rawPct = (rawP * 100).toFixed(1);
  const calPct = (calP * 100).toFixed(1);
  const corrPp = calibration.correctionAppliedPp;
  const parts: string[] = [
    `"${label}" (${questionType}): raw ${rawPct}% → calibrated ${calPct}%`,
    `fallback: ${calibration.fallbackLevel} (local n=${calibration.localSegmentN}, global n=${calibration.globalBucketN})`,
    corrPp !== 0 ? `correction: ${corrPp > 0 ? "+" : ""}${corrPp.toFixed(1)}pp` : "no correction applied",
    `confidence: ${confidence.level}`,
  ];
  return parts.join(" · ");
}

export function buildPortfolioSummary(questions: PortfolioQuestionResult[]): PortfolioSummary {
  const byCalibrated = [...questions].sort((a, b) => a.calibratedProbability - b.calibratedProbability);
  const highestRisk = byCalibrated[0];
  const highestUpside = byCalibrated[byCalibrated.length - 1];

  let mostSensitive: PortfolioSummary["mostSensitive"] = null;
  for (const q of questions) {
    const delta = q.keyDrivers.swingFactor ? Math.abs(q.keyDrivers.swingFactor.deltaIfReversed) : 0;
    if (delta > 0 && (!mostSensitive || delta > mostSensitive.swingDelta)) {
      mostSensitive = {
        label: q.label,
        swingDelta: delta,
        swingSignal: q.keyDrivers.swingFactor!.description,
      };
    }
  }

  const rawValues = questions.map((q) => q.rawProbability);
  const calValues = questions.map((q) => q.calibratedProbability);
  const rawSpreadPp = (Math.max(...rawValues) - Math.min(...rawValues)) * 100;
  const calibratedSpreadPp = (Math.max(...calValues) - Math.min(...calValues)) * 100;

  let note: string;
  if (questions.length <= 1) {
    note = "Single question — no cross-question comparison available.";
  } else if (calibratedSpreadPp < 3) {
    note = "All questions converge to similar probabilities — high internal consistency.";
  } else if (calibratedSpreadPp < 10) {
    note = "Moderate spread across questions — calibration segments are differentiating meaningfully.";
  } else {
    note = "Wide spread across questions — question framing or prior assumptions create materially different outlooks. Review priors and calibration segment coverage.";
  }

  return {
    highestRisk: { label: highestRisk.label, calibratedProbability: highestRisk.calibratedProbability },
    highestUpside: { label: highestUpside.label, calibratedProbability: highestUpside.calibratedProbability },
    mostSensitive,
    crossQuestionConsistency: { rawSpreadPp: Number(rawSpreadPp.toFixed(1)), calibratedSpreadPp: Number(calibratedSpreadPp.toFixed(1)), note },
    questionCount: questions.length,
  };
}
