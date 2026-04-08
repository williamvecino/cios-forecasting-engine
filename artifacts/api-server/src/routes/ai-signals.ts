import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { researchBrand } from "../lib/web-research";
import { isSafetyRiskCase, isRegulatoryCase } from "../lib/case-type-router.js";
import { buildCaseFrame, buildFrameConstraintPrompt, filterSignalsByFrame, scoreSignalRelevance, type CaseFrame } from "../lib/case-framing.js";
import { buildGapGuardPromptBlock, scanObjectForGapViolations, replaceGapPhrases } from "../lib/narrative-gap-guard.js";
import { runStructuredEvidenceSearch, buildFullSearchQueries, buildGapSearchQueries, type EvidenceCandidate } from "../lib/structured-evidence-search.js";

const router = Router();

const ADOPTION_MECHANISM_FAMILIES = [
  { id: "clinical_evidence_strength", label: "Clinical Evidence Strength", keywords: ["trial", "efficacy", "endpoint", "phase", "pivotal", "data", "evidence", "clinical", "study", "outcome"] },
  { id: "guideline_soc_movement", label: "Guideline / Standard-of-Care Movement", keywords: ["guideline", "recommendation", "standard of care", "consensus", "nccn", "asco", "idsa", "ats", "endorsement", "positioning"] },
  { id: "access_reimbursement", label: "Access / Reimbursement", keywords: ["payer", "formulary", "prior auth", "step therapy", "coverage", "reimbursement", "copay", "access", "restriction", "tier"] },
  { id: "prescriber_behavior", label: "Prescriber Behavior", keywords: ["prescrib", "physician", "clinician", "adoption", "intent", "familiarity", "comfort", "experience", "uptake", "switching"] },
  { id: "operational_delivery_friction", label: "Operational / Delivery Friction", keywords: ["administration", "infusion", "nebuliz", "inhal", "injection", "workflow", "training", "burden", "logistic", "compliance"] },
  { id: "competitive_soc_pressure", label: "Competitive / Standard-of-Care Pressure", keywords: ["competitor", "competing", "entrenched", "incumbent", "alternative", "standard of care", "sequencing", "inertia", "displacement"] },
  { id: "launch_market_signals", label: "Launch / Market Signals", keywords: ["launch", "kol", "awareness", "education", "field force", "medical affairs", "advocacy", "market shaping", "readiness"] },
] as const;

type AdoptionMechanismId = typeof ADOPTION_MECHANISM_FAMILIES[number]["id"];

function isAdoptionCase(caseFrame: CaseFrame): boolean {
  return caseFrame.caseType === "clinical_adoption" ||
    caseFrame.profileCaseType === "clinical_adoption" ||
    caseFrame.archetypeLabel.toLowerCase().includes("adoption");
}

function hasThresholdAndTimeWindow(questionText: string): boolean {
  const hasThreshold = /(?:≥|>=|at least|reach|exceed|achieve)\s*\d+/i.test(questionText) ||
    /\d+\s*%/i.test(questionText);
  const hasTimeWindow = /within\s+\d+\s*(month|year|week)/i.test(questionText) ||
    /by\s+(q[1-4]|20\d\d|end of|year)/i.test(questionText) ||
    /\d+[\s-]*(month|year)/i.test(questionText);
  return hasThreshold && hasTimeWindow;
}

interface MechanismCoverage {
  family_id: string;
  family_label: string;
  covered: boolean;
  signal_count: number;
  signal_ids: string[];
}

interface AdoptionCoverageAnalysis {
  mechanism_coverage: MechanismCoverage[];
  covered_count: number;
  total_families: number;
  missing_families: string[];
  dominant_supportive_driver: string | null;
  dominant_constraining_driver: string | null;
  is_under_specified: boolean;
  sufficiency_warning: string | null;
}

function computeAdoptionCoverage(signals: any[]): AdoptionCoverageAnalysis {
  const accepted = signals.filter((s: any) => s.text);

  const coverage: MechanismCoverage[] = ADOPTION_MECHANISM_FAMILIES.map((fam) => {
    const matching = accepted.filter((s: any) => {
      const text = ((s.text || "") + " " + (s.rationale || "")).toLowerCase();
      return fam.keywords.some((kw) => text.includes(kw));
    });
    return {
      family_id: fam.id,
      family_label: fam.label,
      covered: matching.length > 0,
      signal_count: matching.length,
      signal_ids: matching.map((_: any, i: number) => `sig-${i}`),
    };
  });

  const coveredCount = coverage.filter((c) => c.covered).length;
  const missingFamilies = coverage.filter((c) => !c.covered).map((c) => c.family_label);

  const supportive = accepted.filter((s: any) =>
    s.direction === "increases_probability" || s.direction === "positive"
  );
  const constraining = accepted.filter((s: any) =>
    s.direction === "decreases_probability" || s.direction === "negative"
  );

  const highSupportive = supportive.filter((s: any) => s.strength === "High");
  const highConstraining = constraining.filter((s: any) => s.strength === "High");

  const dominantSupportive = highSupportive.length > 0
    ? highSupportive[0].text
    : supportive.length > 0 ? supportive[0].text : null;

  const dominantConstraining = highConstraining.length > 0
    ? highConstraining[0].text
    : constraining.length > 0 ? constraining[0].text : null;

  const distinctSignals = accepted.length;
  const isUnderSpecified = distinctSignals < 6 || coveredCount < 4;

  let sufficiencyWarning: string | null = null;
  if (distinctSignals < 6) {
    sufficiencyWarning = `Signal set may be incomplete — ${distinctSignals} signals generated, but adoption cases typically require 6–8 materially distinct signals across major driver families. Additional driver families should be explored.`;
  } else if (distinctSignals < 8 && missingFamilies.length >= 3) {
    sufficiencyWarning = `Signal coverage is thin — ${missingFamilies.length} mechanism families have no signals. Consider exploring: ${missingFamilies.join(", ")}.`;
  }

  return {
    mechanism_coverage: coverage,
    covered_count: coveredCount,
    total_families: ADOPTION_MECHANISM_FAMILIES.length,
    missing_families: missingFamilies,
    dominant_supportive_driver: dominantSupportive,
    dominant_constraining_driver: dominantConstraining,
    is_under_specified: isUnderSpecified,
    sufficiency_warning: sufficiencyWarning,
  };
}

function buildAdoptionSignalSummary(coverage: AdoptionCoverageAnalysis): string {
  const parts: string[] = [];

  if (coverage.dominant_supportive_driver) {
    const truncated = coverage.dominant_supportive_driver.length > 120
      ? coverage.dominant_supportive_driver.slice(0, 117) + "..."
      : coverage.dominant_supportive_driver;
    parts.push(`Dominant supportive driver: ${truncated}`);
  }

  if (coverage.dominant_constraining_driver) {
    const truncated = coverage.dominant_constraining_driver.length > 120
      ? coverage.dominant_constraining_driver.slice(0, 117) + "..."
      : coverage.dominant_constraining_driver;
    parts.push(`Dominant constraining driver: ${truncated}`);
  }

  if (coverage.missing_families.length > 0) {
    parts.push(`Missing mechanism families: ${coverage.missing_families.join(", ")}`);
  }

  if (coverage.is_under_specified) {
    parts.push("Case may be under-specified — additional signals needed for a robust forecast.");
  }

  return parts.join(" | ");
}

function buildAdoptionExpansionPrompt(questionText: string): string {
  const hasThreshold = hasThresholdAndTimeWindow(questionText);

  let prompt = `
ADOPTION CASE — EXPANDED SIGNAL GENERATION RULES:

This is an adoption forecast. You MUST generate signals across ALL of these mechanism families, not just broad categories. For each family, generate at least one causally relevant signal. If a family genuinely has no applicable signal for this specific case, explicitly note it as a gap.

REQUIRED MECHANISM FAMILIES (generate at least one signal per family):
1. CLINICAL EVIDENCE STRENGTH — Strength of pivotal evidence supporting the specific use asked about. Name the specific trial(s), endpoint(s), and effect size(s).
2. GUIDELINE / STANDARD-OF-CARE MOVEMENT — Current and anticipated guideline positioning. Name specific guideline bodies and their current stance.
3. ACCESS / REIMBURSEMENT — Formulary inclusion, prior authorization requirements, step therapy restrictions, payer coverage status.
4. PRESCRIBER BEHAVIOR — Physician prescribing intent, familiarity, comfort level, and adoption trajectory for this specific use.
5. OPERATIONAL / DELIVERY FRICTION — Administration complexity, workflow burden, training requirements, logistical barriers specific to this therapy.
6. COMPETITIVE / STANDARD-OF-CARE PRESSURE — Current treatment-sequencing inertia, competing standard-of-care entrenchment, switching costs.
7. LAUNCH / MARKET SIGNALS — KOL support, medical education activity, field force coverage, market-shaping efforts.

MINIMUM COVERAGE RULE: You MUST attempt coverage across ALL 7 mechanism families before presenting the signal set. If a family has no candidate signal, state: "No signal identified for [family name] — this is a coverage gap."

MINIMUM SIGNAL COUNT: For adoption cases, generate at least 8 materially distinct signals. If you cannot reach 8 distinct signals, add a note: "Signal set may be incomplete — additional driver families should be explored."

ADOPTION-SPECIFIC DRIVER SUGGESTIONS — consider these signal types if applicable:
- Strength of pivotal evidence for the specific line/use asked about
- Likelihood and timing of guideline endorsement for the asked use
- Physician prescribing intent for the specific use
- Formulary inclusion without restrictive controls
- Current treatment-sequencing inertia among target prescribers
- Operational burden of therapy administration in the target setting
- KOL support for the specific positioning asked about
- Competing standard-of-care entrenchment`;

  if (hasThreshold) {
    prompt += `

THRESHOLD-WINDOW EXPANSION: This question specifies both an adoption threshold and a time window. Apply the adoption-specific driver library:
- For EACH mechanism family, assess whether it can achieve the required threshold within the time window
- Generate signals that specifically address the feasibility of reaching the threshold, not just general adoption direction
- Include at least one signal about treatment-sequencing inertia (how entrenched is the current standard of care?)
- Include at least one signal about operational barriers specific to reaching the target level`;
  }

  return prompt;
}

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

    const caseFrame = buildCaseFrame(body.questionText, body.subject, therapeuticArea, null);

    const research = await researchBrand(body.subject, body.questionText, sanitizedKeywords);
    const hasResearch = research.newsHeadlines.length > 0;

    const systemPrompt = `You are a pharmaceutical market intelligence analyst. Given a specific brand/therapy and a forecasting question, you must generate structured, multi-source signals that drive the forecast.

A BRAND DEVELOPMENT CHECK has been performed. ${hasResearch
  ? "Real-time web research found recent developments. You MUST convert these into structured signals FIRST, before generating any derived signals."
  : "No recent verified brand developments were found from web research. You MUST still use your training knowledge about this specific product to generate brand-specific signals."}

CRITICAL RULES:

0. BRAND SPECIFICITY — ABSOLUTE REQUIREMENT: Every signal text MUST name the actual product, disease, trial, mechanism, or competitive product. NEVER generate signals with generic text like "Early launch trajectory tracking above historical comparators" or "Patient awareness campaigns driving demand-side pull" or "Favorable guideline positioning supporting rapid initial uptake." These are banned template phrases. Instead, name the SPECIFIC trial (e.g. CONVERT, ENCORE), the SPECIFIC disease (e.g. MAC lung disease, refractory NTM), the SPECIFIC mechanism (e.g. nebulized liposomal amikacin), and the SPECIFIC competitors or guidelines. If you cannot name the specific details, state what is unknown rather than substituting generic filler. A signal that could apply to any drug in any therapeutic area is ALWAYS wrong.

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
- **signal_family**: one of "Clinical Efficacy", "Safety / Tolerability", "Regulatory Status", "Manufacturing / Readiness", "Access / Payer", "Guideline / KOL", "Field Adoption Behavior", "Competitive Moves", "Operational Execution", "Message / Perception"
- **signal_class**: "observed" | "derived" | "uncertainty"
- **signal_source**: "internal" | "external" | "missing"
- **category**: one of "evidence", "access", "competition", "guideline", "timing", "adoption"
- **signal_domain**: one of "clinical_evidence", "safety_pharmacovigilance", "regulatory_activity", "guideline_activity", "market_access", "operational_readiness", "competitive_dynamics", "legal_litigation"
- **direction**: "increases_probability", "decreases_probability", "signals_uncertainty", "signals_risk_escalation", "operational_readiness", "market_response"
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

DEDUPLICATION RULES — apply strictly:
- NEVER generate two signals that describe the same underlying fact, event, or inference from different angles. Each signal must represent a DISTINCT piece of evidence or reasoning.
- If two candidate signals share >80% of the same factual basis, MERGE them into one signal that captures the complete picture.
- Before finalizing, review all signals and remove any that are semantically redundant with another signal already in the list.

Generate 8-15 causally relevant, non-redundant signals. Observed brand developments first, then derived signals, then uncertainties. Only include signals from families that directly influence the decision mechanism.

For incoming_events, generate 5 events the forecaster should monitor:
{ "id": "ev-N", "title": "...", "type": "evidence|access|competition|guideline|adoption", "description": "...", "relevance": "..." }

For market_summary: 2-3 sentences starting with the most important recent development if one exists.

For question_translation_summary: Write 2-3 sentences explaining the translation distance between the strongest brand signal and the specific question asked. Quantify the distance with specific metrics — do NOT use vague phrases like "deserves", "ready to deliver", "market readiness", "opportunity gap", or "performance gap" without numeric definitions. For example: "ENCORE data strengthens the clinical case for Arikayce broadly (HR 0.70, p<0.001), but the question asks about first-line adoption specifically. Current label covers second-line only, 0 of 5 major guidelines recommend first-line use, and 2 of 3 national payers restrict to second-line — creating a measurable translation distance between the clinical signal and the specific adoption outcome."
${buildGapGuardPromptBlock()}

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
      researchSection = `\n\nBRAND DEVELOPMENT CHECK: No recent verified brand developments found via live search for "${body.subject}". However, you MUST still use your training knowledge about this specific product/brand. You know the clinical trial history, mechanism of action, approved indications, competitive landscape, and key milestones for major pharmaceutical products. USE THAT KNOWLEDGE to generate product-specific signals. Classify them as "derived" (not "observed") since they are not from a live source, but they must still reference the ACTUAL product details — real trial names, real indications, real competitive products, real regulatory history. Do NOT fall back to generic adoption templates.`;
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

Convert relevant verified brand developments into observed signals first, then add derived implications and uncertainties.

${buildFrameConstraintPrompt(caseFrame)}

${isAdoptionCase(caseFrame) ? buildAdoptionExpansionPrompt(body.questionText) : ""}

${isSafetyRiskCase(body.questionText) ? `SAFETY/RISK CASE RULES:
- This is a safety/risk case. Safety signals are PRIMARY drivers with highest weight.
- Media/advocacy signals are INFLUENCE FACTORS only — downweight them relative to clinical evidence and regulatory review.
- A positive payer/access signal implies access conditions (step therapy, prior authorization), NOT adoption decline.
- Time constraints modify resolution speed (when the answer arrives), NOT outcome probability.
- Use "use" instead of "adoption", "continuation" instead of "growth", "clinician" instead of "prescriber".
- Direction validation: for restriction-outcome questions, a "Positive" access/payer signal should have direction "Negative" (it reduces restriction probability).
- Feasibility timelines affect how quickly the safety question will be resolved, NOT whether restrictions will happen.` : ""}
${(isSafetyRiskCase(body.questionText) || isRegulatoryCase(body.questionText)) ? `REGULATORY/SAFETY CASE DOMAIN RULES:
- This is a regulatory/safety-risk case about label changes, black box warnings, REMS, safety signals, or FDA/EMA safety actions.
- ALLOWED signal domains: safety evidence, regulatory activity, pharmacovigilance data, legal developments (lawsuits, settlements, DOJ actions), clinical guideline changes, and safety warnings.
- EXCLUDED signal domains: Do NOT generate system_operational signals (manufacturing, supply chain, inventory, packaging, launch readiness, production capacity, commercial inventory). These are irrelevant to regulatory safety outcomes.
- Signal families to prioritize: brand_clinical_regulatory (safety data, regulatory filings, label history), patient_demand (adverse event reports, patient safety complaints), competitor (competitor safety comparisons).
- De-prioritize: provider_behavioral (unless about prescribing behavior changes DUE TO safety concerns), payer_access (unless about formulary restrictions DUE TO safety concerns).
- Use "label change" instead of "adoption", "regulatory action" instead of "launch", "safety profile" instead of "market positioning".
- Every signal must be evaluated for its causal impact on the REGULATORY OUTCOME (e.g., probability of FDA label change, black box warning, or REMS requirement within the time horizon).` : ""}`;

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

    const gapViolations = scanObjectForGapViolations(parsed);
    if (gapViolations.length > 0) {
      console.warn(`[gap-guard] Found ${gapViolations.length} gap violations in AI response, cleaning...`);
      if (typeof parsed.constraint_explanation === "string") {
        parsed.constraint_explanation = replaceGapPhrases(parsed.constraint_explanation);
      }
      if (Array.isArray(parsed.event_gates)) {
        for (const gate of parsed.event_gates) {
          if (typeof gate.reasoning === "string") gate.reasoning = replaceGapPhrases(gate.reasoning);
          if (typeof gate.description === "string") gate.description = replaceGapPhrases(gate.description);
        }
      }
      if (typeof parsed.market_summary === "string") {
        parsed.market_summary = replaceGapPhrases(parsed.market_summary);
      }
      if (typeof parsed.question_translation_summary === "string") {
        parsed.question_translation_summary = replaceGapPhrases(parsed.question_translation_summary);
      }
      if (Array.isArray(parsed.signals)) {
        for (const sig of parsed.signals) {
          if (typeof sig.text === "string") sig.text = replaceGapPhrases(sig.text);
          if (typeof sig.rationale === "string") sig.rationale = replaceGapPhrases(sig.rationale);
          if (typeof sig.question_relevance_note === "string") sig.question_relevance_note = replaceGapPhrases(sig.question_relevance_note);
        }
      }
    }

    if (Array.isArray(parsed.signals)) {
      const frameResult = filterSignalsByFrame(parsed.signals, caseFrame);
      parsed.signals = frameResult.accepted;
      if (frameResult.rejected.length > 0) {
        parsed.frame_filtered_count = frameResult.rejected.length;
      }
    }

    if (Array.isArray(parsed.signals)) {
      const VALID_DIRECTIONS = new Set(["increases_probability", "decreases_probability", "signals_uncertainty", "signals_risk_escalation", "operational_readiness", "market_response"]);
      const VALID_DOMAINS = new Set(["clinical_evidence", "safety_pharmacovigilance", "regulatory_activity", "guideline_activity", "market_access", "operational_readiness", "competitive_dynamics", "legal_litigation"]);
      const LEGACY_DIRECTION_MAP: Record<string, string> = { positive: "increases_probability", negative: "decreases_probability", neutral: "signals_uncertainty" };
      parsed.signals = parsed.signals.map((s: any) => {
        if (s.direction && !VALID_DIRECTIONS.has(s.direction)) {
          s.direction = LEGACY_DIRECTION_MAP[s.direction] || "signals_uncertainty";
        }
        if (s.signal_domain && !VALID_DOMAINS.has(s.signal_domain)) {
          s.signal_domain = "clinical_evidence";
        }
        if (!s.signal_domain) {
          s.signal_domain = "clinical_evidence";
        }
        return s;
      });

      parsed.signals = parsed.signals.map((s: any) => {
        s.frame_relevance_score = scoreSignalRelevance(s, caseFrame);
        return s;
      });

      const seen: string[] = [];
      parsed.signals = parsed.signals.filter((s: any) => {
        const tokens = new Set<string>((s.text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w: string) => w.length > 3));
        for (const prev of seen) {
          const prevTokens = new Set<string>(prev.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w: string) => w.length > 3));
          const intersection = [...tokens].filter((t: string) => prevTokens.has(t)).length;
          const union = new Set<string>([...tokens, ...prevTokens]).size;
          if (union > 0 && intersection / union > 0.7) return false;
        }
        seen.push(s.text || "");
        return true;
      });

      const GENERIC_PHRASES = [
        "launch trajectory tracking above historical comparators",
        "patient awareness campaigns driving demand",
        "favorable guideline positioning supporting rapid",
        "market access barriers may cap penetration below target threshold",
        "strong clinical data supporting",
        "competitive landscape creating pressure",
        "real-world evidence generation",
        "tracking above historical",
        "driving demand-side pull",
        "supporting rapid initial uptake",
        "cap penetration below target",
        "creating competitive pressure",
        "early adoption momentum",
        "favorable positioning supporting",
        "awareness campaigns driving",
      ];
      parsed.signals = parsed.signals.filter((s: any) => {
        const text = (s.text || "").toLowerCase().trim();
        const matchesGeneric = GENERIC_PHRASES.some(phrase => text.includes(phrase));
        if (matchesGeneric) {
          console.warn(`[signal-filter] Removed generic signal: "${(s.text || "").slice(0, 100)}"`);
          return false;
        }
        return true;
      });
    }

    parsed.case_frame = {
      caseType: caseFrame.caseType,
      profileCaseType: caseFrame.profileCaseType,
      primaryDecisionMechanism: caseFrame.primaryDecisionMechanism,
      decisionGrammar: caseFrame.decisionGrammar,
      allowedSignalFamilies: caseFrame.allowedSignalFamilies,
      forbiddenSignalFamilies: caseFrame.forbiddenSignalFamilies,
      prioritizedFamilies: caseFrame.prioritizedFamilies,
    };

    if (isAdoptionCase(caseFrame) && Array.isArray(parsed.signals)) {
      const coverageAnalysis = computeAdoptionCoverage(parsed.signals);
      parsed.adoption_coverage = coverageAnalysis;
      parsed.signal_summary = buildAdoptionSignalSummary(coverageAnalysis);
      if (coverageAnalysis.sufficiency_warning) {
        parsed.sufficiency_warning = coverageAnalysis.sufficiency_warning;
      }
    }

    res.json(parsed);
  } catch (err: any) {
    console.error("AI signal generation error:", err);
    res.status(500).json({ error: "Failed to generate AI signals" });
  }
});

router.post("/ai-signals/structured-search", async (req, res) => {
  try {
    const { subject, indication, questionText } = req.body;
    if (!subject) {
      return res.status(400).json({ error: "subject (drug name) is required" });
    }

    const drugName = subject;
    const diseaseState = indication || "";
    const categories = buildFullSearchQueries(drugName, diseaseState);

    const result = await runStructuredEvidenceSearch(drugName, diseaseState, categories);

    res.json({
      signals: result.candidates.map((c) => ({
        tempId: c.tempId,
        text: c.finding,
        trialName: c.trialName,
        pmid: c.pmid,
        source_url: c.sourceUrl,
        source_title: c.sourceTitle,
        category: mapCategoryToSignalCategory(c.category),
        signal_family: mapCategoryToFamily(c.category),
        signal_class: "observed" as const,
        signal_source: "external" as const,
        signal_domain: mapCategoryToDomain(c.category),
        direction: c.direction === "Positive" ? "increases_probability" : "decreases_probability",
        strength: c.strengthScore >= 4 ? "High" : c.strengthScore >= 2 ? "Medium" : "Low",
        reliability: c.reliabilityScore >= 4 ? "Confirmed" : c.reliabilityScore >= 2 ? "Probable" : "Speculative",
        evidenceCategory: c.category,
        signalType: c.signalType,
        brand_verified: true,
        rationale: c.finding,
        countTowardPosterior: false,
      })),
      categoriesSearched: result.categoriesSearched,
      searchType: "structured_evidence",
      drugName,
      indication: diseaseState,
    });
  } catch (err: any) {
    console.error("Structured search error:", err);
    res.status(500).json({ error: "Structured evidence search failed" });
  }
});

function mapCategoryToSignalCategory(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes("clinical") || lower.includes("trial")) return "evidence";
  if (lower.includes("label") || lower.includes("regulatory") || lower.includes("fda")) return "evidence";
  if (lower.includes("guideline")) return "guideline";
  if (lower.includes("safety")) return "evidence";
  if (lower.includes("payer") || lower.includes("access")) return "access";
  if (lower.includes("launch") || lower.includes("market")) return "adoption";
  if (lower.includes("compet")) return "competition";
  return "evidence";
}

function mapCategoryToFamily(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes("clinical") || lower.includes("trial")) return "brand_clinical_regulatory";
  if (lower.includes("label") || lower.includes("regulatory")) return "brand_clinical_regulatory";
  if (lower.includes("guideline")) return "brand_clinical_regulatory";
  if (lower.includes("safety")) return "brand_clinical_regulatory";
  if (lower.includes("payer") || lower.includes("access")) return "payer_access";
  if (lower.includes("launch") || lower.includes("market")) return "provider_behavioral";
  if (lower.includes("compet")) return "competitor";
  if (lower.includes("prescrib")) return "provider_behavioral";
  if (lower.includes("operational")) return "system_operational";
  return "brand_clinical_regulatory";
}

function mapCategoryToDomain(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes("clinical") || lower.includes("trial")) return "clinical_evidence";
  if (lower.includes("label") || lower.includes("regulatory")) return "regulatory_activity";
  if (lower.includes("guideline")) return "guideline_activity";
  if (lower.includes("safety")) return "safety_pharmacovigilance";
  if (lower.includes("payer") || lower.includes("access")) return "market_access";
  if (lower.includes("launch") || lower.includes("market")) return "operational_readiness";
  if (lower.includes("compet")) return "competitive_dynamics";
  return "clinical_evidence";
}

router.post("/ai-signals/completeness", async (req, res) => {
  try {
    const { question, questionType, subject, existingSignals, missingFamilies, indication } = req.body;
    if (!question || !subject) {
      res.status(400).json({ error: "question and subject are required" });
      return;
    }

    if (Array.isArray(missingFamilies) && missingFamilies.length > 0) {
      const diseaseState = indication || "";
      const gapCategories = buildGapSearchQueries(subject, diseaseState, missingFamilies);

      if (gapCategories.length > 0) {
        const result = await runStructuredEvidenceSearch(subject, diseaseState, gapCategories);

        const suggestions = result.candidates.map((c) => ({
          text: c.finding,
          rationale: `Found via targeted search for missing ${c.category} coverage`,
          category: mapCategoryToSignalCategory(c.category),
          trialName: c.trialName,
          pmid: c.pmid,
          sourceUrl: c.sourceUrl,
          sourceTitle: c.sourceTitle,
          signalType: c.signalType,
          direction: c.direction,
          strengthScore: c.strengthScore,
          reliabilityScore: c.reliabilityScore,
          evidenceCategory: c.category,
          isStructuredResult: true,
          countTowardPosterior: false,
        }));

        res.json({ suggestions, searchType: "gap_targeted", gapsFilled: missingFamilies });
        return;
      }
    }

    const signalList = (existingSignals || []).slice(0, 30).map((t: string, i: number) => `${i + 1}. ${t}`).join("\n");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      seed: 42,
      messages: [
        {
          role: "system",
          content: `You are a pharmaceutical forecasting signal analyst. Given a forecasting question, subject, and existing signals, identify 3-5 important signals that are MISSING from the current set. Focus on signals that cover gaps in: economic drivers, structural defenses, competitive pressures, and execution capacity. Each suggestion must be specific and actionable, not generic.

Return JSON: { "suggestions": [{ "text": "...", "rationale": "why this is missing and important", "category": "economic|structural|competitive|execution" }] }`,
        },
        {
          role: "user",
          content: `Question: ${question}\nSubject: ${subject}\nQuestion type: ${questionType || "binary"}\n\nExisting signals:\n${signalList}\n\nWhat important signals are missing?`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const text = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err: any) {
    console.error("Signal completeness error:", err);
    res.status(500).json({ error: "Failed to analyze signal completeness" });
  }
});

router.post("/ai-signals/frame", async (req, res) => {
  try {
    const { questionText, subject, therapeuticArea, diseaseState } = req.body;
    if (!questionText || !subject) {
      res.status(400).json({ error: "questionText and subject are required" });
      return;
    }
    const frame = buildCaseFrame(questionText, subject, therapeuticArea, diseaseState);
    res.json(frame);
  } catch (err: any) {
    console.error("Case frame error:", err);
    res.status(500).json({ error: "Failed to build case frame" });
  }
});

export default router;
