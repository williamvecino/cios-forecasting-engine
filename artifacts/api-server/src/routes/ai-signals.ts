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

interface GeneratedSignal {
  id: string;
  text: string;
  category: "evidence" | "access" | "competition" | "guideline" | "timing" | "adoption";
  direction: "positive" | "negative" | "neutral";
  strength: "High" | "Medium" | "Low";
  reliability: "Confirmed" | "Probable" | "Speculative";
  source_type: string;
  rationale: string;
}

interface GeneratedEvent {
  id: string;
  title: string;
  type: string;
  description: string;
  relevance: string;
}

router.post("/ai-signals/generate", async (req, res) => {
  try {
    const body = req.body as SignalGenerationRequest;

    if (!body.subject || !body.questionText) {
      res.status(400).json({ error: "subject and questionText are required" });
      return;
    }

    const systemPrompt = `You are a pharmaceutical market intelligence analyst specializing in HCP (Healthcare Professional) adoption forecasting. Given a drug/therapy name and a forecasting question, you must research and generate evidence-based signals by analyzing:

1. **Clinical & Preclinical Data**: FDA approval status, clinical trial phases, efficacy data, safety profile, mechanism of action
2. **Competitor Landscape**: Approved competitors in the same category, pipeline competitors approaching approval, competitive differentiation
3. **Payer & Market Access**: Formulary status, prior authorization requirements, reimbursement landscape, cost-effectiveness data
4. **Physician Behavior**: Prescribing patterns in the category, KOL sentiment, specialty adoption patterns, switching behavior
5. **Guidelines**: Treatment guideline positioning, NCCN/ASCO/society recommendations, evidence grading
6. **Patient Factors**: Patient attitudes, adherence patterns, demand-side dynamics, patient advocacy

Each signal must have:
- **text**: A specific, factual statement (not generic)
- **category**: one of "evidence", "access", "competition", "guideline", "timing", "adoption"
- **direction**: "positive" (favors the outcome), "negative" (opposes), or "neutral"
- **strength**: "High", "Medium", or "Low" — based on how much this factor impacts the forecast
- **reliability**: "Confirmed" (published/verified data), "Probable" (strong indicators), "Speculative" (early signals)
- **source_type**: Where this signal comes from (e.g. "clinical_trial", "fda_database", "payer_landscape", "kol_sentiment", "guidelines", "competitive_intel", "patient_data")
- **rationale**: Brief explanation of WHY this signal has the assigned strength and direction

WEIGHT LOGIC:
- Clinical efficacy data with Phase 3 results → High strength, Confirmed reliability
- Competitor approaching approval → High strength, Probable reliability
- KOL sentiment from conferences → Medium strength, Probable reliability
- Patient advocacy movements → Low-Medium strength, Speculative reliability
- Guideline inclusion → High strength, Confirmed reliability
- Payer step-therapy barriers → High strength (negative), Confirmed reliability
- Early prescribing trend data → Medium strength, Probable reliability

Generate 8-12 signals covering ALL six categories. Be specific to the actual drug/therapy — use real pharmaceutical knowledge. If you don't know the specific drug, generate realistic signals for a therapy in that therapeutic category.

Return ONLY valid JSON with this structure:
{
  "signals": [...],
  "incoming_events": [...],
  "market_summary": "Brief 2-3 sentence market context summary"
}

For incoming_events, generate 5 context-specific events that could generate new signals:
{
  "id": "ev-N",
  "title": "Short event title",
  "type": "evidence|access|competition|guideline|adoption",
  "description": "What is expected and when",
  "relevance": "Why this matters for the forecast"
}`;

    const userPrompt = `Generate intelligence signals for:

**Subject/Brand**: ${body.subject}
**Forecasting Question**: ${body.questionText}
**Predicted Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Question Type**: ${body.questionType || "binary"}
${body.entities?.length ? `**Comparison Groups**: ${body.entities.join(" vs ")}` : ""}

Research this therapy/brand thoroughly. Check:
- Is it FDA-approved? What phase? What indication?
- Who are the direct competitors (approved and pipeline)?
- What is the payer landscape?
- What do physicians think about it?
- Are there relevant guidelines?
- What are patient attitudes?

Generate specific, evidence-informed signals with logical comparative weights.`;

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
    res.json(parsed);
  } catch (err: any) {
    console.error("AI signal generation error:", err);
    res.status(500).json({ error: "Failed to generate AI signals" });
  }
});

export default router;
