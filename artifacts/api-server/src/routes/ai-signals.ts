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
    { name: "pulmonology", terms: ["pulmonology", "pulmonologist", "copd", "asthma", "pulmonary", "respiratory", "bronchiectasis", "arikayce", "mac lung"] },
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

    const systemPrompt = `You are a pharmaceutical market intelligence analyst. Given a specific brand/therapy and a forecasting question, you must generate structured, multi-source signals that drive the forecast.

A BRAND DEVELOPMENT CHECK has been performed. ${hasResearch
  ? "Real-time web research found recent developments. You MUST convert these into structured signals FIRST, before generating any derived or generic signals."
  : "No recent verified brand developments were found from web research."}

CRITICAL RULES:

1. Each case is unique. Do NOT apply generic templates. Evaluate this specific brand/product/question on its own merits.

2. QUESTION RELEVANCE TRANSLATION — This is the most important rule. Every signal MUST be evaluated against THE SPECIFIC QUESTION being asked, not just the brand overall. A strong brand signal that does not directly answer the question must NOT be treated as if it does.

   For EACH signal, you must assess:
   - **applies_to_line_of_therapy**: Does this signal apply to the specific line of therapy in the question? Values: "current_label" (matches current approved use), "future_label" (would require label expansion), "uncertain" (unclear applicability)
   - **applies_to_stakeholder_group**: Which stakeholder group does this signal affect? Values: specific group name(s) from the question, "both", "all", "unknown"
   - **applies_within_time_horizon**: Can this signal plausibly change behavior within the specified time horizon? Values: "yes" (likely within horizon), "partial" (some effect but constrained), "unlikely" (effect beyond horizon)
   - **translation_confidence**: How directly does this signal translate to the specific outcome asked? Values: "high" (direct causal link to the asked outcome), "moderate" (indirect or conditional link), "low" (upstream signal with uncertain conversion)
   - **question_relevance_note**: One sentence explaining WHY this signal does or does not directly answer the question. Be specific.

   EXAMPLE: If the question asks about "first-line adoption within 12 months" and you find positive Phase 3 data:
   - If the data supports the current indication but NOT first-line use → applies_to_line_of_therapy: "future_label", translation_confidence: "low"
   - If access/guidelines haven't changed to support first-line → applies_within_time_horizon: "partial"
   - The signal is still valid and important, but its FORECAST IMPACT must be constrained

   FORECAST IMPACT RULE: A signal may only have "High" strength if translation_confidence is "high". If translation_confidence is "low", strength MUST be "Medium" or "Low" regardless of how important the brand news is. This prevents upstream brand signals from dominating the forecast when they don't directly answer the question.

3. SIGNAL FAMILIES — Every signal MUST belong to exactly one of these 6 families:
   - "brand_clinical_regulatory": trial readouts, label updates, safety signals, regulatory filings, guideline updates
   - "payer_access": coverage criteria, prior authorization, formulary status, reimbursement, patient cost burden
   - "competitor": competitor launches, competitor data, competitor safety issues, competitor pricing, positioning shifts
   - "patient_demand": symptom burden, treatment dissatisfaction, patient requests, discontinuation burden, advocacy activity
   - "provider_behavioral": specialty ownership, workflow resistance, prescribing familiarity, risk tolerance, referral dynamics, training readiness
   - "system_operational": equipment requirements, staffing limitations, protocol readiness, pharmacy/logistics burden, administration complexity

3. SIGNAL CLASSIFICATION — Every signal must also be classified as:
   - "observed": Directly sourced from verified brand developments (press releases, trial results, FDA actions). MUST come first.
   - "derived": Reasonable inference from observed data or established market knowledge.
   - "uncertainty": Unresolved issue or open question to monitor.

4. COVERAGE REQUIREMENT: Generate signals across ALL 6 families. You MUST include at least one signal from each family. This is critical for forecast quality.

5. ORDER: Observed signals first (from brand development check), then derived signals across all families, then uncertainties.

6. For observed signals from web research, include: source_url, observed_date, citation_excerpt, brand_verified: true.

7. Do NOT fabricate specific facts. For derived signals, mark brand_verified: false.

8. Therapeutic context (detected: ${therapeuticArea}) informs weighting and interpretation, but real brand/context signals always take precedence over archetype patterns.

For each signal, provide:
- **text**: A specific analytical driver statement. For observed signals, cite the specific development.
- **signal_family**: one of "brand_clinical_regulatory", "payer_access", "competitor", "patient_demand", "provider_behavioral", "system_operational"
- **signal_class**: "observed" | "derived" | "uncertainty"
- **category**: one of "evidence", "access", "competition", "guideline", "timing", "adoption"
- **direction**: "positive", "negative", or "neutral"
- **strength**: "High", "Medium", or "Low"
- **reliability**: "Confirmed" (observed from verified source), "Probable" (reasonable inference), "Speculative" (uncertain)
- **source_type**: e.g. "official_company", "official_brand_site", "clinicaltrials", "guideline", "payer_policy", "scientific_publication", "conference", "inferred", "press_release", "investor_relations"
- **source_url**: URL if available (required for observed signals), null otherwise
- **observed_date**: date string if known (required for observed signals), null otherwise
- **citation_excerpt**: key quote/fact from source (required for observed signals), null otherwise
- **brand_verified**: true for observed signals from verified sources, false otherwise
- **rationale**: Why this factor matters for this specific forecast
- **applies_to_line_of_therapy**: "current_label" | "future_label" | "uncertain"
- **applies_to_stakeholder_group**: specific group name, "both", "all", or "unknown"
- **applies_within_time_horizon**: "yes" | "partial" | "unlikely"
- **translation_confidence**: "high" | "moderate" | "low"
- **question_relevance_note**: One sentence explaining how directly this signal answers the specific question asked

Generate 12-18 signals covering all 6 families. Observed brand developments first, then derived across all families, then uncertainties.

For incoming_events, generate 5 events the forecaster should monitor:
{ "id": "ev-N", "title": "...", "type": "evidence|access|competition|guideline|adoption", "description": "...", "relevance": "..." }

For market_summary: 2-3 sentences starting with the most important recent development if one exists.

For question_translation_summary: Write 2-3 sentences explaining the gap between the strongest brand signal and the specific question asked. For example: "ENCORE data strengthens the clinical case for Arikayce broadly, but the question asks about first-line adoption specifically. Current label, guidelines, and payer coverage do not yet support routine first-line use, creating a translation gap between the brand signal and the forecast outcome."

Return ONLY valid JSON:
{
  "signals": [...],
  "incoming_events": [...],
  "market_summary": "...",
  "question_translation_summary": "...",
  "therapeutic_area": "${therapeuticArea}",
  "brand_check_performed": true,
  "verified_developments_found": ${hasResearch}
}`;

    let researchSection = "";
    if (hasResearch) {
      researchSection = `\n\n--- BRAND DEVELOPMENT CHECK RESULTS ---\n${research.combinedContext}\n--- END BRAND DEVELOPMENT CHECK ---\n\nYou MUST convert the above verified brand developments into "observed" signals with source_url, observed_date, citation_excerpt, and brand_verified: true. These must appear first in your signal list. Then generate derived and uncertainty signals across ALL 6 families.`;
    } else {
      researchSection = `\n\nBRAND DEVELOPMENT CHECK: No recent verified brand developments found for "${body.subject}". Generate signals based on known market dynamics across all 6 signal families, but classify them as "derived" or "uncertainty" — not "observed".`;
    }

    const userPrompt = `Generate multi-source structured signals for:

**Brand/Subject**: ${body.subject}
**Question**: ${body.questionText}
**Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Question Type**: ${body.questionType || "binary"}
${body.entities?.length ? `**Groups**: ${body.entities.join(" vs ")}` : ""}${researchSection}

IMPORTANT: You must generate signals from ALL 6 families:
1. brand_clinical_regulatory — what clinical/regulatory developments affect adoption?
2. payer_access — what coverage/reimbursement factors affect adoption?
3. competitor — what competitive dynamics affect adoption?
4. patient_demand — what patient factors drive or limit demand?
5. provider_behavioral — what physician behavior patterns affect adoption?
6. system_operational — what operational/logistical factors affect adoption?

CRITICAL REMINDER — QUESTION RELEVANCE TRANSLATION:
Every signal must include applies_to_line_of_therapy, applies_to_stakeholder_group, applies_within_time_horizon, translation_confidence, and question_relevance_note.

The question asks specifically: "${body.questionText}"
- Evaluate each signal against THIS EXACT question.
- A strong positive brand development (e.g. positive trial data) should NOT automatically get "High" strength if it doesn't directly drive the specific outcome asked about (e.g. first-line adoption vs general adoption).
- If a signal is an upstream positive but has uncertain conversion to the asked outcome, set translation_confidence: "low" or "moderate" and constrain strength accordingly.

Convert verified brand developments into observed signals first, then add derived implications and uncertainties across all families.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 10000,
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
