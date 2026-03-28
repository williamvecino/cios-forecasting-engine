import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface SignalQualityInput {
  signals: Array<{
    id: string;
    text: string;
    direction: string;
    strength: string;
    confidence: string;
    source?: string;
    source_type?: string;
    observed_date?: string | null;
    source_url?: string | null;
  }>;
  question: string;
}

interface QualityAssessment {
  signalId: string;
  signalText: string;
  qualityScore: number;
  reliability: "high" | "moderate" | "low" | "unverifiable";
  freshness: "current" | "recent" | "dated" | "stale" | "unknown";
  directness: "direct" | "indirect" | "inferred" | "speculative";
  duplicationRisk: "none" | "low" | "moderate" | "high";
  warnings: string[];
  recommendation: "keep" | "verify" | "downgrade" | "flag" | "remove";
  rationale: string;
}

interface SignalQualityOutput {
  assessments: QualityAssessment[];
  overallQuality: {
    averageScore: number;
    signalsToVerify: number;
    signalsToDowngrade: number;
    signalsToRemove: number;
    signalGaps: string[];
  };
}

router.post("/agents/signal-quality", async (req: Request, res: Response) => {
  const input = req.body as SignalQualityInput;

  if (!input.signals?.length) {
    return res.status(400).json({ error: "signals array is required and must not be empty" });
  }
  if (!input.question) {
    return res.status(400).json({ error: "question is required" });
  }

  const systemPrompt = `You are a Signal Quality Agent in a clinical intelligence forecasting system.

PURPOSE: Score the reliability, freshness, directness, and duplication risk of each signal. Identify signals that need verification, downgrading, or removal. Identify gaps in signal coverage.

RULES:
- Quality score: 0-100 based on reliability (40%), freshness (25%), directness (25%), source quality (10%)
- Reliability: does the source have a track record of accuracy?
- Freshness: how recent is the information relative to the decision horizon?
- Directness: does the signal directly address the question or is it inferred?
- Duplication risk: could this signal be counting the same evidence as another signal?
- Be specific about warnings and rationale
- Signal gaps: what important information is missing?

OUTPUT FORMAT (JSON):
{
  "assessments": [
    {
      "signalId": "string",
      "signalText": "string — truncated signal text",
      "qualityScore": number (0-100),
      "reliability": "high" | "moderate" | "low" | "unverifiable",
      "freshness": "current" | "recent" | "dated" | "stale" | "unknown",
      "directness": "direct" | "indirect" | "inferred" | "speculative",
      "duplicationRisk": "none" | "low" | "moderate" | "high",
      "warnings": ["string"],
      "recommendation": "keep" | "verify" | "downgrade" | "flag" | "remove",
      "rationale": "string"
    }
  ],
  "overallQuality": {
    "averageScore": number,
    "signalsToVerify": number,
    "signalsToDowngrade": number,
    "signalsToRemove": number,
    "signalGaps": ["string — what's missing"]
  }
}

Return ONLY valid JSON.`;

  const signalList = input.signals.map(s =>
    `[${s.id}] "${s.text}" — direction: ${s.direction}, strength: ${s.strength}, confidence: ${s.confidence}, source: ${s.source_type || s.source || "unknown"}, date: ${s.observed_date || "unknown"}`
  ).join("\n");

  const userPrompt = `Question: ${input.question}

Signals to assess:
${signalList}

Assess quality of each signal.`;

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

    const parsed = JSON.parse(content) as SignalQualityOutput;
    const rawAssessments = Array.isArray(parsed.assessments) ? parsed.assessments : [];
    const safe: SignalQualityOutput = {
      assessments: rawAssessments.map(a => ({
        signalId: a.signalId || "",
        signalText: a.signalText || "",
        qualityScore: typeof a.qualityScore === "number" ? a.qualityScore : 0,
        reliability: a.reliability || "unverifiable",
        freshness: a.freshness || "unknown",
        directness: a.directness || "inferred",
        duplicationRisk: a.duplicationRisk || "none",
        warnings: Array.isArray(a.warnings) ? a.warnings : [],
        recommendation: a.recommendation || "flag",
        rationale: a.rationale || "",
      })),
      overallQuality: {
        averageScore: parsed.overallQuality?.averageScore ?? 0,
        signalsToVerify: parsed.overallQuality?.signalsToVerify ?? 0,
        signalsToDowngrade: parsed.overallQuality?.signalsToDowngrade ?? 0,
        signalsToRemove: parsed.overallQuality?.signalsToRemove ?? 0,
        signalGaps: Array.isArray(parsed.overallQuality?.signalGaps) ? parsed.overallQuality.signalGaps : [],
      },
    };
    res.json(safe);
  } catch (err: any) {
    console.error("[signal-quality] Error:", err.message);
    res.status(500).json({ error: "Signal quality agent failed", detail: err.message });
  }
});

export default router;
