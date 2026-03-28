import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface ConflictResolverInput {
  signals: Array<{
    id: string;
    text: string;
    direction: string;
    strength: string;
    confidence: string;
    source?: string;
    source_type?: string;
  }>;
  question: string;
}

interface ConflictGroup {
  conflictId: string;
  conflictType: "directional" | "magnitude" | "temporal" | "source";
  severity: "critical" | "moderate" | "minor";
  signalIds: string[];
  description: string;
  resolution: {
    strategy: "keep_both" | "prefer_stronger" | "prefer_newer" | "merge" | "flag_for_user" | "remove_weaker";
    rationale: string;
    preferredSignalId?: string;
    mergedText?: string;
    adjustedDirection?: string;
    adjustedStrength?: string;
  };
}

interface ConflictResolverOutput {
  conflicts: ConflictGroup[];
  totalConflicts: number;
  criticalConflicts: number;
  unresolvedCount: number;
  signalCoherence: "coherent" | "mostly_coherent" | "mixed" | "contradictory";
  narrative: string;
}

router.post("/agents/conflict-resolver", async (req: Request, res: Response) => {
  const input = req.body as ConflictResolverInput;

  if (!input.signals?.length) {
    return res.status(400).json({ error: "signals array is required and must not be empty" });
  }
  if (!input.question) {
    return res.status(400).json({ error: "question is required" });
  }

  const systemPrompt = `You are a Conflict Resolver Agent in a clinical intelligence forecasting system.

PURPOSE: Detect and manage conflicting signals across sources. Group conflicts, classify their type and severity, and recommend resolution strategies.

CONFLICT TYPES:
- directional: signals point in opposite directions on the same factor
- magnitude: signals agree on direction but disagree on strength/impact
- temporal: signals from different time periods that may no longer both be valid
- source: conflicting claims from different source types (e.g. KOL vs data)

RESOLUTION STRATEGIES:
- keep_both: both signals are valid perspectives, flag for user awareness
- prefer_stronger: one signal has clearly stronger evidence
- prefer_newer: temporal precedence — newer information supersedes
- merge: combine into a single nuanced signal
- flag_for_user: ambiguous, needs human judgment
- remove_weaker: one signal is clearly superseded

OUTPUT FORMAT (JSON):
{
  "conflicts": [
    {
      "conflictId": "string",
      "conflictType": "directional" | "magnitude" | "temporal" | "source",
      "severity": "critical" | "moderate" | "minor",
      "signalIds": ["string"],
      "description": "string — what's conflicting",
      "resolution": {
        "strategy": "keep_both" | "prefer_stronger" | "prefer_newer" | "merge" | "flag_for_user" | "remove_weaker",
        "rationale": "string",
        "preferredSignalId": "string — optional",
        "mergedText": "string — optional, if strategy is merge",
        "adjustedDirection": "string — optional",
        "adjustedStrength": "string — optional"
      }
    }
  ],
  "totalConflicts": number,
  "criticalConflicts": number,
  "unresolvedCount": number,
  "signalCoherence": "coherent" | "mostly_coherent" | "mixed" | "contradictory",
  "narrative": "string — plain-language summary of the conflict landscape"
}

If no conflicts are detected, return empty conflicts array with signalCoherence "coherent".
Return ONLY valid JSON.`;

  const signalList = input.signals.map(s =>
    `[${s.id}] "${s.text}" — direction: ${s.direction}, strength: ${s.strength}, confidence: ${s.confidence}, source: ${s.source_type || s.source || "unknown"}`
  ).join("\n");

  const userPrompt = `Question: ${input.question}

Signals to check for conflicts:
${signalList}

Identify all conflicts and recommend resolutions.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      seed: 42,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: "No response from model" });
    }

    const parsed = JSON.parse(content) as ConflictResolverOutput;
    const rawConflicts = Array.isArray(parsed.conflicts) ? parsed.conflicts : [];
    const safe: ConflictResolverOutput = {
      conflicts: rawConflicts.map(c => ({
        conflictId: c.conflictId || "",
        conflictType: c.conflictType || "directional",
        severity: c.severity || "minor",
        signalIds: Array.isArray(c.signalIds) ? c.signalIds : [],
        description: c.description || "",
        resolution: {
          strategy: c.resolution?.strategy || "flag_for_user",
          rationale: c.resolution?.rationale || "",
          preferredSignalId: c.resolution?.preferredSignalId,
          mergedText: c.resolution?.mergedText,
          adjustedDirection: c.resolution?.adjustedDirection,
          adjustedStrength: c.resolution?.adjustedStrength,
        },
      })),
      totalConflicts: parsed.totalConflicts || 0,
      criticalConflicts: parsed.criticalConflicts || 0,
      unresolvedCount: parsed.unresolvedCount || 0,
      signalCoherence: parsed.signalCoherence || "coherent",
      narrative: parsed.narrative || "No conflicts detected.",
    };
    res.json(safe);
  } catch (err: any) {
    console.error("[conflict-resolver] Error:", err.message);
    res.status(500).json({ error: "Conflict resolver agent failed", detail: err.message });
  }
});

export default router;
