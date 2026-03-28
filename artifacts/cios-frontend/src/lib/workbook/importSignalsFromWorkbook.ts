import { parseMiosBaosWorkbook, type WorkbookParseResult, type ReadinessCheck } from "./parseMiosBaosWorkbook";
import { normalizeCiosSignals, type NormalizedSignal } from "./normalizeCiosSignals";

export type ImportMode = "replace" | "merge";

export interface ImportSummary {
  programId: string;
  brand: string;
  strategicQuestion: string;
  totalImported: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  topByRank: { signalId: string; label: string; direction: string; strength: string }[];
  warningCount: number;
  warnings: string[];
  readinessChecks: ReadinessCheck[];
  readinessAllPassed: boolean;
}

export interface ImportResult {
  success: boolean;
  parseResult: WorkbookParseResult;
  normalizedSignals: NormalizedSignal[];
  summary: ImportSummary | null;
  errors: string[];
  questionMismatch: boolean;
  questionMismatchDetail: string | null;
}

export function processWorkbook(data: ArrayBuffer, fileName: string): ImportResult {
  const parseResult = parseMiosBaosWorkbook(data, fileName);

  if (!parseResult.success || !parseResult.activeProgram) {
    return {
      success: false,
      parseResult,
      normalizedSignals: [],
      summary: null,
      errors: parseResult.errors,
      questionMismatch: false,
      questionMismatchDetail: null,
    };
  }

  const { signals: normalized, warnings: normWarnings } = normalizeCiosSignals(
    parseResult.signals,
    parseResult.traceRows,
    fileName,
  );

  const allWarnings = [...parseResult.warnings, ...normWarnings];

  const readinessAllPassed = parseResult.readinessChecks.length === 0 || parseResult.readinessChecks.every((c) => c.passed);

  const summary: ImportSummary = {
    programId: parseResult.activeProgram.programId,
    brand: parseResult.activeProgram.brand,
    strategicQuestion: parseResult.activeProgram.strategicQuestion,
    totalImported: normalized.length,
    positiveCount: normalized.filter((s) => s.direction === "positive").length,
    negativeCount: normalized.filter((s) => s.direction === "negative").length,
    neutralCount: normalized.filter((s) => s.direction === "neutral").length,
    topByRank: normalized.slice(0, 5).map((s) => ({
      signalId: s.workbook_meta.signalId,
      label: s.text,
      direction: s.direction,
      strength: s.strength,
    })),
    warningCount: allWarnings.length,
    warnings: allWarnings,
    readinessChecks: parseResult.readinessChecks,
    readinessAllPassed,
  };

  return {
    success: true,
    parseResult,
    normalizedSignals: normalized,
    summary,
    errors: [],
    questionMismatch: false,
    questionMismatchDetail: null,
  };
}

export function checkQuestionAlignment(
  workbookQuestion: string,
  activeQuestionText: string,
): { mismatch: boolean; detail: string | null } {
  if (!workbookQuestion || !activeQuestionText) {
    return { mismatch: false, detail: null };
  }

  const wbNorm = workbookQuestion.toLowerCase().trim().replace(/[?.!]/g, "");
  const aqNorm = activeQuestionText.toLowerCase().trim().replace(/[?.!]/g, "");

  if (wbNorm === aqNorm) return { mismatch: false, detail: null };

  const wbWords = new Set(wbNorm.split(/\s+/));
  const aqWords = new Set(aqNorm.split(/\s+/));
  const intersection = [...wbWords].filter((w) => aqWords.has(w));
  const overlap = intersection.length / Math.max(wbWords.size, aqWords.size);

  if (overlap > 0.6) return { mismatch: false, detail: null };

  return {
    mismatch: true,
    detail: `Workbook strategic question differs from current case question.\nWorkbook: "${workbookQuestion}"\nCurrent case: "${activeQuestionText}"`,
  };
}

export function applyImport(
  mode: ImportMode,
  existingSignals: any[],
  importedSignals: NormalizedSignal[],
): any[] {
  if (mode === "replace") {
    return [...importedSignals];
  }

  const importedById = new Map(importedSignals.map((s) => [s.workbook_meta.signalId, s]));
  const merged: any[] = [];

  for (const existing of existingSignals) {
    const wbId = existing.workbook_meta?.signalId;
    if (wbId && importedById.has(wbId)) {
      merged.push(importedById.get(wbId));
      importedById.delete(wbId);
    } else {
      merged.push(existing);
    }
  }

  for (const remaining of importedById.values()) {
    merged.push(remaining);
  }

  return merged;
}
