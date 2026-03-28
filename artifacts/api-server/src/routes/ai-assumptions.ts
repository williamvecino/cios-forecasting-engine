import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface AssumptionExtractionRequest {
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
  existing_assumptions?: Assumption[] | null;
}

interface Assumption {
  id: string;
  text: string;
  category: string;
  source_step: string;
  status: "active" | "challenged" | "invalidated";
  confidence: "high" | "moderate" | "low";
  linked_gates: string[];
  version: number;
  created_at: string;
  updated_at: string;
  invalidation_reason?: string;
}

router.post("/ai-assumptions/extract", async (req, res) => {
  try {
    const body = req.body as AssumptionExtractionRequest;

    if (!body.subject || !body.questionText) {
      res.status(400).json({ error: "subject and questionText are required" });
      return;
    }

    const caseContext = buildCaseContext(body);
    const existingContext = body.existing_assumptions?.length
      ? `\nEXISTING ASSUMPTIONS (update status if evidence has changed):\n${body.existing_assumptions.map(a => `- [${a.id}] [${a.status}] [${a.category}] ${a.text}`).join("\n")}`
      : "";

    const systemPrompt = `You are a strategic assumption auditor. Your job is to surface what must be true for a decision to hold.

You extract assumptions from forecasts, constraints, signals, and recommendations. These are NOT opinions — they are testable premises that the analysis depends on.

CATEGORIES (use exactly these):
- "Clinical" — assumptions about efficacy, safety, trial outcomes, real-world evidence
- "Regulatory" — assumptions about approval, guideline inclusion, label scope
- "Market Access" — assumptions about payer coverage, reimbursement, formulary position
- "Competitive" — assumptions about competitor behavior, market share, timing
- "Behavioral" — assumptions about HCP/patient adoption patterns, decision-making
- "Operational" — assumptions about infrastructure, workflow, implementation capacity

RULES:
- Extract 6-15 assumptions depending on case complexity
- Each assumption must be a clear, testable statement that starts with a premise (e.g., "Payer coverage will be secured within 6 months")
- Never use: "Bayesian", "posterior", "Brier", "likelihood ratio", "prior odds"
- Link each assumption to the gate(s) it depends on (use gate labels from context, or empty array if no direct gate link)
- Assign confidence based on how much evidence supports this assumption: high = strong signal support, moderate = some evidence, low = inferred with minimal evidence
- source_step should be the earliest step where this assumption originates: "forecast", "decide", or "respond"
- If existing assumptions are provided, preserve their IDs. Update status to "challenged" if new evidence weakens them, or "invalidated" if contradicted. Add new ones as needed.
${existingContext}

OUTPUT FORMAT — return valid JSON:
{
  "assumptions": [
    {
      "id": "asmp_<short_slug>",
      "text": "Clear testable assumption statement",
      "category": "Clinical | Regulatory | Market Access | Competitive | Behavioral | Operational",
      "source_step": "forecast | decide | respond",
      "status": "active | challenged | invalidated",
      "confidence": "high | moderate | low",
      "linked_gates": ["gate label 1", "gate label 2"],
      "invalidation_reason": "Only if challenged or invalidated — what changed"
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

Surface what must be true for this analysis to hold. Be specific to this case — do not generate generic assumptions.`;

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
    const now = new Date().toISOString();

    const VALID_CATEGORIES = ["Clinical", "Regulatory", "Market Access", "Competitive", "Behavioral", "Operational"];
    const VALID_STATUSES = ["active", "challenged", "invalidated"];
    const VALID_CONFIDENCE = ["high", "moderate", "low"];
    const VALID_STEPS = ["forecast", "decide", "respond"];

    const assumptions: Assumption[] = (parsed.assumptions || [])
      .filter((a: any) => a.text && typeof a.text === "string" && a.text.trim().length > 0)
      .map((a: any) => {
        const existing = body.existing_assumptions?.find(e => e.id === a.id);
        return {
          id: a.id || `asmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          text: a.text.trim(),
          category: VALID_CATEGORIES.includes(a.category) ? a.category : "Operational",
          source_step: VALID_STEPS.includes(a.source_step) ? a.source_step : "forecast",
          status: VALID_STATUSES.includes(a.status) ? a.status : "active",
          confidence: VALID_CONFIDENCE.includes(a.confidence) ? a.confidence : "moderate",
          linked_gates: Array.isArray(a.linked_gates) ? a.linked_gates : [],
          version: existing ? existing.version + 1 : 1,
          created_at: existing?.created_at || now,
          updated_at: now,
          invalidation_reason: a.invalidation_reason || undefined,
        };
      })
      .slice(0, 20);

    res.json({ assumptions });
  } catch (err: any) {
    console.error("[ai-assumptions] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to extract assumptions" });
  }
});

function buildCaseContext(body: AssumptionExtractionRequest): string {
  const parts: string[] = [];

  if (body.gates?.length) {
    parts.push("EVENT GATES:");
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
      parts.push("\nREQUIRED ACTIONS:");
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
