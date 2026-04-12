import { useState } from "react";
import {
  Loader2,
  Brain,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

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

interface BaosResult {
  brand: string;
  barrierSignals: BaosBarrier[];
  barrierSummary: string;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export default function ObjectionHandlingPanel({
  brand,
  question,
  therapeuticArea,
  indication,
  forecastProbability,
  primaryConstraint,
  topNegativeDriver,
  signalDetails,
}: {
  brand: string;
  question: string;
  therapeuticArea?: string;
  indication?: string;
  forecastProbability?: number | null;
  primaryConstraint?: string;
  topNegativeDriver?: string;
  signalDetails?: Array<{ description?: string; direction?: string; pointContribution?: number }>;
}) {
  const [result, setResult] = useState<BaosResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);
    const apiBase = getApiBase();
    try {
      // Step 1: Run MIOS to get evidence
      const miosRes = await fetch(`${apiBase}/agents/mios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          question,
          therapeuticArea: indication || therapeuticArea,
          indication,
          forecastProbability,
          primaryConstraint,
          topNegativeDriver,
          currentBelief: `${brand} faces adoption barriers`,
          desiredBelief: `${brand} overcomes key adoption barriers`,
          evidenceSignals: signalDetails
            ?.filter(s => s.direction === "negative")
            .map(s => ({ description: s.description || "", pointContribution: s.pointContribution || 0 })),
        }),
      });
      if (!miosRes.ok) throw new Error(`MIOS failed: HTTP ${miosRes.status}`);
      const miosData = await miosRes.json();

      // Step 2: Pass MIOS evidence to BAOS
      const baosRes = await fetch(`${apiBase}/agents/baos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          question,
          therapeuticArea: indication || therapeuticArea,
          indication,
          miosEvidence: miosData.evidenceSignals || [],
        }),
      });
      if (!baosRes.ok) throw new Error(`BAOS failed: HTTP ${baosRes.status}`);
      const baosData: BaosResult = await baosRes.json();
      setResult(baosData);
    } catch (e: any) {
      setError(e.message || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center justify-between px-5 py-4 border-b border-amber-500/20">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-foreground">Objection Handling</h3>
          <span className="text-xs text-muted-foreground">Cognitive barriers & adoption friction</span>
        </div>
        {!result && !loading && (
          <button
            onClick={runAnalysis}
            disabled={!brand}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            <Brain className="w-3 h-3" />
            Run Analysis
          </button>
        )}
        {result && (
          <button
            onClick={runAnalysis}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
          >
            <Brain className="w-3 h-3" />
            Re-run
          </button>
        )}
      </div>

      {error && <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>}

      {loading && (
        <div className="px-5 py-6 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <div>
            <div className="text-sm text-foreground">Identifying cognitive barriers...</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Gathering evidence for {brand}, then analyzing HCP behavioral barriers
            </div>
          </div>
        </div>
      )}

      {result && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-5 py-3 cursor-pointer"
          >
            <span className="text-xs font-medium text-amber-300">
              {result.barrierSignals.length} barrier{result.barrierSignals.length !== 1 ? "s" : ""} identified
            </span>
            {expanded ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
          </button>

          {expanded && (
            <div className="px-5 pb-5 space-y-3">
              {result.barrierSignals.map((b, i) => (
                <div key={i} className="rounded-lg border border-border bg-slate-800/50 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {b.direction === "positive" ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span className="text-xs text-foreground/90 leading-relaxed flex-1">{b.barrierText}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded">{b.cognitiveLens}</span>
                    <span className="text-[10px] text-muted-foreground">{b.affectedSegment}</span>
                  </div>
                  {b.whyItMatters && (
                    <div className="text-[10px] text-foreground/60 italic">{b.whyItMatters}</div>
                  )}
                  <div className="flex gap-2">
                    <span className="text-[10px] text-muted-foreground">{b.strength}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{b.confidence}</span>
                  </div>
                </div>
              ))}

              {result.barrierSummary && (
                <div className="text-xs text-muted-foreground/70 italic mt-2">{result.barrierSummary}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
