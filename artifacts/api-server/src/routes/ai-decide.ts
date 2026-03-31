import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { researchBrand } from "../lib/web-research";
import { deriveDecisions, type ForecastGate, type DerivedDecisions, type DecisionItem } from "../lib/decision-derivation";
import { validateDecisionIntegrity, type IntegrityReport } from "../lib/decision-integrity-validator";
import { assignArchetypesForSegmentation } from "../lib/archetype-assignment";
import { generateDecisionActions, type DecisionAction } from "../lib/gate-action-library";
import { getProfileForQuestion, buildVocabularyConstraintPrompt, buildSegmentationConstraintPrompt, buildRiskFramingPrompt, buildDecisionLayerPrompt, buildDriverConstraintPrompt, buildSafetySignalPrompt, buildEvidenceGatePrompt, buildOutcomeStatePrompt, buildActionFilterPrompt, buildPropagationPathwayPrompt, buildDecisionSensitivityPrompt } from "../lib/case-type-router.js";

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
        `- ${b.title} (severity: ${b.severity_or_priority}, gate_id: "${b.source_gate_id}", gate_label: ${b.source_gate_label} [${b.source_gate_status}])`
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

For barrier_decomposition, break EACH non-strong gate into 2-5 specific operational drivers using the gate's gate_id as the key. Each driver must be a concrete, observable condition — never repeat the gate label.
For adoption_segmentation, name real prescriber/provider types specific to this product.
For competitive_risk, readiness_timeline, and growth_feasibility, ground assessments in the gate profile and product context.
`;
    }

    const caseTypeProfile = getProfileForQuestion(body.questionText, body.questionType);
    const isRegulatory = caseTypeProfile.caseType === "regulatory_approval";
    const isClinical = caseTypeProfile.caseType === "clinical_outcome";
    const vocabConstraints = buildVocabularyConstraintPrompt(caseTypeProfile);
    const segConstraints = buildSegmentationConstraintPrompt(caseTypeProfile);
    const riskConstraints = buildRiskFramingPrompt(caseTypeProfile);
    const decisionLayerConstraints = buildDecisionLayerPrompt(caseTypeProfile);
    const driverConstraints = buildDriverConstraintPrompt(caseTypeProfile);
    const safetyConstraints = buildSafetySignalPrompt(caseTypeProfile);
    const evidenceGateConstraints = buildEvidenceGatePrompt(caseTypeProfile);
    const outcomeStateConstraints = buildOutcomeStatePrompt(caseTypeProfile);
    const actionFilterConstraints = buildActionFilterPrompt(caseTypeProfile);
    const propagationConstraints = buildPropagationPathwayPrompt(caseTypeProfile);
    const sensitivityConstraints = buildDecisionSensitivityPrompt(caseTypeProfile);

    const impactLabel = isClinical ? "impact_on_endpoint" : isRegulatory ? "impact_on_approval" : "impact_on_adoption";
    const segmentationBlock = isClinical ? `
  "stakeholder_segmentation": {
    "primary_decision_makers": { "actors": ["Trial Investigators"], "reason": "Why" },
    "key_influencers": { "actors": ["Data Safety Monitoring Board"], "reason": "Why" },
    "supporting_actors": { "actors": ["Biostatistics & Data Management"], "reason": "Why" },
    "risk_gatekeepers": { "actors": ["Risk Gatekeepers"], "reason": "Why" },
    "contextual_actors": { "actors": ["Clinical Development Leadership"], "reason": "Why" }
  }` : isRegulatory ? `
  "stakeholder_segmentation": {
    "primary_decision_makers": { "actors": ["FDA Review Division"], "reason": "Why" },
    "key_influencers": { "actors": ["Advisory Committee Members"], "reason": "Why" },
    "supporting_actors": { "actors": ["Sponsor Regulatory Team"], "reason": "Why" },
    "contextual_actors": { "actors": ["Patient Advocacy Groups"], "reason": "Why" }
  }` : `
  "adoption_segmentation": {
    "early_adopters": { "segments": ["real segment type 1"], "reason": "Why" },
    "persuadables": { "segments": ["segment"], "reason": "Why" },
    "late_movers": { "segments": ["segment"], "reason": "Why" },
    "resistant": { "segments": ["segment"], "reason": "Why" }
  }`;

    const competitiveBlock = isClinical ? `
  "clinical_precedent_risk": {
    "class_precedent": "Prior trial success/failure patterns for this mechanism or endpoint",
    "safety_spillover_risk": "Low|Moderate|High",
    "comparator_benchmark": "How trial results may be weighed relative to competitor data",
    "precedent_implications": "What similar past trial outcomes suggest"
  }` : isRegulatory ? `
  "regulatory_precedent_risk": {
    "class_precedent": "Prior approval/rejection patterns for this mechanism or class",
    "safety_spillover_risk": "Low|Moderate|High",
    "comparative_review_tolerance": "How FDA may weigh benefit-risk relative to alternatives",
    "precedent_implications": "What similar past decisions suggest"
  }` : `
  "competitive_risk": {
    "incumbent_defense": "What existing alternatives will do",
    "fast_follower_risk": "Low|Moderate|High",
    "evidence_response": "How competitors may counter",
    "access_response": "Competitive payer actions"
  }`;

    const feasibilityBlock = (isRegulatory || isClinical) ? "" : `,
  "growth_feasibility": {
    "segment_size": "Small|Medium|Large",
    "access_expansion": "Coverage growth potential",
    "operational_scalability": "Low|Moderate|High",
    "revenue_translation": "Low|Moderate|High"
  }`;

    const analystType = isClinical ? "clinical trial strategy" : isRegulatory ? "regulatory strategy" : "commercial strategy";
    const caseHeader = isClinical
      ? "\nThis is a CLINICAL OUTCOME case. All language, actors, and framing must be trial-focused — NOT regulatory, commercial, or adoption.\n"
      : isRegulatory
        ? "\nThis is a REGULATORY APPROVAL case. All language, actors, and framing must be regulatory — NOT commercial/adoption.\n"
        : "";

    const systemPrompt = `You are a pharmaceutical ${analystType} analyst. Generate contextual detail for a structured decision analysis.

CRITICAL: Each case is unique. Evaluate this specific product on its own merits.
${caseHeader}
${hasResearch ? "REAL-TIME WEB RESEARCH is included below. Ground your analysis in these findings." : "No recent web research was found. Rely on your training knowledge."}

${hasGates ? `IMPORTANT: A decision framework has been derived from the forecast gates. You must ADD DETAIL to this framework, not replace it. Do not invent barriers or actions that are not in the framework.` : "No forecast gates available. Generate a standalone analysis."}
${vocabConstraints}${segConstraints}${riskConstraints}${decisionLayerConstraints}${driverConstraints}${safetyConstraints}${evidenceGateConstraints}${outcomeStateConstraints}${actionFilterConstraints}${propagationConstraints}${sensitivityConstraints}
Return ONLY valid JSON with this structure:

{
  "barrier_decomposition": {
    "<use the exact gate_id string from the barriers list, e.g. 'g2' not the label>": [
      {
        "driver": "Specific ${isRegulatory ? "regulatory" : "operational"} driver name",
        "current_state": "Concise description of the current condition (1 sentence)",
        "${impactLabel}": "How this specifically affects ${isRegulatory ? "approval" : "adoption"} (1 sentence)",
        "what_would_improve_it": "Concrete action or change needed (1 sentence)",
        "expected_effect": "What improvement would do to outlook (1 sentence)"
      }
    ]
  },${segmentationBlock},
  "readiness_timeline": {
    "near_term_readiness": "Low|Moderate|High",
    "trigger_events": ["event 1", "event 2"],
    "dependencies": ["dependency 1"],
    "timing_risks": ["risk 1"]
  },${competitiveBlock}${feasibilityBlock}
}

BARRIER DECOMPOSITION RULES:
- For each non-strong gate (by gate_id), provide 2-5 specific ${isClinical ? "trial design" : isRegulatory ? "regulatory" : "operational"} drivers.
- NEVER use the gate label itself as a driver name. Break it into the underlying conditions.
- Each driver must be a concrete, observable condition.
- "current_state" must describe the actual real-world situation, not restate the gate.
- "${impactLabel}" must explain HOW this specific driver ${isClinical ? "affects endpoint success" : isRegulatory ? "affects the approval decision" : "slows or blocks adoption"}.
- "what_would_improve_it" must be a concrete, actionable intervention.
- "expected_effect" must describe the specific change in ${isClinical ? "endpoint" : isRegulatory ? "approval" : "adoption"} outlook if the improvement is made.

${isClinical ? "Name trial stakeholders specific to this case (e.g. 'Principal Investigators at Phase III sites', 'Independent DSMB members')." : isRegulatory ? "Name regulatory actors specific to this case (e.g. 'FDA Neurology Division', 'Peripheral and CNS Drugs Advisory Committee')." : "Name real segment types specific to this product (e.g. 'Pulmonologists at academic centers', 'Community oncologists')."}`;

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

    let decisionActions: DecisionAction[] = [];
    if (hasGates) {
      decisionActions = generateDecisionActions(
        gates,
        body.brandOutlookProbability ?? null,
        body.constrainedProbability ?? null,
      );
    }

    if (hasGates && derived && integrity) {
      const rawDecomp = aiContext.barrier_decomposition || {};
      const decomp: Record<string, any[]> = {};
      const labelToId: Record<string, string> = {};
      for (const g of gates) {
        labelToId[g.gate_label.toLowerCase()] = g.gate_id;
        labelToId[g.gate_label.toLowerCase().replace(/\s+/g, "_")] = g.gate_id;
        labelToId[g.gate_label.toLowerCase().replace(/\s+/g, "-")] = g.gate_id;
        const withStatus = `${g.gate_label.toLowerCase()} [${g.status}]`;
        labelToId[withStatus] = g.gate_id;
      }
      for (const [key, drivers] of Object.entries(rawDecomp)) {
        if (gates.some(g => g.gate_id === key)) {
          decomp[key] = drivers as any[];
        } else {
          const normalized = key.toLowerCase().replace(/\s+/g, "_");
          const mapped = labelToId[key.toLowerCase()] || labelToId[normalized] || labelToId[key.toLowerCase().replace(/_/g, " ")];
          if (mapped) {
            decomp[mapped] = drivers as any[];
          } else {
            decomp[key] = drivers as any[];
          }
        }
      }

      const requiredFieldSets = [
        ["driver", "current_state", "impact_on_adoption", "what_would_improve_it", "expected_effect"],
        ["driver", "current_state", "impact_on_approval", "what_would_improve_it", "expected_effect"],
      ];
      for (const [gateId, drivers] of Object.entries(decomp)) {
        if (!Array.isArray(drivers)) { delete decomp[gateId]; continue; }
        decomp[gateId] = (drivers as any[]).filter((d: any) =>
          d && typeof d === "object" && requiredFieldSets.some(fields =>
            fields.every(f => typeof d[f] === "string" && d[f].length > 0)
          )
        );
        if (decomp[gateId].length === 0) delete decomp[gateId];
      }

      for (const barrier of derived.barriers) {
        const drivers = decomp[barrier.source_gate_id];
        if (drivers && Array.isArray(drivers) && drivers.length > 0) {
          barrier.rationale = drivers.map((d: any) => d.driver).join("; ");
        }
      }
      for (const action of derived.actions) {
        const drivers = decomp[action.source_gate_id];
        if (drivers && Array.isArray(drivers) && drivers.length > 0) {
          action.rationale = `${action.rationale} Underlying drivers: ${drivers.map((d: any) => d.driver).join(", ")}.`;
        }
      }

      let archetypeAssignments = null;
      try {
        const seg = aiContext.adoption_segmentation || aiContext.stakeholder_segmentation;
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
        decision_actions: decisionActions,
        integrity: integrity,
        barrier_decomposition: decomp,
        adoption_segmentation: aiContext.adoption_segmentation || aiContext.stakeholder_segmentation || null,
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
        const seg = aiContext.adoption_segmentation || aiContext.stakeholder_segmentation;
        if (seg) {
          archetypeAssignments = assignArchetypesForSegmentation(seg, []);
        }
      } catch (arcErr: any) {
        console.error("[ai-decide] Archetype assignment failed (non-blocking):", arcErr.message);
      }

      res.json({
        mode: "standalone",
        derived_decisions: null,
        decision_actions: decisionActions,
        integrity: null,
        barrier_decomposition: null,
        adoption_segmentation: aiContext.adoption_segmentation || aiContext.stakeholder_segmentation || null,
        archetype_assignments: archetypeAssignments,
        readiness_timeline: aiContext.readiness_timeline || null,
        competitive_risk: aiContext.competitive_risk || null,
        growth_feasibility: aiContext.growth_feasibility || null,
        forecast_context: null,
      });
    }
  } catch (err: any) {
    console.error("AI decide generation error:", err);
    res.status(500).json({ error: "Failed to generate decision analysis" });
  }
});

export default router;
