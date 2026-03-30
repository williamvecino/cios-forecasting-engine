import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface RefineRequest {
  rawInput: string;
  proposedQuestion?: string;
}

interface FeasibilityCheck {
  verdict: "feasible" | "feasible_with_refinement" | "not_feasible";
  explanation: string;
  refinedQuestion?: string;
  checks: {
    clearOutcome: { pass: boolean; note: string };
    explicitHorizon: { pass: boolean; note: string };
    observableEvent: { pass: boolean; note: string };
    decisionRelevance: { pass: boolean; note: string };
    modelFeasibility: { pass: boolean; note: string };
  };
}

interface OutcomeStructure {
  recommended: "binary" | "multi_state";
  explanation: string;
  states: string[];
}

interface RefineResponse {
  feasibility: FeasibilityCheck;
  outcomeStructure: OutcomeStructure;
}

router.post("/ai-refine-question", async (req, res) => {
  try {
    const body = req.body as RefineRequest;

    if (!body.rawInput?.trim() && !body.proposedQuestion?.trim()) {
      res.status(400).json({ error: "rawInput or proposedQuestion is required" });
      return;
    }

    const questionToEvaluate = (body.proposedQuestion || body.rawInput || "").trim();
    const userDraft = (body.rawInput || "").trim();

    const systemPrompt = `You are a forecast question validation expert for a pharmaceutical intelligence system.

You receive a question (possibly AI-refined from a user draft) and must:
1. Evaluate whether this question is feasible to model as a probabilistic forecast
2. Recommend whether the outcome should be binary or multi-state

FEASIBILITY CRITERIA — evaluate each independently:
- clearOutcome: Does the question define a specific, measurable outcome? (not vague like "do well" or "succeed")
- explicitHorizon: Does it include a clear time frame? (e.g., "within 12 months", "by 2027")
- observableEvent: Is the outcome observable and verifiable? (not subjective or opinion-based)
- decisionRelevance: Would the answer inform a concrete business or clinical decision?
- modelFeasibility: Can the system gather signals and evidence to estimate probability? (not purely speculative)

VERDICT RULES:
- "feasible": All 5 criteria pass
- "feasible_with_refinement": 3-4 criteria pass; provide a refinedQuestion that fixes the gaps
- "not_feasible": Fewer than 3 pass; explain why this cannot be forecast

OUTCOME STRUCTURE RULES:
- Use "binary" ONLY when the outcome is truly yes/no with no meaningful intermediate states
  Examples: approval vs no approval, restriction imposed vs not imposed
- Use "multi_state" when the outcome can occur in staged, graded, or spectrum forms
  Examples: no action / safety communication / label update / restricted indication
- When recommending multi_state, provide 3-5 specific outcome states ordered from least to most severe/significant
- The states array must always have at least 2 entries (even for binary: ["Yes", "No"])

${userDraft && userDraft !== questionToEvaluate ? `\nThe user originally wrote: "${userDraft}"\nThe AI-proposed version is: "${questionToEvaluate}"\nEvaluate the AI-proposed version.` : ""}

Respond with valid JSON only. No markdown, no explanation outside the JSON.

Output schema:
{
  "feasibility": {
    "verdict": "feasible|feasible_with_refinement|not_feasible",
    "explanation": "string - 1-2 sentence summary of the feasibility assessment",
    "refinedQuestion": "string or null - only if verdict is feasible_with_refinement",
    "checks": {
      "clearOutcome": { "pass": true/false, "note": "string - brief explanation" },
      "explicitHorizon": { "pass": true/false, "note": "string" },
      "observableEvent": { "pass": true/false, "note": "string" },
      "decisionRelevance": { "pass": true/false, "note": "string" },
      "modelFeasibility": { "pass": true/false, "note": "string" }
    }
  },
  "outcomeStructure": {
    "recommended": "binary|multi_state",
    "explanation": "string - why this structure is appropriate for this question",
    "states": ["string array of outcome states"]
  }
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: questionToEvaluate },
      ],
      temperature: 0,
      seed: 42,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || "";

    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: "Failed to parse refinement output" });
      return;
    }

    const validVerdicts = ["feasible", "feasible_with_refinement", "not_feasible"];
    const feas = parsed.feasibility || {};
    const ostr = parsed.outcomeStructure || {};

    const safeCheck = (c: any) => ({
      pass: !!c?.pass,
      note: typeof c?.note === "string" ? c.note : "",
    });

    const result: RefineResponse = {
      feasibility: {
        verdict: validVerdicts.includes(feas.verdict) ? feas.verdict : "not_feasible",
        explanation: typeof feas.explanation === "string" ? feas.explanation : "Assessment complete.",
        refinedQuestion: typeof feas.refinedQuestion === "string" ? feas.refinedQuestion : undefined,
        checks: {
          clearOutcome: safeCheck(feas.checks?.clearOutcome),
          explicitHorizon: safeCheck(feas.checks?.explicitHorizon),
          observableEvent: safeCheck(feas.checks?.observableEvent),
          decisionRelevance: safeCheck(feas.checks?.decisionRelevance),
          modelFeasibility: safeCheck(feas.checks?.modelFeasibility),
        },
      },
      outcomeStructure: {
        recommended: ostr.recommended === "multi_state" ? "multi_state" : "binary",
        explanation: typeof ostr.explanation === "string" ? ostr.explanation : "",
        states: Array.isArray(ostr.states)
          ? ostr.states.filter((s: any): s is string => typeof s === "string" && s.trim() !== "")
          : ["Yes", "No"],
      },
    };

    res.json(result);
  } catch (err) {
    console.error("[ai-refine-question] Error:", err);
    res.status(500).json({ error: "Question refinement failed" });
  }
});

export default router;
