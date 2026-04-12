import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { extractIdentifiers, detectRedFlags, verifyIdentifier } from "../lib/evidence-verification.js";

const router = Router();

interface MiosInput {
  brand: string;
  question: string;
  therapeuticArea?: string;
  indication?: string;
  context?: string;
  forecastProbability?: number;
  primaryConstraint?: string;
  topPositiveDriver?: string;
  topNegativeDriver?: string;
  recommendedAction?: string;
  currentBelief?: string;
  desiredBelief?: string;
  evidenceSignals?: Array<{ description: string; pointContribution: number }>;
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
  sourceGrounded: boolean;
  redFlags: string[];
  verificationStatus: "verified" | "invalid" | "unverified" | "flagged";
}

interface MiosOutput {
  brand: string;
  beliefShiftsIdentified: string[];
  evidenceSignals: MiosEvidenceSignal[];
  searchSummary: string;
  verifiedCount: number;
  totalCount: number;
}

router.post("/agents/mios", async (req, res) => {
  const input: MiosInput = req.body;

  if (!input.brand || !input.question) {
    return res.status(400).json({ error: "brand and question are required" });
  }

  const todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const systemPrompt = `You are MIOS — the Medical Intelligence & Outcome System.

Your single job: find brand-specific clinical evidence for ${input.brand} that is relevant to the forecasting question.

Today's date: ${todayStr}

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

═══ TEMPORAL RELEVANCE (MANDATORY) ═══
Today is ${todayStr}. You must evaluate every piece of evidence for temporal relevance.

RECENCY RULES:
1. PRIORITIZE evidence from the last 12 months (since ~${new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "long", year: "numeric" })}). This is the most actionable evidence.
2. Evidence older than 12 months is acceptable ONLY if it is structurally foundational — a pivotal Phase III trial, an FDA approval, a landmark safety finding that still shapes clinical practice.
3. Press releases, conference abstracts, and advisory committee meetings older than 12 months should almost never be cited — they are likely superseded by newer data.
4. All cited dates must be realistic relative to today (${todayStr}). Do not cite future publications.
5. When citing older evidence, explain in whyItMatters why it remains relevant despite its age.
6. AT LEAST 60% of your evidence signals should reference data from the last 12 months.
═══ END TEMPORAL RELEVANCE ═══

EVIDENCE REQUIREMENTS:
- Every evidence signal MUST cite a specific source: trial name + journal/year, FDA action + date, or real-world data source
- All dates in trialOrSource must be realistic relative to today (${todayStr})
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
      "whyItMatters": "Plain-language explanation of WHY this evidence matters for adoption — be specific about what it means practically for prescribers. Example: 'This trial showed 40% fewer hospitalizations, which means payers are more likely to grant formulary access because they can justify the cost savings.'",
      "relevanceToQuestion": "how this connects to the specific question — name the link explicitly"
    }
  ],
  "searchSummary": "brief summary of evidence landscape"
}`;

  const forecastContext = [
    input.forecastProbability != null ? `Forecast probability: ${Math.round(input.forecastProbability * 100)}%` : "",
    input.primaryConstraint ? `Primary adoption barrier identified: ${input.primaryConstraint}` : "",
    input.topPositiveDriver ? `Strongest positive driver: ${input.topPositiveDriver}` : "",
    input.topNegativeDriver ? `Strongest negative driver: ${input.topNegativeDriver}` : "",
    input.currentBelief ? `Current HCP belief to shift: ${input.currentBelief}` : "",
    input.desiredBelief ? `Desired HCP belief: ${input.desiredBelief}` : "",
    input.evidenceSignals?.length
      ? `Top evidence signals from forecast:\n${input.evidenceSignals.map((s, i) => `${i + 1}. ${s.description}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n");

  const userPrompt = `Brand: ${input.brand}
Question: ${input.question}
${input.therapeuticArea ? `Therapeutic Area: ${input.therapeuticArea}` : ""}
${input.indication ? `Indication: ${input.indication}` : ""}
${input.context ? `Additional Context: ${input.context}` : ""}
${forecastContext ? `\n${forecastContext}` : ""}

Find all relevant clinical evidence for ${input.brand} that supports shifting from the current belief to the desired belief. Prioritize evidence that directly addresses the primary barrier identified above.`;

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

    const allSignals: MiosEvidenceSignal[] = Array.isArray(parsed.evidenceSignals)
      ? await Promise.all(parsed.evidenceSignals.map(async (s: any) => {
          const combinedText = `${s.evidenceText || ""} ${s.trialOrSource || ""}`;
          const { identifiers } = extractIdentifiers(combinedText);
          const redFlags = detectRedFlags(combinedText, identifiers.length);

          // Verify any extracted identifiers against registries
          let verificationStatus: "verified" | "invalid" | "unverified" | "flagged" = redFlags.length > 0 ? "flagged" : "unverified";
          for (const id of identifiers) {
            const check = await verifyIdentifier(id.type, id.value);
            if (check.outcome === "valid") { verificationStatus = "verified"; break; }
            if (check.outcome === "invalid") { verificationStatus = "invalid"; break; }
          }

          return {
            beliefShift: s.beliefShift || "",
            evidenceText: s.evidenceText || "",
            trialOrSource: s.trialOrSource || "",
            direction: s.direction === "negative" ? "negative" : "positive",
            strength: ["High", "Medium", "Low"].includes(s.strength) ? s.strength : "Medium",
            confidence: ["Confirmed", "Probable", "Speculative"].includes(s.confidence) ? s.confidence : "Probable",
            whyItMatters: s.whyItMatters || "",
            relevanceToQuestion: s.relevanceToQuestion || "",
            sourceGrounded: identifiers.length > 0,
            redFlags,
            verificationStatus,
          };
        }))
      : [];

    const totalCount = allSignals.length;

    // Filter: keep only signals that are verified, or unverified with a grounded source.
    // Remove signals that are invalid or flagged without a grounded source (likely fabricated).
    const evidenceSignals = allSignals.filter(s => {
      if (s.verificationStatus === "verified") return true;
      if (s.verificationStatus === "unverified" && s.sourceGrounded) return true;
      return false;
    });

    const verifiedCount = evidenceSignals.filter(s => s.verificationStatus === "verified").length;

    const result: MiosOutput = {
      brand: input.brand,
      beliefShiftsIdentified: Array.isArray(parsed.beliefShiftsIdentified) ? parsed.beliefShiftsIdentified : [],
      evidenceSignals,
      searchSummary: parsed.searchSummary || "",
      verifiedCount,
      totalCount,
    };

    return res.json(result);
  } catch (err: any) {
    console.error("MIOS agent error:", err);
    return res.status(500).json({ error: err.message || "MIOS agent failed" });
  }
});

export default router;
