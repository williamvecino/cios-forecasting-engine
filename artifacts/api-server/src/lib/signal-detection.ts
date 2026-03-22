import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { casesTable } from "@workspace/db";
import { like, or, ilike } from "drizzle-orm";

const DETECTION_SYSTEM_PROMPT = `You are a pharmaceutical and medtech market intelligence analyst. Your task is to scan source text and extract candidate signals that may affect healthcare provider adoption of drugs, devices, diagnostics, or therapeutic interventions.

For each signal you detect, output a JSON object with these fields:
- evidenceSnippet: the key excerpt or sentence from the source that supports this signal (verbatim or close paraphrase, max 300 chars)
- signalType: one of exactly ["Clinical", "Access", "Regulatory", "KOL", "Operational", "Competitor", "Safety", "InstitutionalReadiness", "ReferralBehavior"]
- suggestedDirection: "positive" (supports adoption), "negative" (hinders adoption), or "neutral"
- suggestedStrength: "low", "medium", or "high"
- suggestedScope: "market", "specialty", "subspecialty", "institution", or "physician"
- extractionConfidence: "low", "medium", or "high" — how confident you are this is a real signal
- possibleEventFamily: a short label grouping related signals (e.g., "FDA approval Q1 2026", "ASCO 2025 data")
- detectedDate: ISO date if mentioned in text, or null
- therapyArea: the therapy area if detectable, or null
- geography: geography if detectable, or null
- specialty: medical specialty if detectable, or null
- subspecialty: subspecialty if detectable, or null
- institutionName: institution name if mentioned, or null
- physicianName: physician name if mentioned, or null

Signal type guidance:
- Clinical: Trial results, efficacy data, endpoint results, phase transitions
- Access: Payer decisions, formulary status, prior auth changes, reimbursement
- Regulatory: FDA actions, approvals, label changes, warning letters, REMS
- KOL: Key opinion leader endorsements, conference presentations, advocacy
- Operational: Workflow friction, administration burden, logistics challenges
- Competitor: Competitive launches, market entries, LOE, switching trends
- Safety: Adverse events, safety signals, black box warnings, recalls
- InstitutionalReadiness: Hospital formulary, P&T decisions, protocol adoption
- ReferralBehavior: Referral pattern changes, diagnostic pathway shifts

Output ONLY a valid JSON array of signal objects. No markdown, no preamble. If no signals found, output [].`;

export interface DetectionInput {
  sources: { label: string; url?: string; text: string }[];
  therapyArea?: string;
  geography?: string;
  targetType?: string;
  specialty?: string;
  subspecialty?: string;
}

export interface DetectedSignalRaw {
  evidenceSnippet: string;
  signalType: string;
  suggestedDirection: string;
  suggestedStrength: string;
  suggestedScope: string;
  extractionConfidence: string;
  possibleEventFamily: string | null;
  detectedDate: string | null;
  therapyArea: string | null;
  geography: string | null;
  specialty: string | null;
  subspecialty: string | null;
  institutionName: string | null;
  physicianName: string | null;
  sourceLabel: string;
  sourceUrl: string | null;
}

const VALID_SIGNAL_TYPES = ["Clinical", "Access", "Regulatory", "KOL", "Operational", "Competitor", "Safety", "InstitutionalReadiness", "ReferralBehavior"];
const VALID_DIRECTIONS = ["positive", "negative", "neutral"];
const VALID_STRENGTHS = ["low", "medium", "high"];
const VALID_SCOPES = ["market", "specialty", "subspecialty", "institution", "physician"];
const VALID_CONFIDENCES = ["low", "medium", "high"];

function sanitize(raw: any, source: { label: string; url?: string }): DetectedSignalRaw | null {
  if (!raw?.evidenceSnippet || typeof raw.evidenceSnippet !== "string") return null;

  return {
    evidenceSnippet: raw.evidenceSnippet.slice(0, 500),
    signalType: VALID_SIGNAL_TYPES.includes(raw.signalType) ? raw.signalType : "Clinical",
    suggestedDirection: VALID_DIRECTIONS.includes(raw.suggestedDirection) ? raw.suggestedDirection : "neutral",
    suggestedStrength: VALID_STRENGTHS.includes(raw.suggestedStrength) ? raw.suggestedStrength : "medium",
    suggestedScope: VALID_SCOPES.includes(raw.suggestedScope) ? raw.suggestedScope : "market",
    extractionConfidence: VALID_CONFIDENCES.includes(raw.extractionConfidence) ? raw.extractionConfidence : "medium",
    possibleEventFamily: raw.possibleEventFamily ?? null,
    detectedDate: raw.detectedDate ?? null,
    therapyArea: raw.therapyArea ?? null,
    geography: raw.geography ?? null,
    specialty: raw.specialty ?? null,
    subspecialty: raw.subspecialty ?? null,
    institutionName: raw.institutionName ?? null,
    physicianName: raw.physicianName ?? null,
    sourceLabel: source.label,
    sourceUrl: source.url ?? null,
  };
}

export async function extractSignalsFromSource(source: { label: string; url?: string; text: string }): Promise<DetectedSignalRaw[]> {
  const truncatedText = source.text.slice(0, 12000);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: DETECTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Extract all adoption-relevant signals from the following source.\n\nSource: ${source.label}${source.url ? ` (${source.url})` : ""}\n\n---\n${truncatedText}\n---\n\nReturn only valid JSON array.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "[]";
  let parsed: any[];
  try {
    parsed = JSON.parse(raw.replace(/```json\n?|```\n?/g, "").trim());
    if (!Array.isArray(parsed)) parsed = [];
  } catch {
    parsed = [];
  }

  return parsed.map(r => sanitize(r, source)).filter((s): s is DetectedSignalRaw => s !== null);
}

export async function matchSignalsToCases(signals: DetectedSignalRaw[]): Promise<{ detectedSignalId: string; caseId: string; matchConfidence: string; matchReason: string }[]> {
  const allCases = await db.select().from(casesTable);
  if (allCases.length === 0) return [];

  const suggestions: { detectedSignalId: string; caseId: string; matchConfidence: string; matchReason: string }[] = [];

  for (const sig of signals) {
    for (const c of allCases) {
      const reasons: string[] = [];
      let score = 0;

      if (sig.therapyArea && c.therapeuticArea && c.therapeuticArea.toLowerCase().includes(sig.therapyArea.toLowerCase())) {
        reasons.push("Therapy area overlap");
        score += 3;
      }
      if (sig.geography && c.geography && c.geography.toLowerCase().includes(sig.geography.toLowerCase())) {
        reasons.push("Geography overlap");
        score += 2;
      }
      if (sig.specialty && c.specialty && c.specialty.toLowerCase().includes(sig.specialty.toLowerCase())) {
        reasons.push("Specialty overlap");
        score += 2;
      }
      if (sig.subspecialty && c.subspecialty && c.subspecialty.toLowerCase().includes(sig.subspecialty.toLowerCase())) {
        reasons.push("Subspecialty overlap");
        score += 2;
      }

      if (score > 0) {
        suggestions.push({
          detectedSignalId: "",
          caseId: c.caseId,
          matchConfidence: score >= 5 ? "high" : score >= 3 ? "medium" : "low",
          matchReason: reasons.join(", "),
        });
      }
    }
  }

  return suggestions;
}
