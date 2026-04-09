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

    const needleMovement = buildNeedleMovement(body.signalDetails || []);

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
  if (/phase\s*(i|ii|iii|iv)|trial|sputum|culture\s*conversion|efficacy|endpoint|fev1/i.test(d)) return "clinical";
  if (/formulary|payer|coverage|reimbursement|copay|prior\s*auth|specialty\s*pharmacy/i.test(d)) return "access";
  if (/nebuliz|administrat|infusion|dosing|delivery|logistics|rems|monitoring/i.test(d)) return "operational";
  if (/prescrib|adopt|survey|familiarity|awareness|education|behavior/i.test(d)) return "behavioral";
  if (/off-label|compet|entrenched|alternative|pipeline|generic|biosimilar/i.test(d)) return "competitive";
  if (/safety|adverse|discontinu|bronchospasm|tolerab|pharmacovigilance/i.test(d)) return "clinical";
  if (/population|prevalence|incidence|eligible|patient\s*pool/i.test(d)) return "operational";
  return "operational";
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

  // H2H / comparative data detection — check whether the signal stack already contains comparative evidence
  const allDescriptions = details.map(d => (d.description || "").toLowerCase()).join(" ");
  const hasComparativeData = /\bh2h\b|head.to.head|superiority|comparative\s+(efficacy|effectiveness|data|trial|study)|vs\s+\w+.*\b(trial|study|data)\b/.test(allDescriptions);

  const strategic: string[] = [];
  const tactical: string[] = [];

  if (movesDown.length > 0) {
    const topNeg = movesDown[0];
    const rawShort = topNeg.name.split(/[—(,]/)[0].trim();
    const constraintShortName = rawShort.length > 60 ? rawShort.slice(0, 60).replace(/\s+\S*$/, "") : rawShort.toLowerCase();
    if (topNeg.category === "clinical") {
      strategic.push(`Address ${topNeg.name.toLowerCase().includes("bronchospasm") || topNeg.name.toLowerCase().includes("safety") || topNeg.name.toLowerCase().includes("pharmacovigilance") ? "safety profile concerns" : "clinical evidence gaps"} through targeted real-world evidence programs`);
      tactical.push(`Develop specialist-facing materials addressing ${constraintShortName}`);
    } else if (topNeg.category === "operational") {
      strategic.push(`Redesign the administration pathway to reduce operational friction from ${constraintShortName}`);
      tactical.push(`Launch clinic workflow optimization pilots at high-volume prescribing centers`);
    } else if (topNeg.category === "behavioral") {
      strategic.push(`Build a structured specialist education and adoption program targeting prescriber familiarity barriers`);
      tactical.push(`Deploy peer-to-peer education with KOLs who have direct prescribing experience`);
    } else if (topNeg.category === "competitive") {
      if (hasComparativeData) {
        // Comparative data EXISTS — recommend deploying it, not generating it
        strategic.push(`Accelerate communication of existing comparative efficacy evidence to shift prescriber perception`);
        tactical.push(`Deploy comparative effectiveness data through peer-reviewed publication and KOL-led education`);
      } else {
        // No comparative data — recommend differentiation strategy (NOT H2H study)
        strategic.push(`Develop differentiation strategy against entrenched alternatives based on current evidence strengths`);
        tactical.push(`Focus specialist detailing on demonstrated clinical advantages from existing trial data`);
      }
    } else if (topNeg.category === "access") {
      strategic.push(`Expand payer coverage through health economics and outcomes research submissions`);
      tactical.push(`Prioritize formulary negotiations with top specialty pharmacy networks`);
    }
  }

  if (movesUp.length > 0) {
    const topPos = movesUp[0];
    if (topPos.category === "clinical") {
      strategic.push(`Maximize leverage of clinical evidence from ${topPos.name.split("(")[0].trim()} across all stakeholder communications`);
    } else if (topPos.category === "access") {
      strategic.push(`Accelerate formulary expansion building on existing ${topPos.name.split("(")[0].trim().toLowerCase()}`);
    }
    tactical.push(`Integrate top positive driver evidence into field team messaging immediately`);
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
