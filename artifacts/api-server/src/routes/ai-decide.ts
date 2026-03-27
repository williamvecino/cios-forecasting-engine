import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { researchBrand } from "../lib/web-research";

const router = Router();

interface ForecastGate {
  gate_id: string;
  gate_label: string;
  description: string;
  status: string;
  reasoning: string;
  constrains_probability_to: number;
}

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

    const research = await researchBrand(body.subject, body.questionText);
    const hasResearch = research.combinedContext.length > 0;

    const systemPrompt = `You are a pharmaceutical commercial strategy analyst. Generate a structured decision analysis for a specific brand/product and forecasting question.

CRITICAL: Each case is unique. Evaluate this specific product on its own merits. Do not apply generic templates. A hair restoration adjunct therapy has different segmentation, barriers, and competitive dynamics than an oncology biologic — even within the same therapeutic area.

${hasResearch ? "REAL-TIME WEB RESEARCH was performed and is included below. Ground your analysis in these real, current findings. Reference specific recent developments (trial results, FDA actions, press releases) when they affect segmentation, barriers, or timeline." : "No recent web research was found. Rely on your training knowledge but be transparent about uncertainty."}

Consider:
- What type of product is this? (novel drug, adjunct therapy, diagnostic, device, etc.)
- Who are the actual prescribers/users? (specialists, generalists, surgeons, etc.)
- What drives adoption for THIS type of product? (evidence? guidelines? patient demand? visible results? payer coverage?)
- What is the relevant payment model? (insurance-covered? cash-pay? buy-and-bill?)
- What recent developments (from research) change the adoption outlook?

Do NOT fabricate specific data. Use research findings when available, and provide analytical assessments based on the product type and market context.

CRITICAL POLARITY RULE for barrier_diagnosis:
Each domain has TWO separate variables: "readiness" and "barrier". They are inversely correlated:
- If evidence SUPPORTS adoption → readiness = High, barrier = Low
- If evidence IMPEDES adoption → readiness = Low, barrier = High
- If access is easy → readiness = High, barrier = Low
- If access is restricted → readiness = Low, barrier = High
A positive adoption signal must NEVER produce a High barrier. A negative signal must NEVER produce a High readiness.
The "detail" field must be consistent with both readiness and barrier levels.

FORECAST-DERIVED DECISION RULE:
If forecast gates are provided below, ALL barrier assessments and recommended actions MUST be derived from those gates.
- Each barrier_diagnosis domain MUST include "source_gate_id" referencing the most relevant gate.
- If a gate status is "strong", the corresponding barrier CANNOT be "High".
- If a gate status is "weak" or "unresolved", at least one recommended_action must address it.
- Each recommended_action MUST include a "source_gate_id" and "forecast_dependency" explaining how it connects to the forecast.
- Do NOT invent barriers or actions that have no basis in the forecast gates.

Return ONLY valid JSON with this structure:

{
  "adoption_segmentation": {
    "early_adopters": { "segments": ["segment 1", "segment 2"], "reason": "Why these move first" },
    "persuadables": { "segments": ["segment"], "reason": "Why persuadable" },
    "late_movers": { "segments": ["segment"], "reason": "Why slow" },
    "resistant": { "segments": ["segment"], "reason": "Why resistant" }
  },
  "barrier_diagnosis": {
    "evidence": { "readiness": "Low|Moderate|High", "barrier": "Low|Moderate|High", "source_gate_id": "gate ID from forecast gates or null", "detail": "Specific assessment for this product" },
    "access": { "readiness": "Low|Moderate|High", "barrier": "Low|Moderate|High", "source_gate_id": "gate ID or null", "detail": "Specific assessment" },
    "workflow": { "readiness": "Low|Moderate|High", "barrier": "Low|Moderate|High", "source_gate_id": "gate ID or null", "detail": "Specific assessment" },
    "competitive": { "readiness": "Low|Moderate|High", "barrier": "Low|Moderate|High", "source_gate_id": "gate ID or null", "detail": "Specific assessment" }
  },
  "readiness_timeline": {
    "near_term_readiness": "Low|Moderate|High",
    "trigger_events": ["event 1", "event 2", "event 3"],
    "dependencies": ["dependency 1", "dependency 2"],
    "timing_risks": ["risk 1", "risk 2"]
  },
  "competitive_risk": {
    "incumbent_defense": "What existing alternatives will do",
    "fast_follower_risk": "Low|Moderate|High",
    "evidence_response": "How competitors may counter with evidence",
    "access_response": "Competitive payer/access actions"
  },
  "growth_feasibility": {
    "segment_size": "Small|Medium|Large",
    "access_expansion": "Coverage growth potential for this product",
    "operational_scalability": "Low|Moderate|High",
    "revenue_translation": "Low|Moderate|High"
  },
  "recommended_actions": [
    { "action": "Action text", "source_gate_id": "gate ID or null", "forecast_dependency": "How this action connects to and could improve the forecast" }
  ]
}

Name real segment types specific to this product (e.g. "Hair restoration surgeons", "Community oncologists", "Large cardiology practices") — not generic labels.`;

    let researchSection = "";
    if (hasResearch) {
      researchSection = `\n\n--- REAL-TIME WEB RESEARCH ---\n${research.combinedContext}\n--- END RESEARCH ---\n\nUse the above research to ground your decision analysis in real, current developments.`;
    }

    let gatesSection = "";
    if (body.forecastGates && body.forecastGates.length > 0) {
      const gateLines = body.forecastGates.map((g) =>
        `- ${g.gate_id}: "${g.gate_label}" | status=${g.status} | constrains_to=${Math.round(g.constrains_probability_to * 100)}% | ${g.description}`
      ).join("\n");
      gatesSection = `\n\n--- FORECAST GATES (from Step 3) ---\n${gateLines}\nBrand Outlook: ${body.brandOutlookProbability != null ? Math.round(body.brandOutlookProbability * 100) + "%" : "unknown"}\nConstrained Forecast: ${body.constrainedProbability != null ? Math.round(body.constrainedProbability * 100) + "%" : "unknown"}\n--- END GATES ---\n\nYou MUST derive all barrier_diagnosis and recommended_actions from these gates. Reference gate IDs in source_gate_id fields.`;
    }

    const userPrompt = `Generate decision analysis for:

**Brand/Subject**: ${body.subject}
**Question**: ${body.questionText}
**Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Question Type**: ${body.questionType || "binary"}
**Therapeutic Context**: ${area}
${body.entities?.length ? `**Groups**: ${body.entities.join(", ")}` : ""}${researchSection}${gatesSection}

Evaluate this specific product and its market. Who are the real segments? What are the actual barriers? What would trigger adoption?`;

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
    if (!content) {
      res.status(500).json({ error: "No response from AI" });
      return;
    }

    const parsed = JSON.parse(content);

    if (parsed.barrier_diagnosis) {
      const validLevels = new Set(["High", "Moderate", "Low"]);
      const inverse: Record<string, string> = { High: "Low", Low: "High", Moderate: "Moderate" };
      const allowedPairs = new Set(["High:Low", "Low:High", "Moderate:Moderate", "Moderate:Low", "Low:Moderate", "High:Moderate", "Moderate:High"]);
      const forbiddenPairs = new Set(["High:High", "Low:Low"]);

      for (const domain of Object.keys(parsed.barrier_diagnosis)) {
        const item = parsed.barrier_diagnosis[domain];
        if (!item) continue;

        if (item.level && !item.readiness) {
          item.readiness = item.level;
          item.barrier = inverse[item.level] || "Moderate";
          delete item.level;
        }

        if (!validLevels.has(item.readiness)) item.readiness = "Moderate";
        if (!validLevels.has(item.barrier)) item.barrier = inverse[item.readiness] || "Moderate";

        const pair = `${item.readiness}:${item.barrier}`;
        if (forbiddenPairs.has(pair)) {
          item.barrier = inverse[item.readiness];
        }
      }
    }

    if (body.forecastGates && body.forecastGates.length > 0) {
      const gateMap = new Map(body.forecastGates.map((g) => [g.gate_id, g]));
      const gateStatusToMaxBarrier: Record<string, string> = { strong: "Low", moderate: "Moderate", weak: "High", unresolved: "High" };

      if (parsed.barrier_diagnosis) {
        for (const domain of Object.keys(parsed.barrier_diagnosis)) {
          const item = parsed.barrier_diagnosis[domain];
          if (!item) continue;
          if (item.source_gate_id && gateMap.has(item.source_gate_id)) {
            const gate = gateMap.get(item.source_gate_id)!;
            const maxBarrier = gateStatusToMaxBarrier[gate.status] || "Moderate";
            if (item.barrier === "High" && maxBarrier !== "High") {
              item.barrier = maxBarrier;
            }
          }
        }
      }

      if (parsed.recommended_actions && Array.isArray(parsed.recommended_actions)) {
        parsed.recommended_actions = parsed.recommended_actions.map((a: any) => {
          if (typeof a === "string") {
            return { action: a, source_gate_id: null, forecast_dependency: null };
          }
          return a;
        });
      }

      const weakOrUnresolved = body.forecastGates.filter((g) => g.status === "weak" || g.status === "unresolved");
      const actions = parsed.recommended_actions || [];
      for (const gate of weakOrUnresolved) {
        const hasLinkedAction = actions.some((a: any) => a?.source_gate_id === gate.gate_id);
        if (!hasLinkedAction) {
          actions.push({
            action: `Address ${gate.gate_label}: ${gate.description}`,
            source_gate_id: gate.gate_id,
            forecast_dependency: `This gate is ${gate.status} and constrains the forecast to ${Math.round(gate.constrains_probability_to * 100)}%. Resolving it could lift the cap.`,
          });
        }
      }
      parsed.recommended_actions = actions;
    }

    const integrityWarnings: string[] = [];
    if (body.forecastGates && body.forecastGates.length > 0) {
      const gateIds = new Set(body.forecastGates.map((g) => g.gate_id));

      if (parsed.barrier_diagnosis) {
        for (const [domain, item] of Object.entries(parsed.barrier_diagnosis)) {
          const bi = item as any;
          if (!bi?.source_gate_id || !gateIds.has(bi.source_gate_id)) {
            integrityWarnings.push(`barrier_diagnosis.${domain}: missing or invalid source_gate_id`);
          }
        }
      }

      if (parsed.recommended_actions && Array.isArray(parsed.recommended_actions)) {
        parsed.recommended_actions.forEach((a: any, i: number) => {
          if (!a?.source_gate_id || !gateIds.has(a.source_gate_id)) {
            integrityWarnings.push(`recommended_actions[${i}]: missing or invalid source_gate_id`);
          }
        });
      }
    }

    parsed._integrity = {
      gate_linked: body.forecastGates && body.forecastGates.length > 0,
      warnings: integrityWarnings,
      valid: integrityWarnings.length === 0,
    };

    res.json(parsed);
  } catch (err: any) {
    console.error("AI decide generation error:", err);
    res.status(500).json({ error: "Failed to generate decision analysis" });
  }
});

export default router;
