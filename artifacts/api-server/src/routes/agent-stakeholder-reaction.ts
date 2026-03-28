import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface StakeholderReactionInput {
  question: string;
  actors?: Array<{ name: string; role: string; influenceWeight: number }>;
  scenario: {
    label: string;
    description: string;
    probability?: number;
  };
  timeHorizon?: string;
  context?: string;
}

interface ActorReaction {
  actorName: string;
  initialReaction: string;
  reactionIntensity: "strong" | "moderate" | "mild" | "indifferent";
  reactionDirection: "supportive" | "resistant" | "neutral" | "mixed";
  behaviorChange: string;
  timeToReact: string;
  cascadeEffects: string[];
  secondOrderEffects: string[];
  responseConsiderations: string[];
}

interface StakeholderReactionOutput {
  reactions: ActorReaction[];
  systemImpact: {
    netEffect: "accelerates" | "decelerates" | "neutral" | "destabilizes";
    confidenceInPrediction: "high" | "moderate" | "low";
    keyUncertainty: string;
    timeline: string;
  };
  criticalWatchpoints: string[];
}

router.post("/agents/stakeholder-reaction", async (req: Request, res: Response) => {
  const input = req.body as StakeholderReactionInput;

  if (!input.question) {
    return res.status(400).json({ error: "question is required" });
  }
  if (!input.scenario?.label) {
    return res.status(400).json({ error: "scenario with label is required" });
  }

  const systemPrompt = `You are a Stakeholder Reaction Agent in a clinical intelligence forecasting system.

PURPOSE: Simulate how each market actor reacts to a specific scenario or change over time. Predict behavioral changes, cascade effects, and second-order consequences.

SCOPE BOUNDARY — what you must NOT do:
- Do NOT identify or define actors. That is the Actor Segmentation agent's job. You receive actors as input.
- Do NOT estimate probabilities or forecast outcomes. That is the forecast engine's job.
- Do NOT recommend strategic actions or prioritize next steps. That is the Prioritization agent's job.
- Do NOT assess signal quality or conflicts. Those are separate agents' jobs.
- You only SIMULATE reactions to a given scenario — you do not decide which scenario to simulate.

RULES:
- Each reaction must be specific to the actor's role and constraints
- Cascade effects: what happens when this actor reacts (downstream effects on other actors)
- Second-order effects: less obvious consequences that emerge over time
- Time to react: how quickly this actor would respond
- Response considerations: what factors would shape how to manage this reaction (descriptive, not prescriptive)
- Be concrete, not generic

OUTPUT FORMAT (JSON):
{
  "reactions": [
    {
      "actorName": "string",
      "initialReaction": "string — what they do first",
      "reactionIntensity": "strong" | "moderate" | "mild" | "indifferent",
      "reactionDirection": "supportive" | "resistant" | "neutral" | "mixed",
      "behaviorChange": "string — how their behavior changes",
      "timeToReact": "string — e.g. 'immediate', '1-2 weeks', '3-6 months'",
      "cascadeEffects": ["string — downstream effects"],
      "secondOrderEffects": ["string — longer-term consequences"],
      "responseConsiderations": ["string — factors that shape how to manage this reaction"]
    }
  ],
  "systemImpact": {
    "netEffect": "accelerates" | "decelerates" | "neutral" | "destabilizes",
    "confidenceInPrediction": "high" | "moderate" | "low",
    "keyUncertainty": "string",
    "timeline": "string"
  },
  "criticalWatchpoints": ["string — what to monitor"]
}

Return ONLY valid JSON.`;

  const actorList = input.actors?.length
    ? `Known Actors:\n${input.actors.map(a => `- ${a.name} (${a.role}, influence: ${a.influenceWeight})`).join("\n")}`
    : "";

  const userPrompt = `Question: ${input.question}

Scenario: ${input.scenario.label}
Description: ${input.scenario.description}
${input.scenario.probability !== undefined ? `Scenario Probability: ${input.scenario.probability}%` : ""}
${input.timeHorizon ? `Time Horizon: ${input.timeHorizon}` : ""}
${actorList}
${input.context ? `Additional Context: ${input.context}` : ""}

Simulate how each actor reacts to this scenario.`;

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

    const parsed = JSON.parse(content) as StakeholderReactionOutput;
    const rawReactions = Array.isArray(parsed.reactions) ? parsed.reactions : [];
    const safe: StakeholderReactionOutput = {
      reactions: rawReactions.map(r => ({
        actorName: r.actorName || "Unknown actor",
        initialReaction: r.initialReaction || "",
        reactionIntensity: r.reactionIntensity || "indifferent",
        reactionDirection: r.reactionDirection || "neutral",
        behaviorChange: r.behaviorChange || "",
        timeToReact: r.timeToReact || "unknown",
        cascadeEffects: Array.isArray(r.cascadeEffects) ? r.cascadeEffects : [],
        secondOrderEffects: Array.isArray(r.secondOrderEffects) ? r.secondOrderEffects : [],
        responseConsiderations: Array.isArray(r.responseConsiderations) ? r.responseConsiderations : (Array.isArray(r.mitigationOptions) ? r.mitigationOptions : []),
      })),
      systemImpact: {
        netEffect: parsed.systemImpact?.netEffect || "neutral",
        confidenceInPrediction: parsed.systemImpact?.confidenceInPrediction || "low",
        keyUncertainty: parsed.systemImpact?.keyUncertainty || "Insufficient data",
        timeline: parsed.systemImpact?.timeline || "Unknown",
      },
      criticalWatchpoints: Array.isArray(parsed.criticalWatchpoints) ? parsed.criticalWatchpoints : [],
    };
    res.json(safe);
  } catch (err: any) {
    console.error("[stakeholder-reaction] Error:", err.message);
    res.status(500).json({ error: "Stakeholder reaction agent failed", detail: err.message });
  }
});

export default router;
