import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getProfileForQuestion, buildVocabularyConstraintPrompt, buildDecisionLayerPrompt, buildDriverConstraintPrompt, buildSafetySignalPrompt, buildEvidenceGatePrompt, buildOutcomeStatePrompt, buildActionFilterPrompt, buildPropagationPathwayPrompt, buildDecisionSensitivityPrompt, getResponseModeLabel } from "../lib/case-type-router.js";
import { buildGapGuardPromptBlock, scanObjectForGapViolations, replaceGapPhrases } from "../lib/narrative-gap-guard.js";

const router = Router();

interface SignalDetail {
  signalId: string;
  description?: string;
  rawLikelihoodRatio?: number;
  effectiveLikelihoodRatio?: number;
  dependencyRole?: string;
  pointContribution?: number;
  correlationGroup?: string;
}

interface RespondRequest {
  subject: string;
  questionText: string;
  outcome?: string;
  timeHorizon?: string;
  probability?: number | null;
  constrainedProbability?: number | null;
  posteriorProbability?: number | null;
  thresholdProbability?: number | null;
  successDefinition?: string | null;
  outcomeThreshold?: string | null;
  strategicQuestion?: string | null;
  topConstraint?: string | null;
  topDriver?: string | null;
  signalDetails?: SignalDetail[];
  signals?: { text: string; direction: string; importance: string; confidence: string; source: string; signal_source?: string }[];
  derived_decisions?: {
    barriers: { title: string; rationale: string; severity_or_priority: string }[];
    actions: { title: string; rationale: string; severity_or_priority: string }[];
    segments: { title: string; rationale: string }[];
    trigger_events: { title: string; rationale: string }[];
    monitoring: { title: string; rationale: string }[];
  } | null;
  adoption_segmentation?: {
    early_adopters?: { segments: string[]; reason: string };
    persuadables?: { segments: string[]; reason: string };
  } | null;
  readiness_timeline?: {
    near_term_readiness?: string;
    trigger_events?: string[];
    dependencies?: string[];
    timing_risks?: string[];
  } | null;
  competitive_risk?: {
    incumbent_defense?: string;
    fast_follower_risk?: string;
  } | null;
}

router.post("/ai-respond/generate", async (req, res) => {
  try {
    const body = req.body as RespondRequest;

    if (!body.subject || !body.questionText) {
      res.status(400).json({ error: "subject and questionText are required" });
      return;
    }

    const posteriorPct = body.posteriorProbability != null ? Math.round(body.posteriorProbability * 100) : null;
    const thresholdPct = body.thresholdProbability != null ? Math.round(body.thresholdProbability * 100) : null;
    const fallbackProb = body.constrainedProbability ?? body.probability ?? null;
    const displayPct = posteriorPct ?? thresholdPct ?? (fallbackProb != null ? Math.round(fallbackProb * 100) : null);

    let probabilityFrame = "";
    if (displayPct != null) {
      if (displayPct >= 75) {
        probabilityFrame = `The probability of achieving the defined target is ${displayPct}% — verdict: LIKELY. Your narrative MUST reflect this — the recommendation should be about capitalizing on momentum and managing remaining risks, NOT about whether the outcome will happen.`;
      } else if (displayPct >= 60) {
        probabilityFrame = `The probability of achieving the defined target is ${displayPct}% — verdict: LIKELY. The outcome is more likely than not. Frame the narrative around what conditions must hold and what risks remain.`;
      } else if (displayPct >= 40) {
        probabilityFrame = `The probability of achieving the defined target is ${displayPct}% — verdict: UNCERTAIN. The outcome is genuinely uncertain. Do not say "likely" or "unlikely" — say "uncertain" or "conditional."`;
      } else {
        probabilityFrame = `The probability of achieving the defined target is ${displayPct}% — verdict: UNLIKELY. The outcome is unlikely given current evidence. Your narrative should reflect skepticism about the outcome occurring without significant changes.`;
      }
    }

    const caseTypeProfile = getProfileForQuestion(body.questionText);
    const isRegulatory = caseTypeProfile.caseType === "regulatory_approval";
    const isClinical = caseTypeProfile.caseType === "clinical_outcome";
    const vocabConstraints = buildVocabularyConstraintPrompt(caseTypeProfile);
    const decisionLayerConstraints = buildDecisionLayerPrompt(caseTypeProfile);
    const driverConstraints = buildDriverConstraintPrompt(caseTypeProfile);
    const safetyConstraints = buildSafetySignalPrompt(caseTypeProfile);
    const evidenceGateConstraints = buildEvidenceGatePrompt(caseTypeProfile);
    const outcomeStateConstraints = buildOutcomeStatePrompt(caseTypeProfile);
    const actionFilterConstraints = buildActionFilterPrompt(caseTypeProfile);
    const propagationConstraints = buildPropagationPathwayPrompt(caseTypeProfile);
    const sensitivityConstraints = buildDecisionSensitivityPrompt(caseTypeProfile);
    const responseModeLabel = getResponseModeLabel(caseTypeProfile.responseMode);

    const caseTypeLabel = isClinical ? "clinical trial strategy" : isRegulatory ? "regulatory" : "strategy";
    const caseTypeHeader = isClinical
      ? "\nThis is a CLINICAL OUTCOME case. All language, actions, and success measures must be trial-focused — NOT regulatory, commercial, or adoption-oriented.\n"
      : isRegulatory
        ? "\nThis is a REGULATORY APPROVAL case. All language, actions, and success measures must be regulatory — NOT commercial, adoption, or launch-oriented.\n"
        : "";

    const signalContext = buildSignalDetailContext(body.signalDetails || []);

    const systemPrompt = `You are a senior ${caseTypeLabel} advisor writing a concise executive launch strategy brief. Your output will be read by a decision-maker who needs to act, not analyze.
RESPONSE MODE: ${responseModeLabel}
${caseTypeHeader}
VOICE:
- Write like a trusted advisor speaking directly to the executive
- Short, declarative sentences. No filler. No hedging.
- State what is happening, what matters, what to do. Nothing else.
- Never use: "Bayesian", "posterior", "Brier score", "likelihood ratio", "prior odds"
- "Probability" is allowed but MUST always specify probability OF WHAT — always say "probability of achieving [the defined target] within [time horizon]"
- Never say only "unlikely" without completing the sentence with what is unlikely to be achieved
${vocabConstraints}${decisionLayerConstraints}${driverConstraints}${safetyConstraints}${evidenceGateConstraints}${outcomeStateConstraints}${actionFilterConstraints}${propagationConstraints}${sensitivityConstraints}
═══ PROBABILITY ALIGNMENT (MANDATORY) ═══
${probabilityFrame || "No probability provided. Generate response from signals and question context."}
The strategic_recommendation MUST be consistent with the probability. If the probability says likely, the recommendation must say likely. If the probability says unlikely, the recommendation must say unlikely. A contradiction between the computed probability and the narrative is a critical error.

CRITICAL DISTINCTION — TWO PROBABILITIES:
- "Probability of achieving the target" = ${thresholdPct != null ? `${thresholdPct}%` : "not provided"} — this is the probability that the defined adoption target will be reached within the time horizon. THIS is what the executive cares about.
- "Overall environment strength" = ${posteriorPct != null ? `${posteriorPct}%` : "not provided"} — this is the overall signal-adjusted probability reflecting the balance of all positive and negative evidence. This contextualizes the environment but is NOT the target probability.
Do NOT confuse these two numbers. When you say "probability," you mean probability of achieving the defined target.
═══ END PROBABILITY ALIGNMENT ═══
${buildGapGuardPromptBlock()}

STRUCTURE — return valid JSON with exactly these 4 keys:
{
  "strategic_recommendation": "One sentence. State whether the defined target is likely/unlikely to be achieved within the time horizon, at what probability, and name the primary reason. Example format: 'It is unlikely that [brand] will achieve [target] within [time], with a current [X]% probability of reaching this adoption target, primarily because [binding constraint].' MUST align with the computed probability.",
  "primary_constraint": "Two to four sentences maximum. Name the single primary binding constraint that is limiting the probability. Explain in plain language WHY this constraint matters for adoption. Do NOT list multiple constraints — identify the ONE that is most binding and explain its mechanism. Be specific to this case.",
  "highest_impact_lever": "Two to three sentences. Name the single action most likely to move the probability upward. Explain what kind of change is required and why it would work. Do NOT give generic advice — be specific to the signals and constraints in this case.",
  "realistic_ceiling": "One sentence. State the likely achievable range under current conditions without structural change. Example: 'Under current conditions, [brand] adoption is more likely to reach [realistic range] rather than the [target] threshold.'"
}

CRITICAL RULES:
- TRANSPARENCY IS MANDATORY. Every statement must explain WHY.
- strategic_recommendation: ONE SENTENCE ONLY. Must include the specific target definition, time horizon, probability percentage, and primary constraint. The reader must know: probability of WHAT, by WHEN, and WHY it is at this level. MUST reference the main positive support AND the main binding constraint by name (not by ID).
- primary_constraint: Name the SINGLE most binding constraint. Explain its mechanism in plain language. 2-4 sentences maximum. Do not list barriers — explain the one that matters most.
- highest_impact_lever: Name ONE specific action, not a list. Explain why THIS action would have the largest effect on probability. Must be operationally specific, not strategic platitude. The lever MUST be logically tied to the primary constraint.
- realistic_ceiling: ONE sentence describing what is achievable without removing the binding constraint.

═══ H2H / COMPARATIVE STUDY RECOMMENDATION GUARD (MANDATORY) ═══
NEVER recommend "conduct a head-to-head trial," "generate H2H data," or "publish comparative effectiveness data" as the highest_impact_lever UNLESS the signal stack already contains comparative or superiority data (e.g., an existing H2H trial result, a published comparative effectiveness study, or indirect comparison analysis). H2H is a valid signal type when data exists. It is NOT a valid recommendation when data does not exist. If no comparative data appears in the signals above, recommend actions that leverage EXISTING evidence strengths instead — publication strategy, KOL education, real-world evidence programs, or payer engagement.
═══ END H2H GUARD ═══

EXECUTIVE FORMATTING (MANDATORY):
- All probabilities must be displayed as rounded whole-number percentages (e.g. "18%" not "0.17860861821130714", "39%" not "0.3885")
- NEVER output raw decimal probabilities in any field
- NEVER include internal signal identifiers (e.g. CS-001, CS-002, SIG-xxx). Refer to signals by their descriptive name only (e.g. "CONVERT Phase III trial" not "CS-001")
- Write for an executive reader: concise, plain language, no technical notation`;

    const decisionContext = buildDecisionContext(body);

    const userPrompt = `Write an executive launch strategy brief for:

Subject: ${body.subject}
Strategic Question: ${body.strategicQuestion || body.questionText}
Success Definition: ${body.successDefinition || body.outcome || "adoption target"}
Outcome Threshold: ${body.outcomeThreshold || "Not specified"}
Time Horizon: ${body.timeHorizon || "12 months"}
Probability of Achieving Target: ${thresholdPct != null ? `${thresholdPct}%` : displayPct != null ? `${displayPct}%` : "Not yet calculated"}
Overall Environment Strength: ${posteriorPct != null ? `${posteriorPct}%` : "Not yet calculated"}

${signalContext}

${decisionContext}

Answer these executive questions in the structured format:
1. What is the probability of achieving this specific target, and is it likely or unlikely?
2. What is the primary constraint preventing a higher probability?
3. What single action would most move the probability?
4. What is realistically achievable under current conditions?`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "No response generated" });
      return;
    }

    const parsed = JSON.parse(content);

    // Signal-anchored overrides: primary_constraint and highest_impact_lever
    // are derived deterministically from the already-computed signalDetails
    // and buildNeedleMovement output, so the two fields cannot fabricate
    // signals that are not in the accepted ledger. strategic_recommendation
    // and realistic_ceiling remain LLM-generated.
    const needleMovement = buildNeedleMovement(body.signalDetails || []);
    const topNeg = [...(body.signalDetails || [])]
      .filter((s) => (s.pointContribution ?? 0) < 0)
      .sort((a, b) => (a.pointContribution ?? 0) - (b.pointContribution ?? 0))[0];

    const validated = {
      strategic_recommendation: typeof parsed.strategic_recommendation === "string"
        ? parsed.strategic_recommendation
        : parsed.strategic_recommendation?.headline || parsed.strategic_recommendation?.text || "Recommendation pending",
      primary_constraint: typeof parsed.primary_constraint === "string"
        ? parsed.primary_constraint
        : parsed.primary_constraint?.text || "",
      highest_impact_lever: typeof parsed.highest_impact_lever === "string"
        ? parsed.highest_impact_lever
        : parsed.highest_impact_lever?.text || "",
      realistic_ceiling: typeof parsed.realistic_ceiling === "string"
        ? parsed.realistic_ceiling
        : parsed.realistic_ceiling?.text || "",
    };

    if (topNeg) {
      const cleanDesc = stripSignalId(topNeg.description || "").trim();
      const ppDrag = Math.abs((topNeg.pointContribution ?? 0) * 100).toFixed(1);
      validated.primary_constraint = replaceGapPhrases(
        `The single binding constraint is ${cleanDesc} (${ppDrag}pp drag on the posterior).`
      );
    }
    const topStrategic = needleMovement?.recommended_actions?.strategic?.[0];
    if (topStrategic) {
      validated.highest_impact_lever = replaceGapPhrases(topStrategic);
    }

    const gapFields = {
      strategic_recommendation: validated.strategic_recommendation,
      primary_constraint: validated.primary_constraint,
      highest_impact_lever: validated.highest_impact_lever,
      realistic_ceiling: validated.realistic_ceiling,
    };
    const gapViolations = scanObjectForGapViolations(gapFields);
    if (gapViolations.length > 0) {
      validated.strategic_recommendation = replaceGapPhrases(validated.strategic_recommendation);
      validated.primary_constraint = replaceGapPhrases(validated.primary_constraint);
      validated.highest_impact_lever = replaceGapPhrases(validated.highest_impact_lever);
      validated.realistic_ceiling = replaceGapPhrases(validated.realistic_ceiling);
    }

    const decisionClarity = {
      successDefinition: body.successDefinition || body.outcome || null,
      outcomeThreshold: body.outcomeThreshold || null,
      timeHorizon: body.timeHorizon || null,
      targetProbability: body.thresholdProbability ?? fallbackProb,
      environmentStrength: body.posteriorProbability ?? null,
    };

    res.json({
      ...validated,
      decision_clarity: decisionClarity,
      needle_movement: needleMovement,
      _gapGuard: {
        clean: gapViolations.length === 0,
        violationCount: gapViolations.length,
        violations: gapViolations,
      },
    });
  } catch (err: any) {
    console.error("[ai-respond] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

function buildSignalDetailContext(details: SignalDetail[]): string {
  if (!details.length) return "";

  const lines: string[] = ["SIGNAL EVIDENCE SUMMARY:"];
  const positive = details.filter(d => (d.rawLikelihoodRatio ?? 1) > 1);
  const negative = details.filter(d => (d.rawLikelihoodRatio ?? 1) < 1);

  if (positive.length) {
    lines.push("Positive drivers:");
    positive.forEach(d => {
      const ppPct = d.pointContribution != null ? `${d.pointContribution > 0 ? "+" : ""}${(d.pointContribution * 100).toFixed(1)}pp` : "";
      lines.push(`  - ${d.description || "No description"} [${ppPct}, ${d.dependencyRole || "Independent"}]`);
    });
  }

  if (negative.length) {
    lines.push("Negative constraints:");
    negative.forEach(d => {
      const ppPct = d.pointContribution != null ? `${(d.pointContribution * 100).toFixed(1)}pp` : "";
      const compressed = d.dependencyRole === "Derivative" ? " (compressed — partially redundant)" : "";
      lines.push(`  - ${d.description || "No description"} [${ppPct}, ${d.dependencyRole || "Independent"}${compressed}]`);
    });
  }

  return lines.join("\n");
}

interface NeedleDriver {
  name: string;
  category: string;
  direction: "increases probability" | "decreases probability";
  impact: "high" | "moderate" | "low";
  contribution: string;
}

interface NeedleMovement {
  moves_up: NeedleDriver[];
  moves_down: NeedleDriver[];
  recommended_actions: {
    strategic: string[];
    tactical: string[];
  };
}

function classifyCategory(desc: string): string {
  const d = desc.toLowerCase();
  if (/\blabel\b|post.?marketing|\bpmr\b|\bpmc\b|submission|sponsor commitment|fda\s+(guidance|requirement)|regulatory\s+(commitment|pathway|hold)/i.test(d)) return "regulatory";
  if (/formulary|payer|coverage|reimbursement|copay|prior\s*auth|specialty\s*pharmacy|\bheor\b|\bbia\b|\bp\s*&\s*t\b|medicaid|medicare/i.test(d)) return "access";
  if (/off-label|compet|entrenched|alternative|pipeline|generic|biosimilar|standard\s+of\s+care|incumbent/i.test(d)) return "competitive";
  if (/nebuliz|administrat|infusion|dosing|delivery|logistics|\brems\b|monitoring|workflow|onboarding|device|clinic\s+capacity/i.test(d)) return "operational";
  if (/phase\s*(i|ii|iii|iv)|trial|sputum|culture\s*conversion|efficacy|endpoint|fev1|guideline|ats\/idsa|ats |\bidsa\b|society\s+endors|tolerab|safety|adverse|discontinu|bronchospasm|pharmacovigilance/i.test(d)) return "clinical";
  if (/prescrib|adopt|survey|familiarity|awareness|education|behavior/i.test(d)) return "clinical";
  if (/population|prevalence|incidence|eligible|patient\s*pool/i.test(d)) return "operational";
  return "operational";
}

function timingForWeightPp(absWeightPp: number): string {
  if (absWeightPp >= 8) return "within 60 days of launch";
  if (absWeightPp >= 4) return "within 90 days of launch";
  return "within 180 days of launch";
}

function signalAnchor(description: string): string {
  const stripped = stripSignalId(description || "").trim();
  if (!stripped) return "";
  const firstSentence = stripped.match(/^[^.!?]+[.!?]/);
  const snippet = (firstSentence ? firstSentence[0] : stripped).trim();
  const truncated = snippet.length > 140 ? snippet.slice(0, 140).replace(/\s+\S*$/, "") + "…" : snippet;
  return truncated.replace(/\s+$/, "").replace(/[.!?]+$/, "");
}

interface ActionTemplate {
  strategic: string;
  tactical: string;
}

const STRATEGIC_STEMS: Record<string, string[]> = {
  access: [
    "Stand up a payer-engagement and HEOR/BIA workstream with coverage-policy language tailored for P&T review",
    "Commission a HEOR/BIA dossier and formulary-positioning playbook to underpin payer access",
    "Build a coverage-policy and P&T narrative that aligns formulary submissions with payer evidence requirements",
  ],
  clinical: [
    "Launch a prescriber-education and protocol-integration program that folds existing clinical evidence and tolerability management into the standard pathway",
    "Stand up a clinical-evidence integration and tolerability-management initiative for treating physicians",
    "Develop a protocol-embedded prescriber-education curriculum focused on clinical evidence integration and tolerability management",
  ],
  operational: [
    "Build a workflow-integration and patient-onboarding program covering device and administration support",
    "Stand up a device-training and administration-support service to remove onboarding friction in the clinical workflow",
    "Launch a clinic-workflow redesign with embedded onboarding and administration support staffed by device specialists",
  ],
  regulatory: [
    "Align label, submission strategy, and post-marketing commitments with stakeholder expectations",
    "Develop a post-marketing evidence plan and FDA-guidance-aligned communication strategy that reinforces label intent",
    "Structure a submission and label-alignment workstream with post-marketing commitments mapped to FDA guidance",
  ],
  competitive: [
    "Deploy a differentiation and positioning program that marshals head-to-head or indirect comparative evidence into core messaging",
    "Build a head-to-head positioning narrative that anchors differentiation against the incumbent option",
    "Stand up a competitive-positioning and differentiation workstream supported by head-to-head or indirect comparative analyses",
  ],
  default: [
    "Design a targeted intervention",
    "Stand up a focused workstream",
    "Launch a cross-functional response plan",
  ],
};

const TACTICAL_STEMS: Record<string, string[]> = {
  access: [
    "Brief account teams on formulary and prior-authorization positioning",
    "Equip payer field teams with a coverage-policy and HEOR/BIA fact base",
    "Run targeted P&T meeting prep with formulary-aligned messaging",
  ],
  clinical: [
    "Roll out specialist-facing clinical materials and peer-led education",
    "Deploy prescriber-education modules with tolerability-management protocols",
    "Activate medical science liaisons with protocol-integration and clinical-evidence talking points",
  ],
  operational: [
    "Pilot clinic workflow optimization and administration-support services at high-volume centers",
    "Stand up onboarding pods with device-training and workflow-integration coaches",
    "Run a workflow-redesign sprint with administration-support and device-handling coverage",
  ],
  regulatory: [
    "Coordinate medical, regulatory, and commercial teams on label-aligned communication",
    "Brief field and medical teams on submission-aligned and post-marketing-consistent messaging",
    "Run a label-and-FDA-guidance alignment workshop that translates submission language into field talking points",
  ],
  competitive: [
    "Equip field teams with differentiation messaging and objection handlers",
    "Deploy positioning-and-differentiation talk tracks with head-to-head evidence",
    "Run head-to-head messaging drills and positioning workshops with field teams",
  ],
  default: [
    "Brief field and medical teams on the specific response",
    "Activate cross-functional teams to respond",
    "Coordinate a tactical response across functions",
  ],
};

function buildCategoryAction(category: string, anchor: string, timing: string, variantIndex: number): ActionTemplate {
  const quoted = anchor ? `“${anchor}”` : "the surfaced constraint";
  const key = STRATEGIC_STEMS[category] ? category : "default";
  const strategicStems = STRATEGIC_STEMS[key];
  const tacticalStems = TACTICAL_STEMS[key];
  const idx = ((variantIndex % strategicStems.length) + strategicStems.length) % strategicStems.length;
  const strategicStem = strategicStems[idx];
  const tacticalStem = tacticalStems[idx];
  const suffix = `addresses the constraint surfaced by ${quoted} ${timing}`;
  return {
    strategic: `${strategicStem}; ${suffix}.`,
    tactical: `${tacticalStem}; ${suffix}.`,
  };
}

function classifyImpact(absContribution: number): "high" | "moderate" | "low" {
  if (absContribution >= 0.05) return "high";
  if (absContribution >= 0.025) return "moderate";
  return "low";
}

function stripSignalId(desc: string): string {
  return desc.replace(/^[A-Z]{2,4}-\d{2,4}:\s*/, "").trim();
}

function buildNeedleMovement(details: SignalDetail[]): NeedleMovement | null {
  if (!details.length) return null;

  const sorted = [...details].sort((a, b) => Math.abs(b.pointContribution ?? 0) - Math.abs(a.pointContribution ?? 0));

  const positive = sorted
    .filter(s => (s.pointContribution ?? 0) > 0)
    .slice(0, 3);

  const negative = sorted
    .filter(s => (s.pointContribution ?? 0) < 0)
    .slice(0, 3);

  const movesUp: NeedleDriver[] = positive.map(s => ({
    name: stripSignalId(s.description || "Unknown driver"),
    category: classifyCategory(s.description || ""),
    direction: "increases probability" as const,
    impact: classifyImpact(Math.abs(s.pointContribution ?? 0)),
    contribution: `+${(Math.abs(s.pointContribution ?? 0) * 100).toFixed(1)}pp`,
  }));

  const movesDown: NeedleDriver[] = negative.map(s => ({
    name: stripSignalId(s.description || "Unknown driver"),
    category: classifyCategory(s.description || ""),
    direction: "decreases probability" as const,
    impact: classifyImpact(Math.abs(s.pointContribution ?? 0)),
    contribution: `-${(Math.abs(s.pointContribution ?? 0) * 100).toFixed(1)}pp`,
  }));

  // One strategic + one tactical action per blocking signal (negative weight, has anchor text).
  // Signals are already countTowardPosterior-filtered upstream (forecasts.ts). Skip any signal
  // without a non-empty description — that is the engine's equivalent of the sourceQuote requirement.
  const blockingSignals = sorted.filter(s => (s.pointContribution ?? 0) < 0 && signalAnchor(s.description || "").length > 0);

  const strategic: string[] = [];
  const tactical: string[] = [];
  const categoryUseCount: Record<string, number> = {};

  for (const signal of blockingSignals) {
    const absPp = Math.abs((signal.pointContribution ?? 0) * 100);
    const category = classifyCategory(signal.description || "");
    const anchor = signalAnchor(signal.description || "");
    const timing = timingForWeightPp(absPp);
    const variantIndex = categoryUseCount[category] ?? 0;
    categoryUseCount[category] = variantIndex + 1;
    const action = buildCategoryAction(category, anchor, timing, variantIndex);
    strategic.push(action.strategic);
    tactical.push(action.tactical);
  }

  if (strategic.length === 0) strategic.push("Conduct root-cause analysis on the primary binding constraint to identify structural intervention points");
  if (tactical.length === 0) tactical.push("Brief field teams on current driver landscape and priority actions within 30 days");

  return {
    moves_up: movesUp,
    moves_down: movesDown,
    recommended_actions: { strategic, tactical },
  };
}

function buildDecisionContext(body: RespondRequest): string {
  const parts: string[] = [];

  if (body.signals?.length) {
    parts.push("ACTIVE SIGNALS:");
    body.signals.forEach(s => {
      parts.push(`- [${s.direction}] [${s.importance}] ${s.text} (${s.confidence}, ${s.source}${s.signal_source ? `, ${s.signal_source}` : ""})`);
    });
  }

  if (body.derived_decisions) {
    const dd = body.derived_decisions;
    if (dd.barriers?.length) {
      parts.push("\nBARRIERS:");
      dd.barriers.forEach(b => parts.push(`- [${b.severity_or_priority}] ${b.title}: ${b.rationale}`));
    }
    if (dd.actions?.length) {
      parts.push("\nREQUIRED ACTIONS:");
      dd.actions.forEach(a => parts.push(`- [${a.severity_or_priority}] ${a.title}: ${a.rationale}`));
    }
    if (dd.segments?.length) {
      parts.push("\nTARGET SEGMENTS:");
      dd.segments.forEach(s => parts.push(`- ${s.title}: ${s.rationale}`));
    }
    if (dd.trigger_events?.length) {
      parts.push("\nTRIGGER EVENTS:");
      dd.trigger_events.forEach(t => parts.push(`- ${t.title}: ${t.rationale}`));
    }
    if (dd.monitoring?.length) {
      parts.push("\nMONITORING:");
      dd.monitoring.forEach(m => parts.push(`- ${m.title}: ${m.rationale}`));
    }
  }

  if (body.readiness_timeline) {
    const rt = body.readiness_timeline;
    if (rt.near_term_readiness) parts.push(`\nREADINESS: ${rt.near_term_readiness}`);
    if (rt.timing_risks?.length) {
      parts.push("TIMING RISKS:");
      rt.timing_risks.forEach(r => parts.push(`- ${r}`));
    }
    if (rt.dependencies?.length) {
      parts.push("DEPENDENCIES:");
      rt.dependencies.forEach(d => parts.push(`- ${d}`));
    }
  }

  if (body.competitive_risk) {
    const cr = body.competitive_risk;
    if (cr.incumbent_defense) parts.push(`\nINCUMBENT DEFENSE: ${cr.incumbent_defense}`);
    if (cr.fast_follower_risk) parts.push(`FAST-FOLLOWER RISK: ${cr.fast_follower_risk}`);
  }

  if (body.adoption_segmentation) {
    const as_ = body.adoption_segmentation;
    if (as_.early_adopters?.segments?.length) {
      parts.push(`\nEARLY ADOPTERS: ${as_.early_adopters.segments.join(", ")} — ${as_.early_adopters.reason}`);
    }
    if (as_.persuadables?.segments?.length) {
      parts.push(`PERSUADABLES: ${as_.persuadables.segments.join(", ")} — ${as_.persuadables.reason}`);
    }
  }

  return parts.length > 0 ? parts.join("\n") : "No prior decision analysis available. Generate response from the question and probability alone.";
}

export default router;
