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
  questionType: "strategic" | "competitive" | "financial" | "operational" | "diagnostic";
}

interface QuestionStructuringOutput {
  activeQuestion: StructuredQuestion;
  supportingQuestions: StructuredQuestion[];
  rejection: {
    rejected: boolean;
    reason: string | null;
    suggestion: string | null;
  };
  improvementExplanation: string | null;
  inputHash: string;
  driftDetected: boolean;
  driftWarning: string | null;
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

SCOPE BOUNDARY — what you must NOT do:
- Do NOT generate signals or evidence. That is MIOS, BAOS, or External Signal Scout's job.
- Do NOT estimate probabilities or forecast outcomes. That is the forecast engine's job.
- Do NOT assess signal quality, conflicts, or coherence. Those are separate agents' jobs.
- Do NOT identify stakeholders or market actors. That is the Actor Segmentation agent's job.
- Do NOT recommend actions. That is the Prioritization agent's job.
- You only STRUCTURE the question — you do not answer it or analyze it.

═══ PRIMARY QUESTION GUARDRAIL (MANDATORY) ═══
When generating a forecast question from a narrative, do NOT default to the easiest measurable outcome. Select the primary question based on the GOVERNING STRATEGIC UNCERTAINTY behind the decision.

Primary question ranking order (highest priority first):
1) Strategic / competitive outcome (e.g., competitive erosion, market defense, franchise risk)
2) Franchise defense / erosion risk (e.g., share loss, coverage reduction impact)
3) Portfolio value consequence (e.g., total portfolio impact from a strategic shift)
4) Financial metric consequence (e.g., ROI, revenue change)
5) Operational intermediate variable (e.g., adoption rate, prescribing velocity)

If both a strategic-risk question and a finance question are possible, ALWAYS prefer the strategic-risk question as primary UNLESS the user explicitly requests finance-first framing.
Financial proxy questions (ROI, revenue, cost impact) should be secondary questions, not primary.
═══ END PRIMARY QUESTION GUARDRAIL ═══

═══ QUESTION DRIFT DETECTION (MANDATORY) ═══
Before finalizing the primary question, compare the source narrative with the proposed question and detect drift.

Flag drift if ANY of these are true:
- The question shifts from strategic consequence to financial proxy
- The question drops the core competitive risk described in the source
- The question reframes the decision around ROI when the narrative is about preservation, erosion, adoption, timing, or competitive threat

If drift is detected:
- Set driftDetected to true
- Set driftWarning to a short explanation of what shifted
- Generate BOTH a strategic-risk version (as activeQuestion) AND a financial-outcome version (as the first supportingQuestion with questionType "financial")
- Default to the strategic-risk version as activeQuestion
═══ END QUESTION DRIFT DETECTION ═══

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

Classify each question's questionType:
- "strategic": competitive position, market defense, franchise risk
- "competitive": head-to-head competitor dynamics
- "financial": ROI, revenue, cost impact, portfolio value
- "operational": adoption rate, prescribing velocity, supply chain
- "diagnostic": root cause analysis, barrier identification

IMPORTANT: If you rewrite or restructure the user's question, you MUST explain WHY your version is better. Cover these dimensions:
- Measurability: Is the outcome now measurable and specific?
- Time horizon: Is the time frame now explicit and plausible?
- Observability: Is the event now directly observable and verifiable?
- Causal modelability: Can the system now trace causal links to estimate probability?

If the question was already well-formed and you did not change it, set improvementExplanation to null.

Respond with valid JSON only. No markdown, no explanation outside the JSON.

Output schema:
{
  "activeQuestion": {
    "questionText": "string - the primary bounded question (must be the strategic-risk version if drift detected)",
    "archetype": "binary|comparative|ranking|threshold|timing",
    "horizon": "string - time period (e.g., '12 months', '2026-2027')",
    "targetOutcome": "string - what success/occurrence looks like",
    "boundedness": "bounded|needs_splitting|too_broad",
    "questionType": "strategic|competitive|financial|operational|diagnostic"
  },
  "supportingQuestions": [
    {
      "questionText": "string",
      "archetype": "string",
      "horizon": "string",
      "targetOutcome": "string",
      "boundedness": "bounded",
      "questionType": "strategic|competitive|financial|operational|diagnostic"
    }
  ],
  "rejection": {
    "rejected": false,
    "reason": null,
    "suggestion": null
  },
  "improvementExplanation": "string or null - why the restructured question is a better forecasting form",
  "driftDetected": false,
  "driftWarning": "string or null - explanation of what shifted if drift detected"
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
    const validQuestionTypes = ["strategic", "competitive", "financial", "operational", "diagnostic"];

    const result: QuestionStructuringOutput = {
      activeQuestion: {
        questionText: active.questionText || rawInput,
        archetype: validArchetypes.includes(active.archetype) ? active.archetype : "binary",
        horizon: active.horizon || "12 months",
        targetOutcome: active.targetOutcome || "",
        boundedness: ["bounded", "needs_splitting", "too_broad"].includes(active.boundedness) ? active.boundedness : "bounded",
        questionType: validQuestionTypes.includes(active.questionType) ? active.questionType : "strategic",
      },
      supportingQuestions: Array.isArray(parsed.supportingQuestions)
        ? parsed.supportingQuestions.map((sq: any) => ({
            questionText: sq.questionText || "",
            archetype: validArchetypes.includes(sq.archetype) ? sq.archetype : "binary",
            horizon: sq.horizon || "12 months",
            targetOutcome: sq.targetOutcome || "",
            boundedness: "bounded",
            questionType: validQuestionTypes.includes(sq.questionType) ? sq.questionType : "strategic",
          }))
        : [],
      rejection: {
        rejected: !!parsed.rejection?.rejected,
        reason: parsed.rejection?.reason || null,
        suggestion: parsed.rejection?.suggestion || null,
      },
      improvementExplanation: typeof parsed.improvementExplanation === "string" ? parsed.improvementExplanation : null,
      inputHash: hashInput(rawInput),
      driftDetected: !!parsed.driftDetected,
      driftWarning: typeof parsed.driftWarning === "string" ? parsed.driftWarning : null,
    };

    res.json({ structuredQuestions: result });
  } catch (err) {
    console.error("[agent:question-structuring] Error:", err);
    res.status(500).json({ error: "Question structuring failed" });
  }
});

export default router;
