import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { assumptionRegistryTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getProfileForQuestion, buildVocabularyConstraintPrompt, buildDecisionLayerPrompt, buildDriverConstraintPrompt } from "../lib/case-type-router.js";

const router = Router();

const VALID_CATEGORIES = ["regulatory", "payer", "supply", "workflow", "clinical", "competitive", "operational", "timeline"] as const;
const VALID_STATUSES = ["active", "validated", "invalidated", "unknown"] as const;
const VALID_CONFIDENCE = ["high", "moderate", "low"] as const;
const VALID_SOURCE_TYPES = ["signal", "inference", "external_data", "user_input", "historical_pattern"] as const;
const VALID_IMPACT = ["high", "moderate", "low"] as const;

type Category = typeof VALID_CATEGORIES[number];
type Status = typeof VALID_STATUSES[number];
type Confidence = typeof VALID_CONFIDENCE[number];
type SourceType = typeof VALID_SOURCE_TYPES[number];
type Impact = typeof VALID_IMPACT[number];

interface AssumptionExtractionRequest {
  caseId: string;
  subject: string;
  questionText: string;
  outcome?: string;
  timeHorizon?: string;
  probability?: number | null;
  constrainedProbability?: number | null;
  gates?: { gate_label: string; status: string; constrains_probability_to: number; reasoning: string }[];
  signals?: { text: string; direction: string; importance: string; confidence?: string }[];
  derived_decisions?: {
    barriers?: { title: string; rationale: string; severity_or_priority: string }[];
    actions?: { title: string; rationale: string; severity_or_priority: string }[];
    trigger_events?: { title: string; rationale: string }[];
  } | null;
  adoption_segmentation?: Record<string, any> | null;
  respond_result?: {
    strategic_recommendation?: string;
    why_this_matters?: string;
    priority_actions?: string[];
    execution_focus?: string;
  } | null;
}

function generateId(): string {
  return `A-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

router.get("/assumptions/:caseId", async (req, res) => {
  try {
    const { caseId } = req.params;
    if (!caseId) {
      res.status(400).json({ error: "caseId is required" });
      return;
    }

    const rows = await db
      .select()
      .from(assumptionRegistryTable)
      .where(eq(assumptionRegistryTable.caseId, caseId));

    res.json({ assumptions: rows });
  } catch (err: any) {
    console.error("[assumptions] GET error:", err?.message || err);
    res.status(500).json({ error: "Failed to fetch assumptions" });
  }
});

router.patch("/assumptions/:assumptionId/status", async (req, res) => {
  try {
    const { assumptionId } = req.params;
    const { status, invalidation_reason } = req.body;

    if (!assumptionId || !status) {
      res.status(400).json({ error: "assumptionId and status are required" });
      return;
    }

    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
      return;
    }

    const existing = await db
      .select()
      .from(assumptionRegistryTable)
      .where(eq(assumptionRegistryTable.assumptionId, assumptionId));

    if (!existing.length) {
      res.status(404).json({ error: "Assumption not found" });
      return;
    }

    const oldStatus = existing[0].assumptionStatus;
    const oldImpact = existing[0].impactLevel;

    await db
      .update(assumptionRegistryTable)
      .set({
        assumptionStatus: status as Status,
        invalidationReason: invalidation_reason || null,
        lastUpdated: new Date(),
      })
      .where(eq(assumptionRegistryTable.assumptionId, assumptionId));

    const recalculationTriggered =
      oldStatus !== status &&
      (oldImpact === "high" || oldImpact === "moderate");

    const updated = await db
      .select()
      .from(assumptionRegistryTable)
      .where(eq(assumptionRegistryTable.assumptionId, assumptionId));

    res.json({
      assumption: updated[0],
      recalculation_triggered: recalculationTriggered,
      previous_status: oldStatus,
    });
  } catch (err: any) {
    console.error("[assumptions] PATCH error:", err?.message || err);
    res.status(500).json({ error: "Failed to update assumption" });
  }
});

router.post("/ai-assumptions/extract", async (req, res) => {
  try {
    const body = req.body as AssumptionExtractionRequest;

    if (!body.subject || !body.questionText || !body.caseId) {
      res.status(400).json({ error: "caseId, subject, and questionText are required" });
      return;
    }

    const existingRows = await db
      .select()
      .from(assumptionRegistryTable)
      .where(eq(assumptionRegistryTable.caseId, body.caseId));

    const caseTypeProfile = getProfileForQuestion(body.questionText);
    const vocabConstraints = buildVocabularyConstraintPrompt(caseTypeProfile);
    const decisionLayerConstraints = buildDecisionLayerPrompt(caseTypeProfile);
    const driverConstraints = buildDriverConstraintPrompt(caseTypeProfile);

    const caseContext = buildCaseContext(body);
    const existingContext = existingRows.length
      ? `\nEXISTING ASSUMPTIONS (preserve IDs, update status if evidence has changed):\n${existingRows.map(a => `- [${a.assumptionId}] [${a.assumptionStatus}] [${a.assumptionCategory}] [impact:${a.impactLevel}] ${a.assumptionStatement}`).join("\n")}`
      : "";

    const systemPrompt = `You are a strategic assumption auditor. Your job is to surface what must be true for a forecast or decision to hold.

You extract assumptions from forecasts, constraints, signals, and recommendations. These are NOT opinions — they are testable conditions that the analysis depends on.

CATEGORIES (use exactly these lowercase values):
- "regulatory" — approval timelines, guideline inclusion, label scope
- "payer" — coverage decisions, reimbursement, formulary position, prior auth
- "supply" — manufacturing readiness, supplier validation, distribution capacity
- "workflow" — clinic staffing, integration readiness, operational capacity
- "clinical" — efficacy expectations, safety profile, trial outcomes, RWE
- "competitive" — competitor behavior, market share shifts, defensive responses
- "operational" — infrastructure, implementation capacity, training readiness
- "timeline" — launch timing, event sequencing, deadline dependencies

SOURCE TYPES (use exactly these):
- "signal" — derived from an observed signal in the evidence
- "inference" — inferred from constraints, gates, or decision logic
- "external_data" — based on external data source or research
- "user_input" — explicitly stated by user input
- "historical_pattern" — derived from similar historical cases

RULES:
- Extract 6-15 assumptions depending on case complexity
- Every primary constraint must generate at least one assumption
- Every recommendation must depend on at least one assumption
- Each assumption must be a clear, testable statement
- Never use: "Bayesian", "posterior", "Brier", "likelihood ratio", "prior odds"
- STRICT DEDUPLICATION: if multiple constraints, barriers, or signals imply the same underlying assumption (e.g., "payer coverage pending" and "coverage unresolved" and "payer decision not final"), you MUST merge them into ONE normalized assumption. Never create multiple assumptions that describe the same condition from different angles. When in doubt, merge.
- Link each assumption to gate labels from context when relevant
- If existing assumptions are provided, preserve their IDs. Update status to "validated" if confirmed, "invalidated" if contradicted. Add new ones as needed.
${vocabConstraints}${decisionLayerConstraints}${driverConstraints}${existingContext}

OUTPUT FORMAT — return valid JSON:
{
  "assumptions": [
    {
      "id": "A-<SHORT>",
      "statement": "Clear testable assumption statement",
      "category": "regulatory|payer|supply|workflow|clinical|competitive|operational|timeline",
      "status": "active|validated|invalidated|unknown",
      "confidence": "high|moderate|low",
      "source_type": "signal|inference|external_data|user_input|historical_pattern",
      "impact": "high|moderate|low",
      "linked_gates": ["gate label 1"],
      "invalidation_reason": "Only if validated or invalidated — what changed"
    }
  ]
}`;

    const userPrompt = `Extract the assumptions underlying this analysis:

SUBJECT: ${body.subject}
QUESTION: ${body.questionText}
OUTCOME: ${body.outcome || "adoption"}
TIME HORIZON: ${body.timeHorizon || "12 months"}
CURRENT PROBABILITY: ${body.constrainedProbability != null ? `${Math.round(body.constrainedProbability * 100)}%` : body.probability != null ? `${Math.round(body.probability * 100)}%` : "Not yet calculated"}

${caseContext}

Surface what must be true for this analysis to hold. Be specific to this case.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 3000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "No response generated" });
      return;
    }

    const parsed = JSON.parse(content);
    const now = new Date();

    const rawAssumptions = (parsed.assumptions || [])
      .filter((a: any) => a.statement && typeof a.statement === "string" && a.statement.trim().length > 0)
      .slice(0, 20);

    const existingIds = new Set(existingRows.map(r => r.assumptionId));
    const statusChanges: { assumptionId: string; oldStatus: string; newStatus: string; impact: string }[] = [];

    for (const a of rawAssumptions) {
      const category = VALID_CATEGORIES.includes(a.category) ? a.category as Category : "operational" as Category;
      const status = VALID_STATUSES.includes(a.status) ? a.status as Status : "active" as Status;
      const confidence = VALID_CONFIDENCE.includes(a.confidence) ? a.confidence as Confidence : "moderate" as Confidence;
      const sourceType = VALID_SOURCE_TYPES.includes(a.source_type) ? a.source_type as SourceType : "inference" as SourceType;
      const impact = VALID_IMPACT.includes(a.impact) ? a.impact as Impact : "moderate" as Impact;
      const linkedGates = JSON.stringify(Array.isArray(a.linked_gates) ? a.linked_gates : []);

      if (existingIds.has(a.id)) {
        const oldRow = existingRows.find(r => r.assumptionId === a.id)!;
        if (oldRow.assumptionStatus !== status) {
          statusChanges.push({
            assumptionId: a.id,
            oldStatus: oldRow.assumptionStatus,
            newStatus: status,
            impact: oldRow.impactLevel,
          });
        }

        await db
          .update(assumptionRegistryTable)
          .set({
            assumptionStatement: a.statement.trim(),
            assumptionCategory: category,
            assumptionStatus: status,
            confidenceLevel: confidence,
            sourceType: sourceType,
            impactLevel: impact,
            linkedGates: linkedGates,
            invalidationReason: a.invalidation_reason || null,
            lastUpdated: now,
          })
          .where(eq(assumptionRegistryTable.assumptionId, a.id));

        existingIds.delete(a.id);
      } else {
        const newId = generateId();
        await db.insert(assumptionRegistryTable).values({
          assumptionId: newId,
          caseId: body.caseId,
          assumptionStatement: a.statement.trim(),
          assumptionCategory: category,
          assumptionStatus: status,
          confidenceLevel: confidence,
          sourceType: sourceType,
          impactLevel: impact,
          owner: "system",
          linkedGates: linkedGates,
          invalidationReason: a.invalidation_reason || null,
        });
      }
    }

    const recalculationTriggered = statusChanges.some(
      sc => sc.impact === "high" || sc.impact === "moderate"
    );

    const finalRows = await db
      .select()
      .from(assumptionRegistryTable)
      .where(eq(assumptionRegistryTable.caseId, body.caseId));

    res.json({
      assumptions: finalRows,
      status_changes: statusChanges,
      recalculation_triggered: recalculationTriggered,
    });
  } catch (err: any) {
    console.error("[ai-assumptions] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to extract assumptions" });
  }
});

router.delete("/assumptions/:caseId", async (req, res) => {
  try {
    const { caseId } = req.params;
    await db
      .delete(assumptionRegistryTable)
      .where(eq(assumptionRegistryTable.caseId, caseId));
    res.json({ deleted: true });
  } catch (err: any) {
    console.error("[assumptions] DELETE error:", err?.message || err);
    res.status(500).json({ error: "Failed to delete assumptions" });
  }
});

function buildCaseContext(body: AssumptionExtractionRequest): string {
  const parts: string[] = [];

  if (body.gates?.length) {
    parts.push("EVENT GATES (primary constraints):");
    body.gates.forEach(g => {
      parts.push(`- [${g.status}] ${g.gate_label} — constrains to ${Math.round(g.constrains_probability_to * 100)}% — ${g.reasoning}`);
    });
  }

  if (body.signals?.length) {
    parts.push("\nACTIVE SIGNALS:");
    body.signals.forEach(s => {
      parts.push(`- [${s.direction}] [${s.importance}] ${s.text}`);
    });
  }

  if (body.derived_decisions) {
    const dd = body.derived_decisions;
    if (dd.barriers?.length) {
      parts.push("\nBARRIERS:");
      dd.barriers.forEach(b => parts.push(`- [${b.severity_or_priority}] ${b.title}: ${b.rationale}`));
    }
    if (dd.actions?.length) {
      parts.push("\nRECOMMENDED ACTIONS:");
      dd.actions.forEach(a => parts.push(`- [${a.severity_or_priority}] ${a.title}: ${a.rationale}`));
    }
    if (dd.trigger_events?.length) {
      parts.push("\nTRIGGER EVENTS:");
      dd.trigger_events.forEach(t => parts.push(`- ${t.title}: ${t.rationale}`));
    }
  }

  if (body.adoption_segmentation) {
    const seg = body.adoption_segmentation;
    const segParts: string[] = [];
    for (const [key, val] of Object.entries(seg)) {
      if (val && typeof val === "object" && "segments" in val) {
        segParts.push(`- ${key}: ${(val as any).segments?.join(", ") || "none"} — ${(val as any).reason || ""}`);
      }
    }
    if (segParts.length) {
      parts.push("\nADOPTION SEGMENTATION:");
      parts.push(...segParts);
    }
  }

  if (body.respond_result) {
    const r = body.respond_result;
    if (r.strategic_recommendation) parts.push(`\nSTRATEGIC RECOMMENDATION: ${r.strategic_recommendation}`);
    if (r.why_this_matters) parts.push(`WHY IT MATTERS: ${r.why_this_matters}`);
    if (r.priority_actions?.length) {
      parts.push("PRIORITY ACTIONS:");
      r.priority_actions.forEach(a => parts.push(`- ${a}`));
    }
    if (r.execution_focus) parts.push(`EXECUTION FOCUS: ${r.execution_focus}`);
  }

  return parts.length > 0 ? parts.join("\n") : "Limited context available — extract assumptions from the question and probability alone.";
}

export default router;
