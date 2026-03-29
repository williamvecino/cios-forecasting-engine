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
  comparisonGroups: string[];
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

const SCENARIO_TRIGGERS = /\b(or|vs\.?|versus|between|compared to|alternatively)\b/i;

function deriveComparisonGroups(rawInput: string, outcomes: string[], questionType: string): string[] {
  const q = rawInput.toLowerCase();

  if (outcomes.length >= 2) {
    return outcomes.slice(0, 2);
  }

  if (SCENARIO_TRIGGERS.test(rawInput)) {
    if (q.includes("launch") && (q.includes("timing") || q.includes("202") || q.includes("delay"))) {
      return ["Early launch", "Delayed launch"];
    }
    if (q.includes("adoption")) {
      return ["Rapid adoption", "Slow adoption"];
    }
    if (q.includes("approval")) {
      return ["Approval achieved", "Approval delayed"];
    }
  }

  if (q.includes("launch") && (q.includes("timing") || q.includes("202") || q.includes("delay") || q.includes("push"))) {
    return ["Early launch", "Delayed launch"];
  }
  if (q.includes("adoption") && (q.includes("target") || q.includes("threshold") || q.includes("achieve"))) {
    return ["Rapid adoption", "Slow adoption"];
  }
  if (q.includes("approv") && (q.includes("delay") || q.includes("achiev") || q.includes("will"))) {
    return ["Approval achieved", "Approval delayed"];
  }
  if (q.includes("guideline") || q.includes("nccn") || q.includes("asco")) {
    return ["Guideline inclusion", "Guideline exclusion"];
  }
  if (q.includes("biosimilar") || q.includes("generic")) {
    return ["Market entry on time", "Market entry delayed"];
  }

  return [];
}

function sanitizeInterpretation(raw: Record<string, unknown>, rawInput: string): InterpretedQuestion {
  const outcomes = asStringArray(raw.outcomes);
  const questionType = asString(raw.questionType, "binary");

  let comparisonGroups = asStringArray(raw.comparisonGroups);
  if (comparisonGroups.length < 2) {
    comparisonGroups = deriveComparisonGroups(rawInput, outcomes, questionType);
  }

  return {
    decisionType: asString(raw.decisionType, "Decision"),
    event: asString(raw.event, rawInput.slice(0, 100)),
    outcomes,
    timeHorizon: asString(raw.timeHorizon, "12 months"),
    primaryConstraint: asString(raw.primaryConstraint, "To be determined"),
    subject: asString(raw.subject, ""),
    outcome: asString(raw.outcome, ""),
    questionType,
    entities: asStringArray(raw.entities),
    comparisonGroups,
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
10. comparisonGroups: Decision-based scenario comparison groups derived from the question's outcome alternatives. These must be outcome scenarios, NOT entity names.
    - If the question contains timing alternatives (e.g., "2026 or 2027"), use those as groups (e.g., ["Late 2026 launch", "Late 2027 launch"])
    - If the question implies adoption scenarios, use ["Rapid adoption", "Slow adoption"]
    - If the question implies approval scenarios, use ["Approval achieved", "Approval delayed"]
    - If the question contains "or", "vs", "between" with scenario alternatives, extract those alternatives
    - Do NOT use company names, drug names, or geographic regions as comparison groups
    - Comparison groups should always represent competing outcome scenarios for the SAME subject
11. restatedQuestion: A clean, one-sentence restatement of the question in executive language

Always provide all fields. If a field cannot be determined, use a reasonable inference rather than leaving it blank.

Respond with valid JSON only. No markdown, no explanation.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawInput },
      ],
      temperature: 0.3,
      max_tokens: 1000,
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
