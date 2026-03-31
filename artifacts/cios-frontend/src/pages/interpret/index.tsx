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
  Fingerprint,
  BarChart3,
  Tag,
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

const SIGNAL_TYPE_COLORS: Record<string, string> = {
  "Phase III clinical": "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
  "Guideline inclusion": "text-purple-400 border-purple-500/30 bg-purple-500/10",
  "KOL endorsement": "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
  "Field intelligence": "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  "Operational friction": "text-slate-400 border-slate-500/30 bg-slate-500/10",
  "Competitor counteraction": "text-orange-400 border-orange-500/30 bg-orange-500/10",
  "Access / commercial": "text-blue-400 border-blue-500/30 bg-blue-500/10",
  "Regulatory / clinical": "text-purple-300 border-purple-400/30 bg-purple-400/10",
  "Access friction": "text-red-400 border-red-500/30 bg-red-500/10",
  "Payer / coverage": "text-amber-400 border-amber-500/30 bg-amber-500/10",
  "Market adoption / utilization": "text-teal-400 border-teal-500/30 bg-teal-500/10",
  "Capacity / infrastructure": "text-slate-300 border-slate-400/30 bg-slate-400/10",
  "Competitor countermove": "text-orange-300 border-orange-400/30 bg-orange-400/10",
};

interface Interpretation {
  interpretationId: string;
  factIndex: number;
  factText: string;
  decisionRelevance: string;
  causalPathway: string | null;
  direction: string;
  impactEstimate: string;
  independenceClassification: string;
  dependsOn: number | null;
  rootEvidenceId: string | null;
  confidence: string;
  recommendedSignal: boolean;
  recommendationReason: string;
  rejectionReason: string | null;
  suggestedSignalType: string;
  suggestedStrength: number;
  suggestedReliability: number;
}

interface InterpretationResult {
  batchId: string;
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

function StrengthBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className={`w-3 h-3 rounded-sm ${
              n <= value ? "bg-blue-500/60" : "bg-slate-700/40"
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] text-slate-400">{value}/5</span>
    </div>
  );
}

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
        const signalDirection =
          interp.direction === "positive"
            ? "Positive"
            : interp.direction === "negative"
              ? "Negative"
              : "Neutral";

        const signalRes = await fetch(`${API}/api/cases/${caseId}/signals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signalDescription: interp.factText,
            direction: signalDirection,
            strengthScore: interp.suggestedStrength,
            reliabilityScore: interp.suggestedReliability,
            signalType: interp.suggestedSignalType,
            source: "ingestion_interpretation",
            sourceLabel: "Document Ingestion",
            rootEvidenceId: interp.rootEvidenceId,
          }),
        });

        if (!signalRes.ok) {
          failures.push(`Fact ${interp.factIndex}: ${interp.factText.slice(0, 60)}...`);
          continue;
        }

        const signalData = await signalRes.json().catch(() => null);
        const linkedSignalId = signalData?.id || signalData?.signalId || null;
        const isOverride = interp.recommendedSignal !== overrides[interp.factIndex];

        await fetch(`${API}/api/signal-interpretations/${interp.interpretationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAccepted: true,
            userOverride: isOverride,
            linkedSignalId,
            status: "accepted",
          }),
        });
      }

      const rejected = result.interpretations.filter(
        (interp) => !overrides[interp.factIndex]
      );

      for (const interp of rejected) {
        await fetch(`${API}/api/signal-interpretations/${interp.interpretationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAccepted: false,
            userOverride: interp.recommendedSignal !== (overrides[interp.factIndex] ?? false),
            status: "rejected",
          }),
        });
      }

      if (failures.length > 0 && failures.length === accepted.length) {
        throw new Error("All signal creations failed. Check the signals endpoint.");
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

  const handleSkipAll = useCallback(async () => {
    if (result) {
      for (const interp of result.interpretations) {
        await fetch(`${API}/api/signal-interpretations/${interp.interpretationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userAccepted: false, status: "skipped" }),
        }).catch(() => {});
      }
    }
    localStorage.removeItem("cios.interpretationPayload");
    navigate("/signals");
  }, [result, navigate]);

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
                const typeColor = SIGNAL_TYPE_COLORS[interp.suggestedSignalType] || SIGNAL_TYPE_COLORS.Intelligence;

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

                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${typeColor}`}>
                              <Tag className="w-3 h-3" />
                              {interp.suggestedSignalType}
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

                            {interp.rootEvidenceId && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-0.5 text-[10px] font-medium text-cyan-400">
                                <Fingerprint className="w-3 h-3" />
                                {interp.rootEvidenceId}
                              </span>
                            )}
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
                        <div className="ml-9 space-y-3 pt-2 border-t border-border">
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

                          <div className="space-y-1">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {interp.recommendedSignal ? "Recommendation Reason" : "Rejection Reason"}
                            </div>
                            <div className={`text-xs rounded-lg px-3 py-2 border ${
                              interp.recommendedSignal
                                ? "text-green-300 bg-green-500/5 border-green-500/10"
                                : "text-red-300 bg-red-500/5 border-red-500/10"
                            }`}>
                              {interp.recommendationReason || interp.rejectionReason || "No reason provided"}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <StrengthBar value={interp.suggestedStrength} label="Strength" />
                              <StrengthBar value={interp.suggestedReliability} label="Reliability" />
                            </div>

                            <div className="space-y-2 text-xs">
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
                              {interp.rootEvidenceId && (
                                <div>
                                  <span className="text-muted-foreground">Root Evidence: </span>
                                  <span className="text-cyan-400 font-mono">{interp.rootEvidenceId}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-lg bg-slate-800/30 border border-border px-3 py-2">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Interpretation ID</div>
                            <div className="text-[11px] text-slate-400 font-mono">{interp.interpretationId}</div>
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

            {result.batchId && (
              <div className="rounded-xl bg-slate-800/30 border border-border px-4 py-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Interpretation Batch</div>
                <div className="text-xs text-slate-400 font-mono">{result.batchId}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
