import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface QuestionStructuringInput {
  rawInput: string;
}

interface StructuredQuestion {
  questionText: string;
  archetype: "binary" | "comparative" | "ranking" | "threshold" | "timing";
  horizon: string;
  targetOutcome: string;
  boundedness: "bounded" | "needs_splitting" | "too_broad";
}

interface QuestionStructuringOutput {
  activeQuestion: StructuredQuestion;
  supportingQuestions: StructuredQuestion[];
  rejection: {
    rejected: boolean;
    reason: string | null;
    suggestion: string | null;
  };
  inputHash: string;
}

function hashInput(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

router.post("/agents/question-structuring", async (req, res) => {
  try {
    const body = req.body as QuestionStructuringInput;

    if (!body.rawInput || !body.rawInput.trim()) {
      res.status(400).json({ error: "rawInput is required" });
      return;
    }

    const rawInput = body.rawInput.trim();

    const systemPrompt = `You are a decision-question structuring agent for a pharmaceutical intelligence system.

Your single job: convert raw user text into 1-3 bounded, answerable decision questions.

Rules:
1. Each question must be answerable with a probability (0-100%).
2. Each question must have a clear time horizon.
3. Each question must have a specific target outcome.
4. If the input is too broad or contains multiple unrelated decisions, set boundedness to "needs_splitting" and break into separate questions.
5. If the input is not a decision question at all (e.g., "tell me about X", general knowledge), set rejected to true with a reason.
6. Never combine multiple decisions into one question.
7. Never rewrite a well-formed question unnecessarily.

Classify each question archetype:
- "binary": yes/no outcome (e.g., "Will X launch by Y?")
- "comparative": choosing between options (e.g., "Will A or B gain share?")
- "ranking": ordering multiple items (e.g., "Which of these 3 will perform best?")
- "threshold": crossing a numeric boundary (e.g., "Will adoption exceed 30%?")
- "timing": when something will happen (e.g., "When will generic entry occur?")

Respond with valid JSON only. No markdown, no explanation.

Output schema:
{
  "activeQuestion": {
    "questionText": "string - the primary bounded question",
    "archetype": "binary|comparative|ranking|threshold|timing",
    "horizon": "string - time period (e.g., '12 months', '2026-2027')",
    "targetOutcome": "string - what success/occurrence looks like",
    "boundedness": "bounded|needs_splitting|too_broad"
  },
  "supportingQuestions": [
    {
      "questionText": "string",
      "archetype": "string",
      "horizon": "string",
      "targetOutcome": "string",
      "boundedness": "bounded"
    }
  ],
  "rejection": {
    "rejected": false,
    "reason": null,
    "suggestion": null
  }
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawInput },
      ],
      temperature: 0,
      seed: 42,
      max_tokens: 1200,
    });

    const content = response.choices[0]?.message?.content || "";

    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: "Failed to parse structuring output" });
      return;
    }

    const active = parsed.activeQuestion || {};
    const validArchetypes = ["binary", "comparative", "ranking", "threshold", "timing"];

    const result: QuestionStructuringOutput = {
      activeQuestion: {
        questionText: active.questionText || rawInput,
        archetype: validArchetypes.includes(active.archetype) ? active.archetype : "binary",
        horizon: active.horizon || "12 months",
        targetOutcome: active.targetOutcome || "",
        boundedness: ["bounded", "needs_splitting", "too_broad"].includes(active.boundedness) ? active.boundedness : "bounded",
      },
      supportingQuestions: Array.isArray(parsed.supportingQuestions)
        ? parsed.supportingQuestions.map((sq: any) => ({
            questionText: sq.questionText || "",
            archetype: validArchetypes.includes(sq.archetype) ? sq.archetype : "binary",
            horizon: sq.horizon || "12 months",
            targetOutcome: sq.targetOutcome || "",
            boundedness: "bounded",
          }))
        : [],
      rejection: {
        rejected: !!parsed.rejection?.rejected,
        reason: parsed.rejection?.reason || null,
        suggestion: parsed.rejection?.suggestion || null,
      },
      inputHash: hashInput(rawInput),
    };

    res.json({ structuredQuestions: result });
  } catch (err) {
    console.error("[agent:question-structuring] Error:", err);
    res.status(500).json({ error: "Question structuring failed" });
  }
});

export default router;
