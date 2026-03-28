import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { researchBrand } from "../lib/web-research";
import { deriveDecisions, type ForecastGate, type DerivedDecisions, type DecisionItem } from "../lib/decision-derivation";
import { validateDecisionIntegrity, type IntegrityReport } from "../lib/decision-integrity-validator";
import { assignArchetypesForSegmentation } from "../lib/archetype-assignment";

const router = Router();

interface DecideRequest {
  subject: string;
  outcome?: string;
  questionType?: string;
  questionText: string;
  timeHorizon?: string;
  entities?: string[];
  therapeuticArea?: string;
  forecastGates?: ForecastGate[];
  brandOutlookProbability?: number;
  constrainedProbability?: number;
}

router.post("/ai-decide/generate", async (req, res) => {
  try {
    const body = req.body as DecideRequest;

    if (!body.subject || !body.questionText) {
      res.status(400).json({ error: "subject and questionText are required" });
      return;
    }

    const area = body.therapeuticArea || "general";
    const gates = (body.forecastGates || []) as ForecastGate[];
    const hasGates = gates.length > 0;

    let derived: DerivedDecisions | null = null;
    let integrity: IntegrityReport | null = null;

    if (hasGates) {
      derived = deriveDecisions(gates, body.brandOutlookProbability ?? null, body.constrainedProbability ?? null);
      integrity = validateDecisionIntegrity(derived, gates, body.brandOutlookProbability ?? null, body.constrainedProbability ?? null);
    }

    const research = await researchBrand(body.subject, body.questionText);
    const hasResearch = research.combinedContext.length > 0;

    let contextPrompt = "";
    if (hasGates && derived) {
      const barrierSummary = derived.barriers.map(b =>
        `- ${b.title} (severity: ${b.severity_or_priority}, gate: ${b.source_gate_label} [${b.source_gate_status}])`
      ).join("\n");
      const actionSummary = derived.actions.map(a =>
        `- ${a.title} (priority: ${a.severity_or_priority}, gate: ${a.source_gate_label} [${a.source_gate_status}])`
      ).join("\n");
      const segmentSummary = derived.segments.map(s =>
        `- ${s.title}: ${s.rationale}`
      ).join("\n");

      contextPrompt = `
--- FORECAST-DERIVED DECISION FRAMEWORK ---
The following barriers, actions, and segments were deterministically derived from the forecast gates.
Your job is to ADD CONTEXTUAL DETAIL to these items — not to invent new ones or override the structure.

DERIVED BARRIERS:
${barrierSummary || "(none — all gates are strong)"}

DERIVED ACTIONS:
${actionSummary || "(none required)"}

DERIVED SEGMENTS:
${segmentSummary}

Brand Outlook: ${body.brandOutlookProbability != null ? Math.round(body.brandOutlookProbability * 100) + "%" : "unknown"}
Constrained Forecast: ${body.constrainedProbability != null ? Math.round(body.constrainedProbability * 100) + "%" : "unknown"}
--- END FRAMEWORK ---

For each barrier, provide a specific "detail" field explaining WHY this barrier matters for this specific product/market (1-2 sentences, grounded in the product context).
For adoption_segmentation, name real prescriber/provider types specific to this product.
For competitive_risk, readiness_timeline, and growth_feasibility, ground assessments in the gate profile and product context.
`;
    }

    const systemPrompt = `You are a pharmaceutical commercial strategy analyst. Generate contextual detail for a structured decision analysis.

CRITICAL: Each case is unique. Evaluate this specific product on its own merits.

${hasResearch ? "REAL-TIME WEB RESEARCH is included below. Ground your analysis in these findings." : "No recent web research was found. Rely on your training knowledge."}

${hasGates ? `IMPORTANT: A decision framework has been derived from the forecast gates. You must ADD DETAIL to this framework, not replace it. Do not invent barriers or actions that are not in the framework.` : "No forecast gates available. Generate a standalone analysis."}

Return ONLY valid JSON with this structure:

{
  "barrier_details": {
    "<gate_id>": "1-2 sentence contextual explanation of why this barrier matters for this product"
  },
  "adoption_segmentation": {
    "early_adopters": { "segments": ["real segment type 1"], "reason": "Why" },
    "persuadables": { "segments": ["segment"], "reason": "Why" },
    "late_movers": { "segments": ["segment"], "reason": "Why" },
    "resistant": { "segments": ["segment"], "reason": "Why" }
  },
  "readiness_timeline": {
    "near_term_readiness": "Low|Moderate|High",
    "trigger_events": ["event 1", "event 2"],
    "dependencies": ["dependency 1"],
    "timing_risks": ["risk 1"]
  },
  "competitive_risk": {
    "incumbent_defense": "What existing alternatives will do",
    "fast_follower_risk": "Low|Moderate|High",
    "evidence_response": "How competitors may counter",
    "access_response": "Competitive payer actions"
  },
  "growth_feasibility": {
    "segment_size": "Small|Medium|Large",
    "access_expansion": "Coverage growth potential",
    "operational_scalability": "Low|Moderate|High",
    "revenue_translation": "Low|Moderate|High"
  }
}

Name real segment types specific to this product (e.g. "Pulmonologists at academic centers", "Community oncologists").`;

    let researchSection = "";
    if (hasResearch) {
      researchSection = `\n\n--- REAL-TIME WEB RESEARCH ---\n${research.combinedContext}\n--- END RESEARCH ---`;
    }

    const userPrompt = `Generate contextual analysis for:

**Brand/Subject**: ${body.subject}
**Question**: ${body.questionText}
**Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Therapeutic Context**: ${area}
${body.entities?.length ? `**Groups**: ${body.entities.join(", ")}` : ""}${researchSection}${contextPrompt}`;

    let aiContext: any = {};
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        aiContext = JSON.parse(content);
      }
    } catch (aiErr: any) {
      console.error("AI contextual enrichment failed (returning derived decisions without AI detail):", aiErr.message);
      if (!hasGates || !derived) {
        res.status(500).json({ error: "AI analysis failed and no forecast gates available for derivation" });
        return;
      }
    }

    if (hasGates && derived && integrity) {
      const barrierDetails = aiContext.barrier_details || {};
      for (const barrier of derived.barriers) {
        if (barrierDetails[barrier.source_gate_id]) {
          barrier.rationale = barrierDetails[barrier.source_gate_id];
        }
      }
      for (const action of derived.actions) {
        if (barrierDetails[action.source_gate_id]) {
          action.rationale = `${action.rationale} ${barrierDetails[action.source_gate_id]}`;
        }
      }

      let archetypeAssignments = null;
      try {
        const seg = aiContext.adoption_segmentation;
        if (seg) {
          const gateInfos = gates.map(g => ({ gate_label: g.gate_label, status: g.status, reasoning: g.reasoning }));
          archetypeAssignments = assignArchetypesForSegmentation(seg, gateInfos);
        }
      } catch (arcErr: any) {
        console.error("[ai-decide] Archetype assignment failed (non-blocking):", arcErr.message);
      }

      res.json({
        mode: "forecast_derived",
        derived_decisions: derived,
        integrity: integrity,
        adoption_segmentation: aiContext.adoption_segmentation || null,
        archetype_assignments: archetypeAssignments,
        readiness_timeline: aiContext.readiness_timeline || null,
        competitive_risk: aiContext.competitive_risk || null,
        growth_feasibility: aiContext.growth_feasibility || null,
        forecast_context: {
          brand_outlook: body.brandOutlookProbability,
          constrained_probability: body.constrainedProbability,
          gate_count: gates.length,
          weak_gate_count: gates.filter(g => g.status === "weak" || g.status === "unresolved").length,
        },
      });
    } else {
      let archetypeAssignments = null;
      try {
        const seg = aiContext.adoption_segmentation;
        if (seg) {
          archetypeAssignments = assignArchetypesForSegmentation(seg, []);
        }
      } catch (arcErr: any) {
        console.error("[ai-decide] Archetype assignment failed (non-blocking):", arcErr.message);
      }

      res.json({
        mode: "standalone",
        derived_decisions: null,
        integrity: null,
        adoption_segmentation: aiContext.adoption_segmentation || null,
        archetype_assignments: archetypeAssignments,
        readiness_timeline: aiContext.readiness_timeline || null,
        competitive_risk: aiContext.competitive_risk || null,
        growth_feasibility: aiContext.growth_feasibility || null,
        barrier_details: aiContext.barrier_details || null,
        forecast_context: null,
      });
    }
  } catch (err: any) {
    console.error("AI decide generation error:", err);
    res.status(500).json({ error: "Failed to generate decision analysis" });
  }
});

export default router;
