import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { researchBrand } from "../lib/web-research";

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
    { name: "psychiatry", terms: ["psychiatry", "psychiatrist", "psychiatric", "schizophrenia", "antipsychotic", "bipolar", "psychosis", "schizoaffective", "mental health", "injectable antipsychotic"] },
    { name: "neurology", terms: ["neurology", "neurologist", "alzheimer", "parkinson", "epilepsy", "migraine", "multiple sclerosis"] },
    { name: "pulmonology", terms: ["pulmonology", "pulmonologist", "copd", "asthma", "pulmonary", "respiratory", "bronchiectasis", "arikayce"] },
    { name: "infectious disease", terms: ["infectious disease", "antimicrobial", "antibiotic", "antifungal", "antiviral", "hospital-acquired", "nosocomial", "stewardship", "formulary", "sepsis", "pneumonia", "bacteremia", "mrsa", "c. diff"] },
    { name: "rare disease", terms: ["rare disease", "orphan drug", "orphan", "ultra-rare", "specialty center", "specialty treatment", "rare condition", "enzyme replacement", "gene therapy"] },
    { name: "medical device", terms: ["medical device", "device", "catheter", "procedural", "minimally invasive", "implant", "surgical", "procedure adoption", "ambulatory surgery", "endoscop"] },
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

    const research = await researchBrand(body.subject, body.questionText);
    const hasResearch = research.newsHeadlines.length > 0;

    const systemPrompt = `You are a pharmaceutical market intelligence analyst. Given a specific brand/therapy and a forecasting question, you must generate analytical signals that drive the forecast.

A BRAND DEVELOPMENT CHECK has been performed. ${hasResearch
  ? "Real-time web research found recent developments. You MUST convert these into structured signals FIRST, before generating any derived or generic signals."
  : "No recent verified brand developments were found from web research."}

CRITICAL RULES:

1. Each case is unique. Do NOT apply generic templates. Evaluate this specific brand/product/question on its own merits.

2. SIGNAL CLASSIFICATION — Every signal must be classified as one of:
   - "observed": Directly sourced from verified brand developments (press releases, clinical trial results, FDA actions, investor announcements). These MUST come first and carry highest weight.
   - "derived": Reasonable implications inferred from observed developments or established market knowledge.
   - "uncertainty": Open questions or unknown factors that could affect the forecast.

3. ORDER REQUIREMENT: Observed signals first, then derived, then uncertainties. ${hasResearch ? "If web research found developments but you output no observed signals, this is a logic failure." : "Since no web research was found, you may have mostly derived signals — but be transparent about this."}

4. For observed signals sourced from web research, you MUST include:
   - source_url: the URL where this was found (from the research data)
   - observed_date: when this development occurred/was announced
   - citation_excerpt: a brief quote or key fact from the source
   - brand_verified: true

5. Do NOT fabricate specific facts. For derived signals, mark brand_verified: false.

6. What drives adoption varies by product type. Determine what matters for THIS specific product and question.

7. Identify what therapeutic context this falls into (detected: ${therapeuticArea}) and reason about what adoption dynamics apply. But do not blindly apply a template.

For each signal, provide:
- **text**: A specific analytical driver statement. For observed signals, cite the specific development.
- **signal_class**: "observed" | "derived" | "uncertainty"
- **category**: one of "evidence", "access", "competition", "guideline", "timing", "adoption"
- **direction**: "positive", "negative", or "neutral"
- **strength**: "High", "Medium", or "Low"
- **reliability**: "Confirmed" (observed from verified source), "Probable" (reasonable inference), "Speculative" (uncertain)
- **source_type**: e.g. "press_release", "investor_relations", "clinical_data", "clinical_trials_gov", "fda", "congress", "guidelines", "market_research", "payer_landscape", "competitive_intel"
- **source_url**: URL if available (required for observed signals), null otherwise
- **observed_date**: date string if known (required for observed signals), null otherwise
- **citation_excerpt**: key quote/fact from source (required for observed signals), null otherwise
- **brand_verified**: true for observed signals from verified sources, false otherwise
- **rationale**: Why this factor matters for this specific forecast

Generate 8-12 signals. Observed brand developments first, then derived implications, then uncertainties.

For incoming_events, generate 5 events the forecaster should monitor:
{ "id": "ev-N", "title": "...", "type": "evidence|access|competition|guideline|adoption", "description": "...", "relevance": "..." }

For market_summary: 2-3 sentences starting with the most important recent development if one exists. Do not apply generic therapeutic area templates.

Return ONLY valid JSON:
{
  "signals": [...],
  "incoming_events": [...],
  "market_summary": "...",
  "therapeutic_area": "${therapeuticArea}",
  "brand_check_performed": true,
  "verified_developments_found": ${hasResearch}
}`;

    let researchSection = "";
    if (hasResearch) {
      researchSection = `\n\n--- BRAND DEVELOPMENT CHECK RESULTS ---\n${research.combinedContext}\n--- END BRAND DEVELOPMENT CHECK ---\n\nYou MUST convert the above verified brand developments into "observed" signals with source_url, observed_date, citation_excerpt, and brand_verified: true. These must appear first in your signal list.`;
    } else {
      researchSection = `\n\nBRAND DEVELOPMENT CHECK: No recent verified brand developments found for "${body.subject}". Generate signals based on known market dynamics, but classify them as "derived" or "uncertainty" — not "observed".`;
    }

    const userPrompt = `Generate analytical signals for:

**Brand/Subject**: ${body.subject}
**Question**: ${body.questionText}
**Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Question Type**: ${body.questionType || "binary"}
${body.entities?.length ? `**Groups**: ${body.entities.join(" vs ")}` : ""}${researchSection}

Evaluate this specific product and question. Convert verified brand developments into observed signals first, then add derived implications and open uncertainties.`;

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
    parsed.brand_check_performed = true;
    parsed.verified_developments_found = hasResearch;
    parsed.sources_searched = research.sourcesSearched;
    res.json(parsed);
  } catch (err: any) {
    console.error("AI signal generation error:", err);
    res.status(500).json({ error: "Failed to generate AI signals" });
  }
});

export default router;
