import type { CaseLibrary } from "@workspace/db";

export interface AnalogMatch {
  analogCase: CaseLibrary;
  similarityScore: number;
  similarityReasoning: string;
  matchedDimensions: string[];
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

export function scoreAnalogSimilarity(
  query: QueryContext,
  analog: CaseLibrary
): { score: number; dimensions: string[]; reasoning: string } {
  const dimensions: string[] = [];
  let score = 0;
  const maxScore = 100;

  const weights = {
    therapyArea: 25,
    specialty: 20,
    productType: 15,
    evidenceType: 15,
    payerEnvironment: 10,
    lifecycleStage: 10,
    brand: 5,
  };

  if (normalizedMatch(query.therapyArea, analog.therapyArea)) {
    score += weights.therapyArea;
    dimensions.push("Therapy area match");
  } else if (partialMatch(query.therapyArea, analog.therapyArea)) {
    score += weights.therapyArea * 0.5;
    dimensions.push("Partial therapy area match");
  }

  if (
    normalizedMatch(query.specialty, analog.specialty) ||
    partialMatch(query.specialtyProfile, analog.specialty)
  ) {
    score += weights.specialty;
    dimensions.push("Specialty match");
  } else if (partialMatch(query.specialty, analog.specialty)) {
    score += weights.specialty * 0.5;
    dimensions.push("Partial specialty match");
  }

  if (normalizedMatch(query.productType, analog.productType)) {
    score += weights.productType;
    dimensions.push("Product type match (medication/device)");
  }

  if (partialMatch(query.evidenceType, analog.evidenceType)) {
    score += weights.evidenceType;
    dimensions.push("Evidence type alignment");
  }

  if (partialMatch(query.payerEnvironment, analog.marketAccessConditions)) {
    score += weights.payerEnvironment;
    dimensions.push("Access/payer environment similarity");
  }

  if (analog.lifecycleStage) {
    score += weights.lifecycleStage * 0.5;
    dimensions.push("Lifecycle stage available");
  }

  if (partialMatch(query.primaryBrand, analog.caseId)) {
    score += weights.brand;
  }

  const normalizedScore = Math.min(100, score);

  let reasoning = "";
  if (dimensions.length === 0) {
    reasoning = "Limited direct overlap found — use with caution as a reference case.";
  } else if (normalizedScore >= 70) {
    reasoning = `Strong analog match. Key parallels: ${dimensions.slice(0, 3).join(", ")}. Historical outcome pattern may directly inform forecast.`;
  } else if (normalizedScore >= 40) {
    reasoning = `Moderate analog match. Relevant parallels: ${dimensions.join(", ")}. Apply with adjustments for context differences.`;
  } else {
    reasoning = `Weak analog match. Partial overlap: ${dimensions.join(", ")}. Treat as background reference only.`;
  }

  return { score: normalizedScore, dimensions, reasoning };
}

export function retrieveAnalogs(
  query: QueryContext,
  library: CaseLibrary[],
  topN = 5
): AnalogMatch[] {
  const scored = library.map((analog) => {
    const { score, dimensions, reasoning } = scoreAnalogSimilarity(query, analog);
    return {
      analogCase: analog,
      similarityScore: score,
      similarityReasoning: reasoning,
      matchedDimensions: dimensions,
    };
  });

  return scored
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, topN);
}
