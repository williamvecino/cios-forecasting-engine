import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface PrioritizationInput {
  question: string;
  probability?: number;
  signals?: Array<{ text: string; direction: string; strength: string }>;
  actors?: Array<{ name: string; influenceWeight: number }>;
  scenarios?: Array<{ label: string; probability: number }>;
  constraints?: string[];
  context?: string;
}

interface PrioritizedAction {
  rank: number;
  action: string;
  category: "investigate" | "prepare" | "execute" | "monitor" | "hedge";
  leverage: "high" | "moderate" | "low";
  urgency: "immediate" | "near-term" | "watch";
  rationale: string;
  dependsOn: string[];
  riskIfDelayed: string;
  ownerRole: string;
  timeframe: string;
}

interface PrioritizationOutput {
  prioritizedActions: PrioritizedAction[];
  decisionReadiness: {
    score: number;
    gaps: string[];
    recommendation: string;
  };
  nextReviewTrigger: string;
}

router.post("/agents/prioritization", async (req: Request, res: Response) => {
  const input = req.body as PrioritizationInput;

  if (!input.question) {
    return res.status(400).json({ error: "question is required" });
  }

  const systemPrompt = `You are a Prioritization Agent in a clinical intelligence forecasting system.

PURPOSE: Given a decision question, its current probability estimate, signals, actors, and scenarios, produce a ranked list of 3-5 prioritized actions. Each action must be concrete, assignable, and ranked by leverage × urgency.

SCOPE BOUNDARY — what you must NOT do:
- Do NOT estimate or change probabilities. That is the forecast engine's job.
- Do NOT identify actors or map stakeholders. That is the Actor Segmentation agent's job.
- Do NOT simulate stakeholder reactions. That is the Stakeholder Reaction agent's job.
- Do NOT generate signals or evidence. That is MIOS, BAOS, or External Signal Scout's job.
- Do NOT assess signal quality or resolve conflicts. Those are separate agents' jobs.
- You only RANK actions — you receive inputs from other agents and the engine.

RULES:
- Actions must be specific and actionable (not "gather more data" but "commission Phase 3b subgroup analysis of elderly patients")
- Leverage = how much this action could shift the outcome probability
- Urgency = time-sensitivity given the decision horizon
- Each action must have a clear owner role and timeframe
- Categories: investigate (fill knowledge gap), prepare (ready for likely outcome), execute (act now), monitor (watch for trigger), hedge (reduce downside)
- dependsOn references other actions by their action text
- Decision readiness score = 0-100 indicating how ready we are to make this decision

OUTPUT FORMAT (JSON):
{
  "prioritizedActions": [
    {
      "rank": number,
      "action": "string — specific actionable step",
      "category": "investigate" | "prepare" | "execute" | "monitor" | "hedge",
      "leverage": "high" | "moderate" | "low",
      "urgency": "immediate" | "near-term" | "watch",
      "rationale": "string — why this matters and why this rank",
      "dependsOn": ["string — other actions this depends on"],
      "riskIfDelayed": "string — what happens if we don't do this",
      "ownerRole": "string — who should own this",
      "timeframe": "string — when this should be completed"
    }
  ],
  "decisionReadiness": {
    "score": number (0-100),
    "gaps": ["string — what's missing before we can decide"],
    "recommendation": "string — decide now, wait for X, or gather Y"
  },
  "nextReviewTrigger": "string — what event should trigger re-evaluation"
}

Return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

  const userPrompt = `Question: ${input.question}
${input.probability !== undefined ? `Current Probability: ${input.probability}%` : ""}
${input.signals?.length ? `Key Signals:\n${input.signals.map(s => `- [${s.direction}, ${s.strength}] ${s.text}`).join("\n")}` : ""}
${input.actors?.length ? `Key Actors:\n${input.actors.map(a => `- ${a.name} (influence: ${a.influenceWeight})`).join("\n")}` : ""}
${input.scenarios?.length ? `Scenarios:\n${input.scenarios.map(s => `- ${s.label}: ${s.probability}%`).join("\n")}` : ""}
${input.constraints?.length ? `Constraints:\n${input.constraints.map(c => `- ${c}`).join("\n")}` : ""}
${input.context ? `Additional Context: ${input.context}` : ""}

Produce 3-5 ranked prioritized actions.`;

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

    const parsed = JSON.parse(content) as PrioritizationOutput;
    const safe: PrioritizationOutput = {
      prioritizedActions: Array.isArray(parsed.prioritizedActions) ? parsed.prioritizedActions : [],
      decisionReadiness: parsed.decisionReadiness || { score: 0, gaps: ["Analysis incomplete"], recommendation: "Insufficient data to prioritize" },
      nextReviewTrigger: parsed.nextReviewTrigger || "When new signals arrive",
    };
    res.json(safe);
  } catch (err: any) {
    console.error("[prioritization] Error:", err.message);
    res.status(500).json({ error: "Prioritization agent failed", detail: err.message });
  }
});

export default router;
