import type {
  BiasBySignalType,
  CalibrationRow,
  CalibrationSummary,
  ForecastRecord,
} from "../types/forecast";

import {
  CoreSignalType,
  SIGNAL_TYPE_ORDER,
  getSignalTypeLabel,
} from "./signal-taxonomy";

function round(value: number, digits = 3): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function toPct(value01: number): number {
  return value01 * 100;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function hasResolvedOutcome(forecast: ForecastRecord): boolean {
  return forecast.actualOutcome === 0 || forecast.actualOutcome === 1;
}

export function computeBrierScore(predictedProbability: number, actualOutcome: number): number {
  const diff = predictedProbability - actualOutcome;
  return diff * diff;
}

export function buildCalibrationRows(forecasts: ForecastRecord[]): CalibrationRow[] {
  return forecasts
    .filter(hasResolvedOutcome)
    .map((forecast) => {
      const predicted = forecast.predictedProbability;
      const actual = forecast.actualOutcome as number;
      const brier = computeBrierScore(predicted, actual);

      const activeSignalTypes = unique(
        (forecast.signals ?? []).map((s) => s.signalType)
      );

      const activeSignalSubtypes = unique(
        (forecast.signals ?? [])
          .map((s) => s.signalSubtype)
          .filter((x): x is NonNullable<typeof x> => Boolean(x))
      );

      return {
        forecastId: forecast.id,
        caseId: forecast.caseId,
        predictedProbability: predicted,
        actualOutcome: actual,
        brierScore: brier,
        errorPp: toPct(predicted - actual),
        activeSignalTypes,
        activeSignalSubtypes,
      };
    });
}

export function computeBiasBySignalType(rows: CalibrationRow[]): BiasBySignalType[] {
  const result: BiasBySignalType[] = [];

  for (const signalType of SIGNAL_TYPE_ORDER) {
    const matchingRows = rows.filter((row) => row.activeSignalTypes.includes(signalType));

    if (matchingRows.length === 0) {
      result.push({
        signalType,
        label: getSignalTypeLabel(signalType),
        n: 0,
        meanErrorPp: 0,
        meanBrier: 0,
        calibrated: false,
      });
      continue;
    }

    const meanErrorPp =
      matchingRows.reduce((sum, row) => sum + row.errorPp, 0) / matchingRows.length;

    const meanBrier =
      matchingRows.reduce((sum, row) => sum + row.brierScore, 0) / matchingRows.length;

    result.push({
      signalType,
      label: getSignalTypeLabel(signalType),
      n: matchingRows.length,
      meanErrorPp: round(meanErrorPp, 1),
      meanBrier: round(meanBrier, 3),
      calibrated: true,
    });
  }

  return result;
}

export function computeCalibrationSummary(forecasts: ForecastRecord[]): CalibrationSummary {
  const totalForecasts = forecasts.length;
  const resolvedRows = buildCalibrationRows(forecasts);
  const calibratedRecords = resolvedRows.length;

  const coveragePct =
    totalForecasts === 0 ? 0 : round((calibratedRecords / totalForecasts) * 100, 0);

  const meanBrierScore =
    calibratedRecords === 0
      ? null
      : round(
          resolvedRows.reduce((sum, row) => sum + row.brierScore, 0) / calibratedRecords,
          3
        );

  const meanForecastErrorPp =
    calibratedRecords === 0
      ? null
      : round(
          resolvedRows.reduce((sum, row) => sum + row.errorPp, 0) / calibratedRecords,
          1
        );

  const biasBySignalType = computeBiasBySignalType(resolvedRows);

  return {
    totalForecasts,
    calibratedRecords,
    coveragePct,
    meanBrierScore,
    meanForecastErrorPp,
    biasBySignalType,
    resolvedRows,
  };
}

export function getDisplayedCalibrationSignalTypes(
  biasRows: BiasBySignalType[],
  options?: { includeEmpty?: boolean }
): BiasBySignalType[] {
  const includeEmpty = options?.includeEmpty ?? true;

  return biasRows.filter((row) => {
    if (includeEmpty) return true;
    return row.n > 0;
  });
}

export function getTopOverforecastedSignalTypes(
  biasRows: BiasBySignalType[],
  count = 3
): BiasBySignalType[] {
  return [...biasRows]
    .filter((row) => row.n > 0)
    .sort((a, b) => a.meanErrorPp - b.meanErrorPp)
    .slice(0, count);
}

export function getTopUnderforecastedSignalTypes(
  biasRows: BiasBySignalType[],
  count = 3
): BiasBySignalType[] {
  return [...biasRows]
    .filter((row) => row.n > 0)
    .sort((a, b) => b.meanErrorPp - a.meanErrorPp)
    .slice(0, count);
}
