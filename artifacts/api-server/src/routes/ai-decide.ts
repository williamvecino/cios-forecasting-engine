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

    const systemPrompt = `You are a pharmaceutical commercial strategy analyst. Given a forecasting question about HCP adoption, generate a structured decision analysis.

You must generate analysis for ALL FIVE sections below. Each section must have specific, actionable content — not generic placeholders.

THERAPEUTIC AREA: ${area}

Return ONLY valid JSON with this exact structure:

{
  "adoption_segmentation": {
    "early_adopters": {
      "segments": ["segment name 1", "segment name 2"],
      "reason": "Why these segments move first"
    },
    "persuadables": {
      "segments": ["segment name"],
      "reason": "Why these segments are persuadable"
    },
    "late_movers": {
      "segments": ["segment name"],
      "reason": "Why these segments are slow"
    },
    "resistant": {
      "segments": ["segment name"],
      "reason": "Why these segments resist"
    }
  },
  "barrier_diagnosis": {
    "evidence": { "level": "Low|Moderate|High", "detail": "Specific assessment" },
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
    "incumbent_defense": "Description of expected incumbent response",
    "fast_follower_risk": "Low|Moderate|High",
    "evidence_response": "Description of expected evidence counter-messaging",
    "access_response": "Description of expected payer/access competitive actions"
  },
  "growth_feasibility": {
    "segment_size": "Small|Medium|Large",
    "access_expansion": "Description of coverage growth potential",
    "operational_scalability": "Low|Moderate|High",
    "revenue_translation": "Low|Moderate|High"
  },
  "recommended_actions": [
    "Action 1",
    "Action 2",
    "Action 3"
  ]
}

RULES:
1. Be specific to the therapeutic area and question context.
2. Name real segment types (e.g. "Academic oncology centers", "Community oncologists", "High-volume dermatology practices") — not generic labels.
3. Barrier levels should reflect realistic pharmaceutical market dynamics.
4. Do NOT fabricate specific data points, but DO provide domain-specific strategic assessments.
5. Recommended actions should be concrete and actionable.`;

    const userPrompt = `Generate a structured decision analysis for:

**Subject/Brand**: ${body.subject}
**Question**: ${body.questionText}
**Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Question Type**: ${body.questionType || "binary"}
**Therapeutic Area**: ${area}
${body.entities?.length ? `**Groups**: ${body.entities.join(", ")}` : ""}

Provide domain-specific analysis covering adoption segmentation, barrier diagnosis, readiness timeline, competitive risk, and growth feasibility.`;

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
