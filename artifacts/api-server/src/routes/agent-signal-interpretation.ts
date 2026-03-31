import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface FactInput {
  text: string;
  source?: string;
  category?: string;
}

interface InterpretationRequest {
  facts: FactInput[];
  decisionContext: {
    primaryDecision: string;
    domain: string;
    decisionArchetype: string;
    questionText: string;
  };
}

router.post("/agents/signal-interpretation", async (req, res) => {
  try {
    const body = req.body as InterpretationRequest;

    if (!body.facts || !Array.isArray(body.facts) || body.facts.length === 0) {
      res.status(400).json({ error: "facts array is required and must not be empty" });
      return;
    }

    if (!body.decisionContext?.primaryDecision || !body.decisionContext?.questionText) {
      res.status(400).json({ error: "decisionContext with primaryDecision and questionText is required" });
      return;
    }

    const factsBlock = body.facts
      .map((f, i) => `[FACT ${i + 1}] ${f.text}${f.source ? ` (Source: ${f.source})` : ""}${f.category ? ` [Category: ${f.category}]` : ""}`)
      .join("\n");

    const systemPrompt = `You are a Signal Interpretation Agent for a pharmaceutical intelligence system (CIOS).

Your single job: evaluate extracted facts and determine whether each fact should become an active forecast signal.

SCOPE BOUNDARY — what you must NOT do:
- Do NOT compute likelihood ratios, posterior probabilities, or forecast outputs.
- Do NOT recommend actions or strategic decisions.
- Do NOT modify or create the forecast. You only INTERPRET facts into signal candidates.

═══ DECISION CONTEXT ═══
Primary Decision: ${body.decisionContext.primaryDecision}
Decision Domain: ${body.decisionContext.domain || "Unknown"}
Decision Archetype: ${body.decisionContext.decisionArchetype || "Unknown"}
Forecast Question: ${body.decisionContext.questionText}

═══ YOUR TASK ═══
For EACH fact provided, produce an interpretation object with these fields:

1. factIndex: The 1-based index of the input fact.
2. factText: Echo the original fact text.
3. decisionRelevance: "direct" | "indirect" | "tangential" | "irrelevant"
   - "direct": The fact directly addresses the primary decision or its key drivers.
   - "indirect": The fact affects a variable that influences the decision, but through an intermediate step.
   - "tangential": The fact is in the same domain but does not materially affect the decision outcome.
   - "irrelevant": The fact has no bearing on the decision.

4. causalPathway: A brief description of HOW this fact connects to the decision outcome. Must follow the pattern: "Fact → [intermediate mechanism] → [outcome impact]". If irrelevant, set to null.

5. direction: "positive" | "negative" | "neutral" | "ambiguous"
   - "positive": The fact increases the probability of the decision outcome occurring.
   - "negative": The fact decreases the probability.
   - "neutral": The fact provides context but does not shift probability.
   - "ambiguous": The fact could shift probability in either direction depending on unresolved conditions.

6. impactEstimate: "high" | "moderate" | "low" | "negligible"
   - Based on how much the fact would shift a reasonable person's confidence in the outcome.

7. independenceClassification: "independent" | "partially_dependent" | "dependent" | "redundant"
   - "independent": This fact provides unique information not captured by any other fact in the set.
   - "partially_dependent": This fact shares some causal pathway with another fact but adds incremental information.
   - "dependent": This fact's information is largely derived from or caused by another fact.
   - "redundant": This fact restates information already present in another fact.
   If partially_dependent, dependent, or redundant, include "dependsOn" with the factIndex of the related fact.

8. confidence: "high" | "moderate" | "low"
   - How confident you are in the interpretation above.

9. recommendedSignal: true | false
   - true ONLY if ALL of these conditions are met:
     a) decisionRelevance is "direct" or "indirect"
     b) impactEstimate is "high" or "moderate"
     c) independenceClassification is "independent" or "partially_dependent"
     d) direction is NOT "ambiguous" (unless impact is high)
   - false for all other facts.

10. rejectionReason: string | null
    - If recommendedSignal is false, explain why in one sentence.
    - If recommendedSignal is true, set to null.

═══ INTERPRETATION RULES ═══
- Be conservative. Most facts should NOT become signals. Over-signaling leads to noisy forecasts.
- A fact is NOT a signal if it merely restates the question or decision.
- A fact is NOT a signal if it describes a general market condition without specific directional impact.
- Two facts sharing the same underlying cause should be flagged as dependent. Only the more informative one should be recommended.
- Facts about vendor/agency capabilities are NOT signals for the underlying business decision (unless the decision IS about vendor selection).

═══ RESPONSE FORMAT ═══
Respond with valid JSON only. No markdown, no explanation outside the JSON.

{
  "interpretations": [
    {
      "factIndex": 1,
      "factText": "string",
      "decisionRelevance": "direct|indirect|tangential|irrelevant",
      "causalPathway": "string or null",
      "direction": "positive|negative|neutral|ambiguous",
      "impactEstimate": "high|moderate|low|negligible",
      "independenceClassification": "independent|partially_dependent|dependent|redundant",
      "dependsOn": null,
      "confidence": "high|moderate|low",
      "recommendedSignal": true,
      "rejectionReason": null
    }
  ],
  "summary": {
    "totalFacts": 0,
    "recommendedCount": 0,
    "rejectedCount": 0,
    "independentCount": 0,
    "dependentCount": 0
  }
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: factsBlock },
      ],
      temperature: 0,
      seed: 42,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content || "";

    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: "Failed to parse interpretation output" });
      return;
    }

    const validRelevance = ["direct", "indirect", "tangential", "irrelevant"];
    const validDirection = ["positive", "negative", "neutral", "ambiguous"];
    const validImpact = ["high", "moderate", "low", "negligible"];
    const validIndependence = ["independent", "partially_dependent", "dependent", "redundant"];
    const validConfidence = ["high", "moderate", "low"];

    const interpretations = Array.isArray(parsed.interpretations)
      ? parsed.interpretations.map((interp: any, i: number) => ({
          factIndex: interp.factIndex || i + 1,
          factText: interp.factText || body.facts[i]?.text || "",
          decisionRelevance: validRelevance.includes(interp.decisionRelevance) ? interp.decisionRelevance : "tangential",
          causalPathway: interp.causalPathway || null,
          direction: validDirection.includes(interp.direction) ? interp.direction : "neutral",
          impactEstimate: validImpact.includes(interp.impactEstimate) ? interp.impactEstimate : "low",
          independenceClassification: validIndependence.includes(interp.independenceClassification) ? interp.independenceClassification : "independent",
          dependsOn: typeof interp.dependsOn === "number" ? interp.dependsOn : null,
          confidence: validConfidence.includes(interp.confidence) ? interp.confidence : "moderate",
          recommendedSignal: !!interp.recommendedSignal,
          rejectionReason: interp.rejectionReason || null,
        }))
      : [];

    const recommended = interpretations.filter((i: any) => i.recommendedSignal);
    const rejected = interpretations.filter((i: any) => !i.recommendedSignal);

    const result = {
      interpretations,
      summary: {
        totalFacts: interpretations.length,
        recommendedCount: recommended.length,
        rejectedCount: rejected.length,
        independentCount: interpretations.filter((i: any) => i.independenceClassification === "independent").length,
        dependentCount: interpretations.filter((i: any) => ["dependent", "redundant"].includes(i.independenceClassification)).length,
      },
      decisionContext: body.decisionContext,
    };

    res.json(result);
  } catch (err) {
    console.error("[agent:signal-interpretation] Error:", err);
    res.status(500).json({ error: "Signal interpretation failed" });
  }
});

export default router;
