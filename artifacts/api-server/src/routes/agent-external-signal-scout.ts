import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { extractIdentifiers, detectRedFlags, verifyIdentifier } from "../lib/evidence-verification.js";

const router = Router();

interface ExternalSignalScoutInput {
  activeQuestion: string;
  subject?: string;
  brand?: string;
  programId?: string;
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
  recencyTag: "current" | "recent" | "older_but_relevant" | "outdated";
  sourceGrounded: boolean;
  redFlags: string[];
}

interface ExternalSignalScoutOutput {
  candidates: CandidateSignal[];
  searchContext: string;
  inputHash: string;
}

function computeRecencyTag(sourceDate: string): "current" | "recent" | "older_but_relevant" | null {
  const now = Date.now();
  const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
  const twelveMonthsAgo = now - 365 * 24 * 60 * 60 * 1000;

  const quarterMatch = sourceDate.match(/Q([1-4])\s*(\d{4})/i);
  const halfMatch = sourceDate.match(/H([12])\s*(\d{4})/i);
  const monthYearMatch = sourceDate.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/i);
  const yearOnlyMatch = sourceDate.match(/\b(20\d{2})\b/);

  let estimatedDate: number | null = null;

  if (monthYearMatch) {
    const d = new Date(`${monthYearMatch[1]} 15, ${monthYearMatch[2]}`);
    if (!isNaN(d.getTime())) estimatedDate = d.getTime();
  } else if (quarterMatch) {
    const qMonth = (parseInt(quarterMatch[1]) - 1) * 3;
    const d = new Date(parseInt(quarterMatch[2]), qMonth + 1, 15);
    if (!isNaN(d.getTime())) estimatedDate = d.getTime();
  } else if (halfMatch) {
    const hMonth = halfMatch[1] === "1" ? 3 : 9;
    const d = new Date(parseInt(halfMatch[2]), hMonth, 15);
    if (!isNaN(d.getTime())) estimatedDate = d.getTime();
  } else if (yearOnlyMatch) {
    const d = new Date(parseInt(yearOnlyMatch[1]), 6, 1);
    if (!isNaN(d.getTime())) estimatedDate = d.getTime();
  }

  if (estimatedDate === null) return null;

  if (estimatedDate > now + 365 * 24 * 60 * 60 * 1000) return null;

  if (estimatedDate >= sixMonthsAgo) return "current";
  if (estimatedDate >= twelveMonthsAgo) return "recent";
  return "older_but_relevant";
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
    const programId = body.programId || "";
    const therapeuticArea = body.therapeuticArea || "";
    const indication = body.indication || "";
    const timeHorizon = body.timeHorizon || "12 months";
    const existingSignals = body.existingSignals || [];

    const existingContext = existingSignals.length > 0
      ? `\n\nThe user already has these signals (do NOT duplicate them):\n${existingSignals.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

    const todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const systemPrompt = `You are an external signal scout for a pharmaceutical intelligence system.

Your single job: identify 5-10 relevant EXTERNAL signals that could affect the outcome of a decision question about ${brand || "a specific drug"}.

Today's date: ${todayStr}

Decision question: "${activeQuestion}"
${brand ? `Brand: ${brand}` : ""}
${programId ? `ProgramID: ${programId}` : ""}
${therapeuticArea ? `Therapeutic Area: ${therapeuticArea}` : ""}
${indication ? `Indication: ${indication}` : ""}
Time horizon: ${timeHorizon}
${existingContext}

═══ SCOPE CONSTRAINT (MANDATORY) ═══
You operate ONLY within the scope of the active ProgramID${programId ? ` (${programId})` : ""} for ${brand || "the active brand"}.
You must NOT generate, retrieve, or infer signals from brands, drugs, or programs outside the active ProgramID.
Any reference to Entresto, Repatha, Ofev, Keytruda, Humira, or ANY non-active-brand name is a SCOPE VIOLATION and must be rejected.
The ONLY brand you may reference is ${brand || "the active brand"}. All other brand names are out of scope.
If you cannot produce signals within scope, return an empty candidates array — do NOT fill with out-of-scope content.
═══ END SCOPE CONSTRAINT ═══

SCOPE BOUNDARY — what you must NOT do:
- Do NOT generate brand-specific clinical evidence (trial results, efficacy data, safety profiles, FDA approvals for ${brand || "the subject brand"}). That is MIOS's job.
- Do NOT generate adoption barriers or behavioral objections for ${brand || "the subject brand"}. That is BAOS's job.
- Do NOT estimate probabilities or forecast outcomes. That is the forecast engine's job.
- Do NOT identify market actors or stakeholders. That is the Actor Segmentation agent's job.
- Do NOT resolve signal conflicts. That is the Conflict Resolver's job.
- Do NOT reference or generate signals about any drug/brand other than ${brand || "the active brand"} and its direct competitors within ${therapeuticArea || "the same therapeutic area"}.

SCOPE — what you SHOULD find:
- Competitor actions, launches, or pipeline events that affect ${brand || "this drug"}'s position IN ${therapeuticArea || "THIS THERAPEUTIC AREA"}
- Regulatory environment changes (guideline updates, policy shifts, CMS rules) relevant to ${brand || "this drug"}'s drug category
- Payer landscape changes (formulary decisions, prior auth policy changes) specific to ${therapeuticArea || "this therapeutic area"}
- Market dynamics (pricing trends, generic entry timelines, market access shifts) for ${brand || "this drug"}'s drug class
- External clinical events (competitor trial readouts, conference presentations) in ${indication || "this disease area"}
- System-level changes affecting ${therapeuticArea || "THIS therapeutic area"} specifically

═══ TEMPORAL RELEVANCE (MANDATORY) ═══
Today is ${todayStr}. You must evaluate every signal for temporal relevance.

RECENCY WINDOWS:
- "current": Events from the last 6 months (since ~${new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "long", year: "numeric" })}). PREFERRED. These are the most actionable.
- "recent": Events from 6-12 months ago. ACCEPTABLE. Still relevant for decision-making.
- "older_but_relevant": Events older than 12 months BUT structurally important (foundational trials, landmark guidelines, FDA approvals that set the current landscape). ALLOWED ONLY with justification in whyItMatters.
- "outdated": Events older than 12 months that are not structurally important. NEVER INCLUDE THESE.

TEMPORAL RULES:
1. AT LEAST 70% of signals must be "current" or "recent" (within the last 12 months from today).
2. Signals older than 12 months are only acceptable if they represent a FOUNDATIONAL event still shaping today's landscape (e.g., an FDA approval that created the current market structure, a guideline that remains the standard of care).
3. For older signals, you MUST explain in whyItMatters why the signal is still relevant despite its age.
4. Press releases, conference presentations, and market events older than 12 months should almost never be included — they are likely superseded.
5. sourceDate must reflect realistic dates. Do not invent future dates beyond the forecast horizon (${timeHorizon} from today).
6. When in doubt about recency, prefer a more recent signal over an older one.
═══ END TEMPORAL RELEVANCE ═══

Rules:
1. Only suggest signals that are plausibly real and relevant to this specific decision about ${brand || "the active brand"}.
2. Every signal must be relevant to ${brand || "the active brand"} within ${therapeuticArea || "its therapeutic area"}. Do NOT surface signals from unrelated therapeutic areas or unrelated brands.
3. Each signal must have a specific source (e.g., "FDA advisory committee", "CMS proposed rule", "ASCO 2025 abstract", "competitor 10-K filing").
4. Each signal must have a plausible date or timeframe relative to today (${todayStr}).
5. Do NOT forecast. Signals describe what has happened or is expected to happen, not what the outcome will be.
6. Do NOT duplicate any existing signals the user already has.
7. Prioritize signals by relevance to ${brand || "the active brand"}. Cut anything that would not matter to this specific brand team.
8. Signal types: regulatory, competitive, clinical, market, payer, guideline, pipeline, safety, economic.
9. Be specific — "FDA approved competitor drug X for NSCLC" not "regulatory changes."
10. Think: "Would ${brand || "this brand"}'s team put this signal on their competitive landscape slide?" If not, leave it out.
11. Signals must be dated realistically. Press releases and market events should be from the last 12 months unless structurally foundational.

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
      "whyItMatters": "string - 1-sentence explanation of relevance to the decision. For older signals, MUST explain why still relevant.",
      "recencyTag": "current|recent|older_but_relevant"
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

    const validRecencyTags = ["current", "recent", "older_but_relevant"];

    const candidates: CandidateSignal[] = Array.isArray(parsed.candidates)
      ? parsed.candidates
        .filter((c: any) => c.recencyTag !== "outdated")
        .map((c: any) => {
          const llmTag = validRecencyTags.includes(c.recencyTag) ? c.recencyTag : "recent";
          const computedTag = computeRecencyTag(c.sourceDate || "");
          const finalTag = computedTag || llmTag;

          let score = typeof c.relevanceScore === "number" ? Math.min(1, Math.max(0, c.relevanceScore)) : 0.5;
          if (finalTag === "older_but_relevant") {
            score = Math.min(score, 0.65);
          }

          // Run red flag detection and identifier extraction on signal text
          const signalText = `${c.signalLabel || ""} ${c.source || ""} ${c.whyItMatters || ""}`;
          const { identifiers } = extractIdentifiers(signalText);
          const redFlags = detectRedFlags(signalText, identifiers.length);
          const sourceGrounded = identifiers.length > 0; // Has at least one verifiable identifier

          return {
            signalLabel: c.signalLabel || "",
            source: c.source || "Unknown",
            sourceDate: c.sourceDate || "Unknown",
            signalType: validTypes.includes(c.signalType) ? c.signalType : "market",
            suggestedDirection: validDirections.includes(c.suggestedDirection) ? c.suggestedDirection : "neutral",
            suggestedStrength: validStrengths.includes(c.suggestedStrength) ? c.suggestedStrength : "Medium",
            suggestedConfidence: validConfidences.includes(c.suggestedConfidence) ? c.suggestedConfidence : "Probable",
            relevanceScore: score,
            whyItMatters: c.whyItMatters || "",
            recencyTag: finalTag,
            sourceGrounded,
            redFlags,
          };
        })
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
