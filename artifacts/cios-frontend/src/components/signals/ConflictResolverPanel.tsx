import { useState } from "react";
import { Loader2, GitMerge, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

interface ConflictGroup {
  conflictId: string;
  conflictType: string;
  severity: string;
  signalIds: string[];
  description: string;
  resolution: {
    strategy: string;
    rationale: string;
    preferredSignalId?: string;
    mergedText?: string;
  };
}

interface ConflictResult {
  conflicts: ConflictGroup[];
  totalConflicts: number;
  criticalConflicts: number;
  unresolvedCount: number;
  signalCoherence: string;
  narrative: string;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export default function ConflictResolverPanel({ question, signals }: {
  question: string;
  signals: Array<{ id: string; text: string; direction: string; strength: string; reliability: string; source?: string; source_type?: string }>;
}) {
  const [result, setResult] = useState<ConflictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function runResolver() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/agents/conflict-resolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          signals: signals.map(s => ({ ...s, confidence: s.reliability })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const coherenceColor = (c: string) =>
    c === "coherent" ? "text-emerald-400" : c === "mostly_coherent" ? "text-blue-400" : c === "mixed" ? "text-amber-400" : "text-red-400";

  const severityColor = (s: string) =>
    s === "critical" ? "text-red-400 bg-red-500/10 border-red-500/20" : s === "moderate" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-slate-400 bg-slate-500/10 border-slate-500/20";

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-bold text-foreground">Conflict Resolver</span>
          {result && (
            <span className={`text-xs font-medium ${coherenceColor(result.signalCoherence)}`}>
              {result.signalCoherence.replace(/_/g, " ")}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-5 pb-4 pt-3 space-y-4">
          {!result && (
            <button
              onClick={runResolver}
              disabled={loading || signals.length < 2}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
              {loading ? "Checking conflicts..." : "Check for Conflicts"}
            </button>
          )}

          {error && <div className="text-xs text-red-400">{error}</div>}

          {result && (
            <div className="space-y-3">
              <p className="text-xs text-foreground/70 leading-relaxed">{result.narrative}</p>

              {result.conflicts.length === 0 ? (
                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3 text-xs text-emerald-400">
                  No conflicts detected. Signals are coherent.
                </div>
              ) : (
                <div className="space-y-2">
                  {result.conflicts.map((c) => (
                    <div key={c.conflictId} className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium rounded border px-1.5 py-0.5 ${severityColor(c.severity)}`}>{c.severity}</span>
                        <span className="text-[10px] text-muted-foreground">{c.conflictType}</span>
                      </div>
                      <p className="text-xs text-foreground/80">{c.description}</p>
                      <div className="rounded bg-slate-800/50 p-2">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Resolution: {c.resolution.strategy.replace(/_/g, " ")}</div>
                        <p className="text-xs text-foreground/70">{c.resolution.rationale}</p>
                        {c.resolution.mergedText && (
                          <p className="text-xs text-blue-400/80 mt-1 italic">Merged: "{c.resolution.mergedText}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
