import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, decisionClassificationsTable } from "@workspace/db";

const router = Router();

const VALID_ARCHETYPES = [
  "launch_strategy",
  "adoption_risk",
  "market_access",
  "competitive_positioning",
  "operational_readiness",
  "resource_allocation",
  "stakeholder_behavior",
  "capability_gap",
  "vendor_selection",
  "portfolio_strategy",
  "evidence_positioning",
] as const;

const VALID_CONFIDENCE = ["high", "moderate", "low"] as const;

router.post("/agents/decision-classification", async (req, res) => {
  try {
    const { sourceText } = req.body as { sourceText?: string };

    if (!sourceText || !sourceText.trim()) {
      res.status(400).json({ error: "sourceText is required" });
      return;
    }

    const text = sourceText.trim();

    const systemPrompt = `You are a Decision Classification Agent for a pharmaceutical intelligence system (CIOS).

Your single job: classify raw unstructured text into a structured decision classification BEFORE any forecast case is created.

SCOPE BOUNDARY — what you must NOT do:
- Do NOT generate signals, evidence, or forecasts.
- Do NOT estimate probabilities.
- Do NOT recommend actions or solutions.
- You only CLASSIFY the decision — you do not analyze or answer it.

═══ INPUT ═══
You receive raw text from RFPs, CI docs, emails, notes, pasted slide decks, strategy memos, or any business document.

═══ CLASSIFICATION OUTPUT ═══
For the input text, produce:

1. domain: The business domain (e.g., "Oncology", "Immunology", "Cardiovascular", "Rare Disease", "CNS", "Vaccines", "Medical Devices", "Gene Therapy").

2. decisionArchetype: One of: launch_strategy, adoption_risk, market_access, competitive_positioning, operational_readiness, resource_allocation, stakeholder_behavior, capability_gap, vendor_selection, portfolio_strategy, evidence_positioning.

3. primaryDecision: The single most important business decision embedded in the text. State it as a clear decision statement.

4. supportingDecisions: Array of 0-3 secondary decisions that support or depend on the primary decision.

5. deferredDecisions: Array of decisions detected in the text that are NOT part of the primary decision thread. These should be routed to a separate queue for later analysis.

6. confidence: "high", "moderate", or "low" — how confident you are in the classification.

7. evidenceSpans: Array of objects, each with:
   - "judgment": which classification field this supports (e.g., "domain", "decisionArchetype", "primaryDecision")
   - "span": the exact quoted text from the source that supports this judgment
   - "reasoning": why this span supports the judgment

8. alternativeArchetype: If another archetype could reasonably apply, name it here with a brief reason. Otherwise null.

9. candidateQuestions: Array of exactly 2-3 ranked candidate forecast questions derived from the primary decision. Each with:
   - "rank": 1, 2, or 3
   - "questionText": A bounded, time-horizoned question answerable with probability
   - "rationale": Why this question captures the decision

═══ VENDOR SELECTION GUARDRAIL (MANDATORY) ═══
Do NOT classify as "vendor_selection" unless the source text EXPLICITLY discusses:
- Choosing between named vendors, agencies, or service providers
- RFP evaluation criteria for vendor comparison
- Procurement or contract selection

If the document is an RFP or procurement document BUT the underlying business problem is about market access, launch strategy, competitive positioning, or any other strategic decision:
→ Classify by the UNDERLYING BUSINESS PROBLEM, not the document wrapper.
→ Set guardrailApplied to true and explain in guardrailReason.

Example: An RFP asking agencies to propose launch strategies should be classified as "launch_strategy", NOT "vendor_selection".

═══ MULTI-DECISION DETECTION (MANDATORY) ═══
If the text contains multiple distinct business decisions:
- Identify the PRIMARY decision (the one with the highest strategic consequence)
- Place related supporting decisions in supportingDecisions
- Place UNRELATED decisions in deferredDecisions
- Every deferred decision must have an evidenceSpan pointing to the source text

═══ LOW CONFIDENCE HANDLING ═══
Set confidence to "low" if ANY of these are true:
- The text is ambiguous about the core business problem
- Multiple archetypes are equally plausible with no clear winner
- Critical context is missing (no therapeutic area, no time frame, no clear decision)
- The text is primarily operational/administrative with no strategic decision

When confidence is "low", include a confidenceRationale explaining what information is missing or ambiguous.

═══ RESPONSE FORMAT ═══
Respond with valid JSON only. No markdown, no explanation outside the JSON.

{
  "domain": "string",
  "decisionArchetype": "string — one of the valid archetypes",
  "primaryDecision": "string — clear decision statement",
  "supportingDecisions": ["string", ...],
  "deferredDecisions": ["string", ...],
  "confidence": "high|moderate|low",
  "confidenceRationale": "string or null",
  "evidenceSpans": [
    {
      "judgment": "string — which field this supports",
      "span": "string — exact quoted text",
      "reasoning": "string"
    }
  ],
  "alternativeArchetype": "string or null",
  "candidateQuestions": [
    {
      "rank": 1,
      "questionText": "string",
      "rationale": "string"
    }
  ],
  "guardrailApplied": false,
  "guardrailReason": "string or null",
  "documentType": "string — e.g., RFP, strategy_memo, CI_report, email, slide_deck, notes, unknown"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0,
      seed: 42,
      max_tokens: 2500,
    });

    const content = response.choices[0]?.message?.content || "";

    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: "Failed to parse classification output" });
      return;
    }

    const archetype = VALID_ARCHETYPES.includes(parsed.decisionArchetype)
      ? parsed.decisionArchetype
      : "operational_readiness";

    const confidence = VALID_CONFIDENCE.includes(parsed.confidence)
      ? parsed.confidence
      : "moderate";

    const classificationId = `DC-${Date.now()}`;

    const result = {
      classificationId,
      domain: parsed.domain || "Unknown",
      decisionArchetype: archetype,
      primaryDecision: parsed.primaryDecision || "",
      supportingDecisions: Array.isArray(parsed.supportingDecisions) ? parsed.supportingDecisions : [],
      deferredDecisions: Array.isArray(parsed.deferredDecisions) ? parsed.deferredDecisions : [],
      confidence,
      confidenceRationale: parsed.confidenceRationale || null,
      evidenceSpans: Array.isArray(parsed.evidenceSpans) ? parsed.evidenceSpans : [],
      alternativeArchetype: parsed.alternativeArchetype || null,
      candidateQuestions: Array.isArray(parsed.candidateQuestions)
        ? parsed.candidateQuestions.slice(0, 3).map((q: any, i: number) => ({
            rank: q.rank || i + 1,
            questionText: q.questionText || "",
            rationale: q.rationale || "",
          }))
        : [],
      guardrailApplied: !!parsed.guardrailApplied,
      guardrailReason: parsed.guardrailReason || null,
      documentType: parsed.documentType || "unknown",
      requiresReview: confidence === "low",
    };

    try {
      await db.insert(decisionClassificationsTable).values({
        classificationId,
        sourceText: text,
        documentType: result.documentType,
        domain: result.domain,
        primaryArchetype: archetype as any,
        alternativeArchetype: result.alternativeArchetype,
        secondaryArchetypes: JSON.stringify(result.supportingDecisions),
        primaryDecision: result.primaryDecision,
        secondaryDecisions: JSON.stringify(result.supportingDecisions),
        deferredDecisions: JSON.stringify(result.deferredDecisions),
        candidateQuestions: JSON.stringify(result.candidateQuestions),
        evidenceSpans: JSON.stringify(result.evidenceSpans),
        confidence: confidence as any,
        confidenceRationale: result.confidenceRationale,
        guardrailApplied: result.guardrailApplied ? "true" : "false",
        guardrailReason: result.guardrailReason,
        status: confidence === "low" ? "requires_review" : "pending_review",
      });
    } catch (dbErr) {
      console.error("[agent:decision-classification] DB insert failed:", dbErr);
      res.status(500).json({ error: "Failed to persist classification audit trail" });
      return;
    }

    res.json({ classification: result });
  } catch (err) {
    console.error("[agent:decision-classification] Error:", err);
    res.status(500).json({ error: "Decision classification failed" });
  }
});

router.get("/decision-classifications/:classificationId", async (req, res) => {
  try {
    const { classificationId } = req.params;
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(decisionClassificationsTable)
      .where(eq(decisionClassificationsTable.classificationId, classificationId));

    if (rows.length === 0) {
      res.status(404).json({ error: "Classification not found" });
      return;
    }

    res.json({ classification: rows[0] });
  } catch (err) {
    console.error("[decision-classification] GET error:", err);
    res.status(500).json({ error: "Failed to retrieve classification" });
  }
});

router.patch("/decision-classifications/:classificationId", async (req, res) => {
  try {
    const { classificationId } = req.params;
    const { status, userConfirmedArchetype, caseId } = req.body;
    const { eq } = await import("drizzle-orm");

    const updates: Record<string, any> = {};
    if (status) updates.status = status;
    if (userConfirmedArchetype) updates.userConfirmedArchetype = userConfirmedArchetype;
    if (caseId) updates.caseId = caseId;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No update fields provided" });
      return;
    }

    const rows = await db
      .update(decisionClassificationsTable)
      .set(updates)
      .where(eq(decisionClassificationsTable.classificationId, classificationId))
      .returning({ classificationId: decisionClassificationsTable.classificationId });

    if (rows.length === 0) {
      res.status(404).json({ error: "Classification not found" });
      return;
    }

    res.json({ updated: true });
  } catch (err) {
    console.error("[decision-classification] PATCH error:", err);
    res.status(500).json({ error: "Failed to update classification" });
  }
});

export default router;
