import type { RawSignalRow } from "./parseMiosBaosWorkbook";

export type NormalizedDirection = "positive" | "negative" | "neutral";
export type NormalizedStrength = "High" | "Medium" | "Low";
export type NormalizedConfidence = "Confirmed" | "Probable" | "Speculative";

export interface WorkbookMeta {
  sourceWorkbook: string;
  programId: string;
  whyItMatters: string;
}

export interface NormalizedSignal {
  id: string;
  text: string;
  caveat: string;
  direction: NormalizedDirection;
  strength: NormalizedStrength;
  reliability: NormalizedConfidence;
  impact: NormalizedStrength;
  category: "evidence";
  source: "system";
  accepted: boolean;
  signal_class: "observed";
  signal_family: "brand_clinical_regulatory";
  source_type: string;
  priority_source: "observed_verified";
  is_locked: boolean;
  workbook_meta: WorkbookMeta;
}

const DIRECTION_MAP: Record<string, NormalizedDirection> = {
  "positive": "positive",
  "supports adoption": "positive",
  "supports early adoption": "positive",
  "negative": "negative",
  "slows adoption": "negative",
  "slows early adoption": "negative",
  "neutral": "neutral",
};

const STRENGTH_MAP: Record<string, NormalizedStrength> = {
  "dominant": "High",
  "high": "High",
  "moderate": "Medium",
  "medium": "Medium",
  "low": "Low",
  "weak": "Low",
};

const CONFIDENCE_MAP: Record<string, NormalizedConfidence> = {
  "high": "Confirmed",
  "confirmed": "Confirmed",
  "moderate": "Probable",
  "probable": "Probable",
  "low": "Speculative",
  "speculative": "Speculative",
};

export interface NormalizationResult {
  signals: NormalizedSignal[];
  warnings: string[];
}

export function normalizeCiosSignals(
  rawSignals: RawSignalRow[],
  fileName: string,
): NormalizationResult {
  const warnings: string[] = [];
  const signals: NormalizedSignal[] = [];

  for (let i = 0; i < rawSignals.length; i++) {
    const raw = rawSignals[i];

    const direction = DIRECTION_MAP[raw.direction.toLowerCase().trim()];
    if (!direction) {
      warnings.push(`Signal ${i + 1} "${raw.signalLabel}": Unknown direction "${raw.direction}". Skipped.`);
      continue;
    }

    const strength = STRENGTH_MAP[raw.strength.toLowerCase().trim()];
    if (!strength) {
      warnings.push(`Signal ${i + 1} "${raw.signalLabel}": Unknown strength "${raw.strength}". Skipped.`);
      continue;
    }

    const confidence = CONFIDENCE_MAP[raw.confidence.toLowerCase().trim()];
    if (!confidence) {
      warnings.push(`Signal ${i + 1} "${raw.signalLabel}": Unknown confidence "${raw.confidence}". Skipped.`);
      continue;
    }

    signals.push({
      id: `wb_${i}`,
      text: raw.signalLabel,
      caveat: raw.whyItMatters,
      direction,
      strength,
      reliability: confidence,
      impact: strength,
      category: "evidence",
      source: "system",
      accepted: true,
      signal_class: "observed",
      signal_family: "brand_clinical_regulatory",
      source_type: "MIOS/BAOS Import",
      priority_source: "observed_verified",
      is_locked: true,
      workbook_meta: {
        sourceWorkbook: fileName,
        programId: raw.programId,
        whyItMatters: raw.whyItMatters,
      },
    });
  }

  return { signals, warnings };
}
