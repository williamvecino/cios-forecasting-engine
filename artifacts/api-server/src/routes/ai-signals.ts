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
  keywords?: string[];
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

    const sanitizedKeywords = Array.isArray(body.keywords)
      ? body.keywords
          .filter((k): k is string => typeof k === "string")
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
          .slice(0, 5)
      : undefined;

    const therapeuticArea = detectTherapeuticArea(body.subject, body.questionText);

    const research = await researchBrand(body.subject, body.questionText, sanitizedKeywords);
    const hasResearch = research.newsHeadlines.length > 0;

    const systemPrompt = `You are a pharmaceutical market intelligence analyst. Given a specific brand/therapy and a forecasting question, you must generate structured, multi-source signals that drive the forecast.

A BRAND DEVELOPMENT CHECK has been performed. ${hasResearch
  ? "Real-time web research found recent developments. You MUST convert these into structured signals FIRST, before generating any derived or generic signals."
  : "No recent verified brand developments were found from web research."}

CRITICAL RULES:

1. Each case is unique. Do NOT apply generic templates. Evaluate this specific brand/product/question on its own merits.

2. DECISION MECHANISM RELEVANCE — This is the most important rule. Every signal must be CAUSALLY relevant to the DECISION MECHANISM in the question, not just topically related to the disease area or therapeutic category.

   BEFORE generating any signal, identify the decision mechanism:
   - Parse the question to find WHAT SPECIFIC EVENT or CONDITION drives the outcome
   - Only include signals that directly influence THAT mechanism
   - EXCLUDE signals that are merely in the same therapeutic area but don't causally affect the asked decision

   EXAMPLE: "Will publication of a Phase III trial accelerate adoption among cardiologists?"
   - Decision mechanism: publication → guideline response → physician behavior change
   - INCLUDE: publication timeline, guideline committee review status, KOL engagement with data, clinician prescribing patterns post-publication
   - EXCLUDE: general statin guideline changes, unrelated gene therapy launches, general cholesterol research — these are cardiovascular topics but NOT causally linked to the decision mechanism

   EXAMPLE: "Will payer restrictions delay uptake by more than 6 months?"
   - Decision mechanism: payer coverage decisions → formulary access → prescribing volume
   - INCLUDE: prior authorization requirements, step therapy policies, formulary review timelines
   - EXCLUDE: clinical trial results (unless directly cited by payers), general disease epidemiology

   Apply this filter BEFORE the question relevance translation below.

3. QUESTION RELEVANCE TRANSLATION — Every signal MUST be evaluated against THE SPECIFIC QUESTION being asked, not just the brand overall. A strong brand signal that does not directly answer the question must NOT be treated as if it does.

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

   FORECAST IMPACT RULE: This rule applies ONLY to UPSTREAM brand signals (e.g., positive trial data when the question is about market access). If a signal is an upstream brand development that doesn't directly address the decision mechanism, constrain its strength based on translation_confidence.
   
   However, signals that ARE PART OF the decision mechanism (e.g., guideline response when the question asks about guideline-driven adoption, prescribing behavior when the question asks about adoption) should use the IMPORTANCE CALIBRATION RULES below, NOT the translation_confidence constraint. These signals directly address the causal chain and should be weighted by their actual impact on the outcome.

3. SIGNAL FAMILIES — Every signal MUST belong to exactly one of these 6 families:
   - "brand_clinical_regulatory": trial readouts, label updates, safety signals, regulatory filings, guideline updates
   - "payer_access": coverage criteria, prior authorization, formulary status, reimbursement, patient cost burden
   - "competitor": competitor launches, competitor data, competitor safety issues, competitor pricing, positioning shifts
   - "patient_demand": symptom burden, treatment dissatisfaction, patient requests, discontinuation burden, advocacy activity
   - "provider_behavioral": specialty ownership, workflow resistance, prescribing familiarity, risk tolerance, referral dynamics, training readiness
   - "system_operational": equipment requirements, staffing limitations, protocol readiness, pharmacy/logistics burden, administration complexity

3. SIGNAL CLASSIFICATION — Every signal must be classified in TWO ways:

   signal_class (analytical origin):
   - "observed": Directly sourced from verified brand developments (press releases, trial results, FDA actions). MUST come first.
   - "derived": Reasonable inference from observed data or established market knowledge.
   - "uncertainty": Unresolved issue or open question to monitor.

   signal_source (controllability):
   - "internal": Controllable drivers — things the organization can act on (staffing, readiness, execution, internal processes, field force, manufacturing, launch preparation)
   - "external": Environment signals outside direct control (regulatory actions, competitor moves, market conditions, payer decisions, published evidence, guideline changes, patient demand trends)
   - "missing": Critical unknowns — information gaps that create forecast risk (unresolved decisions, pending data, unknown outcomes)

4. COVERAGE REQUIREMENT: Generate signals from the families that are CAUSALLY relevant to the decision mechanism identified in the question. You do NOT need all 6 families — only include families with signals that directly influence the causal chain. Aim for 8-15 high-quality, causally relevant signals rather than padding with irrelevant ones.

5. ORDER: Observed signals first (from brand development check), then derived signals, then uncertainties.

6. For observed signals from web research, include: source_url, observed_date, citation_excerpt, brand_verified: true.

7. Do NOT fabricate specific facts. For derived signals, mark brand_verified: false.

8. Therapeutic context (detected: ${therapeuticArea}) informs weighting and interpretation, but real brand/context signals always take precedence over archetype patterns.

IMPORTANCE CALIBRATION RULES — apply these strictly:
- If a signal describes an ADOPTION CONSTRAINT, EXECUTION BOTTLENECK, or SUPPLY DEPENDENCY → strength = "High"
- If a signal describes a PAYER RESTRICTION, ACCESS BARRIER, PRIOR AUTHORIZATION, or STEP THERAPY requirement → strength = "High"
- If a signal describes a RESOURCE SHORTFALL (staffing, capacity, field force readiness below target) → strength = "High"
- If a signal describes COMPETITIVE THREAT with direct impact on the forecast question → strength = "High"
- If a signal describes HEALTH ECONOMICS or COST-EFFECTIVENESS evidence → strength = "Medium" (influences payer decisions but rarely triggers adoption alone)
- If a signal provides SUPPORTING CONTEXT (advisory boards, formulary expansion) without directly constraining or enabling the outcome → strength = "Medium"
- If a signal is PERIPHERAL (investor events, conference presentations, general industry news) → strength = "Low"
- NEVER mark a signal as Low if it describes something that could block or materially delay the outcome

For each signal, provide:
- **text**: A specific analytical driver statement. For observed signals, cite the specific development.
- **signal_family**: one of "brand_clinical_regulatory", "payer_access", "competitor", "patient_demand", "provider_behavioral", "system_operational"
- **signal_class**: "observed" | "derived" | "uncertainty"
- **signal_source**: "internal" | "external" | "missing"
- **category**: one of "evidence", "access", "competition", "guideline", "timing", "adoption"
- **direction**: "positive", "negative", or "neutral"
- **strength**: "High", "Medium", or "Low" — calibrated using the IMPORTANCE CALIBRATION RULES above
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

Generate 8-15 causally relevant signals. Observed brand developments first, then derived signals, then uncertainties. Only include signals from families that directly influence the decision mechanism.

For incoming_events, generate 5 events the forecaster should monitor:
{ "id": "ev-N", "title": "...", "type": "evidence|access|competition|guideline|adoption", "description": "...", "relevance": "..." }

For market_summary: 2-3 sentences starting with the most important recent development if one exists.

For question_translation_summary: Write 2-3 sentences explaining the gap between the strongest brand signal and the specific question asked. For example: "ENCORE data strengthens the clinical case for Arikayce broadly, but the question asks about first-line adoption specifically. Current label, guidelines, and payer coverage do not yet support routine first-line use, creating a translation gap between the brand signal and the forecast outcome."

EVENT DECOMPOSITION LAYER — CRITICAL

For every question, you MUST decompose the asked outcome into gating conditions. The final forecast probability cannot exceed the weakest major gate. This prevents upstream brand strength from producing near-certain probability when specific conditions remain unresolved.

Analyze the question and produce "event_gates" — an array of 3-6 conditions that MUST all be met for the asked outcome to occur. Each gate has:
- **gate_id**: short identifier (e.g. "first_line_applicability")
- **gate_label**: human-readable label (e.g. "First-line applicability")
- **description**: 1-2 sentences explaining what this gate requires
- **status**: "strong" (evidence clearly supports), "moderate" (some evidence, plausible), "weak" (limited evidence, unlikely in horizon), "unresolved" (no evidence either way, open question)
- **reasoning**: 1-2 sentences explaining why this status was assigned based on current signals
- **constrains_probability_to**: a decimal 0-1 representing the maximum probability this gate alone would allow. "strong" gates allow 0.85-0.95, "moderate" gates allow 0.50-0.75, "weak" gates allow 0.15-0.35, "unresolved" gates allow 0.20-0.40.

Common gates to consider (include all that apply to the question):
- **Regulatory/label applicability**: Does the current label support the specific use asked about (e.g. first-line, combination, pediatric)?
- **Stakeholder applicability**: Does the signal apply to the specific prescriber type asked about?
- **Time horizon feasibility**: Can the required changes realistically happen within the asked timeframe?
- **Threshold attainability**: If a specific adoption target is asked about (e.g. ≥4 Rx/quarter, 20% share), can it be reached?
- **Access/reimbursement readiness**: Is payer coverage aligned with the asked use case?
- **Guideline/evidence support**: Do guidelines support the specific use asked about?

FORECAST CONSISTENCY RULE: The "constrained_probability" field must equal the MINIMUM of all gate constrains_probability_to values. If any gate is "weak" or "unresolved", the final constrained probability MUST be below 0.40. A near-certain forecast (>0.80) requires ALL major gates to be "strong" or "moderate".

Also produce:
- **brand_outlook_probability**: 0-1, what the probability would be if we only considered brand momentum and signal strength (the unconstrained view)
- **constrained_probability**: 0-1, the final probability after applying gate constraints (= minimum of all gate caps)
- **constraint_explanation**: 1-2 sentences explaining why the constrained probability differs from the brand outlook

Return ONLY valid JSON:
{
  "signals": [...],
  "incoming_events": [...],
  "market_summary": "...",
  "question_translation_summary": "...",
  "event_gates": [...],
  "brand_outlook_probability": 0.XX,
  "constrained_probability": 0.XX,
  "constraint_explanation": "...",
  "therapeutic_area": "${therapeuticArea}",
  "brand_check_performed": true,
  "verified_developments_found": ${hasResearch}
}`;

    let researchSection = "";
    if (hasResearch) {
      researchSection = `\n\n--- BRAND DEVELOPMENT CHECK RESULTS ---\n${research.combinedContext}\n--- END BRAND DEVELOPMENT CHECK ---\n\nIMPORTANT: Only convert brand developments into signals if they are CAUSALLY relevant to the decision mechanism in the question. Discard any news items that are merely in the same therapeutic area but do not directly affect the asked decision. For example, if the question asks about publication-driven adoption, discard general disease area news, unrelated product launches, or broad industry updates. Only include developments that influence the specific causal chain in the question.\n\nConvert relevant verified developments into "observed" signals with source_url, observed_date, citation_excerpt, and brand_verified: true. Then generate derived and uncertainty signals.`;
    } else {
      researchSection = `\n\nBRAND DEVELOPMENT CHECK: No recent verified brand developments found for "${body.subject}". Generate signals based on known market dynamics, but classify them as "derived" or "uncertainty" — not "observed". Every signal must be causally relevant to the decision mechanism in the question.`;
    }

    const keywordSection = sanitizedKeywords?.length
      ? `\n**Additional Focus Areas**: ${sanitizedKeywords.join(", ")}\nIMPORTANT: Pay special attention to signals related to these keywords. Search for and include any signals specifically addressing these topics.`
      : "";

    const userPrompt = `Generate multi-source structured signals for:

**Brand/Subject**: ${body.subject}
**Question**: ${body.questionText}
**Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Question Type**: ${body.questionType || "binary"}
${body.entities?.length ? `**Groups**: ${body.entities.join(" vs ")}` : ""}${keywordSection}${researchSection}

DECISION MECHANISM FILTER — APPLY BEFORE GENERATING ANY SIGNAL:
The question asks: "${body.questionText}"

Step 1: Identify the DECISION MECHANISM — what specific causal chain drives the outcome? Write it as: A → B → C → outcome.
Step 2: Generate AT LEAST ONE signal for EACH STEP in the causal chain (e.g., if the chain is "publication → guideline update → prescribing behavior change → adoption", you MUST generate signals about publication evidence, guideline response, AND prescribing behavior).
Step 3: For EVERY candidate signal, ask: "Does this signal directly influence a step in the causal chain?"
Step 4: If NO → EXCLUDE the signal entirely. Do not include it even if it's in the same disease area.

Signals must be CAUSAL, not merely TOPICAL. A signal about the same therapeutic area that does not affect the decision mechanism is noise.

CAUSAL CHAIN COVERAGE: You must cover the FULL chain. If the question implies physician behavior change, you MUST include provider_behavioral signals about prescribing patterns, adoption intent, or behavior change drivers — these are HIGH importance because they directly measure the outcome.

Generate signals from relevant families (you do not need all 6 if they are not causally relevant):
1. brand_clinical_regulatory — clinical/regulatory developments that affect the decision mechanism
2. payer_access — coverage/reimbursement factors that affect the decision mechanism
3. competitor — competitive dynamics that affect the decision mechanism
4. patient_demand — patient factors that affect the decision mechanism
5. provider_behavioral — physician behavior patterns that affect the decision mechanism (CRITICAL for adoption questions)
6. system_operational — operational/logistical factors that affect the decision mechanism

CRITICAL REMINDER — QUESTION RELEVANCE TRANSLATION:
Every signal must include applies_to_line_of_therapy, applies_to_stakeholder_group, applies_within_time_horizon, translation_confidence, and question_relevance_note.

- Evaluate each signal against THIS EXACT question.
- A strong positive brand development (e.g. positive trial data) should NOT automatically get "High" strength if it doesn't directly drive the specific outcome asked about.
- If a signal is an upstream positive but has uncertain conversion to the asked outcome, set translation_confidence: "low" or "moderate" and constrain strength accordingly.

Convert relevant verified brand developments into observed signals first, then add derived implications and uncertainties.`;

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
