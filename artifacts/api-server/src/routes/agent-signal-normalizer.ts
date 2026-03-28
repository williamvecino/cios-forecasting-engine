import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface RawSignal {
  id: string;
  text: string;
  direction: "positive" | "negative" | "neutral";
  strength: "High" | "Medium" | "Low";
  confidence: "Confirmed" | "Probable" | "Speculative";
  source: string;
  sourceType?: string;
  category?: string;
  signalSource?: string;
}

interface NormalizedSignal {
  id: string;
  originalIds: string[];
  text: string;
  direction: "positive" | "negative" | "neutral";
  strength: "High" | "Medium" | "Low";
  confidence: "Confirmed" | "Probable" | "Speculative";
  source: string;
  sourceType: string;
  category: string;
  isDuplicate: boolean;
  duplicateOf: string | null;
  conflictsWith: string | null;
  conflictType: string | null;
  mergedFrom: string[];
  normalizedScore: number;
}

interface SignalNormalizerOutput {
  normalizedSignals: NormalizedSignal[];
  duplicatesRemoved: number;
  conflictsDetected: number;
  mergeActions: Array<{
    action: "merged" | "flagged" | "kept";
    signalIds: string[];
    reason: string;
  }>;
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

const STRENGTH_SCORE: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const CONFIDENCE_SCORE: Record<string, number> = { Confirmed: 3, Probable: 2, Speculative: 1 };

function computeNormalizedScore(strength: string, confidence: string): number {
  const s = STRENGTH_SCORE[strength] || 2;
  const c = CONFIDENCE_SCORE[confidence] || 2;
  return Math.round(((s + c) / 6) * 100) / 100;
}

router.post("/agents/signal-normalizer", async (req, res) => {
  try {
    const body = req.body as { signals: RawSignal[]; activeQuestion?: string };

    if (!body.signals || !Array.isArray(body.signals) || body.signals.length === 0) {
      res.status(400).json({ error: "signals array is required and must not be empty" });
      return;
    }

    const signals = body.signals;
    const activeQuestion = body.activeQuestion || "";

    if (signals.length <= 3) {
      const normalized: NormalizedSignal[] = signals.map((s) => ({
        id: s.id,
        originalIds: [s.id],
        text: s.text,
        direction: s.direction || "neutral",
        strength: s.strength || "Medium",
        confidence: s.confidence || "Probable",
        source: s.source || "unknown",
        sourceType: s.sourceType || "manual",
        category: s.category || "evidence",
        isDuplicate: false,
        duplicateOf: null,
        conflictsWith: null,
        conflictType: null,
        mergedFrom: [],
        normalizedScore: computeNormalizedScore(s.strength || "Medium", s.confidence || "Probable"),
      }));

      const result: SignalNormalizerOutput = {
        normalizedSignals: normalized,
        duplicatesRemoved: 0,
        conflictsDetected: 0,
        mergeActions: [],
        inputHash: hashInput(JSON.stringify(signals.map((s) => s.text))),
      };

      res.json({ normalization: result });
      return;
    }

    const signalSummary = signals.map((s, i) => (
      `[${s.id}] "${s.text}" | dir=${s.direction} str=${s.strength} conf=${s.confidence} src=${s.sourceType || s.source || "unknown"} cat=${s.category || "evidence"}`
    )).join("\n");

    const systemPrompt = `You are a signal normalizer and deduplicator for a pharmaceutical intelligence system.

Your single job: analyze a set of signals and identify duplicates and overlaps. Flag potential conflicts but do NOT resolve them.

${activeQuestion ? `Decision question context: "${activeQuestion}"` : ""}

SCOPE BOUNDARY — what you must NOT do:
- Do NOT resolve conflicts or recommend which signal is correct. That is the Conflict Resolver's job.
- Do NOT score signal quality or reliability. That is the Signal Quality agent's job.
- Do NOT generate new signals. That is MIOS, BAOS, or External Signal Scout's job.
- Do NOT estimate probabilities. That is the forecast engine's job.
- You only NORMALIZE structure and DETECT duplicates — you do not judge content.

Rules:
1. Two signals are duplicates if they describe the same fact from different sources or with different wording.
2. Two signals conflict if they describe contradictory outcomes for the same topic.
3. When signals overlap partially, flag them but do not merge automatically.
4. Preserve provenance — note which original signal IDs were analyzed.
5. For each pair of duplicates, keep the one with higher confidence/strength, mark the other as duplicate.
6. For conflicts, flag both with the conflict partner ID — do not resolve conflicts, only detect them.

Respond with valid JSON only. No markdown, no explanation.

Output schema:
{
  "duplicatePairs": [
    {
      "keepId": "string - ID of signal to keep",
      "removeId": "string - ID of duplicate to mark",
      "reason": "string - why these are duplicates"
    }
  ],
  "conflictPairs": [
    {
      "signalId1": "string",
      "signalId2": "string",
      "conflictType": "direction|strength|interpretation",
      "reason": "string"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze these signals for duplicates and conflicts:\n\n${signalSummary}` },
      ],
      temperature: 0,
      seed: 42,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || "";

    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const normalized: NormalizedSignal[] = signals.map((s) => ({
        id: s.id,
        originalIds: [s.id],
        text: s.text,
        direction: s.direction || "neutral",
        strength: s.strength || "Medium",
        confidence: s.confidence || "Probable",
        source: s.source || "unknown",
        sourceType: s.sourceType || "manual",
        category: s.category || "evidence",
        isDuplicate: false,
        duplicateOf: null,
        conflictsWith: null,
        conflictType: null,
        mergedFrom: [],
        normalizedScore: computeNormalizedScore(s.strength || "Medium", s.confidence || "Probable"),
      }));

      res.json({
        normalization: {
          normalizedSignals: normalized,
          duplicatesRemoved: 0,
          conflictsDetected: 0,
          mergeActions: [],
          inputHash: hashInput(JSON.stringify(signals.map((s) => s.text))),
        },
      });
      return;
    }

    const duplicatePairs: Array<{ keepId: string; removeId: string; reason: string }> = Array.isArray(parsed.duplicatePairs) ? parsed.duplicatePairs : [];
    const conflictPairs: Array<{ signalId1: string; signalId2: string; conflictType: string; reason: string }> = Array.isArray(parsed.conflictPairs) ? parsed.conflictPairs : [];

    const duplicateIds = new Set(duplicatePairs.map((d) => d.removeId));
    const duplicateOfMap = new Map(duplicatePairs.map((d) => [d.removeId, d.keepId]));

    const conflictMap = new Map<string, { partnerId: string; type: string }>();
    for (const cp of conflictPairs) {
      conflictMap.set(cp.signalId1, { partnerId: cp.signalId2, type: cp.conflictType || "direction" });
      conflictMap.set(cp.signalId2, { partnerId: cp.signalId1, type: cp.conflictType || "direction" });
    }

    const mergeActions: SignalNormalizerOutput["mergeActions"] = [];
    for (const dp of duplicatePairs) {
      mergeActions.push({
        action: "merged",
        signalIds: [dp.keepId, dp.removeId],
        reason: dp.reason,
      });
    }
    for (const cp of conflictPairs) {
      mergeActions.push({
        action: "flagged",
        signalIds: [cp.signalId1, cp.signalId2],
        reason: cp.reason,
      });
    }

    const signalMap = new Map(signals.map((s) => [s.id, s]));

    const normalized: NormalizedSignal[] = signals.map((s) => {
      const conflict = conflictMap.get(s.id);
      const isDup = duplicateIds.has(s.id);
      const dupOf = duplicateOfMap.get(s.id) || null;

      const mergedFrom: string[] = [];
      for (const dp of duplicatePairs) {
        if (dp.keepId === s.id) {
          mergedFrom.push(dp.removeId);
        }
      }

      return {
        id: s.id,
        originalIds: [s.id, ...mergedFrom],
        text: s.text,
        direction: s.direction || "neutral",
        strength: s.strength || "Medium",
        confidence: s.confidence || "Probable",
        source: s.source || "unknown",
        sourceType: s.sourceType || "manual",
        category: s.category || "evidence",
        isDuplicate: isDup,
        duplicateOf: dupOf,
        conflictsWith: conflict?.partnerId || null,
        conflictType: conflict?.type || null,
        mergedFrom,
        normalizedScore: computeNormalizedScore(s.strength || "Medium", s.confidence || "Probable"),
      };
    });

    const result: SignalNormalizerOutput = {
      normalizedSignals: normalized,
      duplicatesRemoved: duplicatePairs.length,
      conflictsDetected: conflictPairs.length,
      mergeActions,
      inputHash: hashInput(JSON.stringify(signals.map((s) => s.text))),
    };

    res.json({ normalization: result });
  } catch (err) {
    console.error("[agent:signal-normalizer] Error:", err);
    res.status(500).json({ error: "Signal normalization failed" });
  }
});

export default router;
