import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getProfileForQuestion, buildVocabularyConstraintPrompt, buildDecisionLayerPrompt, buildDriverConstraintPrompt, buildSafetySignalPrompt, buildEvidenceGatePrompt, buildOutcomeStatePrompt, buildActionFilterPrompt, buildPropagationPathwayPrompt, buildDecisionSensitivityPrompt, getResponseModeLabel } from "../lib/case-type-router.js";

const router = Router();

interface RespondRequest {
  subject: string;
  questionText: string;
  outcome?: string;
  timeHorizon?: string;
  probability?: number | null;
  constrainedProbability?: number | null;
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

    const prob = body.constrainedProbability ?? body.probability ?? null;
    const probPct = prob != null ? Math.round(prob * 100) : null;

    let probabilityFrame = "";
    if (probPct != null) {
      if (probPct >= 75) {
        probabilityFrame = `The current probability is ${probPct}%. This means the outcome is LIKELY. Your narrative MUST reflect this — the recommendation should be about capitalizing on momentum and managing remaining risks, NOT about whether the outcome will happen. Do not say "unlikely" or "uncertain" — the analysis says it is probable.`;
      } else if (probPct >= 55) {
        probabilityFrame = `The current probability is ${probPct}%. This means the outcome is MORE LIKELY THAN NOT but conditional on key factors. Your narrative should reflect cautious optimism — the outcome leans positive but depends on specific conditions being met. Do not frame it as unlikely.`;
      } else if (probPct >= 40) {
        probabilityFrame = `The current probability is ${probPct}%. This means the outcome is UNCERTAIN — roughly a coin flip. Your narrative should reflect genuine uncertainty. Do not overstate confidence in either direction.`;
      } else {
        probabilityFrame = `The current probability is ${probPct}%. This means the outcome is UNLIKELY given current evidence. Your narrative should reflect skepticism about the outcome occurring without significant changes to the current trajectory.`;
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

    const actionExample = isClinical
      ? `"Optimize enrollment strategy because patient selection quality directly determines endpoint sensitivity."`
      : isRegulatory
        ? `"Finalize ARIA risk mitigation strategy because benefit-risk balance is the primary advisory concern."`
        : `"Secure payer commitment because reimbursement uncertainty is the biggest barrier to adoption."`;
    const successExample = isClinical
      ? `"Interim analysis shows consistent treatment effect — confirms endpoint trajectory."`
      : isRegulatory
        ? `"Favorable advisory committee vote — confirms benefit-risk acceptance."`
        : `"First formulary listing — confirms payer acceptance."`;

    const caseTypeLabel = isClinical ? "clinical trial strategy" : isRegulatory ? "regulatory" : "strategy";
    const caseTypeHeader = isClinical
      ? "\nThis is a CLINICAL OUTCOME case. All language, actions, and success measures must be trial-focused — NOT regulatory, commercial, or adoption-oriented.\n"
      : isRegulatory
        ? "\nThis is a REGULATORY APPROVAL case. All language, actions, and success measures must be regulatory — NOT commercial, adoption, or launch-oriented.\n"
        : "";

    const systemPrompt = `You are a senior ${caseTypeLabel} advisor writing a concise executive brief. Your output will be read by a decision-maker who needs to act, not analyze.
RESPONSE MODE: ${responseModeLabel}
${caseTypeHeader}
VOICE:
- Write like a trusted advisor speaking directly to the executive
- Short, declarative sentences. No filler. No hedging.
- State what is happening, what matters, what to do. Nothing else.
- Never use: "Bayesian", "posterior", "Brier score", "likelihood ratio", "prior odds"
- "Probability" is allowed
${vocabConstraints}${decisionLayerConstraints}${driverConstraints}${safetyConstraints}${evidenceGateConstraints}${outcomeStateConstraints}${actionFilterConstraints}${propagationConstraints}${sensitivityConstraints}
═══ PROBABILITY ALIGNMENT (MANDATORY) ═══
${probabilityFrame || "No probability provided. Generate response from signals and question context."}
The strategic_recommendation MUST be consistent with the probability. If the probability says likely, the recommendation must say likely. If the probability says unlikely, the recommendation must say unlikely. A contradiction between the computed probability and the narrative is a critical error.
═══ END PROBABILITY ALIGNMENT ═══

STRUCTURE — return valid JSON with exactly these 5 keys:
{
  "strategic_recommendation": "Two to three sentences. The core strategic call — what is likely to happen AND WHY the probability is what it is. Name the specific evidence or conditions that led to this number. Be specific to the case, not generic. MUST align with the computed probability.",
  "why_this_matters": "Two to three sentences. Name the specific limiting factors or driving forces AND explain why each one matters in plain terms. Do NOT list drivers and risks separately — weave them into a single narrative paragraph that connects each factor to its real-world consequence.",
  "priority_actions": ["Action + because [reason]", "Action + because [reason]", "Action + because [reason]"],
  "success_measures": ["Observable milestone — why it indicates progress", "Observable milestone — why it indicates progress", "Observable milestone — why it indicates progress"],
  "execution_focus": "One to two sentences. Where to prioritize resources and attention first, WHY that area matters most, and what can wait until later."
}

CRITICAL RULES:
- TRANSPARENCY IS MANDATORY. Every statement must explain WHY. Never state a conclusion without saying what evidence or reasoning led to it. The reader should never have to guess where a number or recommendation came from.
- strategic_recommendation: State the expected ${isClinical ? "endpoint" : isRegulatory ? "approval" : "outcome"} trajectory AND its primary constraint. Explain WHY the probability is at this level — name the specific signals or conditions. The TONE and CONCLUSION must match the probability — high probability = likely outcome, low probability = unlikely outcome.
- why_this_matters: A SINGLE PARAGRAPH. Name the real bottlenecks AND explain in plain terms why each one matters for the decision. Connect each factor to what it means practically.
- priority_actions: 3-5 actions. Each action MUST include a brief "because" clause explaining why it is prioritized. Example: ${actionExample}${isRegulatory ? " Actions must be pre-approval and regulatory in scope — no post-approval commercialization tasks like physician education or market rollout." : ""}
- success_measures: 3-5 observable milestones. Each must briefly state why it indicates progress. Example: ${successExample}${isRegulatory ? " Success measures must be regulatory milestones only — no launch readiness, rollout, or market-share markers." : ""}
- execution_focus: ONE to TWO sentences. Where resources go first AND why that area matters most, framed as what to prioritize over what.`;

    const decisionContext = buildDecisionContext(body);

    const userPrompt = `Write an executive response brief for:

Subject: ${body.subject}
Question: ${body.questionText}
Outcome: ${body.outcome || "adoption"}
Time Horizon: ${body.timeHorizon || "12 months"}
Current Probability: ${body.constrainedProbability != null ? `${Math.round(body.constrainedProbability * 100)}%` : body.probability != null ? `${Math.round(body.probability * 100)}%` : "Not yet calculated"}

${decisionContext}

Translate this into a brief. Do not reanalyze — summarize what the evidence says, what should be done, and how to know it is working.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 2000,
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
      why_this_matters: typeof parsed.why_this_matters === "string"
        ? parsed.why_this_matters
        : parsed.why_this_matters?.summary || parsed.why_this_matters?.text || "",
      priority_actions: Array.isArray(parsed.priority_actions)
        ? parsed.priority_actions.map((a: any) => typeof a === "string" ? a : a.action || a.text || "")
        : [],
      success_measures: Array.isArray(parsed.success_measures)
        ? parsed.success_measures.map((m: any) => typeof m === "string" ? m : m.metric || m.text || "")
        : [],
      execution_focus: typeof parsed.execution_focus === "string"
        ? parsed.execution_focus
        : parsed.execution_focus?.primary_focus || parsed.execution_focus?.text || "",
    };

    res.json(validated);
  } catch (err: any) {
    console.error("[ai-respond] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

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
