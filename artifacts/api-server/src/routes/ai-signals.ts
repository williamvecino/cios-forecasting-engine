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

  const oncologyTerms = ["oncology", "oncologist", "cancer", "tumor", "tumour", "carcinoma", "lymphoma", "leukemia", "melanoma", "sarcoma", "nccn", "asco", "chemotherapy", "immunotherapy", "checkpoint inhibitor", "pd-1", "pd-l1", "her2", "egfr", "alk", "braf", "kras", "myeloma", "glioblastoma", "nsclc", "sclc", "crc", "hcc", "rcc", "aml", "cll", "dlbcl", "first-line", "second-line", "third-line", "overall survival", "progression-free", "objective response", "targeted therapy"];
  const dermatologyTerms = ["dermatology", "dermatologist", "psoriasis", "eczema", "atopic dermatitis", "acne", "rosacea", "alopecia", "vitiligo", "hidradenitis", "pasi", "iga", "biologic", "topical", "skin"];
  const immunologyTerms = ["immunology", "rheumatology", "rheumatoid", "lupus", "crohn", "colitis", "psoriatic arthritis", "ankylosing spondylitis", "multiple sclerosis", "autoimmune", "tnf", "jak inhibitor", "il-17", "il-23", "il-6"];
  const cardiologyTerms = ["cardiology", "cardiologist", "heart failure", "atrial fibrillation", "hypertension", "statin", "anticoagulant", "pcsk9", "lipid", "cholesterol", "cardiovascular", "ami", "acs"];
  const neurologyTerms = ["neurology", "neurologist", "alzheimer", "parkinson", "epilepsy", "migraine", "cgrp", "multiple sclerosis", "neuropathy", "seizure"];
  const infectiousTerms = ["infectious disease", "antibiotic", "antiviral", "antifungal", "hiv", "hepatitis", "covid", "antimicrobial", "resistance", "mac", "ntm", "mycobacterium"];
  const pulmonologyTerms = ["pulmonology", "pulmonologist", "copd", "asthma", "pulmonary", "respiratory", "inhaler", "bronchiectasis", "ipf", "cystic fibrosis", "arikayce", "amikacin"];
  const endocrinologyTerms = ["endocrinology", "diabetes", "insulin", "glp-1", "sglt2", "thyroid", "obesity", "semaglutide", "tirzepatide", "a1c", "hba1c"];

  const areas: { name: string; terms: string[] }[] = [
    { name: "oncology", terms: oncologyTerms },
    { name: "dermatology", terms: dermatologyTerms },
    { name: "immunology", terms: immunologyTerms },
    { name: "cardiology", terms: cardiologyTerms },
    { name: "neurology", terms: neurologyTerms },
    { name: "infectious_disease", terms: infectiousTerms },
    { name: "pulmonology", terms: pulmonologyTerms },
    { name: "endocrinology", terms: endocrinologyTerms },
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

function getDomainContext(area: string): string {
  const contexts: Record<string, string> = {
    oncology: `DOMAIN: ONCOLOGY
Oncology adoption follows a specific progression: Evidence → Guidelines → Coverage → Adoption.
Key adoption drivers in oncology (in order of importance):
1. **Survival benefit** (overall survival, progression-free survival) — this is THE primary driver. Without OS/PFS benefit, adoption stalls.
2. **Guideline inclusion** (NCCN preferred, ASCO guidelines, ESMO) — oncologists follow guidelines closely.
3. **Payer coverage** (buy-and-bill economics, prior authorization, specialty pharmacy) — critical for access.
4. **Safety/toxicity profile** (Grade 3-4 adverse events, manageable side effects) — comparative safety matters.
5. **Administration route** (oral vs IV infusion, treatment duration, hospital vs home) — operational impact.
6. **Biomarker requirements** (companion diagnostics, testing infrastructure) — can limit eligible population.
7. **Competitive landscape** (SOC strength, pipeline threats, generic erosion).

Generate signals specific to oncology dynamics. Frame primary drivers around survival data, guideline positioning, payer economics, and toxicity profiles.`,

    dermatology: `DOMAIN: DERMATOLOGY
Dermatology adoption is driven by: Efficacy visibility → Patient demand → KOL influence → Payer coverage.
Key adoption drivers:
1. **Visible efficacy** (PASI scores, IGA response, clear skin endpoints) — dermatology outcomes are visually apparent.
2. **Patient demand** (DTC advertising, patient preference, quality of life) — strong patient pull in dermatology.
3. **KOL influence** (conference presentations, peer-to-peer, advisory boards) — specialty is KOL-driven.
4. **Safety profile** (long-term safety, infection risk, malignancy risk) — important for chronic therapy.
5. **Administration convenience** (self-injection, oral, infusion frequency) — patient preference matters.
6. **Payer coverage** (step therapy requirements, biologic tiers, prior authorization burden).
7. **Competitive density** (many biologics competing in same space).

Generate signals specific to dermatology dynamics.`,

    pulmonology: `DOMAIN: PULMONOLOGY
Pulmonology adoption depends on: Clinical evidence → Guideline positioning → Administration feasibility → Payer coverage.
Key drivers:
1. **Clinical evidence** (lung function improvement, exacerbation reduction, sputum conversion) — endpoints matter.
2. **Administration route** (nebulized vs inhaled vs oral vs IV) — delivery complexity affects adoption.
3. **Guideline positioning** (ATS/IDSA guidelines, treatment algorithms) — specialty follows guidelines.
4. **Payer coverage** (specialty pharmacy, REMS programs, buy-and-bill) — access critical.
5. **Treatment duration** (chronic vs defined course, compliance burden).
6. **Competitor landscape** (SOC alternatives, pipeline therapies).
7. **Specialty infrastructure** (need for monitoring, testing, follow-up).

Generate signals specific to pulmonology dynamics.`,

    immunology: `DOMAIN: IMMUNOLOGY / RHEUMATOLOGY
Adoption follows: Efficacy data → Guideline positioning → Payer tiering → KOL endorsement.
Key drivers:
1. **Efficacy endpoints** (ACR response, DAS28, remission rates, mucosal healing) — disease-specific measures.
2. **Safety profile** (infection risk, cardiovascular risk, malignancy) — long-term safety critical for chronic therapy.
3. **Mechanism differentiation** (TNF vs JAK vs IL-17 vs IL-23) — mechanism class matters.
4. **Payer coverage** (step therapy, fail-first requirements, biosimilar substitution).
5. **Administration** (oral vs subcutaneous vs IV, frequency).
6. **Guideline positioning** (ACR, EULAR, AGA treatment algorithms).
7. **Competitive density** (mature biologic market, biosimilar competition).

Generate signals specific to immunology/rheumatology dynamics.`,

    general: `DOMAIN: GENERAL PHARMACEUTICAL
Generate signals covering the standard pharmaceutical adoption framework:
1. **Clinical evidence** — efficacy data, trial results, real-world evidence.
2. **Guideline positioning** — treatment algorithm placement, society recommendations.
3. **Payer/market access** — formulary status, prior authorization, reimbursement.
4. **Physician behavior** — prescribing patterns, KOL influence, switching inertia.
5. **Competitive landscape** — existing SOC, pipeline threats, generic/biosimilar erosion.
6. **Patient factors** — demand, adherence, quality of life impact.

Generate signals appropriate to the therapeutic context described in the question.`,
  };

  return contexts[area] || contexts.general;
}

router.post("/ai-signals/generate", async (req, res) => {
  try {
    const body = req.body as SignalGenerationRequest;

    if (!body.subject || !body.questionText) {
      res.status(400).json({ error: "subject and questionText are required" });
      return;
    }

    const therapeuticArea = detectTherapeuticArea(body.subject, body.questionText);
    const domainContext = getDomainContext(therapeuticArea);

    const systemPrompt = `You are a pharmaceutical market intelligence analyst specializing in HCP adoption forecasting. You generate domain-specific analytical signals for forecasting questions.

${domainContext}

SIGNAL GENERATION RULES:
1. Generate signals as specific analytical drivers — concrete statements about factors that drive the forecast.
2. Frame signals as domain-specific analytical statements, e.g. "Phase 3 trial demonstrates statistically significant improvement in overall survival" or "NCCN includes therapy as preferred first-line option" — NOT generic statements like "investigate whether the drug works."
3. These are ANALYTICAL FRAMEWORK signals — they describe the TYPES of evidence and factors that matter. They are not fabricated specific facts about this particular drug.
4. Each signal represents a driver category that the forecaster should evaluate. The signal text states the condition. The reliability indicates how established this type of driver typically is.
5. DO NOT fabricate specific numbers (response rates, dates, p-values) unless you are certain they are publicly known facts. Instead, describe the driver qualitatively.
6. DO NOT invent FDA approval dates or specific trial results you are unsure about.

For each signal, provide:
- **text**: A specific analytical driver statement relevant to this therapeutic area
- **category**: one of "evidence", "access", "competition", "guideline", "timing", "adoption"
- **direction**: "positive" (favors the outcome), "negative" (opposes), or "neutral" (depends on findings)
- **strength**: "High", "Medium", or "Low" — how much this factor impacts the forecast
- **reliability**: "Confirmed" (well-established market dynamic), "Probable" (likely applicable), "Speculative" (uncertain applicability)
- **source_type**: e.g. "clinical_trial", "fda_database", "payer_landscape", "kol_sentiment", "guidelines", "competitive_intel", "prescribing_data"
- **rationale**: Why this driver matters for the forecast and its weight

IMPACT LOGIC (domain-specific):
- Core efficacy endpoints (survival in oncology, PASI in derm) → High strength, Confirmed reliability
- Guideline inclusion/positioning → High strength, Confirmed reliability
- Payer coverage/access dynamics → High strength, Probable reliability
- Safety/tolerability profile → High strength, Probable reliability
- KOL endorsement/sentiment → Medium strength, Probable reliability
- Administration complexity → Medium strength, Confirmed reliability
- Competitive pressure → Medium-High strength, Probable reliability
- Patient demand/advocacy → Low-Medium strength, Speculative reliability

Generate 8-12 signals covering the PRIMARY DRIVERS first (highest impact), then supporting signals. Ensure coverage across evidence, access, competition, guideline, and adoption categories.

For incoming_events, generate 5 domain-specific events that the forecaster should monitor:
{
  "id": "ev-N",
  "title": "Short event title",
  "type": "evidence|access|competition|guideline|adoption",
  "description": "What this event is and when it might occur",
  "relevance": "Why it matters for this forecast"
}

For market_summary: Provide a 2-3 sentence domain-specific analytical summary of the key dynamics that will drive this forecast. Reference the therapeutic area and its specific adoption patterns.

Also include:
- **therapeutic_area**: "${therapeuticArea}" (the detected therapeutic area)

Return ONLY valid JSON:
{
  "signals": [...],
  "incoming_events": [...],
  "market_summary": "...",
  "therapeutic_area": "${therapeuticArea}"
}`;

    const userPrompt = `Generate domain-specific analytical signals for this ${therapeuticArea} forecasting question:

**Subject/Brand**: ${body.subject}
**Forecasting Question**: ${body.questionText}
**Predicted Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Question Type**: ${body.questionType || "binary"}
${body.entities?.length ? `**Comparison Groups**: ${body.entities.join(" vs ")}` : ""}

Generate signals that reflect ${therapeuticArea}-specific adoption dynamics. Primary drivers first (highest impact on the forecast), then supporting signals.`;

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
