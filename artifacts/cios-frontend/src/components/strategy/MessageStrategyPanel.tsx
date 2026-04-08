import { useState } from "react";
import {
  Loader2,
  FlaskConical,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

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

interface MiosResult {
  brand: string;
  beliefShiftsIdentified: string[];
  evidenceSignals: MiosEvidence[];
  searchSummary: string;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export default function MessageStrategyPanel({
  brand,
  question,
  therapeuticArea,
  indication,
}: {
  brand: string;
  question: string;
  therapeuticArea?: string;
  indication?: string;
}) {
  const [result, setResult] = useState<MiosResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  async function runMios() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${getApiBase()}/agents/mios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, question, therapeuticArea, indication }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MiosResult = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5">
      <div className="flex items-center justify-between px-5 py-4 border-b border-cyan-500/20">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-foreground">Message Strategy</h3>
          <span className="text-xs text-muted-foreground">Clinical evidence & belief shifts</span>
        </div>
        {!result && !loading && (
          <button
            onClick={runMios}
            disabled={!brand}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            <FlaskConical className="w-3 h-3" />
            Run Analysis
          </button>
        )}
        {result && (
          <button
            onClick={runMios}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer"
          >
            <FlaskConical className="w-3 h-3" />
            Re-run
          </button>
        )}
      </div>

      {error && <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>}

      {loading && (
        <div className="px-5 py-6 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
          <div>
            <div className="text-sm text-foreground">Analyzing clinical evidence...</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Searching for {brand} trial data, FDA actions, safety signals
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
            <span className="text-xs font-medium text-cyan-300">
              {result.evidenceSignals.length} evidence finding{result.evidenceSignals.length !== 1 ? "s" : ""}
            </span>
            {expanded ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
          </button>

          {expanded && (
            <div className="px-5 pb-5 space-y-3">
              {result.beliefShiftsIdentified.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Belief Shifts</div>
                  {result.beliefShiftsIdentified.map((bs, i) => (
                    <div key={i} className="text-xs text-foreground/80 pl-2 border-l-2 border-cyan-500/30 mb-1">{bs}</div>
                  ))}
                </div>
              )}

              {result.evidenceSignals.map((e, i) => (
                <div key={i} className="rounded-lg border border-border bg-slate-800/50 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {e.direction === "positive" ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span className="text-xs text-foreground/90 leading-relaxed flex-1">{e.evidenceText}</span>
                  </div>
                  <div className="text-[10px] text-cyan-400/70">{e.trialOrSource}</div>
                  {e.whyItMatters && (
                    <div className="text-[10px] text-foreground/60 italic">{e.whyItMatters}</div>
                  )}
                  <div className="flex gap-2">
                    <span className="text-[10px] text-muted-foreground">{e.strength}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{e.confidence}</span>
                  </div>
                </div>
              ))}

              {result.searchSummary && (
                <div className="text-xs text-muted-foreground/70 italic mt-2">{result.searchSummary}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
