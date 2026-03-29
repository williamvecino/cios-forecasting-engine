import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface MiosInput {
  brand: string;
  question: string;
  therapeuticArea?: string;
  indication?: string;
  context?: string;
}

interface MiosEvidenceSignal {
  beliefShift: string;
  evidenceText: string;
  trialOrSource: string;
  direction: "positive" | "negative";
  strength: "High" | "Medium" | "Low";
  confidence: "Confirmed" | "Probable" | "Speculative";
  whyItMatters: string;
  relevanceToQuestion: string;
}

interface MiosOutput {
  brand: string;
  beliefShiftsIdentified: string[];
  evidenceSignals: MiosEvidenceSignal[];
  searchSummary: string;
}

router.post("/agents/mios", async (req, res) => {
  const input: MiosInput = req.body;

  if (!input.brand || !input.question) {
    return res.status(400).json({ error: "brand and question are required" });
  }

  const systemPrompt = `You are MIOS — the Medical Intelligence & Outcome System.

Your single job: find brand-specific clinical evidence for ${input.brand} that is relevant to the forecasting question.

═══ SCOPE CONSTRAINT (MANDATORY) ═══
You operate ONLY within the scope of ${input.brand}.
You must NOT generate, retrieve, or infer signals from brands, drugs, or programs outside ${input.brand}.
Any reference to Entresto, Repatha, Ofev, Keytruda, Humira, or ANY non-active-brand name is a SCOPE VIOLATION and must be rejected — unless ${input.brand} IS that brand.
The ONLY brand you may produce evidence for is ${input.brand}. All other brand names are out of scope.
═══ END SCOPE CONSTRAINT ═══

WORKFLOW:
1. Identify the BELIEF SHIFTS needed for ${input.brand} adoption — what must physicians come to believe for this product to succeed?
2. Search for clinical evidence that supports or undermines each belief shift. Think like a PubMed search: find specific trial results, FDA regulatory actions, safety data, real-world evidence.
3. Filter: only keep evidence that is directly relevant to the question being asked about ${input.brand}.

SCOPE BOUNDARY — what you must NOT do:
- Do NOT generate cognitive barriers or behavioral objections. That is BAOS's job.
- Do NOT estimate probabilities or forecast outcomes. That is the forecast engine's job.
- Do NOT generate external market signals, competitor intelligence, or payer data. That is External Signal Scout's job.
- Do NOT identify stakeholders or market actors. That is the Actor Segmentation agent's job.
- Do NOT recommend strategic actions. That is the Prioritization agent's job.
- You only find CLINICAL EVIDENCE for ${input.brand}. Nothing else.

EVIDENCE REQUIREMENTS:
- Every evidence signal MUST cite a specific source: trial name + journal/year, FDA action + date, or real-world data source
- Evidence must be about ${input.brand} specifically, not about the drug class generally
- Direction must reflect whether the evidence supports or opposes adoption of ${input.brand}
- Filter ruthlessly: only include evidence relevant to the specific question

OUTPUT FORMAT (JSON):
{
  "brand": "${input.brand}",
  "beliefShiftsIdentified": ["string — what physicians need to believe"],
  "evidenceSignals": [
    {
      "beliefShift": "which belief shift this evidence relates to",
      "evidenceText": "specific clinical finding with numbers/endpoints",
      "trialOrSource": "Trial Name, Author JOURNAL Year;Vol:Pages OR FDA Action Date",
      "direction": "positive" | "negative",
      "strength": "High" | "Medium" | "Low",
      "confidence": "Confirmed" | "Probable" | "Speculative",
      "whyItMatters": "why this evidence matters for adoption",
      "relevanceToQuestion": "how this connects to the specific question"
    }
  ],
  "searchSummary": "brief summary of evidence landscape"
}`;

  const userPrompt = `Brand: ${input.brand}
Question: ${input.question}
${input.therapeuticArea ? `Therapeutic Area: ${input.therapeuticArea}` : ""}
${input.indication ? `Indication: ${input.indication}` : ""}
${input.context ? `Additional Context: ${input.context}` : ""}

Find all relevant clinical evidence for ${input.brand} that bears on this question. Identify the belief shifts first, then find evidence for each.`;

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

    const result: MiosOutput = {
      brand: input.brand,
      beliefShiftsIdentified: Array.isArray(parsed.beliefShiftsIdentified) ? parsed.beliefShiftsIdentified : [],
      evidenceSignals: Array.isArray(parsed.evidenceSignals)
        ? parsed.evidenceSignals.map((s: any) => ({
            beliefShift: s.beliefShift || "",
            evidenceText: s.evidenceText || "",
            trialOrSource: s.trialOrSource || "",
            direction: s.direction === "negative" ? "negative" : "positive",
            strength: ["High", "Medium", "Low"].includes(s.strength) ? s.strength : "Medium",
            confidence: ["Confirmed", "Probable", "Speculative"].includes(s.confidence) ? s.confidence : "Probable",
            whyItMatters: s.whyItMatters || "",
            relevanceToQuestion: s.relevanceToQuestion || "",
          }))
        : [],
      searchSummary: parsed.searchSummary || "",
    };

    return res.json(result);
  } catch (err: any) {
    console.error("MIOS agent error:", err);
    return res.status(500).json({ error: err.message || "MIOS agent failed" });
  }
});

export default router;
