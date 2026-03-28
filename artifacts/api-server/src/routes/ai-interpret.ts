import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface InterpretRequest {
  rawInput: string;
}

interface InterpretedQuestion {
  decisionType: string;
  event: string;
  outcomes: string[];
  timeHorizon: string;
  primaryConstraint: string;
  subject: string;
  outcome: string;
  questionType: string;
  entities: string[];
  restatedQuestion: string;
}

function asString(val: unknown, fallback: string): string {
  if (typeof val === "string" && val.trim()) return val.trim();
  return fallback;
}

function asStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return [];
}

function sanitizeInterpretation(raw: Record<string, unknown>, rawInput: string): InterpretedQuestion {
  return {
    decisionType: asString(raw.decisionType, "Decision"),
    event: asString(raw.event, rawInput.slice(0, 100)),
    outcomes: asStringArray(raw.outcomes),
    timeHorizon: asString(raw.timeHorizon, "12 months"),
    primaryConstraint: asString(raw.primaryConstraint, "To be determined"),
    subject: asString(raw.subject, ""),
    outcome: asString(raw.outcome, ""),
    questionType: asString(raw.questionType, "binary"),
    entities: asStringArray(raw.entities),
    restatedQuestion: asString(raw.restatedQuestion, rawInput),
  };
}

router.post("/ai-interpret-question", async (req, res) => {
  try {
    const body = req.body as InterpretRequest;

    if (!body.rawInput || !body.rawInput.trim()) {
      res.status(400).json({ error: "rawInput is required" });
      return;
    }

    const rawInput = body.rawInput.trim();

    const systemPrompt = `You are a senior pharmaceutical strategy advisor. A user has typed a question about a pharmaceutical or healthcare decision. Your job is to interpret their question and extract structured information.

From any input — whether it is a clean question, messy notes, bullet points, partial thoughts, or pasted text — you must extract:

1. decisionType: What kind of decision this is (e.g., "Launch timing", "Adoption forecasting", "Market share movement", "Guideline inclusion", "Competitive timing", "Access/coverage", "Regulatory approval")
2. event: The specific event or outcome being evaluated (e.g., "U.S. generic aripiprazole 1-month vial launch")
3. outcomes: The possible outcomes as an array of short phrases (e.g., ["Launch in 2026", "Delayed to 2027"])
4. timeHorizon: The time period under consideration (e.g., "12 months", "2026-2027", "24 months"). If not explicitly stated, infer a reasonable default.
5. primaryConstraint: The most likely primary barrier or constraint driving the outcome (e.g., "Manufacturing readiness", "Regulatory approval", "Payer access")
6. subject: The drug, therapy, device, or product being evaluated (e.g., "ARIKAYCE", "generic aripiprazole vial")
7. outcome: The outcome being measured in one or two words (e.g., "adoption", "launch timing", "market share", "guideline inclusion")
8. questionType: One of "binary", "comparative", "ranking", "threshold", or "timing"
9. entities: Any specific populations, specialties, regions, or groups mentioned (e.g., ["pulmonologists", "Northeast centers"])
10. restatedQuestion: A clean, one-sentence restatement of the question in executive language

Always provide all fields. If a field cannot be determined, use a reasonable inference rather than leaving it blank.

Respond with valid JSON only. No markdown, no explanation.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawInput },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content || "";

    let raw: Record<string, unknown>;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      raw = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: "Failed to interpret question. Please try again." });
      return;
    }

    const parsed = sanitizeInterpretation(raw, rawInput);
    res.json({ interpretation: parsed });
  } catch (err) {
    console.error("Question interpretation error:", err);
    res.status(500).json({ error: "Failed to interpret question" });
  }
});

export default router;
