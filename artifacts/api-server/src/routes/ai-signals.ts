import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface SignalGenerationRequest {
  subject: string;
  outcome?: string;
  questionType?: string;
  questionText: string;
  timeHorizon?: string;
  entities?: string[];
}

function detectTherapeuticArea(subject: string, questionText: string): string {
  const combined = `${subject} ${questionText}`.toLowerCase();

  const areas: { name: string; terms: string[] }[] = [
    { name: "oncology", terms: ["oncology", "oncologist", "cancer", "tumor", "carcinoma", "lymphoma", "leukemia", "melanoma", "sarcoma", "chemotherapy", "immunotherapy", "checkpoint inhibitor", "myeloma", "nsclc", "first-line", "second-line", "targeted therapy"] },
    { name: "dermatology", terms: ["dermatology", "dermatologist", "psoriasis", "eczema", "atopic dermatitis", "acne", "alopecia", "vitiligo", "hair restoration", "cosmetic", "aesthetic", "skin"] },
    { name: "immunology", terms: ["immunology", "rheumatology", "rheumatoid", "lupus", "crohn", "colitis", "autoimmune", "ankylosing"] },
    { name: "cardiology", terms: ["cardiology", "cardiologist", "heart failure", "atrial fibrillation", "hypertension", "cardiovascular"] },
    { name: "neurology", terms: ["neurology", "neurologist", "alzheimer", "parkinson", "epilepsy", "migraine", "multiple sclerosis"] },
    { name: "pulmonology", terms: ["pulmonology", "pulmonologist", "copd", "asthma", "pulmonary", "respiratory", "bronchiectasis", "arikayce"] },
    { name: "endocrinology", terms: ["endocrinology", "diabetes", "insulin", "glp-1", "sglt2", "thyroid", "obesity"] },
  ];

  let bestArea = "general";
  let bestScore = 0;
  for (const area of areas) {
    const score = area.terms.filter((t) => combined.includes(t)).length;
    if (score > bestScore) {
      bestScore = score;
      bestArea = area.name;
    }
  }
  return bestArea;
}

router.post("/ai-signals/generate", async (req, res) => {
  try {
    const body = req.body as SignalGenerationRequest;

    if (!body.subject || !body.questionText) {
      res.status(400).json({ error: "subject and questionText are required" });
      return;
    }

    const therapeuticArea = detectTherapeuticArea(body.subject, body.questionText);

    const systemPrompt = `You are a pharmaceutical market intelligence analyst. Given a specific brand/therapy and a forecasting question, generate analytical signals that drive the forecast.

CRITICAL RULES:

1. Each case is unique. Do NOT apply generic templates. Evaluate this specific brand/product/question on its own merits.

2. What drives adoption varies by product type:
   - Some products are driven by clinical trial evidence and guidelines (e.g. oncology drugs with survival endpoints).
   - Others are driven by visible patient outcomes, workflow simplicity, and patient demand (e.g. aesthetic/adjunct therapies).
   - Others are driven by payer coverage and reimbursement (e.g. specialty drugs with high cost).
   Determine what matters for THIS specific product and question.

3. Do NOT fabricate specific facts. Do not invent FDA approval dates, trial results, response rates, or guideline mentions you are unsure about. If you recognize the brand and know real facts, state them with "Confirmed" reliability. If you don't recognize the brand, frame signals as analytical considerations for what WOULD drive adoption for this type of product.

4. Signals should be specific analytical drivers — concrete factors that move the forecast up or down. Not generic advice like "investigate whether..."

5. Identify what therapeutic context this falls into (detected: ${therapeuticArea}) and reason about what adoption dynamics apply to this specific type of product. But do not blindly apply a template — a hair restoration adjunct therapy has completely different adoption drivers than an oncology biologic, even if both are in "dermatology."

For each signal, provide:
- **text**: A specific analytical driver statement. If you know real facts about this brand, state them. If not, describe the type of factor that matters (e.g. "Documented improvement in clinical outcomes" not "investigate whether outcomes exist").
- **category**: one of "evidence", "access", "competition", "guideline", "timing", "adoption"
- **direction**: "positive", "negative", or "neutral"
- **strength**: "High", "Medium", or "Low"
- **reliability**: "Confirmed" (known fact or well-established market dynamic), "Probable" (reasonable inference), "Speculative" (uncertain)
- **source_type**: What data source informs this (e.g. "clinical_data", "market_research", "payer_landscape", "prescribing_data", "competitive_intel", "guidelines")
- **rationale**: Why this factor matters for this specific forecast

Generate 8-12 signals. Put highest-impact drivers first.

For incoming_events, generate 5 events the forecaster should monitor:
{ "id": "ev-N", "title": "...", "type": "evidence|access|competition|guideline|adoption", "description": "...", "relevance": "..." }

For market_summary: 2-3 sentences describing what dynamics matter most for THIS specific product and question. Do not apply generic therapeutic area templates.

Return ONLY valid JSON:
{
  "signals": [...],
  "incoming_events": [...],
  "market_summary": "...",
  "therapeutic_area": "${therapeuticArea}"
}`;

    const userPrompt = `Generate analytical signals for:

**Brand/Subject**: ${body.subject}
**Question**: ${body.questionText}
**Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Question Type**: ${body.questionType || "binary"}
${body.entities?.length ? `**Groups**: ${body.entities.join(" vs ")}` : ""}

Evaluate this specific product and question. What are the primary factors that would drive or block the forecasted outcome? Consider the product type, the target prescribers, the market dynamics, and what evidence would matter most.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 8192,
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
    parsed.therapeutic_area = therapeuticArea;
    res.json(parsed);
  } catch (err: any) {
    console.error("AI signal generation error:", err);
    res.status(500).json({ error: "Failed to generate AI signals" });
  }
});

export default router;
