import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

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

    const systemPrompt = `You are a senior strategy advisor writing a concise executive brief. Your output will be read by a decision-maker who needs to act, not analyze.

VOICE:
- Write like a trusted advisor speaking directly to the executive
- Short, declarative sentences. No filler. No hedging.
- State what is happening, what matters, what to do. Nothing else.
- Never use: "Bayesian", "posterior", "Brier score", "likelihood ratio", "prior odds"
- "Probability" is allowed

STRUCTURE — return valid JSON with exactly these 5 keys:
{
  "strategic_recommendation": "One to two sentences. The core strategic call — what is likely to happen and what it means for the decision. Be specific to the case, not generic.",
  "why_this_matters": "Two to three sentences. Name the specific limiting factors or driving forces. Do NOT list drivers and risks separately — weave them into a single narrative paragraph that explains what is actually constraining or enabling the outcome.",
  "priority_actions": ["First action", "Second action", "Third action", "Fourth action"],
  "success_measures": ["First observable milestone", "Second observable milestone", "Third observable milestone", "Fourth observable milestone"],
  "execution_focus": "One sentence. Where resources and attention should go first — and implicitly, what NOT to focus on. Be specific."
}

CRITICAL RULES:
- strategic_recommendation: State the expected outcome trajectory and its primary constraint. Not a generic recommendation.
- why_this_matters: A SINGLE PARAGRAPH. Name the real bottlenecks from the signals and decision analysis. Do not split into sub-categories.
- priority_actions: 3-5 short action phrases. No numbering, no rationale — just what to do. Each should be one line.
- success_measures: 3-5 observable outcomes that indicate progress. Not KPIs with targets — just clear milestones stated as phrases.
- execution_focus: ONE sentence. Where resources go first, framed as what to prioritize over what.`;

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
