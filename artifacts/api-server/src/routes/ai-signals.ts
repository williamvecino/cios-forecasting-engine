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

router.post("/ai-signals/generate", async (req, res) => {
  try {
    const body = req.body as SignalGenerationRequest;

    if (!body.subject || !body.questionText) {
      res.status(400).json({ error: "subject and questionText are required" });
      return;
    }

    const systemPrompt = `You are an analytical framework assistant for HCP (Healthcare Professional) adoption forecasting. Your job is to identify the CATEGORIES of evidence and factors that would matter for a forecasting question — NOT to provide specific data points or facts.

CRITICAL RULES:
1. You do NOT have access to real-time data, FDA databases, clinical trial registries, or any live pharmaceutical data sources.
2. You MUST NOT fabricate specific facts: no made-up approval dates, no invented trial results, no fictional response rates, no fabricated guideline mentions, no made-up formulary statuses.
3. You MUST NOT present speculative statements as confirmed facts.
4. If you genuinely know a well-established public fact about a drug (e.g., aspirin reduces inflammation), you may state it and mark reliability as "Confirmed". But if you are not certain, mark it "Speculative" and phrase it as a question or hypothesis.
5. Every signal should be framed as: "The user should investigate whether..." or "A key factor is..." or "Consider the impact of..." — NOT as "Drug X received FDA approval on [date]" unless you are absolutely certain.

For each signal, generate:
- **text**: A statement framed as an analytical consideration, NOT a fabricated fact. Frame as what the user needs to verify or consider.
- **category**: one of "evidence", "access", "competition", "guideline", "timing", "adoption"
- **direction**: "positive" (would favor the outcome if true), "negative" (would oppose), or "neutral" (depends on findings)
- **strength**: "High", "Medium", or "Low" — how much this factor WOULD impact the forecast if confirmed
- **reliability**: 
  - "Confirmed" — ONLY for universally known facts you are certain about
  - "Probable" — for reasonable inferences based on how the market generally works
  - "Speculative" — for anything you are unsure about or that requires verification
- **source_type**: What type of source the user should check (e.g. "clinical_trials_gov", "fda_database", "payer_data", "kol_interviews", "guidelines_review", "competitive_intel", "prescribing_data")
- **rationale**: Why this factor matters for the forecast and what the user should look for

WEIGHT LOGIC:
- Phase 3 efficacy data (if it exists) → High strength, but mark reliability based on YOUR actual knowledge
- Competitive landscape dynamics → High strength, Probable reliability (general market knowledge)
- Payer/access considerations → High strength, Probable reliability (structural market factors)
- KOL sentiment → Medium strength, Speculative reliability (requires primary research)
- Guideline positioning → High strength, but Speculative reliability unless you know for certain
- Patient factors → Medium strength, Speculative reliability

Generate 8-12 signals covering these six categories: evidence, access, competition, guideline, timing, adoption.

For incoming_events, generate 5 events framed as things the user should WATCH FOR — not things that have happened:
{
  "id": "ev-N",
  "title": "Short event title",
  "type": "evidence|access|competition|guideline|adoption",
  "description": "What to watch for and why",
  "relevance": "Why this would matter for the forecast"
}

For market_summary: Describe the ANALYTICAL FRAMEWORK — what categories of evidence matter most for this type of question, and what the user should prioritize investigating. Do NOT state facts about the specific drug unless you are certain they are true.

Return ONLY valid JSON:
{
  "signals": [...],
  "incoming_events": [...],
  "market_summary": "..."
}`;

    const userPrompt = `Generate an analytical signal framework for:

**Subject/Brand**: ${body.subject}
**Forecasting Question**: ${body.questionText}
**Predicted Outcome**: ${body.outcome || "adoption"}
**Time Horizon**: ${body.timeHorizon || "12 months"}
**Question Type**: ${body.questionType || "binary"}
${body.entities?.length ? `**Comparison Groups**: ${body.entities.join(" vs ")}` : ""}

Identify the key factors and considerations that would drive this forecast. Frame each signal as an analytical consideration — what evidence the user needs to find, what market dynamics to evaluate, what data to verify.

DO NOT invent specific facts, dates, trial results, or approval statuses. If you don't recognize this drug/therapy, say so in the market summary and frame signals as "the user should investigate whether..." style considerations.`;

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
