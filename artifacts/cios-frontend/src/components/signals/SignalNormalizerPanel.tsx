import { useState } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Layers,
  AlertTriangle,
  GitMerge,
  Swords,
  Check,
  Trash2,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface MergeAction {
  action: "merged" | "flagged" | "kept";
  signalIds: string[];
  reason: string;
}

interface NormalizationResult {
  normalizedSignals: Array<{
    id: string;
    isDuplicate: boolean;
    duplicateOf: string | null;
    conflictsWith: string | null;
    conflictType: string | null;
    mergedFrom: string[];
    normalizedScore: number;
  }>;
  duplicatesRemoved: number;
  conflictsDetected: number;
  mergeActions: MergeAction[];
  inputHash: string;
}

interface SignalInput {
  id: string;
  text: string;
  direction: "positive" | "negative" | "neutral";
  strength: "High" | "Medium" | "Low";
  confidence: string;
  source: string;
  sourceType?: string;
  category?: string;
  signalSource?: string;
}

interface Props {
  signals: SignalInput[];
  activeQuestion: string;
  onRemoveDuplicate: (signalId: string) => void;
  onFlagConflict: (signalId: string, conflictsWith: string) => void;
}

export default function SignalNormalizerPanel({
  signals,
  activeQuestion,
  onRemoveDuplicate,
  onFlagConflict,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NormalizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedActions, setAppliedActions] = useState<Set<number>>(new Set());

  async function runNormalization() {
    if (signals.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAppliedActions(new Set());

    try {
      const res = await fetch(`${API}/api/agents/signal-normalizer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signals: signals.map((s) => ({
            id: s.id,
            text: s.text,
            direction: s.direction,
            strength: s.strength,
            confidence: s.confidence,
            source: s.source,
            sourceType: s.sourceType,
            category: s.category,
            signalSource: s.signalSource,
          })),
          activeQuestion,
        }),
      });

      if (!res.ok) throw new Error("Normalization failed");

      const data = await res.json();
      if (data.normalization) {
        setResult(data.normalization);
      } else {
        throw new Error("No results returned");
      }
    } catch {
      setError("Failed to normalize signals. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleApplyAction(action: MergeAction, index: number) {
    if (action.action === "merged" && action.signalIds.length >= 2) {
      onRemoveDuplicate(action.signalIds[1]);
    } else if (action.action === "flagged" && action.signalIds.length >= 2) {
      onFlagConflict(action.signalIds[0], action.signalIds[1]);
    }
    setAppliedActions((prev) => new Set(prev).add(index));
  }

  const hasIssues = result && (result.duplicatesRemoved > 0 || result.conflictsDetected > 0);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded && !result && !loading && signals.length > 0) {
            runNormalization();
          }
        }}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/10 transition rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <Layers className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-foreground">Signal Normalizer</div>
            <div className="text-[11px] text-muted-foreground">
              {result
                ? hasIssues
                  ? `${result.duplicatesRemoved} duplicate${result.duplicatesRemoved !== 1 ? "s" : ""}, ${result.conflictsDetected} conflict${result.conflictsDetected !== 1 ? "s" : ""}`
                  : "All signals are clean"
                : `Deduplicate and normalize ${signals.length} signal${signals.length !== 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-violet-400" />}
          {result && !hasIssues && !loading && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[10px] text-emerald-400">
              <Check className="w-3 h-3" />
              Clean
            </span>
          )}
          {result && hasIssues && !loading && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[10px] text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {result.mergeActions.length} action{result.mergeActions.length !== 1 ? "s" : ""}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
              <span className="text-sm text-muted-foreground">Analyzing {signals.length} signals...</span>
            </div>
          )}

          {result && !loading && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-muted/5 p-3 text-center">
                  <div className="text-lg font-bold text-foreground">{signals.length}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
                </div>
                <div className={`rounded-xl border p-3 text-center ${result.duplicatesRemoved > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/5"}`}>
                  <div className={`text-lg font-bold ${result.duplicatesRemoved > 0 ? "text-amber-400" : "text-foreground"}`}>{result.duplicatesRemoved}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Duplicates</div>
                </div>
                <div className={`rounded-xl border p-3 text-center ${result.conflictsDetected > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/5"}`}>
                  <div className={`text-lg font-bold ${result.conflictsDetected > 0 ? "text-red-400" : "text-foreground"}`}>{result.conflictsDetected}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Conflicts</div>
                </div>
              </div>

              {result.mergeActions.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Recommended Actions
                  </div>
                  {result.mergeActions.map((action, index) => {
                    const isApplied = appliedActions.has(index);
                    return (
                      <div
                        key={index}
                        className={`rounded-xl border p-3 space-y-2 ${
                          isApplied
                            ? "border-emerald-500/20 bg-emerald-500/5"
                            : action.action === "merged"
                            ? "border-amber-500/20 bg-amber-500/5"
                            : "border-red-500/20 bg-red-500/5"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 flex-1">
                            {action.action === "merged" ? (
                              <GitMerge className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            ) : (
                              <Swords className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <div className="text-xs font-medium text-foreground">
                                {action.action === "merged" ? "Duplicate detected" : "Conflict detected"}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {action.reason}
                              </div>
                              <div className="text-[10px] text-muted-foreground/60 mt-1">
                                Signals: {action.signalIds.join(", ")}
                              </div>
                            </div>
                          </div>
                          {!isApplied ? (
                            <button
                              type="button"
                              onClick={() => handleApplyAction(action, index)}
                              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition shrink-0 ${
                                action.action === "merged"
                                  ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                  : "border-red-500/30 text-red-400 hover:bg-red-500/10"
                              }`}
                            >
                              {action.action === "merged" ? (
                                <span className="inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Remove duplicate</span>
                              ) : (
                                <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Flag</span>
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[10px] text-emerald-400 shrink-0">
                              <Check className="w-3 h-3" />
                              Applied
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
                  <Check className="w-5 h-5 text-emerald-400" />
                  <div>
                    <div className="text-sm font-medium text-emerald-400">All signals are clean</div>
                    <div className="text-[11px] text-muted-foreground">No duplicates or conflicts detected.</div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={runNormalization}
                disabled={loading}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition inline-flex items-center gap-1.5"
              >
                <Layers className="w-3 h-3" />
                Re-analyze
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
