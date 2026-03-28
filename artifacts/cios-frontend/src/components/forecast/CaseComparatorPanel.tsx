import { useState } from "react";
import { Loader2, GitCompareArrows, ChevronDown, ChevronUp } from "lucide-react";

interface ComparableCase {
  caseName: string;
  brand: string;
  company: string;
  therapeuticArea: string;
  indication: string;
  yearRange: string;
  similarityScore: number;
  keySimilarities: string[];
  keyDifferences: string[];
  outcome: string;
  implicationForCurrentCase: string;
}

interface CaseComparatorResult {
  comparableCases: ComparableCase[];
  analogLibrarySize: number;
  confidenceInAnalogs: "high" | "moderate" | "low";
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export function CaseComparatorPanel({ question, signals, context }: {
  question: string;
  signals?: Array<{ text: string; direction: string }>;
  context?: string;
}) {
  const [result, setResult] = useState<CaseComparatorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  async function runComparator() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/agents/case-comparator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, signals, context }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const confidenceColor = (c: string) =>
    c === "high" ? "text-emerald-400" : c === "moderate" ? "text-amber-400" : "text-red-400";

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-bold text-foreground">Case Comparator</h3>
          <span className="text-xs text-muted-foreground">Historical analogs</span>
        </div>
        {!result && (
          <button
            onClick={runComparator}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitCompareArrows className="w-3 h-3" />}
            {loading ? "Searching analogs..." : "Find Comparable Cases"}
          </button>
        )}
      </div>

      {error && (
        <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>
      )}

      {result && (
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">Analogs found: <span className="text-foreground font-medium">{result.comparableCases.length}</span></span>
            <span className="text-muted-foreground">Confidence: <span className={`font-medium ${confidenceColor(result.confidenceInAnalogs)}`}>{result.confidenceInAnalogs}</span></span>
          </div>

          <div className="space-y-2">
            {result.comparableCases.map((c) => (
              <div key={c.caseName} className="rounded-lg border border-border bg-muted/10">
                <button
                  onClick={() => setExpandedCase(expandedCase === c.caseName ? null : c.caseName)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 text-xs font-bold">
                      {c.similarityScore}%
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{c.brand}</div>
                      <div className="text-xs text-muted-foreground">{c.company} · {c.therapeuticArea} · {c.yearRange}</div>
                    </div>
                  </div>
                  {expandedCase === c.caseName ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {expandedCase === c.caseName && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Outcome</div>
                      <p className="text-xs text-foreground leading-relaxed">{c.outcome}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider mb-1">Similarities</div>
                        <ul className="space-y-0.5">
                          {c.keySimilarities.map((s, i) => (
                            <li key={i} className="text-xs text-foreground/80">• {s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-1">Differences</div>
                        <ul className="space-y-0.5">
                          {c.keyDifferences.map((d, i) => (
                            <li key={i} className="text-xs text-foreground/80">• {d}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-3">
                      <div className="text-[10px] text-violet-400 uppercase tracking-wider mb-1">Implication</div>
                      <p className="text-xs text-foreground/90 leading-relaxed">{c.implicationForCurrentCase}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
