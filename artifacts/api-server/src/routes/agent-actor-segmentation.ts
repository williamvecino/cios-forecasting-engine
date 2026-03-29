import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface ActorSegmentationInput {
  question: string;
  brand?: string;
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

  const brandContext = input.brand ? `for ${input.brand}` : "";

  const systemPrompt = `You are an Actor Segmentation Agent in a clinical intelligence forecasting system.

PURPOSE: Given a decision question about a specific drug/brand, identify ONLY the 3-6 stakeholders who directly influence whether ${input.brand || "this product"} gets adopted. Think like a pharma launch strategist — who actually moves the needle on this drug's adoption?

SCOPE BOUNDARY — what you must NOT do:
- Do NOT simulate how actors react to scenarios. That is the Stakeholder Reaction agent's job.
- Do NOT estimate probabilities or forecast outcomes. That is the forecast engine's job.
- Do NOT recommend actions. That is the Prioritization agent's job.
- Do NOT generate signals or evidence. That is MIOS, BAOS, or External Signal Scout's job.
- Do NOT include actors who do not DIRECTLY influence adoption of ${input.brand || "this specific product"}. If an actor is peripheral or has minimal influence on this specific decision, leave them out. Noise clouds judgment.
- You only MAP actors and their characteristics — you do not predict their behavior.

RULES:
- Identify 3-6 distinct actor segments — only those who MATTER for this drug's adoption. Fewer is better if fewer truly matter.
- Each actor must be specific to this therapeutic area and brand (not "healthcare providers" but "community oncologists treating NSCLC" or "heart failure cardiologists")
- Influence weights must sum to approximately 100 across all actors
- Interactions must be directional and typed
- Signal sensitivity maps how each actor would react to different types of evidence
- Timing indicates when each actor becomes most relevant in the decision horizon
- Only include regulators if a regulatory event is pending. Only include patients if patient advocacy directly drives prescribing. Only include payers if access/formulary is a real barrier for this specific drug.
- Think: "If I were presenting to the brand team, which 3-5 stakeholders would I put on the slide?"

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
${input.brand ? `Brand: ${input.brand}` : ""}
${input.therapeuticArea ? `Therapeutic Area: ${input.therapeuticArea}` : ""}
${input.indication ? `Indication: ${input.indication}` : ""}
${input.signals?.length ? `Key Signals:\n${input.signals.map(s => `- [${s.direction}] ${s.text}`).join("\n")}` : ""}
${input.context ? `Additional Context: ${input.context}` : ""}

Identify ONLY the stakeholders who directly influence ${input.brand || "this product"}'s adoption. Leave out anyone peripheral.`;

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
