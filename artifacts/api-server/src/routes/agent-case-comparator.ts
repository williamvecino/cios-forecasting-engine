import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface CaseComparatorInput {
  question: string;
  brand?: string;
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
  analogLibrarySize: number;
  confidenceInAnalogs: "high" | "moderate" | "low";
}

router.post("/agents/case-comparator", async (req: Request, res: Response) => {
  const input = req.body as CaseComparatorInput;

  if (!input.question) {
    return res.status(400).json({ error: "question is required" });
  }

  const systemPrompt = `You are a Case Comparator Agent in a clinical intelligence forecasting system.

PURPOSE: Given a decision question about ${input.brand || "a specific drug"}, identify 3-5 historical analog cases from pharma/biotech that are structurally comparable. These analogs inform how this drug's adoption might unfold based on what happened with similar drugs.

SCOPE BOUNDARY — what you must NOT do:
- Do NOT estimate probabilities, base rates, or likelihood scores. That is the forecast engine's job.
- Do NOT recommend actions or prioritize next steps. That is the Prioritization agent's job.
- Do NOT identify stakeholders or actors. That is the Actor Segmentation agent's job.
- Do NOT generate brand-specific clinical evidence. That is MIOS's job.

SCOPE — what you SHOULD do:
- Find 3-5 real, historically documented cases with structural similarity to this decision
- For each case, explain what happened, what was similar, what was different, and what the implication is
- Assess confidence in the analog set overall

RULES:
- Only use real, publicly documented cases (FDA approvals, launches, clinical programs)
- Similarity must be STRUCTURAL (same decision type, similar market dynamics, similar therapeutic challenge) not superficial
- Analogs MUST be from the same or closely related therapeutic area${input.therapeuticArea ? ` (${input.therapeuticArea})` : ""}. A cardiology analog is irrelevant for an oncology question. A rare disease analog is irrelevant for a primary care question. Stay in the domain.
- If the drug treats ${input.indication || "a specific indication"}, find analogs that faced the same adoption challenge in the same or adjacent indication — not just any drug that was successful
- Each case must have a clear outcome that informs the current question
- Think: "What other drug faced THIS SAME challenge in THIS SAME therapeutic area?"

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
  "analogLibrarySize": number,
  "confidenceInAnalogs": "high" | "moderate" | "low"
}

Return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

  const userPrompt = `Question: ${input.question}
${input.brand ? `Brand: ${input.brand}` : ""}
${input.therapeuticArea ? `Therapeutic Area: ${input.therapeuticArea}` : ""}
${input.indication ? `Indication: ${input.indication}` : ""}
${input.stage ? `Stage: ${input.stage}` : ""}
${input.signals?.length ? `Key Signals:\n${input.signals.map(s => `- [${s.direction}] ${s.text}`).join("\n")}` : ""}
${input.context ? `Additional Context: ${input.context}` : ""}

Find 3-5 analogs from the same therapeutic area that faced the same adoption challenge as ${input.brand || "this drug"}.`;

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
