import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface DecideRequest {
  subject: string;
  outcome?: string;
  questionType?: string;
  questionText: string;
  timeHorizon?: string;
  entities?: string[];
  therapeuticArea?: string;
}

router.post("/ai-decide/generate", async (req, res) => {
  try {
    const body = req.body as DecideRequest;

    if (!body.subject || !body.questionText) {
      res.status(400).json({ error: "subject and questionText are required" });
      return;
    }

    const area = body.therapeuticArea || "general";

    const systemPrompt = `You are a pharmaceutical commercial strategy analyst. Generate a structured decision analysis for a specific brand/product and forecasting question.

CRITICAL: Each case is unique. Evaluate this specific product on its own merits. Do not apply generic templates. A hair restoration adjunct therapy has different segmentation, barriers, and competitive dynamics than an oncology biologic — even within the same therapeutic area.

Consider:
- What type of product is this? (novel drug, adjunct therapy, diagnostic, device, etc.)
- Who are the actual prescribers/users? (specialists, generalists, surgeons, etc.)
- What drives adoption for THIS type of product? (evidence? guidelines? patient demand? visible results? payer coverage?)
- What is the relevant payment model? (insurance-covered? cash-pay? buy-and-bill?)

Do NOT fabricate specific data. Provide analytical assessments based on the product type and market context.

Return ONLY valid JSON with this structure:

{
  "adoption_segmentation": {
    "early_adopters": { "segments": ["segment 1", "segment 2"], "reason": "Why these move first" },
    "persuadables": { "segments": ["segment"], "reason": "Why persuadable" },
    "late_movers": { "segments": ["segment"], "reason": "Why slow" },
    "resistant": { "segments": ["segment"], "reason": "Why resistant" }
  },
  "barrier_diagnosis": {
    "evidence": { "level": "Low|Moderate|High", "detail": "Specific assessment for this product" },
    "access": { "level": "Low|Moderate|High", "detail": "Specific assessment" },
    "workflow": { "level": "Low|Moderate|High", "detail": "Specific assessment" },
    "competitive": { "level": "Low|Moderate|High", "detail": "Specific assessment" }
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
  "recommended_actions": ["Action 1", "Action 2", "Action 3"]
}

Name real segment types specific to this product (e.g. "Hair restoration surgeons", "Community oncologists", "Large cardiology practices") — not generic labels.`;

    const userPrompt = `Generate decision analysis for:

**Brand/Subject**: ${body.subject}
**Question**: ${body.questionText}
**Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Question Type**: ${body.questionType || "binary"}
**Therapeutic Context**: ${area}
${body.entities?.length ? `**Groups**: ${body.entities.join(", ")}` : ""}

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
    res.json(parsed);
  } catch (err: any) {
    console.error("AI decide generation error:", err);
    res.status(500).json({ error: "Failed to generate decision analysis" });
  }
});

export default router;
