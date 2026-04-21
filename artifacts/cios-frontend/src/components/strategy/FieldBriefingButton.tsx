import { useState } from "react";
import { Loader2, FileText, Users, Stethoscope, FlaskConical, Target, AlertTriangle, X } from "lucide-react";
import SourceLine from "./SourceLine";
import { processClaimsWithTiers, filterAndSortByTier, injectSourceUrls, buildSourceInstructions, type EvidenceTier, type SignalSource } from "./evidence-tier";
import { repairAndParseJson } from "./json-repair";

interface BriefingSection {
  audience: string;
  headline: string;
  keyEvidence: string;
  barrier: string;
  talkingPoint: string;
  recommendedAction: string;
  sourceQuote?: string | null;
  source?: { trialName?: string; journal?: string; year?: string | number; pmid?: string; nct?: string; sourceUrl?: string };
  evidenceTier: EvidenceTier;
}

interface Props {
  brand: string;
  indication?: string;
  forecastProbability?: number;
  primaryConstraint?: string;
  topPositiveDriver?: string;
  topNegativeDriver?: string;
  recommendedAction?: string;
  topSignals?: string[];
  target?: string;
  caseId?: string;
}

export default function FieldBriefingButton({
  brand,
  indication,
  forecastProbability,
  primaryConstraint,
  topPositiveDriver,
  recommendedAction,
  topSignals,
  target,
  caseId,
}: Props) {
  const [sections, setSections] = useState<BriefingSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function deleteClaim(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setSections([]);

    const probPct = forecastProbability != null ? `${Math.round(forecastProbability * 100)}%` : "unknown";
    const signalList = (topSignals || []).join("; ") || "not available";
    const targetStr = target || "achieving the forecasted outcome";

    let signalGroundingBlock = "";
    let diseaseCtxBlock = "";
    let signalSources: SignalSource[] = [];
    if (caseId) {
      try {
        const ctxRes = await fetch(`/api/cases/${caseId}/signal-stack-context`);
        if (ctxRes.ok) {
          const ctxData = await ctxRes.json();
          if (ctxData.diseaseContextBlock) {
            diseaseCtxBlock = `\n\n═══ DISEASE & COMPETITIVE CONTEXT ═══\n${ctxData.diseaseContextBlock}\n═══ END DISEASE CONTEXT ═══`;
          }
          if (ctxData.verifiedSources) {
            signalSources = ctxData.verifiedSources;
          }
          if (ctxData.hasSignalStack && ctxData.constraintBlock) {
            signalGroundingBlock = `\n\n${ctxData.constraintBlock}\n\nCRITICAL CLINICAL FRAMING RULE:\n- All talking points must be drawn from the signal stack and disease context ONLY\n- Use the PRIMARY ENDPOINT exactly as described in the signal stack — do NOT substitute a different endpoint from training data\n- If the primary endpoint is a PRO measure (e.g. respiratory symptom scores), frame all efficacy talking points around that PRO — this is a key differentiator\n- Address PRO skepticism where it exists — acknowledge the concern and counter with the validated PRO data\n- Include safety, dosing, and secondary endpoint evidence from the disease context when available\n- Safety talking points must reference ONLY the adverse events in the signal stack or disease context\n- Dosing/administration points must reflect the ACTUAL regimen from signals\n- If a dimension has no signals (GAP), state: "No [dimension] data in signal stack" instead of fabricating content\n- Source citations must come from the signal stack — do not introduce new PMIDs, DOIs, or NCT numbers`;
          }
        }
      } catch (e) {
        console.warn("Failed to fetch signal stack context:", e);
      }
    }

    const sourceInstructions = buildSourceInstructions(signalSources, `For each section, reference a specific trial or study that supports the evidence. Use real published data — do NOT fabricate PMIDs, NCT numbers, or journal citations.`);

    const prompt = `You are a medical affairs strategist preparing MSL field briefings for ${brand} in ${indication || "its indication"}. Forecast: ${probPct} probability of ${targetStr}. Primary driver: ${topPositiveDriver || "not identified"}. Primary barrier: ${primaryConstraint || "not identified"}. Top evidence: ${signalList}. Recommended action: ${recommendedAction || "not specified"}.${diseaseCtxBlock}

${sourceInstructions}

Generate audience-tailored briefing sections for exactly 4 MSL audiences. Each section must be specific to what THAT audience cares about — different emphasis, different language, different evidence framing. Be concrete to ${brand} and ${indication || "its indication"}.

Audiences: KOL / Investigator, Community Specialist, Hospital Pharmacy Director, Patient Advocacy Liaison.

Return ONLY a JSON array, no other text:
[
  {
    "audience": "KOL / Investigator",
    "headline": "<one-line positioning statement tailored to this audience, max 15 words>",
    "keyEvidence": "<the single most compelling evidence point for THIS audience, max 25 words>",
    "barrier": "<the primary adoption barrier THIS audience faces, max 15 words>",
    "talkingPoint": "<one ready-to-use talking point, max 30 words>",
    "recommendedAction": "<specific next step the MSL should take with this audience, max 20 words>",
    "sourceQuote": "<EXACT text copied from the signal Evidence field>",
    "source": {
      "trialName": "<Source name most relevant to THIS audience's evidence — each audience should cite a DIFFERENT source>",
      "journal": "",
      "year": "",
      "pmid": "",
      "nct": ""
    }
  }
]`;

    try {
      const res = await fetch("/api/strategy/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, maxTokens: 4000 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const text = data.text || "[]";
      const parsed = repairAndParseJson(text);
      const rawClaims = parsed.map((s: any) => ({
        audience: s.audience || "",
        headline: s.headline || "",
        keyEvidence: s.keyEvidence || "",
        barrier: s.barrier || "",
        talkingPoint: s.talkingPoint || "",
        recommendedAction: s.recommendedAction || "",
        sourceQuote: s.sourceQuote || null,
        source: s.source || undefined,
      }));

      const withUrls = injectSourceUrls(rawClaims, signalSources);
      const tiered = await processClaimsWithTiers(withUrls, signalSources);
      const visible = filterAndSortByTier(tiered) as BriefingSection[];
      setSections(visible);
      if (caseId && visible.length > 0) {
        try { localStorage.setItem(`cios.fieldBriefing:${caseId}`, JSON.stringify(visible)); } catch {}
      }
    } catch (e: any) {
      setError(e.message);
      if (caseId) { try { localStorage.removeItem(`cios.fieldBriefing:${caseId}`); } catch {} }
    } finally {
      setLoading(false);
    }
  }

  const audienceIcon = (aud: string) => {
    if (aud.match(/kol|investigator/i)) return <FlaskConical className="w-3.5 h-3.5 text-violet-400" />;
    if (aud.match(/community/i)) return <Stethoscope className="w-3.5 h-3.5 text-violet-400" />;
    if (aud.match(/pharmacy|hospital/i)) return <Users className="w-3.5 h-3.5 text-violet-400" />;
    return <Users className="w-3.5 h-3.5 text-violet-400" />;
  };

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5">
      <div className="flex items-center justify-between px-5 py-4 border-b border-violet-500/20">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-bold text-foreground">Field Briefing</h3>
          <span className="text-xs text-muted-foreground">Audience-tailored MSL briefings</span>
        </div>
        <button
          onClick={generate}
          disabled={!brand || loading}
          className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition disabled:opacity-50 cursor-pointer"
        >
          <FileText className="w-3 h-3" />
          {sections.length > 0 ? "Re-run" : "Run Analysis"}
        </button>
      </div>

      {error && <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>}

      {loading && (
        <div className="px-5 py-6 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          <div>
            <div className="text-sm text-foreground">Generating audience-tailored briefings...</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Preparing MSL talking points for {brand}
            </div>
          </div>
        </div>
      )}

      {sections.length > 0 && (
        <div className="px-5 pb-5 pt-3 space-y-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Audience-Tailored Briefings</div>
          {sections.map((sec, i) => (
            <div key={i} className="rounded-lg border border-border bg-slate-800/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {audienceIcon(sec.audience)}
                  <span className="text-xs font-semibold text-violet-300">{sec.audience}</span>
                  {sec.evidenceTier === "amber" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Unverified source
                    </span>
                  )}
                </div>
                {sec.evidenceTier === "amber" && (
                  <button
                    onClick={() => deleteClaim(i)}
                    className="inline-flex items-center gap-0.5 text-[10px] text-red-400/70 hover:text-red-400 transition cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    Delete
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-medium text-violet-400/80 bg-violet-500/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">Headline</span>
                  <span className="text-xs text-foreground/90 font-medium">{sec.headline}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-medium text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">Evidence</span>
                  <span className="text-xs text-foreground/80">{sec.keyEvidence}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-medium text-rose-400/80 bg-rose-500/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">Barrier</span>
                  <span className="text-xs text-foreground/80">{sec.barrier}</span>
                </div>
                <div className="mt-1.5 pl-2 border-l-2 border-violet-500/30">
                  <span className="text-[10px] text-violet-400/70 font-medium">Talking point: </span>
                  <span className="text-xs text-foreground/70">{sec.talkingPoint}</span>
                </div>
                <div className="flex items-start gap-2 mt-1">
                  <Target className="w-3 h-3 text-amber-400/60 shrink-0 mt-0.5" />
                  <span className="text-[10px] text-amber-300/80">{sec.recommendedAction}</span>
                </div>
                <SourceLine source={sec.source} accentColor="violet" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
