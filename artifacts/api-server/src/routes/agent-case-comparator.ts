import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface CaseComparatorInput {
  question: string;
  therapeuticArea?: string;
  indication?: string;
  stage?: string;
  signals?: Array<{ text: string; direction: string }>;
  context?: string;
}

interface ComparableCase {
  caseName: string;
  brand: string;
  company: string;
  therapeuticArea: string;
  indication: string;
  yearRange: string;
  similarityScore: number;
  keySimilarities: string[];
  keyDifferences: string[];
  outcome: string;
  implicationForCurrentCase: string;
}

interface CaseComparatorOutput {
  comparableCases: ComparableCase[];
  priorStructure: {
    baseRateEstimate: number;
    baseRateRationale: string;
    adjustmentFactors: Array<{
      factor: string;
      direction: "up" | "down" | "neutral";
      magnitude: "small" | "moderate" | "large";
      rationale: string;
    }>;
  };
  analogLibrarySize: number;
  confidenceInAnalogs: "high" | "moderate" | "low";
}

router.post("/agents/case-comparator", async (req: Request, res: Response) => {
  const input = req.body as CaseComparatorInput;

  if (!input.question) {
    return res.status(400).json({ error: "question is required" });
  }

  const systemPrompt = `You are a Case Comparator Agent in a clinical intelligence forecasting system.

PURPOSE: Given a decision question and context, identify 3-5 historical analog cases from pharma/biotech that are structurally comparable. For each, assess similarity, divergence, and implication for the current case. Then structure a prior estimate based on base rates from these analogs.

RULES:
- Only use real, publicly documented cases (FDA approvals, launches, clinical programs)
- Similarity must be structural (same decision type, similar market dynamics) not superficial
- Each case must have a clear outcome that informs the current question
- Base rate estimate must be grounded in the analog outcomes
- Adjustment factors must be specific and directional

OUTPUT FORMAT (JSON):
{
  "comparableCases": [
    {
      "caseName": "string — descriptive name",
      "brand": "string — product brand name",
      "company": "string — company name",
      "therapeuticArea": "string",
      "indication": "string",
      "yearRange": "string — e.g. 2018-2020",
      "similarityScore": number (0-100),
      "keySimilarities": ["string"],
      "keyDifferences": ["string"],
      "outcome": "string — what actually happened",
      "implicationForCurrentCase": "string — what this means for the current question"
    }
  ],
  "priorStructure": {
    "baseRateEstimate": number (0-100, probability percentage),
    "baseRateRationale": "string — why this base rate from analogs",
    "adjustmentFactors": [
      {
        "factor": "string",
        "direction": "up" | "down" | "neutral",
        "magnitude": "small" | "moderate" | "large",
        "rationale": "string"
      }
    ]
  },
  "analogLibrarySize": number,
  "confidenceInAnalogs": "high" | "moderate" | "low"
}

Return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

  const userPrompt = `Question: ${input.question}
${input.therapeuticArea ? `Therapeutic Area: ${input.therapeuticArea}` : ""}
${input.indication ? `Indication: ${input.indication}` : ""}
${input.stage ? `Stage: ${input.stage}` : ""}
${input.signals?.length ? `Key Signals:\n${input.signals.map(s => `- [${s.direction}] ${s.text}`).join("\n")}` : ""}
${input.context ? `Additional Context: ${input.context}` : ""}

Identify 3-5 structurally comparable historical cases and structure a prior estimate.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      seed: 42,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: "No response from model" });
    }

    const parsed = JSON.parse(content) as CaseComparatorOutput;
    const safe: CaseComparatorOutput = {
      comparableCases: Array.isArray(parsed.comparableCases) ? parsed.comparableCases : [],
      priorStructure: parsed.priorStructure || { baseRateEstimate: 50, baseRateRationale: "Insufficient data", adjustmentFactors: [] },
      analogLibrarySize: parsed.analogLibrarySize || 0,
      confidenceInAnalogs: parsed.confidenceInAnalogs || "low",
    };
    res.json(safe);
  } catch (err: any) {
    console.error("[case-comparator] Error:", err.message);
    res.status(500).json({ error: "Case comparator agent failed", detail: err.message });
  }
});

export default router;
