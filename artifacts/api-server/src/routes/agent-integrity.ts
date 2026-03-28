import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface IntegrityInput {
  question: string;
  probability?: number;
  signals?: Array<{ text: string; direction: string; strength: string; confidence: string }>;
  gates?: Array<{ label: string; status: string; constrains_to: number }>;
  judgment?: {
    headline?: string;
    narrative?: string;
    recommendation?: string;
    confidenceLevel?: string;
  };
  decision?: {
    action?: string;
    rationale?: string;
  };
}

interface IntegrityCheck {
  checkId: string;
  checkName: string;
  category: "signal_coherence" | "probability_alignment" | "narrative_consistency" | "gate_signal_alignment" | "decision_grounding" | "confidence_calibration";
  status: "pass" | "warning" | "fail";
  severity: "critical" | "moderate" | "minor";
  detail: string;
  suggestion?: string;
}

interface IntegrityOutput {
  checks: IntegrityCheck[];
  overallIntegrity: "sound" | "minor_issues" | "significant_issues" | "unreliable";
  passCount: number;
  warningCount: number;
  failCount: number;
  summary: string;
}

router.post("/agents/integrity", async (req: Request, res: Response) => {
  const input = req.body as IntegrityInput;

  if (!input.question) {
    return res.status(400).json({ error: "question is required" });
  }

  const systemPrompt = `You are an Integrity / Consistency Agent in a clinical intelligence forecasting system.

PURPOSE: Check that the case's signals, probability, narrative, recommendation, constraints, and confidence are internally coherent. Flag contradictions, unsupported claims, and calibration issues.

CHECKS TO PERFORM:
1. Signal Coherence: Do signals collectively tell a consistent story? Are there unresolved contradictions?
2. Probability Alignment: Does the probability level match what the signals imply? (e.g., 85% probability but mostly negative signals = misaligned)
3. Narrative Consistency: Does the judgment narrative match the data? Does it mention factors not in the signals?
4. Gate-Signal Alignment: Do gate statuses align with the underlying signals? (e.g., a "strong" gate but no supporting signals = suspicious)
5. Decision Grounding: Is the recommended decision grounded in the probability and signals, or does it go beyond what the evidence supports?
6. Confidence Calibration: Is the stated confidence level appropriate given signal quality and coverage?

OUTPUT FORMAT (JSON):
{
  "checks": [
    {
      "checkId": "string",
      "checkName": "string — human-readable check name",
      "category": "signal_coherence" | "probability_alignment" | "narrative_consistency" | "gate_signal_alignment" | "decision_grounding" | "confidence_calibration",
      "status": "pass" | "warning" | "fail",
      "severity": "critical" | "moderate" | "minor",
      "detail": "string — what was found",
      "suggestion": "string — optional fix suggestion"
    }
  ],
  "overallIntegrity": "sound" | "minor_issues" | "significant_issues" | "unreliable",
  "passCount": number,
  "warningCount": number,
  "failCount": number,
  "summary": "string — one-paragraph integrity summary"
}

Return ONLY valid JSON.`;

  const userPrompt = `Question: ${input.question}
${input.probability !== undefined ? `Current Probability: ${input.probability}%` : ""}
${input.signals?.length ? `Signals (${input.signals.length}):\n${input.signals.map(s => `- [${s.direction}, ${s.strength}, ${s.confidence}] ${s.text}`).join("\n")}` : ""}
${input.gates?.length ? `Gates (${input.gates.length}):\n${input.gates.map(g => `- ${g.label}: ${g.status} (constrains to ${g.constrains_to})`).join("\n")}` : ""}
${input.judgment?.headline ? `Judgment Headline: ${input.judgment.headline}` : ""}
${input.judgment?.narrative ? `Judgment Narrative: ${input.judgment.narrative}` : ""}
${input.judgment?.recommendation ? `Recommendation: ${input.judgment.recommendation}` : ""}
${input.judgment?.confidenceLevel ? `Confidence Level: ${input.judgment.confidenceLevel}` : ""}
${input.decision?.action ? `Decision Action: ${input.decision.action}` : ""}
${input.decision?.rationale ? `Decision Rationale: ${input.decision.rationale}` : ""}

Run all integrity checks on this case.`;

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

    const parsed = JSON.parse(content) as IntegrityOutput;
    const rawChecks = Array.isArray(parsed.checks) ? parsed.checks : [];
    const safe: IntegrityOutput = {
      checks: rawChecks.map(c => ({
        checkId: c.checkId || "",
        checkName: c.checkName || "Unknown check",
        category: c.category || "signal_coherence",
        status: c.status || "warning",
        severity: c.severity || "minor",
        detail: c.detail || "",
        suggestion: c.suggestion,
      })),
      overallIntegrity: parsed.overallIntegrity || "unreliable",
      passCount: parsed.passCount || 0,
      warningCount: parsed.warningCount || 0,
      failCount: parsed.failCount || 0,
      summary: parsed.summary || "Integrity check could not be completed.",
    };
    res.json(safe);
  } catch (err: any) {
    console.error("[integrity] Error:", err.message);
    res.status(500).json({ error: "Integrity agent failed", detail: err.message });
  }
});

export default router;
