import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import TopNav from "@/components/top-nav";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  GitBranch,
  Target,
  Zap,
  Shield,
  Eye,
  Link2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const RELEVANCE_COLORS: Record<string, string> = {
  direct: "text-green-400 border-green-500/30 bg-green-500/10",
  indirect: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  tangential: "text-slate-400 border-slate-500/30 bg-slate-500/10",
  irrelevant: "text-red-400 border-red-500/30 bg-red-500/10",
};

const DIRECTION_ICONS: Record<string, { icon: string; color: string }> = {
  positive: { icon: "↑", color: "text-green-400" },
  negative: { icon: "↓", color: "text-red-400" },
  neutral: { icon: "→", color: "text-slate-400" },
  ambiguous: { icon: "⇌", color: "text-amber-400" },
};

const IMPACT_COLORS: Record<string, string> = {
  high: "text-red-300 bg-red-500/10 border-red-500/20",
  moderate: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  low: "text-slate-300 bg-slate-500/10 border-slate-500/20",
  negligible: "text-slate-500 bg-slate-500/5 border-slate-500/10",
};

const INDEPENDENCE_LABELS: Record<string, string> = {
  independent: "Independent",
  partially_dependent: "Partial Overlap",
  dependent: "Dependent",
  redundant: "Redundant",
};

interface Interpretation {
  factIndex: number;
  factText: string;
  decisionRelevance: string;
  causalPathway: string | null;
  direction: string;
  impactEstimate: string;
  independenceClassification: string;
  dependsOn: number | null;
  confidence: string;
  recommendedSignal: boolean;
  rejectionReason: string | null;
}

interface InterpretationResult {
  interpretations: Interpretation[];
  summary: {
    totalFacts: number;
    recommendedCount: number;
    rejectedCount: number;
    independentCount: number;
    dependentCount: number;
  };
  decisionContext: {
    primaryDecision: string;
    domain: string;
    decisionArchetype: string;
    questionText: string;
  };
}

type Phase = "interpreting" | "review" | "creating";

export default function InterpretPage() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("interpreting");
  const [result, setResult] = useState<InterpretationResult | null>(null);
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedFacts, setExpandedFacts] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cios.interpretationPayload");
    if (!stored) {
      navigate("/ingest");
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(stored);
    } catch {
      navigate("/ingest");
      return;
    }

    if (!payload.facts || !payload.decisionContext) {
      navigate("/ingest");
      return;
    }

    runInterpretation(payload);
  }, []);

  const runInterpretation = async (payload: any) => {
    setPhase("interpreting");
    setError(null);

    try {
      const res = await fetch(`${API}/api/agents/signal-interpretation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Interpretation failed");
      }

      const data = await res.json();
      setResult(data);

      const initial: Record<number, boolean> = {};
      data.interpretations.forEach((interp: Interpretation) => {
        initial[interp.factIndex] = interp.recommendedSignal;
      });
      setOverrides(initial);
      setPhase("review");
    } catch (err: any) {
      setError(err.message || "Interpretation failed");
      setPhase("review");
    }
  };

  const toggleOverride = useCallback((factIndex: number) => {
    setOverrides((prev) => ({ ...prev, [factIndex]: !prev[factIndex] }));
  }, []);

  const toggleExpanded = useCallback((factIndex: number) => {
    setExpandedFacts((prev) => {
      const next = new Set(prev);
      if (next.has(factIndex)) next.delete(factIndex);
      else next.add(factIndex);
      return next;
    });
  }, []);

  const recommendedCount = Object.values(overrides).filter(Boolean).length;
  const totalCount = result?.interpretations.length || 0;

  const handleCreateSignals = useCallback(async () => {
    if (!result) return;
    setCreating(true);
    setError(null);

    try {
      const storedRaw = localStorage.getItem("cios.interpretationPayload");
      if (!storedRaw) throw new Error("Session data lost");
      const stored = JSON.parse(storedRaw);
      const caseId = stored.caseId;
      if (!caseId) throw new Error("No case ID found");

      const accepted = result.interpretations.filter(
        (interp) => overrides[interp.factIndex]
      );

      const failures: string[] = [];

      for (const interp of accepted) {
        if (!interp.recommendedSignal && !overrides[interp.factIndex]) continue;

        const signalDirection =
          interp.direction === "positive"
            ? "Positive"
            : interp.direction === "negative"
              ? "Negative"
              : "Neutral";

        const strengthScore =
          interp.impactEstimate === "high"
            ? 5
            : interp.impactEstimate === "moderate"
              ? 3
              : 2;

        const reliabilityScore =
          interp.confidence === "high"
            ? 5
            : interp.confidence === "moderate"
              ? 3
              : 2;

        const res = await fetch(`${API}/api/cases/${caseId}/signals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: interp.factText,
            direction: signalDirection,
            strengthScore,
            reliabilityScore,
            signalType: "Intelligence",
            source: "ingestion_interpretation",
            sourceLabel: "Document Ingestion",
            causalPathway: interp.causalPathway,
            independenceClassification: interp.independenceClassification,
            interpretationConfidence: interp.confidence,
            decisionRelevance: interp.decisionRelevance,
          }),
        });

        if (!res.ok) {
          failures.push(`Fact ${interp.factIndex}: ${interp.factText.slice(0, 60)}...`);
        }
      }

      if (failures.length > 0 && failures.length === accepted.length) {
        throw new Error(`All signal creations failed. Check the signals endpoint.`);
      }

      if (failures.length > 0) {
        setError(`${failures.length} signal(s) failed to create but ${accepted.length - failures.length} succeeded.`);
      }

      localStorage.removeItem("cios.interpretationPayload");
      navigate("/signals");
    } catch (err: any) {
      setError(err.message || "Failed to create signals");
    } finally {
      setCreating(false);
    }
  }, [result, overrides, navigate]);

  const handleSkipAll = useCallback(() => {
    localStorage.removeItem("cios.interpretationPayload");
    navigate("/signals");
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Signal Interpretation</h1>
          <span className="ml-auto text-xs text-muted-foreground uppercase tracking-wider">
            {phase === "interpreting"
              ? "Analyzing Facts..."
              : phase === "creating"
                ? "Creating Signals..."
                : `${recommendedCount} of ${totalCount} facts recommended`}
          </span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {phase === "interpreting" && (
          <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              Interpreting extracted facts against the decision context...
            </p>
            <p className="text-xs text-slate-500">
              Evaluating relevance, causal pathways, independence, and impact for each fact
            </p>
          </div>
        )}

        {phase === "review" && !result && (
          <div className="rounded-2xl border border-red-500/20 bg-card p-8 flex flex-col items-center gap-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-foreground font-medium">Interpretation could not be completed</p>
            <p className="text-xs text-muted-foreground text-center max-w-md">
              The system was unable to interpret the extracted facts. You can retry or go back to the ingestion page.
            </p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  const stored = localStorage.getItem("cios.interpretationPayload");
                  if (stored) {
                    try { runInterpretation(JSON.parse(stored)); } catch { navigate("/ingest"); }
                  } else {
                    navigate("/ingest");
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition"
              >
                <Loader2 className="w-4 h-4" /> Retry Interpretation
              </button>
              <button
                type="button"
                onClick={() => navigate("/ingest")}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Ingestion
              </button>
            </div>
          </div>
        )}

        {phase === "review" && result && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Decision Context</div>
              <div className="text-sm font-medium text-foreground">{result.decisionContext.questionText}</div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Domain: <span className="text-foreground">{result.decisionContext.domain}</span></span>
                <span>Decision: <span className="text-foreground">{result.decisionContext.primaryDecision}</span></span>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-3">
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <div className="text-2xl font-bold">{result.summary.totalFacts}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total Facts</div>
              </div>
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{recommendedCount}</div>
                <div className="text-[10px] text-green-400/60 uppercase tracking-wider mt-1">Will Create</div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{totalCount - recommendedCount}</div>
                <div className="text-[10px] text-red-400/60 uppercase tracking-wider mt-1">Filtered Out</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <div className="text-2xl font-bold">{result.summary.independentCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Independent</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <div className="text-2xl font-bold">{result.summary.dependentCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Dependent</div>
              </div>
            </div>

            <div className="space-y-3">
              {result.interpretations.map((interp) => {
                const isActive = overrides[interp.factIndex] ?? false;
                const expanded = expandedFacts.has(interp.factIndex);
                const dir = DIRECTION_ICONS[interp.direction] || DIRECTION_ICONS.neutral;

                return (
                  <div
                    key={interp.factIndex}
                    className={`rounded-2xl border transition ${
                      isActive
                        ? "border-green-500/20 bg-green-500/[0.03]"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleOverride(interp.factIndex)}
                          className={`mt-0.5 shrink-0 w-6 h-6 rounded-lg border flex items-center justify-center transition ${
                            isActive
                              ? "border-green-500/40 bg-green-500/20 text-green-400"
                              : "border-border bg-background text-muted-foreground hover:border-green-500/30"
                          }`}
                        >
                          {isActive ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <div className="flex-1 space-y-2">
                          <div className="text-sm font-medium text-foreground">
                            {interp.factText}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                                RELEVANCE_COLORS[interp.decisionRelevance] || ""
                              }`}
                            >
                              <Target className="w-3 h-3" />
                              {interp.decisionRelevance}
                            </span>

                            <span
                              className={`inline-flex items-center gap-1 text-xs font-bold ${dir.color}`}
                            >
                              {dir.icon} {interp.direction}
                            </span>

                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                                IMPACT_COLORS[interp.impactEstimate] || ""
                              }`}
                            >
                              <Zap className="w-3 h-3" />
                              {interp.impactEstimate}
                            </span>

                            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <Link2 className="w-3 h-3" />
                              {INDEPENDENCE_LABELS[interp.independenceClassification] || interp.independenceClassification}
                              {interp.dependsOn && (
                                <span className="text-amber-400 ml-1">→ Fact {interp.dependsOn}</span>
                              )}
                            </span>

                            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <Shield className="w-3 h-3" />
                              {interp.confidence}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleExpanded(interp.factIndex)}
                          className="shrink-0 text-muted-foreground hover:text-foreground transition"
                        >
                          {expanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {expanded && (
                        <div className="ml-9 space-y-2 pt-2 border-t border-border">
                          {interp.causalPathway && (
                            <div className="space-y-1">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                Causal Pathway
                              </div>
                              <div className="text-xs text-slate-300 bg-slate-800/50 rounded-lg px-3 py-2 font-mono">
                                {interp.causalPathway}
                              </div>
                            </div>
                          )}

                          {interp.rejectionReason && (
                            <div className="space-y-1">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                Rejection Reason
                              </div>
                              <div className="text-xs text-red-300 bg-red-500/5 rounded-lg px-3 py-2 border border-red-500/10">
                                {interp.rejectionReason}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Recommended: </span>
                              <span className={interp.recommendedSignal ? "text-green-400" : "text-red-400"}>
                                {interp.recommendedSignal ? "Yes" : "No"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Override: </span>
                              <span className={isActive !== interp.recommendedSignal ? "text-amber-400" : "text-slate-400"}>
                                {isActive !== interp.recommendedSignal ? "User Override" : "Default"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => navigate("/ingest")}
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Ingestion
                </button>
                <button
                  type="button"
                  onClick={handleSkipAll}
                  className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition"
                >
                  Skip All — No Signals
                </button>
              </div>

              <div className="flex items-center gap-3">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {recommendedCount} signal{recommendedCount !== 1 ? "s" : ""} will be created
                </span>
                <button
                  type="button"
                  disabled={creating || recommendedCount === 0}
                  onClick={handleCreateSignals}
                  className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                    </>
                  ) : (
                    <>
                      Create {recommendedCount} Signal{recommendedCount !== 1 ? "s" : ""}{" "}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
