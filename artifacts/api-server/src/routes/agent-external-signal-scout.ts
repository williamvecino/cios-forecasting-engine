import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface ExternalSignalScoutInput {
  activeQuestion: string;
  subject?: string;
  brand?: string;
  therapeuticArea?: string;
  indication?: string;
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
    const subject = body.subject || body.brand || "";
    const brand = body.brand || body.subject || "";
    const therapeuticArea = body.therapeuticArea || "";
    const indication = body.indication || "";
    const timeHorizon = body.timeHorizon || "12 months";
    const existingSignals = body.existingSignals || [];

    const existingContext = existingSignals.length > 0
      ? `\n\nThe user already has these signals (do NOT duplicate them):\n${existingSignals.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

    const systemPrompt = `You are an external signal scout for a pharmaceutical intelligence system.

Your single job: identify 5-10 relevant EXTERNAL signals that could affect the outcome of a decision question about ${brand || "a specific drug"}.

Decision question: "${activeQuestion}"
${brand ? `Brand: ${brand}` : ""}
${subject && subject !== brand ? `Subject: ${subject}` : ""}
${therapeuticArea ? `Therapeutic Area: ${therapeuticArea}` : ""}
${indication ? `Indication: ${indication}` : ""}
Time horizon: ${timeHorizon}
${existingContext}

SCOPE BOUNDARY — what you must NOT do:
- Do NOT generate brand-specific clinical evidence (trial results, efficacy data, safety profiles, FDA approvals for the subject brand). That is MIOS's job.
- Do NOT generate adoption barriers or behavioral objections for the subject brand. That is BAOS's job.
- Do NOT estimate probabilities or forecast outcomes. That is the forecast engine's job.
- Do NOT identify market actors or stakeholders. That is the Actor Segmentation agent's job.
- Do NOT resolve signal conflicts. That is the Conflict Resolver's job.

SCOPE — what you SHOULD find:
- Competitor actions, launches, or pipeline events that affect this decision IN THIS THERAPEUTIC AREA
- Regulatory environment changes (guideline updates, policy shifts, CMS rules) relevant to this drug category
- Payer landscape changes (formulary decisions, prior auth policy changes) specific to this therapeutic area
- Market dynamics (pricing trends, generic entry timelines, market access shifts) for this drug class
- External clinical events (competitor trial readouts, conference presentations) in this disease area
- System-level changes affecting THIS therapeutic area specifically

Rules:
1. Only suggest signals that are plausibly real and relevant to this specific decision.
2. Every signal must be relevant to the SAME therapeutic area and disease context as the question. Do NOT surface signals from unrelated therapeutic areas — a cardiology signal is noise for an oncology question.
3. Each signal must have a specific source (e.g., "FDA advisory committee", "CMS proposed rule", "ASCO 2025 abstract", "competitor 10-K filing").
4. Each signal must have a plausible date or timeframe.
5. Do NOT forecast. Signals describe what has happened or is expected to happen, not what the outcome will be.
6. Do NOT duplicate any existing signals the user already has.
7. Prioritize signals by relevance to the decision. Cut anything that would not matter to the brand team.
8. Signal types: regulatory, competitive, clinical, market, payer, guideline, pipeline, safety, economic.
9. Be specific — "FDA approved competitor drug X for NSCLC" not "regulatory changes."
10. Think: "Would a pharma strategist put this signal on the competitive landscape slide for this drug?" If not, leave it out.

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
        { role: "user", content: `Find external signals in ${therapeuticArea || "this therapeutic area"} relevant to ${brand || "this drug"}: ${activeQuestion}` },
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
