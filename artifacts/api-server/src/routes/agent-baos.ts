import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface MiosEvidence {
  evidenceText: string;
  trialOrSource: string;
  direction: string;
  strength: string;
  whyItMatters: string;
}

interface BaosInput {
  brand: string;
  question: string;
  miosEvidence: MiosEvidence[];
  therapeuticArea?: string;
  indication?: string;
  context?: string;
}

interface BaosBarrierSignal {
  cognitiveLens: string;
  barrierText: string;
  triggeringEvidence: string;
  direction: "positive" | "negative";
  strength: "High" | "Medium" | "Low";
  confidence: "Confirmed" | "Probable" | "Speculative";
  whyItMatters: string;
  affectedSegment: string;
}

interface BaosOutput {
  brand: string;
  barrierSignals: BaosBarrierSignal[];
  barrierSummary: string;
}

router.post("/agents/baos", async (req, res) => {
  const input: BaosInput = req.body;

  if (!input.brand || !input.question || !Array.isArray(input.miosEvidence)) {
    return res.status(400).json({ error: "brand, question, and miosEvidence array are required" });
  }

  const evidenceBlock = input.miosEvidence
    .map((e, i) => `${i + 1}. [${e.direction}] ${e.evidenceText} (Source: ${e.trialOrSource})`)
    .join("\n");

  const systemPrompt = `You are BAOS — the Behavioral Adoption & Objection System.

Your single job: given clinical evidence from MIOS about ${input.brand}, identify the cognitive barriers and behavioral objections that healthcare providers (HCPs) will have.

WORKFLOW:
1. Review each piece of MIOS evidence about ${input.brand}
2. For each, identify what cognitive bias or behavioral barrier would affect HCP adoption
3. Name the specific cognitive lens (e.g., Status Quo Bias, Loss Aversion, Anchoring Bias, Availability Heuristic, Authority Bias, Halo Effect, Confirmation Bias, Effort Heuristic, Social Proof, Ambiguity Aversion, Framing Effect, etc.)
4. Determine whether this barrier accelerates or slows adoption of ${input.brand}
5. Filter: only keep barriers relevant to the specific question

SCOPE BOUNDARY — what you must NOT do:
- Do NOT generate clinical evidence or search for trials. That is MIOS's job. You receive MIOS evidence as input.
- Do NOT estimate probabilities or forecast outcomes. That is the forecast engine's job.
- Do NOT generate external market signals. That is External Signal Scout's job.
- Do NOT recommend strategic actions. That is the Prioritization agent's job.
- You only identify COGNITIVE BARRIERS to adoption. Nothing else.

BARRIER REQUIREMENTS:
- Every barrier MUST name a specific cognitive lens
- Every barrier MUST reference which MIOS evidence triggered it
- Direction: "negative" = barrier slows adoption, "positive" = behavioral tailwind accelerates adoption
- Barriers must be specific to HCPs deciding about ${input.brand}, not generic psychology

OUTPUT FORMAT (JSON):
{
  "brand": "${input.brand}",
  "barrierSignals": [
    {
      "cognitiveLens": "Name of the cognitive bias/lens",
      "barrierText": "description of the specific HCP behavioral barrier or tailwind",
      "triggeringEvidence": "which MIOS evidence triggers this barrier",
      "direction": "positive" | "negative",
      "strength": "High" | "Medium" | "Low",
      "confidence": "Confirmed" | "Probable" | "Speculative",
      "whyItMatters": "why this barrier matters for adoption",
      "affectedSegment": "which HCP segment is most affected"
    }
  ],
  "barrierSummary": "brief summary of the cognitive barrier landscape"
}`;

  const userPrompt = `Brand: ${input.brand}
Question: ${input.question}
${input.therapeuticArea ? `Therapeutic Area: ${input.therapeuticArea}` : ""}
${input.indication ? `Indication: ${input.indication}` : ""}

MIOS Evidence for ${input.brand}:
${evidenceBlock}

For each piece of evidence above, identify the cognitive barriers or behavioral tailwinds that HCPs will experience when deciding about ${input.brand}.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      seed: 42,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const result: BaosOutput = {
      brand: input.brand,
      barrierSignals: Array.isArray(parsed.barrierSignals)
        ? parsed.barrierSignals.map((s: any) => ({
            cognitiveLens: s.cognitiveLens || "",
            barrierText: s.barrierText || "",
            triggeringEvidence: s.triggeringEvidence || "",
            direction: s.direction === "positive" ? "positive" : "negative",
            strength: ["High", "Medium", "Low"].includes(s.strength) ? s.strength : "Medium",
            confidence: ["Confirmed", "Probable", "Speculative"].includes(s.confidence) ? s.confidence : "Probable",
            whyItMatters: s.whyItMatters || "",
            affectedSegment: s.affectedSegment || "",
          }))
        : [],
      barrierSummary: parsed.barrierSummary || "",
    };

    return res.json(result);
  } catch (err: any) {
    console.error("BAOS agent error:", err);
    return res.status(500).json({ error: err.message || "BAOS agent failed" });
  }
});

export default router;
