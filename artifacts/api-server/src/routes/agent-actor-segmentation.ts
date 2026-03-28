import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface ActorSegmentationInput {
  question: string;
  therapeuticArea?: string;
  indication?: string;
  signals?: Array<{ text: string; direction: string }>;
  context?: string;
}

interface ActorSegment {
  name: string;
  role: string;
  behavioralCharacteristics: string[];
  constraints: string[];
  triggers: string[];
  influenceWeight: number;
  timing: string;
  signalSensitivity: Array<{
    signalType: string;
    sensitivity: "high" | "moderate" | "low";
    expectedReaction: string;
  }>;
  interactions: Array<{
    targetActor: string;
    interactionType: "influences" | "blocks" | "enables" | "competes" | "coordinates";
    description: string;
  }>;
}

interface ActorSegmentationOutput {
  actors: ActorSegment[];
  systemDynamics: {
    primaryDrivers: string[];
    keyBottlenecks: string[];
    cascadeRisks: string[];
  };
  totalActors: number;
}

router.post("/agents/actor-segmentation", async (req: Request, res: Response) => {
  const input = req.body as ActorSegmentationInput;

  if (!input.question) {
    return res.status(400).json({ error: "question is required" });
  }

  const systemPrompt = `You are an Actor Segmentation Agent in a clinical intelligence forecasting system.

PURPOSE: Given a decision question and context, identify all relevant market actors (stakeholders, organizations, regulatory bodies, patient populations, competitor entities). For each actor, define their role, behavioral characteristics, constraints, triggers, influence weight, timing, signal sensitivity, and interactions with other actors.

RULES:
- Identify 4-8 distinct actor segments — no more, no fewer
- Each actor must be specific (not "healthcare providers" but "community oncologists in US")
- Influence weights must sum to approximately 100 across all actors
- Interactions must be directional and typed
- Signal sensitivity maps how each actor would react to different types of evidence
- Timing indicates when each actor becomes most relevant in the decision horizon

OUTPUT FORMAT (JSON):
{
  "actors": [
    {
      "name": "string — specific actor name",
      "role": "string — their function in the ecosystem",
      "behavioralCharacteristics": ["string — how they typically behave"],
      "constraints": ["string — what limits their actions"],
      "triggers": ["string — what causes them to act"],
      "influenceWeight": number (0-100, relative influence on outcome),
      "timing": "string — when they matter most (e.g. 'pre-launch', 'at approval', 'post-launch Q1-Q2')",
      "signalSensitivity": [
        {
          "signalType": "string — type of signal",
          "sensitivity": "high" | "moderate" | "low",
          "expectedReaction": "string — what they would do"
        }
      ],
      "interactions": [
        {
          "targetActor": "string — name of another actor",
          "interactionType": "influences" | "blocks" | "enables" | "competes" | "coordinates",
          "description": "string — how the interaction works"
        }
      ]
    }
  ],
  "systemDynamics": {
    "primaryDrivers": ["string — what drives the overall system"],
    "keyBottlenecks": ["string — what could slow/block progress"],
    "cascadeRisks": ["string — if X happens, Y follows"]
  },
  "totalActors": number
}

Return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

  const userPrompt = `Question: ${input.question}
${input.therapeuticArea ? `Therapeutic Area: ${input.therapeuticArea}` : ""}
${input.indication ? `Indication: ${input.indication}` : ""}
${input.signals?.length ? `Key Signals:\n${input.signals.map(s => `- [${s.direction}] ${s.text}`).join("\n")}` : ""}
${input.context ? `Additional Context: ${input.context}` : ""}

Identify all relevant actors and map their interactions for this decision.`;

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

    const parsed = JSON.parse(content) as ActorSegmentationOutput;
    const safe: ActorSegmentationOutput = {
      actors: Array.isArray(parsed.actors) ? parsed.actors : [],
      systemDynamics: parsed.systemDynamics || { primaryDrivers: [], keyBottlenecks: [], cascadeRisks: [] },
      totalActors: parsed.totalActors || (Array.isArray(parsed.actors) ? parsed.actors.length : 0),
    };
    res.json(safe);
  } catch (err: any) {
    console.error("[actor-segmentation] Error:", err.message);
    res.status(500).json({ error: "Actor segmentation agent failed", detail: err.message });
  }
});

export default router;
