import { useState } from "react";
import { Loader2, DollarSign, Shield, Target, AlertTriangle, X } from "lucide-react";
import SourceLine from "./SourceLine";
import { processClaimsWithTiers, filterAndSortByTier, injectSourceUrls, buildSourceInstructions, type EvidenceTier, type SignalSource } from "./evidence-tier";
import { repairAndParseJson } from "./json-repair";

interface PayerSection {
  payerType: string;
  coverageOutlook: string;
  clinicalArgument: string;
  economicArgument: string;
  primaryBarrier: string;
  engagementStrategy: string;
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
  topPositiveSignals?: string[];
  accessBarrierSignal?: string;
  caseId?: string;
}

export default function PayerDossierButton({
  brand,
  indication,
  forecastProbability,
  topPositiveSignals,
  accessBarrierSignal,
  primaryConstraint,
  topPositiveDriver,
  caseId,
}: Props) {
  const [sections, setSections] = useState<PayerSection[]>([]);
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
    const clinicalEvidence = (topPositiveSignals || []).join("; ") || "not available";
    const accessBarrier = accessBarrierSignal || primaryConstraint || "not identified";

    // Determine top negative signal family for deterministic Medicare Part D rule.
    // Rule: if top negative signal family is Clinical Efficacy and direction is Negative,
    // Medicare Part D coverageOutlook MUST default to PA Required (not Unrestricted).
    let topNegativeFamily: string | null = null;
    let topNegativeDescription: string | null = null;
    let medicareForcedToPA = false;
    const isClinicalEfficacyFamily = (fam: string | null | undefined): boolean => {
      const f = (fam || "").toLowerCase();
      if (!f) return false;
      return (
        /clinical\s*efficacy/.test(f) ||
        /clinical\s*evidence\s*strength/.test(f) ||
        (/clinical/.test(f) && /efficacy|evidence|differentiation/.test(f))
      );
    };
    if (caseId) {
      try {
        const sigRes = await fetch(`/api/cases/${caseId}/signals`);
        if (sigRes.ok) {
          const allSignals: any[] = await sigRes.json();
          // A signal is "effectively negative" if EITHER its declared direction
          // is negative OR its LR < 1 (parsed safely; missing LR defaults to 1
          // which excludes it). Sort by LR ascending (lowest = most negative).
          const negatives = allSignals
            .map((s) => ({ s, lr: Number.isFinite(Number(s.likelihoodRatio)) ? Number(s.likelihoodRatio) : 1 }))
            .filter(({ s, lr }) => (s.direction || "").toLowerCase() === "negative" || lr < 1)
            .sort((a, b) => a.lr - b.lr)
            .map(({ s }) => s);
          const top = negatives[0];
          if (top) {
            topNegativeFamily = (top.signalFamily || "").trim() || null;
            topNegativeDescription = top.signalDescription || top.signalType || null;
            // Trigger PA rule if the top negative is in the clinical efficacy
            // family. If the top negative's family is missing or non-clinical,
            // fall back to the strongest negative whose family IS clinical
            // efficacy — this protects against payer/operational signals masking
            // a clinically dominant disadvantage.
            if (isClinicalEfficacyFamily(topNegativeFamily)) {
              medicareForcedToPA = true;
            } else {
              const clinicalFallback = negatives.find((s) => isClinicalEfficacyFamily(s.signalFamily));
              if (clinicalFallback) {
                topNegativeFamily = (clinicalFallback.signalFamily || "").trim() || null;
                topNegativeDescription = clinicalFallback.signalDescription || clinicalFallback.signalType || null;
                medicareForcedToPA = true;
              }
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch signals for Medicare Part D rule:", e);
      }
    }

    const medicareRuleBlock = medicareForcedToPA
      ? `\n\n═══ DETERMINISTIC PAYER RULE (MANDATORY) ═══\nThe top negative signal on this case is in the Clinical Efficacy family ("${topNegativeDescription || topNegativeFamily}"). Per CIOS payer governance, when a clinical efficacy disadvantage versus an established class is the dominant negative signal, the Medicare Part D Plan coverageOutlook MUST be "PA Required" (NOT "Unrestricted"). Do not override this. Other payer types are not constrained by this rule.\n═══ END DETERMINISTIC PAYER RULE ═══`
      : "";

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
            signalGroundingBlock = `\n\n${ctxData.constraintBlock}\n\nCRITICAL CLINICAL FRAMING RULE FOR PAYER ARGUMENTS:\n- Reference the ACTUAL trial design and outcomes from the signal stack and disease context — do NOT extrapolate\n- Use the PRIMARY ENDPOINT exactly as described in signals — if it is a PRO measure, the value argument must frame clinical benefit around that PRO\n- Include safety profile and dosing/administration data from the disease context to strengthen payer arguments\n- Reference secondary endpoints and exploratory data from disease context when they support the value story\n- Do NOT generate cost-effectiveness claims not supported by signals — if no health economics signals exist, state the gap\n- Safety arguments must reference ONLY the adverse events in the signal stack or disease context\n- Dosing/administration cost implications must reflect the ACTUAL regimen from signals\n- Do NOT introduce any clinical claims, trial names, PMIDs, NCT numbers, or QALY estimates not in the signal stack\n- If a dimension is marked GAP, state: "No [dimension] data in signal stack — value argument not generated for this dimension"`;
          }
        }
      } catch (e) {
        console.warn("Failed to fetch signal stack context:", e);
      }
    }

    const sourceInstructions = buildSourceInstructions(signalSources, `For each section, reference the most authoritative source. Use real published data — do NOT fabricate PMIDs, NCT numbers, CMS URLs, or policy names.`);

    const prompt = `You are a market access strategist building payer-specific value arguments for ${brand} in ${indication || "its indication"}. Forecast: ${probPct}. Clinical evidence: ${clinicalEvidence}. Primary driver: ${topPositiveDriver || "not identified"}. Access barrier: ${accessBarrier}.${diseaseCtxBlock}${medicareRuleBlock}

${sourceInstructions}

Generate audience-tailored value arguments for exactly 3 payer types. Each must be specific to what THAT payer cares about — different cost framing, different clinical emphasis, different engagement tactics. Be concrete to ${brand}.

Payer types: Commercial P&T Committee, Medicare Part D Plan, Medicaid / State Program.

Return ONLY a JSON array, no other text:
[
  {
    "payerType": "Commercial P&T Committee",
    "coverageOutlook": "<likely coverage decision: Unrestricted / PA Required / Step Therapy / Non-Formulary, max 5 words>",
    "clinicalArgument": "<the single strongest clinical argument for THIS payer, max 25 words>",
    "economicArgument": "<cost-effectiveness or budget impact framing, max 25 words>",
    "primaryBarrier": "<the biggest access barrier with THIS payer type, max 15 words>",
    "engagementStrategy": "<specific recommended engagement tactic for THIS payer, max 20 words>",
    "sourceQuote": "<EXACT text copied from the signal Evidence field>",
    "source": {
      "trialName": "<Source name most relevant to THIS payer's argument — each payer type should cite a DIFFERENT source>",
      "journal": "",
      "year": "",
      "pmid": "",
      "nct": "",
      "cmsUrl": "",
      "payerSourceType": "",
      "policyName": ""
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
      const rawClaims = parsed.map((s: any) => {
        let coverageOutlook = s.coverageOutlook || "";
        // Deterministic post-LLM enforcement: when the top negative signal is in the
        // Clinical Efficacy family, Medicare Part D cannot be Unrestricted.
        if (medicareForcedToPA && /medicare\s*part\s*d/i.test(s.payerType || "")) {
          if (!/pa\s*required|prior\s*auth/i.test(coverageOutlook)) {
            coverageOutlook = "PA Required";
          }
        }
        return {
          payerType: s.payerType || "",
          coverageOutlook,
          clinicalArgument: s.clinicalArgument || "",
          economicArgument: s.economicArgument || "",
          primaryBarrier: s.primaryBarrier || "",
          engagementStrategy: s.engagementStrategy || "",
          sourceQuote: s.sourceQuote || null,
          source: s.source || undefined,
        };
      });

      const withUrls = injectSourceUrls(rawClaims, signalSources);
      const tiered = await processClaimsWithTiers(withUrls, signalSources);
      const visible = filterAndSortByTier(tiered) as PayerSection[];
      setSections(visible);
      if (caseId && visible.length > 0) {
        try { localStorage.setItem(`cios.payerDossier:${caseId}`, JSON.stringify(visible)); } catch {}
      }
    } catch (e: any) {
      setError(e.message);
      if (caseId) { try { localStorage.removeItem(`cios.payerDossier:${caseId}`); } catch {} }
    } finally {
      setLoading(false);
    }
  }

  const outlookColor = (outlook: string) => {
    const l = outlook.toLowerCase();
    if (l.includes("unrestricted")) return "text-emerald-400 bg-emerald-500/10";
    if (l.includes("pa") || l.includes("prior")) return "text-amber-400 bg-amber-500/10";
    if (l.includes("step")) return "text-orange-400 bg-orange-500/10";
    return "text-rose-400 bg-rose-500/10";
  };

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5">
      <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-foreground">Payer Dossier</h3>
          <span className="text-xs text-muted-foreground">Audience-tailored value arguments</span>
        </div>
        <button
          onClick={generate}
          disabled={!brand || loading}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-50 cursor-pointer"
        >
          <DollarSign className="w-3 h-3" />
          {sections.length > 0 ? "Re-run" : "Run Analysis"}
        </button>
      </div>

      {error && <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>}

      {loading && (
        <div className="px-5 py-6 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <div>
            <div className="text-sm text-foreground">Generating payer value arguments...</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Building audience-tailored dossier for {brand}
            </div>
          </div>
        </div>
      )}

      {sections.length > 0 && (
        <div className="px-5 pb-5 pt-3 space-y-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Payer-Specific Value Arguments</div>
          {sections.map((sec, i) => (
            <div key={i} className="rounded-lg border border-border bg-slate-800/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-300">{sec.payerType}</span>
                  {sec.evidenceTier === "amber" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Unverified source
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {sec.evidenceTier === "amber" && (
                    <button
                      onClick={() => deleteClaim(i)}
                      className="inline-flex items-center gap-0.5 text-[10px] text-red-400/70 hover:text-red-400 transition cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      Delete
                    </button>
                  )}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${outlookColor(sec.coverageOutlook)}`}>
                    {sec.coverageOutlook}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-medium text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">Clinical</span>
                  <span className="text-xs text-foreground/80">{sec.clinicalArgument}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-medium text-blue-400/80 bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">Economic</span>
                  <span className="text-xs text-foreground/80">{sec.economicArgument}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-medium text-rose-400/80 bg-rose-500/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">Barrier</span>
                  <span className="text-xs text-foreground/80">{sec.primaryBarrier}</span>
                </div>
                <div className="flex items-start gap-2 mt-1">
                  <Target className="w-3 h-3 text-amber-400/60 shrink-0 mt-0.5" />
                  <span className="text-[10px] text-amber-300/80">{sec.engagementStrategy}</span>
                </div>
                <SourceLine source={sec.source} accentColor="emerald" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
