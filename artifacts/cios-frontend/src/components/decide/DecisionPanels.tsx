import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  Loader2,
  AlertTriangle,
  ArrowRight,
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
  Target,
  Clock,
  BarChart3,
  CheckCircle2,
  XCircle,
  Pause,
  ShieldAlert,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import { exportToExcel, exportToPDF, exportToJSON } from "@/lib/forecast-export";
import SavedQuestionsPanel from "@/components/question/SavedQuestionsPanel";

const API = import.meta.env.VITE_API_URL || "";

interface ForecastData {
  priorProbability: number;
  posteriorProbability?: number;
  currentProbability?: number;
  signalDetails?: SignalDetail[];
  sensitivityAnalysis?: SignalDetail[];
}

interface SignalDetail {
  signalId: string;
  signalDescription?: string;
  description?: string;
  direction: string;
  likelihoodRatio?: number;
  lr?: number;
  signalType?: string;
  contributionPp?: number;
}

function getProbabilityInterpretation(posterior: number): { text: string; color: string; bgColor: string } {
  if (posterior > 0.60) return {
    text: "Evidence strongly supports adoption. Proceed with confidence.",
    color: "text-emerald-400",
    bgColor: "border-emerald-500/20 bg-emerald-500/5",
  };
  if (posterior >= 0.40) return {
    text: "Evidence is balanced. Adoption is plausible but not certain. Address key barriers before committing full resources.",
    color: "text-amber-400",
    bgColor: "border-amber-500/20 bg-amber-500/5",
  };
  if (posterior >= 0.25) return {
    text: "Barriers outweigh differentiation under current conditions. Targeted launch only. Monitor competitive signals closely.",
    color: "text-orange-400",
    bgColor: "border-orange-500/20 bg-orange-500/5",
  };
  return {
    text: "Structural barriers dominate. Do not commit full launch resources until primary constraint resolves.",
    color: "text-red-400",
    bgColor: "border-red-500/20 bg-red-500/5",
  };
}

function getDecisionThreshold(posterior: number): { label: string; sublabel: string; icon: React.ReactNode; color: string; bgColor: string } {
  if (posterior > 0.60) return {
    label: "PROCEED",
    sublabel: "Supports broad deployment",
    icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
    color: "text-emerald-400",
    bgColor: "border-emerald-500/30 bg-emerald-500/10",
  };
  if (posterior >= 0.40) return {
    label: "CONDITIONAL",
    sublabel: "Targeted deployment with barrier monitoring",
    icon: <Pause className="w-6 h-6 text-amber-400" />,
    color: "text-amber-400",
    bgColor: "border-amber-500/30 bg-amber-500/10",
  };
  if (posterior >= 0.25) return {
    label: "HOLD",
    sublabel: "Resolve primary constraint before committing field resources",
    icon: <ShieldAlert className="w-6 h-6 text-orange-400" />,
    color: "text-orange-400",
    bgColor: "border-orange-500/30 bg-orange-500/10",
  };
  return {
    label: "DEFER",
    sublabel: "Posterior below threshold for commercial deployment",
    icon: <XCircle className="w-6 h-6 text-red-400" />,
    color: "text-red-400",
    bgColor: "border-red-500/30 bg-red-500/10",
  };
}

function deriveTimeline(signalType?: string): string {
  if (!signalType) return "Medium-term";
  const st = signalType.toLowerCase();
  if (st.includes("payer") || st.includes("access") || st.includes("reimbursement") || st.includes("formulary")) return "Near-term";
  if (st.includes("safety") || st.includes("operational") || st.includes("capacity")) return "Near-term";
  if (st.includes("competitor") || st.includes("biosimilar") || st.includes("market")) return "Medium-term";
  if (st.includes("guideline") || st.includes("phase") || st.includes("clinical") || st.includes("label")) return "Long-term";
  return "Medium-term";
}

function deriveActionText(signal: SignalDetail): string {
  const desc = signal.signalDescription || signal.description || "";
  const type = (signal.signalType || "").toLowerCase();
  if (type.includes("payer") || type.includes("access") || type.includes("reimbursement")) return `Secure favorable payer pathway to address: ${desc.slice(0, 80)}`;
  if (type.includes("safety")) return `Resolve safety monitoring requirement: ${desc.slice(0, 80)}`;
  if (type.includes("competitor") || type.includes("biosimilar")) return `Develop competitive response strategy for: ${desc.slice(0, 80)}`;
  if (type.includes("formulary")) return `Negotiate formulary positioning to counter: ${desc.slice(0, 80)}`;
  if (type.includes("operational") || type.includes("capacity")) return `Address operational constraint: ${desc.slice(0, 80)}`;
  if (type.includes("guideline")) return `Seek guideline inclusion to address: ${desc.slice(0, 80)}`;
  return `Address barrier: ${desc.slice(0, 100)}`;
}

export default function DecisionPanels() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [, navigate] = useLocation();
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedRef = useRef<string | null>(null);

  const caseId = activeQuestion?.caseId || activeQuestion?.id || "";

  useEffect(() => {
    if (!caseId) return;
    if (requestedRef.current === caseId) return;
    requestedRef.current = caseId;

    setLoading(true);
    setError(null);

    fetch(`${API}/api/cases/${caseId}/forecast`)
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((data) => setForecast(data))
      .catch((err) => {
        console.error("[CIOS Decide] forecast fetch failed:", err);
        setError("Forecast data unavailable. Run the forecast from the Judge step first.");
      })
      .finally(() => setLoading(false));
  }, [caseId]);

  const posterior = forecast?.posteriorProbability ?? forecast?.currentProbability ?? null;
  const prior = forecast?.priorProbability ?? null;

  const allSignals = useMemo(() => {
    return forecast?.signalDetails || forecast?.sensitivityAnalysis || [];
  }, [forecast]);

  const topNegativeSignals = useMemo(() => {
    const isH2hAbsence = (s: SignalDetail) => {
      const type = (s.signalType || "").toLowerCase();
      return type.includes("h2h") && s.direction === "Negative";
    };

    const negatives = allSignals
      .filter((s) => {
        const lr = s.likelihoodRatio ?? s.lr ?? 1;
        return lr < 1 || s.direction === "Negative";
      })
      .map((s) => {
        const lr = s.likelihoodRatio ?? s.lr ?? 1;
        const contribution = s.contributionPp ?? (lr < 1 ? Math.round((1 - lr) * prior! * 100) : 0);
        return { ...s, contribution, _h2hAbsence: isH2hAbsence(s) };
      })
      .filter((s) => !s._h2hAbsence)
      .sort((a, b) => b.contribution - a.contribution);
    return negatives.slice(0, 3);
  }, [allSignals, prior]);

  const interpretation = posterior != null ? getProbabilityInterpretation(posterior) : null;
  const threshold = posterior != null ? getDecisionThreshold(posterior) : null;

  return (
    <WorkflowLayout
      currentStep="decide"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <QuestionGate activeQuestion={activeQuestion}>
        <section className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Step 5
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              Decide
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Decision recommendation derived from the Bayesian posterior and signal analysis.
            </p>
            {caseId && (
              <div className="mt-3">
                <SavedQuestionsPanel caseId={caseId} />
              </div>
            )}
            <div className="mt-3 flex items-center justify-end">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Export</span>
                <button onClick={exportToPDF} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition" title="Export as PDF">
                  <FileText className="w-3.5 h-3.5" /> PDF
                </button>
                <button onClick={exportToExcel} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition" title="Export as Excel">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
                <button onClick={exportToJSON} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition" title="Export as JSON">
                  <FileJson className="w-3.5 h-3.5" /> JSON
                </button>
              </div>
            </div>
          </div>

          {loading && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              <div className="text-sm text-blue-300 font-medium">Loading forecast data...</div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="text-sm text-slate-300">{error}</div>
            </div>
          )}

          {posterior != null && interpretation && threshold && (
            <>
              {/* COMPONENT A — Probability Interpretation */}
              <div className={`rounded-2xl border ${interpretation.bgColor} p-6`}>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Probability Interpretation</span>
                </div>
                <div className="flex items-baseline gap-4 mb-3">
                  <span className={`text-4xl font-bold tabular-nums ${interpretation.color}`}>
                    {Math.round(posterior * 100)}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    posterior (prior: {prior != null ? Math.round(prior * 100) : "?"}%)
                  </span>
                </div>
                <p className={`text-sm font-medium ${interpretation.color}`}>
                  {interpretation.text}
                </p>
              </div>

              {/* COMPONENT B — Top 3 Priority Actions */}
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Top 3 Priority Actions</span>
                </div>
                {topNegativeSignals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No negative signals found — no priority actions needed.</p>
                ) : (
                  <div className="space-y-4">
                    {topNegativeSignals.map((sig, idx) => {
                      const timeline = deriveTimeline(sig.signalType);
                      const actionText = deriveActionText(sig);
                      const lr = sig.likelihoodRatio ?? sig.lr ?? 1;
                      const ppImpact = sig.contributionPp ?? Math.round((1 - lr) * (prior ?? 0.5) * 100);
                      const timelineColor = timeline === "Near-term" ? "text-red-400 border-red-500/30 bg-red-500/10"
                        : timeline === "Medium-term" ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                        : "text-blue-400 border-blue-500/30 bg-blue-500/10";

                      return (
                        <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 shrink-0">
                              <span className="text-sm font-bold text-red-400">{idx + 1}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-foreground leading-snug">{actionText}</div>
                            </div>
                          </div>
                          <div className="pl-10 space-y-2">
                            <div className="text-xs text-muted-foreground">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Why: </span>
                              {sig.signalDescription || sig.description || sig.signalType || "Negative signal"}
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <BarChart3 className="w-3 h-3 text-red-400" />
                                <span className="text-xs font-semibold text-red-400">+{ppImpact}pp if resolved</span>
                              </div>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${timelineColor}`}>
                                <Clock className="w-2.5 h-2.5" />
                                {timeline}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* COMPONENT C — Decision Threshold */}
              <div className={`rounded-2xl border ${threshold.bgColor} p-6`}>
                <div className="flex items-center gap-4">
                  {threshold.icon}
                  <div>
                    <div className={`text-xl font-bold ${threshold.color}`}>
                      {threshold.label}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {threshold.sublabel}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {forecast && (
            <div className="flex justify-end pt-2">
              <button
                onClick={() => navigate("/respond")}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
              >
                Continue to Respond
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}
