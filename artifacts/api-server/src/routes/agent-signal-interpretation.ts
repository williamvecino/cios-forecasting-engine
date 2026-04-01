import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { signalInterpretationsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

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
  caseId: string;
  classificationId?: string;
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

    if (!body.caseId) {
      res.status(400).json({ error: "caseId is required" });
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

8. rootEvidenceId: If this fact references or derives from an identifiable trial, study, regulatory filing, or data source, provide a short identifier (e.g., "NCT03003780", "ADAURA", "EMA/CHMP/2024"). Otherwise null.

9. confidence: "high" | "moderate" | "low"
   - How confident you are in the interpretation above.

10. recommendedSignal: true | false
    - true ONLY if ALL of these conditions are met:
      a) decisionRelevance is "direct" or "indirect"
      b) impactEstimate is "high" or "moderate"
      c) independenceClassification is "independent" or "partially_dependent"
      d) direction is NOT "ambiguous" (unless impact is high)
      e) causalPathway is NOT null (unclear causal pathway = not recommended)
    - false for all other facts.

11. recommendationReason: string
    - If recommendedSignal is true, explain in one sentence why this fact qualifies as a signal.
    - If recommendedSignal is false, explain in one sentence why this fact was rejected.

12. suggestedSignalType: One of: "Phase III clinical", "Guideline inclusion", "KOL endorsement", "Field intelligence", "Operational friction", "Competitor counteraction", "Access / commercial", "Regulatory / clinical", "Access friction", "Experience infrastructure", "Payer / coverage", "Market adoption / utilization", "Capacity / infrastructure", "Competitor countermove", "Safety / tolerability", "Guideline consensus", "Epidemiology / population", "Prescriber behavior", "Access / reimbursement", "Real-world evidence"
    - The most appropriate signal category if this fact were to become a signal.

13. suggestedStrength: integer 1-5
    - 5 = definitive evidence, 4 = strong evidence, 3 = moderate evidence, 2 = weak evidence, 1 = anecdotal

14. suggestedReliability: integer 1-5
    - 5 = peer-reviewed/regulatory, 4 = established source, 3 = credible report, 2 = unverified, 1 = rumor/speculation

15. signalFamily: One of: "Clinical Efficacy", "Safety / Tolerability", "Regulatory Status", "Manufacturing / Readiness", "Access / Payer", "Guideline / KOL", "Field Adoption Behavior", "Competitive Moves", "Operational Execution", "Message / Perception"
    - The primary evidence family this fact belongs to. Must be one of the fixed values above.

16. lineageType: One of: "Root", "Direct Derivative", "Second-Order Derivative", "Duplicate", "Independent Parallel Evidence", "Unclear"
    - "Root": This is an original primary source (trial result, regulatory filing, etc.)
    - "Direct Derivative": Directly derived from a root event (e.g., press release about trial results)
    - "Second-Order Derivative": Derived from a derivative (e.g., KOL commentary about press release about trial)
    - "Duplicate": Restates information already in another fact with no new content
    - "Independent Parallel Evidence": Unrelated source providing genuinely separate evidence
    - "Unclear": Lineage cannot be determined

17. sourceCluster: One of: "Trial Result", "Press Release", "Congress Presentation", "KOL Commentary", "Payer Action", "Regulatory Filing", "Company Guidance", "Field Intelligence", "Media / Trade Press"
    - The category of the original source for this fact.

18. noveltyFlag: true | false
    - true = this fact provides materially new information not captured by other facts in this set
    - false = this fact does not add materially new information (restatement, echo, or derivative)

═══ INTERPRETATION RULES ═══
- Be conservative. Most facts should NOT become signals. Over-signaling leads to noisy forecasts.
- A fact is NOT a signal if it merely restates the question or decision.
- A fact is NOT a signal if it describes a general market condition without specific directional impact.
- Two facts sharing the same underlying cause should be flagged as dependent. Only the more informative one should be recommended.
- Facts about vendor/agency capabilities are NOT signals for the underlying business decision (unless the decision IS about vendor selection).
- Duplicates or derived echoes of the same information must NOT both be recommended. Flag the echo as "redundant" or "dependent".
- If relevance is "tangential" or "irrelevant", recommendedSignal MUST be false.
- If causalPathway is null or unclear, recommendedSignal MUST be false.

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
      "rootEvidenceId": "string or null",
      "confidence": "high|moderate|low",
      "recommendedSignal": true,
      "recommendationReason": "string",
      "suggestedSignalType": "Phase III clinical",
      "suggestedStrength": 3,
      "suggestedReliability": 3,
      "signalFamily": "Clinical Efficacy",
      "lineageType": "Root",
      "sourceCluster": "Trial Result",
      "noveltyFlag": true
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

    const INTERPRETATION_TIMEOUT_MS = 45_000;
    let response: any;
    try {
      response = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: factsBlock },
          ],
          temperature: 0,
          seed: 42,
          max_tokens: 6000,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Interpretation timed out")), INTERPRETATION_TIMEOUT_MS)
        ),
      ]);
    } catch (aiErr: any) {
      console.error("[agent:signal-interpretation] AI call failed or timed out:", aiErr?.message || aiErr);
      res.json({
        batchId: `SI-${Date.now()}`,
        interpretations: [],
        summary: { totalFacts: body.facts.length, recommendedCount: 0, rejectedCount: body.facts.length, independentCount: 0, dependentCount: 0 },
        decisionContext: body.decisionContext,
        skipped: true,
        skipReason: aiErr?.message || "Interpretation unavailable",
      });
      return;
    }

    const content = response.choices[0]?.message?.content || "";

    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[agent:signal-interpretation] JSON parse failed:", parseErr);
      res.json({
        batchId: `SI-${Date.now()}`,
        interpretations: [],
        summary: { totalFacts: body.facts.length, recommendedCount: 0, rejectedCount: body.facts.length, independentCount: 0, dependentCount: 0 },
        decisionContext: body.decisionContext,
        skipped: true,
        skipReason: "Failed to parse interpretation output",
      });
      return;
    }

    const validRelevance = ["direct", "indirect", "tangential", "irrelevant"];
    const validDirection = ["positive", "negative", "neutral", "ambiguous"];
    const validImpact = ["high", "moderate", "low", "negligible"];
    const validIndependence = ["independent", "partially_dependent", "dependent", "redundant"];
    const validConfidence = ["high", "moderate", "low"];
    const validSignalTypes = ["Phase III clinical", "Guideline inclusion", "KOL endorsement", "Field intelligence", "Operational friction", "Competitor counteraction", "Access / commercial", "Regulatory / clinical", "Access friction", "Experience infrastructure", "Payer / coverage", "Market adoption / utilization", "Capacity / infrastructure", "Competitor countermove", "Safety / tolerability", "Guideline consensus", "Epidemiology / population", "Prescriber behavior", "Access / reimbursement", "Real-world evidence"];
    const validSignalFamilies = ["Clinical Efficacy", "Safety / Tolerability", "Regulatory Status", "Manufacturing / Readiness", "Access / Payer", "Guideline / KOL", "Field Adoption Behavior", "Competitive Moves", "Operational Execution", "Message / Perception"];
    const validLineageTypes = ["Root", "Direct Derivative", "Second-Order Derivative", "Duplicate", "Independent Parallel Evidence", "Unclear"];
    const validSourceClusters = ["Trial Result", "Press Release", "Congress Presentation", "KOL Commentary", "Payer Action", "Regulatory Filing", "Company Guidance", "Field Intelligence", "Media / Trade Press"];

    const batchId = `SI-${Date.now()}`;

    const interpretations = Array.isArray(parsed.interpretations)
      ? parsed.interpretations.map((interp: any, i: number) => {
          const relevance = validRelevance.includes(interp.decisionRelevance) ? interp.decisionRelevance : "tangential";
          const pathway = interp.causalPathway || null;
          const impact = validImpact.includes(interp.impactEstimate) ? interp.impactEstimate : "low";
          const independence = validIndependence.includes(interp.independenceClassification) ? interp.independenceClassification : "independent";
          const direction = validDirection.includes(interp.direction) ? interp.direction : "neutral";
          const confidence = validConfidence.includes(interp.confidence) ? interp.confidence : "moderate";

          let recommended = !!interp.recommendedSignal;
          if (["tangential", "irrelevant"].includes(relevance)) recommended = false;
          if (!pathway) recommended = false;
          if (["dependent", "redundant"].includes(independence)) recommended = false;

          return {
            interpretationId: `${batchId}-${interp.factIndex || i + 1}`,
            factIndex: interp.factIndex || i + 1,
            factText: interp.factText || body.facts[i]?.text || "",
            factSource: body.facts[i]?.source || null,
            factCategory: body.facts[i]?.category || null,
            decisionRelevance: relevance,
            causalPathway: pathway,
            direction,
            impactEstimate: impact,
            independenceClassification: independence,
            dependsOn: typeof interp.dependsOn === "number" ? interp.dependsOn : null,
            rootEvidenceId: interp.rootEvidenceId || null,
            confidence,
            recommendedSignal: recommended,
            recommendationReason: interp.recommendationReason || (recommended ? "Meets all signal criteria" : "Does not meet signal criteria"),
            rejectionReason: !recommended ? (interp.recommendationReason || interp.rejectionReason || "Does not meet signal criteria") : null,
            suggestedSignalType: validSignalTypes.includes(interp.suggestedSignalType) ? interp.suggestedSignalType : "Field intelligence",
            suggestedStrength: Math.max(1, Math.min(5, Math.round(Number(interp.suggestedStrength) || 3))),
            suggestedReliability: Math.max(1, Math.min(5, Math.round(Number(interp.suggestedReliability) || 3))),
            signalFamily: validSignalFamilies.includes(interp.signalFamily) ? interp.signalFamily : "Operational Execution",
            lineageType: validLineageTypes.includes(interp.lineageType) ? interp.lineageType : "Unclear",
            sourceCluster: validSourceClusters.includes(interp.sourceCluster) ? interp.sourceCluster : "Field Intelligence",
            noveltyFlag: typeof interp.noveltyFlag === "boolean" ? interp.noveltyFlag : true,
          };
        })
      : [];

    try {
      const dbRows = interpretations.map((interp: any, idx: number) => ({
        interpretationId: interp.interpretationId,
        caseId: body.caseId,
        classificationId: body.classificationId || null,
        sourceDocumentId: body.facts[idx]?.sourceDocumentId || null,
        sourceSpan: body.facts[idx]?.sourceSpan || null,
        sourceType: body.facts[idx]?.source || null,
        factIndex: interp.factIndex,
        factText: interp.factText,
        factSource: interp.factSource,
        factCategory: interp.factCategory,
        decisionRelevance: interp.decisionRelevance,
        causalPathway: interp.causalPathway,
        direction: interp.direction,
        impactEstimate: interp.impactEstimate,
        independenceClassification: interp.independenceClassification,
        dependsOnFactIndex: interp.dependsOn,
        rootEvidenceId: interp.rootEvidenceId,
        confidence: interp.confidence,
        recommendedSignal: interp.recommendedSignal,
        recommendationReason: interp.recommendationReason,
        rejectionReason: interp.rejectionReason,
        suggestedSignalType: interp.suggestedSignalType,
        suggestedStrength: interp.suggestedStrength,
        suggestedReliability: interp.suggestedReliability,
        signalFamily: interp.signalFamily,
        lineageType: interp.lineageType,
        sourceCluster: interp.sourceCluster,
        noveltyFlag: interp.noveltyFlag,
        decisionContextQuestion: body.decisionContext.questionText,
        decisionContextDomain: body.decisionContext.domain,
        decisionContextArchetype: body.decisionContext.decisionArchetype,
        decisionContextPrimaryDecision: body.decisionContext.primaryDecision,
        status: "pending",
      }));

      if (dbRows.length > 0) {
        await db.insert(signalInterpretationsTable).values(dbRows);
      }
    } catch (dbErr) {
      console.error("[agent:signal-interpretation] DB insert failed (non-blocking):", dbErr);
    }

    const recommended = interpretations.filter((i: any) => i.recommendedSignal);
    const rejected = interpretations.filter((i: any) => !i.recommendedSignal);

    const result = {
      batchId,
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
  } catch (err: any) {
    console.error("[agent:signal-interpretation] Unhandled error (non-blocking):", err?.message || err);
    res.json({
      batchId: `SI-${Date.now()}`,
      interpretations: [],
      summary: { totalFacts: 0, recommendedCount: 0, rejectedCount: 0, independentCount: 0, dependentCount: 0 },
      decisionContext: req.body?.decisionContext || {},
      skipped: true,
      skipReason: err?.message || "Signal interpretation unavailable",
    });
  }
});

router.get("/signal-interpretations/:caseId", async (req, res) => {
  try {
    const { caseId } = req.params;
    const rows = await db
      .select()
      .from(signalInterpretationsTable)
      .where(eq(signalInterpretationsTable.caseId, caseId))
      .orderBy(signalInterpretationsTable.factIndex);

    res.json(rows);
  } catch (err) {
    console.error("[signal-interpretations] GET error:", err);
    res.status(500).json({ error: "Failed to fetch interpretations" });
  }
});

router.patch("/signal-interpretations/:interpretationId", async (req, res) => {
  try {
    const { interpretationId } = req.params;
    const { userOverride, linkedSignalId, status, reviewerStatus } = req.body;

    const validReviewerStatuses = ["Pending", "Accepted", "Rejected"];
    const validStatuses = ["pending", "accepted", "rejected", "skipped"];

    if (reviewerStatus && !validReviewerStatuses.includes(reviewerStatus)) {
      res.status(400).json({ error: `Invalid reviewerStatus. Must be one of: ${validReviewerStatuses.join(", ")}` });
      return;
    }
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
      return;
    }
    if (reviewerStatus === "Accepted" && !linkedSignalId) {
      const existing = await db.select({ linkedSignalId: signalInterpretationsTable.linkedSignalId }).from(signalInterpretationsTable).where(eq(signalInterpretationsTable.interpretationId, interpretationId)).limit(1);
      if (existing.length > 0 && !existing[0].linkedSignalId) {
        res.status(400).json({ error: "Cannot set reviewerStatus to Accepted without a linkedSignalId" });
        return;
      }
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (typeof userOverride === "boolean") updates.userOverride = userOverride;
    if (linkedSignalId) updates.linkedSignalId = linkedSignalId;
    if (status) updates.status = status;
    if (reviewerStatus) updates.reviewerStatus = reviewerStatus;

    const rows = await db
      .update(signalInterpretationsTable)
      .set(updates)
      .where(eq(signalInterpretationsTable.interpretationId, interpretationId))
      .returning({ interpretationId: signalInterpretationsTable.interpretationId });

    if (rows.length === 0) {
      res.status(404).json({ error: "Interpretation not found" });
      return;
    }

    res.json({ updated: true });
  } catch (err) {
    console.error("[signal-interpretations] PATCH error:", err);
    res.status(500).json({ error: "Failed to update interpretation" });
  }
});

export default router;
