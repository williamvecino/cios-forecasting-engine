import { useState } from "react";
import { Loader2, FlaskConical, Brain, CheckCircle2, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface MiosEvidence {
  beliefShift: string;
  evidenceText: string;
  trialOrSource: string;
  direction: "positive" | "negative";
  strength: string;
  confidence: string;
  whyItMatters: string;
  relevanceToQuestion: string;
}

interface BaosBarrier {
  cognitiveLens: string;
  barrierText: string;
  triggeringEvidence: string;
  direction: "positive" | "negative";
  strength: string;
  confidence: string;
  whyItMatters: string;
  affectedSegment: string;
}

interface MiosResult {
  brand: string;
  beliefShiftsIdentified: string[];
  evidenceSignals: MiosEvidence[];
  searchSummary: string;
}

interface BaosResult {
  brand: string;
  barrierSignals: BaosBarrier[];
  barrierSummary: string;
}

interface AcceptedSignal {
  id: string;
  text: string;
  caveat: string;
  direction: "positive" | "negative" | "neutral";
  strength: "High" | "Medium" | "Low";
  reliability: "Confirmed" | "Probable" | "Speculative";
  impact: "High" | "Medium" | "Low";
  category: string;
  source: string;
  accepted: boolean;
  signal_class: string;
  signal_family: string;
  source_type: string;
  priority_source: string;
  is_locked: boolean;
  workbook_meta: {
    sourceWorkbook: string;
    programId: string;
    whyItMatters: string;
    trialOrSource?: string;
    cognitiveLens?: string;
  };
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export default function MiosBaosPanel({
  brand,
  question,
  therapeuticArea,
  indication,
  onAcceptSignals,
}: {
  brand: string;
  question: string;
  therapeuticArea?: string;
  indication?: string;
  onAcceptSignals: (signals: AcceptedSignal[]) => void;
}) {
  const [miosResult, setMiosResult] = useState<MiosResult | null>(null);
  const [baosResult, setBaosResult] = useState<BaosResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "mios" | "baos" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<"mios" | "baos" | null>(null);

  async function runMiosBaos() {
    setLoading(true);
    setError(null);
    setPhase("mios");
    setMiosResult(null);
    setBaosResult(null);

    try {
      const miosRes = await fetch(`${getApiBase()}/agents/mios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, question, therapeuticArea, indication }),
      });
      if (!miosRes.ok) throw new Error(`MIOS failed: HTTP ${miosRes.status}`);
      const mios: MiosResult = await miosRes.json();
      setMiosResult(mios);

      setPhase("baos");
      const baosRes = await fetch(`${getApiBase()}/agents/baos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          question,
          therapeuticArea,
          indication,
          miosEvidence: mios.evidenceSignals,
        }),
      });
      if (!baosRes.ok) throw new Error(`BAOS failed: HTTP ${baosRes.status}`);
      const baos: BaosResult = await baosRes.json();
      setBaosResult(baos);
      setPhase("done");
    } catch (e: any) {
      setError(e.message);
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  }

  function acceptAll() {
    const signals: AcceptedSignal[] = [];
    const brandUpper = brand.toUpperCase().replace(/\s+/g, "_");

    if (miosResult) {
      miosResult.evidenceSignals.forEach((e, i) => {
        const str = e.strength as "High" | "Medium" | "Low";
        signals.push({
          id: `mios_${brandUpper.toLowerCase()}_${i}`,
          text: e.evidenceText,
          caveat: e.whyItMatters,
          direction: e.direction,
          strength: str,
          reliability: e.confidence as "Confirmed" | "Probable" | "Speculative",
          impact: str,
          category: "evidence",
          source: "system",
          accepted: true,
          signal_class: "observed",
          signal_family: "brand_clinical_regulatory",
          source_type: "MIOS",
          priority_source: "observed_verified",
          is_locked: true,
          workbook_meta: {
            sourceWorkbook: `MIOS — ${brand}`,
            programId: `MIOS-${brandUpper}`,
            whyItMatters: e.whyItMatters,
            trialOrSource: e.trialOrSource,
          },
        });
      });
    }

    if (baosResult) {
      baosResult.barrierSignals.forEach((b, i) => {
        const str = b.strength as "High" | "Medium" | "Low";
        signals.push({
          id: `baos_${brandUpper.toLowerCase()}_${i}`,
          text: b.barrierText,
          caveat: b.whyItMatters,
          direction: b.direction,
          strength: str,
          reliability: b.confidence as "Confirmed" | "Probable" | "Speculative",
          impact: str,
          category: "adoption",
          source: "system",
          accepted: true,
          signal_class: "observed",
          signal_family: "provider_behavioral",
          source_type: "BAOS",
          priority_source: "observed_verified",
          is_locked: true,
          workbook_meta: {
            sourceWorkbook: `BAOS — ${brand}`,
            programId: `BAOS-${brandUpper}`,
            whyItMatters: b.whyItMatters,
            cognitiveLens: b.cognitiveLens,
          },
        });
      });
    }

    onAcceptSignals(signals);
  }

  const totalSignals = (miosResult?.evidenceSignals.length || 0) + (baosResult?.barrierSignals.length || 0);

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5">
      <div className="flex items-center justify-between px-5 py-4 border-b border-violet-500/20">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-foreground">MIOS / BAOS</h3>
          <span className="text-xs text-muted-foreground">Brand-specific evidence & cognitive barriers</span>
        </div>
        {phase === "idle" && (
          <button
            onClick={runMiosBaos}
            disabled={!brand}
            className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            <FlaskConical className="w-3 h-3" />
            Run MIOS → BAOS
          </button>
        )}
      </div>

      {error && <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>}

      {loading && (
        <div className="px-5 py-6 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          <div>
            <div className="text-sm text-foreground">
              {phase === "mios" ? "MIOS: Finding clinical evidence..." : "BAOS: Identifying cognitive barriers..."}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {phase === "mios"
                ? `Searching for ${brand} trial data, FDA actions, safety signals`
                : `Analyzing HCP behavioral barriers from ${miosResult?.evidenceSignals.length || 0} evidence signals`}
            </div>
          </div>
        </div>
      )}

      {phase === "done" && miosResult && baosResult && (
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-medium text-cyan-300">{miosResult.evidenceSignals.length} MIOS</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-medium text-amber-300">{baosResult.barrierSignals.length} BAOS</span>
              </div>
            </div>
            <button
              onClick={acceptAll}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
            >
              <CheckCircle2 className="w-3 h-3" />
              Accept All ({totalSignals})
            </button>
          </div>

          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5">
            <button
              onClick={() => setExpandedSection(expandedSection === "mios" ? null : "mios")}
              className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  MIOS — Clinical Evidence ({miosResult.evidenceSignals.length})
                </span>
              </div>
              {expandedSection === "mios" ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
            </button>
            {expandedSection === "mios" && (
              <div className="px-4 pb-4 space-y-2">
                {miosResult.beliefShiftsIdentified.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Belief Shifts</div>
                    {miosResult.beliefShiftsIdentified.map((bs, i) => (
                      <div key={i} className="text-xs text-foreground/80 pl-2 border-l-2 border-cyan-500/30 mb-1">{bs}</div>
                    ))}
                  </div>
                )}
                {miosResult.evidenceSignals.map((e, i) => (
                  <div key={i} className="rounded-lg bg-slate-800/50 border border-border p-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      {e.direction === "positive" ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <span className="text-xs text-foreground/90 leading-relaxed">{e.evidenceText}</span>
                    </div>
                    <div className="text-[10px] text-cyan-400/70">{e.trialOrSource}</div>
                    <div className="flex gap-2">
                      <span className="text-[10px] text-muted-foreground">{e.strength}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{e.confidence}</span>
                    </div>
                  </div>
                ))}
                {miosResult.searchSummary && (
                  <div className="text-xs text-muted-foreground/70 italic mt-2">{miosResult.searchSummary}</div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5">
            <button
              onClick={() => setExpandedSection(expandedSection === "baos" ? null : "baos")}
              className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Brain className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  BAOS — Cognitive Barriers ({baosResult.barrierSignals.length})
                </span>
              </div>
              {expandedSection === "baos" ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
            </button>
            {expandedSection === "baos" && (
              <div className="px-4 pb-4 space-y-2">
                {baosResult.barrierSignals.map((b, i) => (
                  <div key={i} className="rounded-lg bg-slate-800/50 border border-border p-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      {b.direction === "positive" ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <span className="text-xs text-foreground/90 leading-relaxed">{b.barrierText}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded">{b.cognitiveLens}</span>
                      <span className="text-[10px] text-muted-foreground">{b.affectedSegment}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[10px] text-muted-foreground">{b.strength}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{b.confidence}</span>
                    </div>
                  </div>
                ))}
                {baosResult.barrierSummary && (
                  <div className="text-xs text-muted-foreground/70 italic mt-2">{baosResult.barrierSummary}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
