import type { RawSignalRow, TraceRow } from "./parseMiosBaosWorkbook";

export type NormalizedDirection = "positive" | "negative" | "neutral";
export type NormalizedStrength = "High" | "Medium" | "Low";
export type NormalizedConfidence = "Confirmed" | "Probable" | "Speculative";

export interface NormalizedSignal {
  id: string;
  text: string;
  caveat: string;
  direction: NormalizedDirection;
  strength: NormalizedStrength;
  reliability: NormalizedConfidence;
  impact: NormalizedStrength;
  category: "evidence" | "access" | "competition" | "guideline" | "timing" | "adoption";
  source: "system";
  accepted: boolean;
  signal_class: "observed";
  signal_family: "brand_clinical_regulatory" | "payer_access" | "competitor" | "patient_demand" | "provider_behavioral" | "system_operational";
  source_type: string;
  priority_source: "observed_verified";
  is_locked: boolean;
  workbook_meta: WorkbookMeta;
}

export interface WorkbookMeta {
  sourceWorkbook: string;
  sourceSheet: string;
  programId: string;
  signalId: string;
  sourceLayer: string;
  sourceReference: string;
  whyItMatters: string;
  forecastDomain: string;
  rank: number | null;
  brand: string;
  strategicQuestion: string;
  signalCategory: string;
  traceability: {
    bridgeId: string;
    statementId: string;
    evidenceId: string;
    baosId: string;
    traceStatus: string;
    notes: string;
  } | null;
}

const DIRECTION_MAP: Record<string, NormalizedDirection> = {
  "positive": "positive",
  "supports adoption": "positive",
  "negative": "negative",
  "slows adoption": "negative",
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
  "moderate": "Probable",
  "low": "Speculative",
};

const CATEGORY_MAP: Record<string, "evidence" | "access" | "competition" | "guideline" | "timing" | "adoption"> = {
  "clinical credibility": "evidence",
  "clinical credibility / need state": "evidence",
  "durability / efficacy": "evidence",
  "durability": "evidence",
  "efficacy": "evidence",
  "clinical": "evidence",
  "evidence": "evidence",
  "payer": "access",
  "access": "access",
  "payer access": "access",
  "reimbursement": "access",
  "competition": "competition",
  "competitive": "competition",
  "guideline": "guideline",
  "guidelines": "guideline",
  "timing": "timing",
  "regulatory": "timing",
  "behavioral": "adoption",
  "behavioral / operational": "adoption",
  "adoption": "adoption",
  "operational": "adoption",
  "workflow": "adoption",
};

const FAMILY_MAP: Record<string, NormalizedSignal["signal_family"]> = {
  "evidence": "brand_clinical_regulatory",
  "access": "payer_access",
  "competition": "competitor",
  "guideline": "brand_clinical_regulatory",
  "timing": "brand_clinical_regulatory",
  "adoption": "provider_behavioral",
};

export interface NormalizationResult {
  signals: NormalizedSignal[];
  warnings: string[];
}

export function normalizeCiosSignals(
  rawSignals: RawSignalRow[],
  traceRows: TraceRow[],
  fileName: string,
): NormalizationResult {
  const warnings: string[] = [];
  const signals: NormalizedSignal[] = [];

  const sorted = [...rawSignals].sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank;
    if (a.rank != null) return -1;
    if (b.rank != null) return 1;

    const strengthOrder: Record<string, number> = { High: 3, Moderate: 2, Low: 1 };
    const confOrder: Record<string, number> = { High: 3, Moderate: 2, Low: 1 };
    const sA = strengthOrder[a.strength] || 0;
    const sB = strengthOrder[b.strength] || 0;
    if (sA !== sB) return sB - sA;
    const cA = confOrder[a.confidence] || 0;
    const cB = confOrder[b.confidence] || 0;
    return cB - cA;
  });

  for (let i = 0; i < sorted.length; i++) {
    const raw = sorted[i];

    const dirKey = raw.direction.toLowerCase().trim();
    const direction = DIRECTION_MAP[dirKey];
    if (!direction) {
      warnings.push(`Signal "${raw.signalId}": Unknown direction "${raw.direction}". Skipped.`);
      continue;
    }

    const strKey = raw.strength.toLowerCase().trim();
    const strength = STRENGTH_MAP[strKey];
    if (!strength) {
      warnings.push(`Signal "${raw.signalId}": Unknown strength "${raw.strength}". Skipped.`);
      continue;
    }

    const confKey = raw.confidence.toLowerCase().trim();
    const confidence = CONFIDENCE_MAP[confKey];
    if (!confidence) {
      warnings.push(`Signal "${raw.signalId}": Unknown confidence "${raw.confidence}". Skipped.`);
      continue;
    }

    const catKey = raw.signalCategory.toLowerCase().trim();
    const category = CATEGORY_MAP[catKey];
    if (!category) {
      warnings.push(`Signal "${raw.signalId}": Unknown category "${raw.signalCategory}". Skipped.`);
      continue;
    }

    if (raw.rank == null) {
      warnings.push(`Signal "${raw.signalId}": Rank missing; fallback sort used.`);
    }

    const trace = traceRows.find((t) => t.signalId === raw.signalId) || null;

    signals.push({
      id: `wb_${raw.signalId}`,
      text: raw.signalLabel,
      caveat: raw.whyItMatters || "",
      direction,
      strength,
      reliability: confidence,
      impact: strength,
      category,
      source: "system",
      accepted: true,
      signal_class: "observed",
      signal_family: FAMILY_MAP[category] || "brand_clinical_regulatory",
      source_type: raw.sourceLayer || "MIOS/BAOS Import",
      priority_source: "observed_verified",
      is_locked: true,
      workbook_meta: {
        sourceWorkbook: fileName,
        sourceSheet: "CIOS_Signal_Export",
        programId: raw.programId,
        signalId: raw.signalId,
        sourceLayer: raw.sourceLayer,
        sourceReference: raw.sourceReference,
        whyItMatters: raw.whyItMatters,
        forecastDomain: raw.forecastDomain,
        rank: raw.rank,
        brand: raw.brand,
        strategicQuestion: raw.strategicQuestion,
        signalCategory: raw.signalCategory,
        traceability: trace
          ? {
              bridgeId: trace.bridgeId,
              statementId: trace.statementId,
              evidenceId: trace.evidenceId,
              baosId: trace.baosId,
              traceStatus: trace.traceStatus,
              notes: trace.notes,
            }
          : null,
      },
    });
  }

  return { signals, warnings };
}
