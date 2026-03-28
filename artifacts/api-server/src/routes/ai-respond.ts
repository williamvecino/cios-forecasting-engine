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

    const systemPrompt = `You are a senior strategy consultant producing a client-ready executive response. You translate decision analysis into clear, actionable recommendations.

RULES:
- Write in executive language — direct, confident, no hedging
- Never use technical terms like "Bayesian", "posterior", "Brier score", "likelihood ratio"
- The word "probability" is allowed
- Structure your output as a JSON object with exactly 5 sections
- Each section must be substantive — no filler or generic advice
- Ground every recommendation in the specific decision context provided
- Priority actions must be concrete and sequenced (first, then, then)
- Success measures must be observable and measurable
- Keep each section concise — 2-4 sentences for narrative sections, 3-5 bullet items for lists

OUTPUT FORMAT (return valid JSON only):
{
  "strategic_recommendation": {
    "headline": "One sentence — the core recommendation",
    "rationale": "2-3 sentences explaining why this is the right call given the evidence and probability"
  },
  "why_this_matters": {
    "key_drivers": ["Driver 1", "Driver 2", "Driver 3"],
    "key_risks": ["Risk 1", "Risk 2", "Risk 3"],
    "summary": "1-2 sentences connecting drivers and risks to the strategic stakes"
  },
  "priority_actions": [
    { "sequence": 1, "action": "What to do first", "rationale": "Why this comes first" },
    { "sequence": 2, "action": "What to do next", "rationale": "Why this follows" },
    { "sequence": 3, "action": "What to do after", "rationale": "Why this is third" }
  ],
  "success_measures": [
    { "metric": "What to measure", "target": "What good looks like", "timeframe": "When to check" }
  ],
  "execution_focus": {
    "primary_focus": "Where resources go first — one clear area",
    "secondary_focus": "Where resources go next",
    "avoid": "What NOT to spend resources on right now and why"
  }
}`;

    const decisionContext = buildDecisionContext(body);

    const userPrompt = `Generate a client-ready executive response for this decision:

**Subject**: ${body.subject}
**Question**: ${body.questionText}
**Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Current Probability**: ${body.constrainedProbability != null ? `${Math.round(body.constrainedProbability * 100)}%` : body.probability != null ? `${Math.round(body.probability * 100)}%` : "Not calculated"}

${decisionContext}

Generate the response. Every recommendation must flow from the decision analysis above — do not introduce new analysis or recalculate anything. Translate what exists into action.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 4000,
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
      strategic_recommendation: {
        headline: parsed.strategic_recommendation?.headline || "Recommendation pending",
        rationale: parsed.strategic_recommendation?.rationale || "",
      },
      why_this_matters: {
        key_drivers: Array.isArray(parsed.why_this_matters?.key_drivers) ? parsed.why_this_matters.key_drivers : [],
        key_risks: Array.isArray(parsed.why_this_matters?.key_risks) ? parsed.why_this_matters.key_risks : [],
        summary: parsed.why_this_matters?.summary || "",
      },
      priority_actions: Array.isArray(parsed.priority_actions) ? parsed.priority_actions.map((a: any, i: number) => ({
        sequence: a.sequence || i + 1,
        action: a.action || "",
        rationale: a.rationale || "",
      })) : [],
      success_measures: Array.isArray(parsed.success_measures) ? parsed.success_measures.map((m: any) => ({
        metric: m.metric || "",
        target: m.target || "",
        timeframe: m.timeframe || "",
      })) : [],
      execution_focus: {
        primary_focus: parsed.execution_focus?.primary_focus || "",
        secondary_focus: parsed.execution_focus?.secondary_focus || "",
        avoid: parsed.execution_focus?.avoid || "",
      },
    };

    res.json(validated);
  } catch (err: any) {
    console.error("[ai-respond] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

function buildDecisionContext(body: RespondRequest): string {
  const parts: string[] = [];

  if (body.derived_decisions) {
    const dd = body.derived_decisions;
    if (dd.barriers?.length) {
      parts.push("**Key Barriers:**");
      dd.barriers.forEach(b => parts.push(`- [${b.severity_or_priority}] ${b.title}: ${b.rationale}`));
    }
    if (dd.actions?.length) {
      parts.push("\n**Required Actions:**");
      dd.actions.forEach(a => parts.push(`- [${a.severity_or_priority}] ${a.title}: ${a.rationale}`));
    }
    if (dd.segments?.length) {
      parts.push("\n**Target Segments:**");
      dd.segments.forEach(s => parts.push(`- ${s.title}: ${s.rationale}`));
    }
    if (dd.trigger_events?.length) {
      parts.push("\n**Trigger Events:**");
      dd.trigger_events.forEach(t => parts.push(`- ${t.title}: ${t.rationale}`));
    }
    if (dd.monitoring?.length) {
      parts.push("\n**Monitoring Items:**");
      dd.monitoring.forEach(m => parts.push(`- ${m.title}: ${m.rationale}`));
    }
  }

  if (body.readiness_timeline) {
    const rt = body.readiness_timeline;
    if (rt.near_term_readiness) parts.push(`\n**Readiness**: ${rt.near_term_readiness}`);
    if (rt.timing_risks?.length) {
      parts.push("**Timing Risks:**");
      rt.timing_risks.forEach(r => parts.push(`- ${r}`));
    }
    if (rt.dependencies?.length) {
      parts.push("**Dependencies:**");
      rt.dependencies.forEach(d => parts.push(`- ${d}`));
    }
  }

  if (body.competitive_risk) {
    const cr = body.competitive_risk;
    if (cr.incumbent_defense) parts.push(`\n**Incumbent Defense**: ${cr.incumbent_defense}`);
    if (cr.fast_follower_risk) parts.push(`**Fast-Follower Risk**: ${cr.fast_follower_risk}`);
  }

  if (body.adoption_segmentation) {
    const as_ = body.adoption_segmentation;
    if (as_.early_adopters?.segments?.length) {
      parts.push(`\n**Early Adopters**: ${as_.early_adopters.segments.join(", ")} — ${as_.early_adopters.reason}`);
    }
    if (as_.persuadables?.segments?.length) {
      parts.push(`**Persuadables**: ${as_.persuadables.segments.join(", ")} — ${as_.persuadables.reason}`);
    }
  }

  return parts.length > 0 ? `--- DECISION ANALYSIS INPUT ---\n${parts.join("\n")}` : "No decision analysis available — generate a response based on the question and probability alone.";
}

export default router;
