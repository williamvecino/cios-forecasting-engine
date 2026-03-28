import { parseMiosBaosWorkbook } from "./parseMiosBaosWorkbook";
import { normalizeCiosSignals, type NormalizedSignal } from "./normalizeCiosSignals";

export interface ImportResult {
  success: boolean;
  signals: NormalizedSignal[];
  totalImported: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  warnings: string[];
  errors: string[];
}

export function processWorkbook(data: ArrayBuffer, fileName: string): ImportResult {
  const parseResult = parseMiosBaosWorkbook(data, fileName);

  if (!parseResult.success) {
    return {
      success: false,
      signals: [],
      totalImported: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      warnings: parseResult.warnings,
      errors: parseResult.errors,
    };
  }

  const { signals, warnings: normWarnings } = normalizeCiosSignals(
    parseResult.signals,
    fileName,
  );

  const allWarnings = [...parseResult.warnings, ...normWarnings];

  if (signals.length === 0) {
    return {
      success: false,
      signals: [],
      totalImported: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      warnings: allWarnings,
      errors: ["All rows had unrecognized direction, strength, or confidence values. No signals could be normalized."],
    };
  }

  return {
    success: true,
    signals,
    totalImported: signals.length,
    positiveCount: signals.filter((s) => s.direction === "positive").length,
    negativeCount: signals.filter((s) => s.direction === "negative").length,
    neutralCount: signals.filter((s) => s.direction === "neutral").length,
    warnings: allWarnings,
    errors: [],
  };
}
