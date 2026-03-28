import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface ExternalSignalScoutInput {
  activeQuestion: string;
  subject?: string;
  timeHorizon?: string;
  existingSignals?: string[];
}

interface CandidateSignal {
  signalLabel: string;
  source: string;
  sourceDate: string;
  signalType: "regulatory" | "competitive" | "clinical" | "market" | "payer" | "guideline" | "pipeline" | "safety" | "economic";
  suggestedDirection: "positive" | "negative" | "neutral";
  suggestedStrength: "High" | "Medium" | "Low";
  suggestedConfidence: "Confirmed" | "Probable" | "Speculative";
  relevanceScore: number;
  whyItMatters: string;
}

interface ExternalSignalScoutOutput {
  candidates: CandidateSignal[];
  searchContext: string;
  inputHash: string;
}

function hashInput(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

router.post("/agents/external-signal-scout", async (req, res) => {
  try {
    const body = req.body as ExternalSignalScoutInput;

    if (!body.activeQuestion || !body.activeQuestion.trim()) {
      res.status(400).json({ error: "activeQuestion is required" });
      return;
    }

    const activeQuestion = body.activeQuestion.trim();
    const subject = body.subject || "";
    const timeHorizon = body.timeHorizon || "12 months";
    const existingSignals = body.existingSignals || [];

    const existingContext = existingSignals.length > 0
      ? `\n\nThe user already has these signals (do NOT duplicate them):\n${existingSignals.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

    const systemPrompt = `You are an external signal scout for a pharmaceutical intelligence system.

Your single job: identify 5-10 relevant EXTERNAL signals that could affect the outcome of a decision question.

Decision question: "${activeQuestion}"
${subject ? `Subject: ${subject}` : ""}
Time horizon: ${timeHorizon}
${existingContext}

SCOPE BOUNDARY — what you must NOT do:
- Do NOT generate brand-specific clinical evidence (trial results, efficacy data, safety profiles, FDA approvals for the subject brand). That is MIOS's job.
- Do NOT generate adoption barriers or behavioral objections for the subject brand. That is BAOS's job.
- Do NOT estimate probabilities or forecast outcomes. That is the forecast engine's job.
- Do NOT identify market actors or stakeholders. That is the Actor Segmentation agent's job.
- Do NOT resolve signal conflicts. That is the Conflict Resolver's job.

SCOPE — what you SHOULD find:
- Competitor actions, launches, or pipeline events that affect this decision
- Regulatory environment changes (guideline updates, policy shifts, CMS rules)
- Payer landscape changes (formulary decisions, prior auth policy changes)
- Market dynamics (pricing trends, generic entry timelines, market access shifts)
- External clinical events (competitor trial readouts, conference presentations)
- Macroeconomic or system-level changes affecting the therapeutic area

Rules:
1. Only suggest signals that are plausibly real and relevant to this specific decision.
2. Each signal must have a specific source (e.g., "FDA advisory committee", "CMS proposed rule", "ASCO 2025 abstract", "competitor 10-K filing").
3. Each signal must have a plausible date or timeframe.
4. Do NOT forecast. Signals describe what has happened or is expected to happen, not what the outcome will be.
5. Do NOT duplicate any existing signals the user already has.
6. Prioritize signals by relevance to the decision.
7. Signal types: regulatory, competitive, clinical, market, payer, guideline, pipeline, safety, economic.
8. Be specific — "FDA approved competitor drug X" not "regulatory changes."

Respond with valid JSON only. No markdown, no explanation.

Output schema:
{
  "candidates": [
    {
      "signalLabel": "string - clear 1-sentence signal description",
      "source": "string - specific source name",
      "sourceDate": "string - date or timeframe (e.g., 'March 2026', 'Q2 2026', 'Expected H2 2026')",
      "signalType": "regulatory|competitive|clinical|market|payer|guideline|pipeline|safety|economic",
      "suggestedDirection": "positive|negative|neutral",
      "suggestedStrength": "High|Medium|Low",
      "suggestedConfidence": "Confirmed|Probable|Speculative",
      "relevanceScore": 0.0-1.0,
      "whyItMatters": "string - 1-sentence explanation of relevance to the decision"
    }
  ],
  "searchContext": "string - brief description of what domain/topic was searched"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Find external signals relevant to this decision: ${activeQuestion}` },
      ],
      temperature: 0,
      seed: 42,
      max_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content || "";

    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: "Failed to parse signal scout output" });
      return;
    }

    const validTypes = ["regulatory", "competitive", "clinical", "market", "payer", "guideline", "pipeline", "safety", "economic"];
    const validDirections = ["positive", "negative", "neutral"];
    const validStrengths = ["High", "Medium", "Low"];
    const validConfidences = ["Confirmed", "Probable", "Speculative"];

    const candidates: CandidateSignal[] = Array.isArray(parsed.candidates)
      ? parsed.candidates.map((c: any) => ({
          signalLabel: c.signalLabel || "",
          source: c.source || "Unknown",
          sourceDate: c.sourceDate || "Unknown",
          signalType: validTypes.includes(c.signalType) ? c.signalType : "market",
          suggestedDirection: validDirections.includes(c.suggestedDirection) ? c.suggestedDirection : "neutral",
          suggestedStrength: validStrengths.includes(c.suggestedStrength) ? c.suggestedStrength : "Medium",
          suggestedConfidence: validConfidences.includes(c.suggestedConfidence) ? c.suggestedConfidence : "Probable",
          relevanceScore: typeof c.relevanceScore === "number" ? Math.min(1, Math.max(0, c.relevanceScore)) : 0.5,
          whyItMatters: c.whyItMatters || "",
        }))
        .filter((c: CandidateSignal) => c.signalLabel)
        .sort((a: CandidateSignal, b: CandidateSignal) => b.relevanceScore - a.relevanceScore)
      : [];

    const result: ExternalSignalScoutOutput = {
      candidates,
      searchContext: parsed.searchContext || `External signals for: ${subject || activeQuestion.slice(0, 80)}`,
      inputHash: hashInput(activeQuestion + subject + timeHorizon),
    };

    res.json({ externalSignals: result });
  } catch (err) {
    console.error("[agent:external-signal-scout] Error:", err);
    res.status(500).json({ error: "External signal scouting failed" });
  }
});

export default router;
