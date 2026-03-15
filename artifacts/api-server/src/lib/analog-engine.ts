import type { CaseLibrary } from "@workspace/db";

export interface AnalogMatch {
  analogCase: CaseLibrary;
  similarityScore: number;
  similarityReasoning: string;
  matchedDimensions: string[];
  keyDifferences: string[];
  adoptionLesson: string;
  confidenceBand: "High" | "Moderate" | "Low";
}

interface QueryContext {
  therapyArea?: string;
  specialty?: string;
  productType?: string;
  evidenceType?: string;
  specialtyProfile?: string;
  payerEnvironment?: string;
  primaryBrand?: string;
}

function normalizedMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

function partialMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const an = a.toLowerCase();
  const bn = b.toLowerCase();
  return an.includes(bn) || bn.includes(an);
}

function deriveAdoptionLesson(analog: CaseLibrary, score: number): string {
  const trajectory = analog.adoptionTrajectory;
  const outcome = analog.finalObservedOutcome;
  const finalProb = analog.finalProbability;

  if (!outcome && !trajectory) {
    return "Insufficient historical outcome data in this analog — treat as structural reference only.";
  }

  const probContext =
    finalProb !== null && finalProb !== undefined
      ? ` Final observed probability: ${(Number(finalProb) * 100).toFixed(0)}%.`
      : "";

  if (score >= 70) {
    return `High-relevance analog. Pattern: "${trajectory || outcome}".${probContext} Trajectory directly informative for current forecast calibration.`;
  }
  if (score >= 40) {
    return `Moderate-relevance analog. "${outcome || trajectory}".${probContext} Apply lessons with adjustments for differing context dimensions.`;
  }
  return `Low-relevance analog. "${outcome || trajectory}".${probContext} Use as background framing — do not apply outcome directly.`;
}

export function scoreAnalogSimilarity(
  query: QueryContext,
  analog: CaseLibrary
): { score: number; dimensions: string[]; differences: string[]; reasoning: string; adoptionLesson: string; confidenceBand: "High" | "Moderate" | "Low" } {
  const dimensions: string[] = [];
  const differences: string[] = [];
  let score = 0;

  const weights = {
    therapyArea: 25,
    specialty: 20,
    productType: 15,
    evidenceType: 15,
    payerEnvironment: 10,
    lifecycleStage: 10,
    brand: 5,
  };

  // Therapy area
  if (normalizedMatch(query.therapyArea, analog.therapyArea)) {
    score += weights.therapyArea;
    dimensions.push("Therapy area match");
  } else if (partialMatch(query.therapyArea, analog.therapyArea)) {
    score += weights.therapyArea * 0.5;
    dimensions.push("Partial therapy area overlap");
  } else {
    if (query.therapyArea && analog.therapyArea) {
      differences.push(`Therapy area: ${query.therapyArea} vs. analog ${analog.therapyArea}`);
    }
  }

  // Specialty
  if (
    normalizedMatch(query.specialty, analog.specialty) ||
    partialMatch(query.specialtyProfile, analog.specialty)
  ) {
    score += weights.specialty;
    dimensions.push("Specialty match");
  } else if (partialMatch(query.specialty, analog.specialty)) {
    score += weights.specialty * 0.5;
    dimensions.push("Partial specialty overlap");
  } else {
    if (query.specialty && analog.specialty) {
      differences.push(`Specialty: ${query.specialty} vs. analog ${analog.specialty}`);
    }
  }

  // Product type
  if (normalizedMatch(query.productType, analog.productType)) {
    score += weights.productType;
    dimensions.push("Product type match");
  } else {
    if (query.productType && analog.productType) {
      differences.push(`Product type: ${query.productType} vs. analog ${analog.productType}`);
    }
  }

  // Evidence type
  if (partialMatch(query.evidenceType, analog.evidenceType)) {
    score += weights.evidenceType;
    dimensions.push("Evidence type alignment");
  } else {
    if (query.evidenceType && analog.evidenceType) {
      differences.push(`Evidence: ${query.evidenceType} vs. analog ${analog.evidenceType}`);
    }
  }

  // Payer / access environment
  if (partialMatch(query.payerEnvironment, analog.marketAccessConditions)) {
    score += weights.payerEnvironment;
    dimensions.push("Payer/access environment similarity");
  } else {
    if (query.payerEnvironment && analog.marketAccessConditions) {
      differences.push(`Payer environment: different access conditions`);
    }
  }

  // Lifecycle stage — give partial credit for having it
  if (analog.lifecycleStage) {
    score += weights.lifecycleStage * 0.5;
    dimensions.push(`Lifecycle stage available (${analog.lifecycleStage})`);
  }

  // Brand bonus
  if (partialMatch(query.primaryBrand, analog.caseId)) {
    score += weights.brand;
  }

  const normalizedScore = Math.min(100, score);
  const confidenceBand: "High" | "Moderate" | "Low" =
    normalizedScore >= 65 ? "High" : normalizedScore >= 35 ? "Moderate" : "Low";

  let reasoning = "";
  if (dimensions.length === 0) {
    reasoning =
      "No direct dimensional overlap found. This case provides structural context only — do not weight its outcome in current forecast.";
  } else if (normalizedScore >= 70) {
    reasoning = `Strong analog. Key parallels: ${dimensions.slice(0, 3).join("; ")}. Historical outcome pattern can directly inform prior calibration.`;
  } else if (normalizedScore >= 40) {
    reasoning = `Moderate analog. Relevant parallels: ${dimensions.join("; ")}. Apply outcome lessons with adjustments for the ${differences.length} differing dimension(s).`;
  } else {
    reasoning = `Weak analog. Partial overlap on: ${dimensions.join("; ")}. Treat as background structural reference — do not transfer outcome probabilities directly.`;
  }

  const adoptionLesson = deriveAdoptionLesson(analog, normalizedScore);

  return { score: normalizedScore, dimensions, differences, reasoning, adoptionLesson, confidenceBand };
}

export function retrieveAnalogs(
  query: QueryContext,
  library: CaseLibrary[],
  topN = 5
): AnalogMatch[] {
  const scored = library.map((analog) => {
    const { score, dimensions, differences, reasoning, adoptionLesson, confidenceBand } =
      scoreAnalogSimilarity(query, analog);
    return {
      analogCase: analog,
      similarityScore: score,
      similarityReasoning: reasoning,
      matchedDimensions: dimensions,
      keyDifferences: differences,
      adoptionLesson,
      confidenceBand,
    };
  });

  return scored
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, topN);
}
