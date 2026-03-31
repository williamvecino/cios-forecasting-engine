import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { detectCaseType } from "@/lib/case-type-utils";
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
  User,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Gauge,
} from "lucide-react";
import { exportToExcel, exportToPDF, exportToJSON } from "@/lib/forecast-export";
import SavedQuestionsPanel from "@/components/question/SavedQuestionsPanel";
import ExplanationPanel from "@/components/explanation-panel";

interface DecisionAction {
  gateName: string;
  blockingCondition: string;
  requiredAction: string;
  owner: string;
  timeline: string;
  resolutionMetric: string;
  forecastImpact: string;
  priorityScore: number;
}

interface ForecastContext {
  brand_outlook: number | null;
  constrained_probability: number | null;
  gate_count: number;
  weak_gate_count: number;
}

interface DecideResponse {
  mode: "forecast_derived" | "standalone";
  decision_actions: DecisionAction[];
  forecast_context: ForecastContext | null;
  [key: string]: any;
}

interface ForecastGate {
  gate_id: string;
  gate_label: string;
  description: string;
  status: string;
  reasoning: string;
  constrains_probability_to: number;
}

function loadForecastGates(caseId: string): { gates: ForecastGate[]; brandOutlook: number | null; constrained: number | null } {
  try {
    const raw = localStorage.getItem(`cios.eventDecomposition:${caseId}`);
    if (!raw) return { gates: [], brandOutlook: null, constrained: null };
    const decomp = JSON.parse(raw);
    return {
      gates: decomp.event_gates || [],
      brandOutlook: decomp.brand_outlook_probability ?? null,
      constrained: decomp.constrained_probability ?? null,
    };
  } catch {
    return { gates: [], brandOutlook: null, constrained: null };
  }
}

function priorityColor(score: number) {
  if (score >= 80) return { bg: "bg-red-500/10", border: "border-red-500/25", text: "text-red-400", badge: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (score >= 60) return { bg: "bg-amber-500/10", border: "border-amber-500/25", text: "text-amber-400", badge: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  return { bg: "bg-blue-500/10", border: "border-blue-500/25", text: "text-blue-400", badge: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
}

function priorityLabel(score: number) {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

export default function DecisionPanels() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [, navigate] = useLocation();
  const [data, setData] = useState<DecideResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedRef = useRef<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<number | null>(null);

  const subject = activeQuestion?.subject || "";
  const questionText = activeQuestion?.rawInput || activeQuestion?.text || activeQuestion?.question || "";
  const caseId = activeQuestion?.caseId || activeQuestion?.id || "";
  const contextKey = `${subject}|${questionText}|${caseId}`;
  const caseTypeInfo = useMemo(() => detectCaseType(questionText), [questionText]);

  useEffect(() => {
    if (!subject || !questionText) return;
    if (requestedRef.current === contextKey) return;
    requestedRef.current = contextKey;

    setData(null);
    setLoading(true);
    setError(null);

    const API = import.meta.env.VITE_API_URL || "";
    const therapeuticArea = localStorage.getItem("cios.therapeuticArea") || "general";
    const { gates, brandOutlook: bo, constrained: cp } = loadForecastGates(caseId);

    fetch(`${API}/api/ai-decide/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        outcome: activeQuestion?.outcome || "adoption",
        questionType: activeQuestion?.questionType || "binary",
        questionText,
        timeHorizon: activeQuestion?.timeHorizon || "12 months",
        entities: activeQuestion?.entities || [],
        therapeuticArea,
        forecastGates: gates,
        brandOutlookProbability: bo,
        constrainedProbability: cp,
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((result) => {
        setData(result);
        try {
          localStorage.setItem(`cios.decideResult:${caseId}`, JSON.stringify(result));
        } catch {}
      })
      .catch((err) => {
        console.error("[CIOS Decide] analysis failed:", err);
        setError("Decision analysis unavailable. The analysis will appear once the system responds.");
      })
      .finally(() => setLoading(false));
  }, [contextKey, caseId]);

  const actions = data?.decision_actions || [];
  const fc = data?.forecast_context;

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
              Decide
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              Priority Actions
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Executable actions derived from forecast gates — each action addresses an unresolved gate with a named owner, timeline, and resolution metric.
            </p>
            {caseId && (
              <div className="mt-3">
                <SavedQuestionsPanel caseId={caseId} />
              </div>
            )}
            {caseId && (
              <div className="mt-4">
                <ExplanationPanel caseId={caseId} />
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              {fc ? (
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>Gates: {fc.gate_count}</span>
                  <span>Unresolved: {fc.weak_gate_count}</span>
                  {fc.brand_outlook != null && <span>Brand Outlook: {Math.round(fc.brand_outlook * 100)}%</span>}
                  {fc.constrained_probability != null && <span>Forecast: {Math.round(fc.constrained_probability * 100)}%</span>}
                </div>
              ) : <div />}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Export</span>
                <button
                  onClick={exportToPDF}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
                  title="Export as PDF"
                >
                  <FileText className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  onClick={exportToExcel}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
                  title="Export as Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Excel
                </button>
                <button
                  onClick={exportToJSON}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
                  title="Export as JSON"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  JSON
                </button>
              </div>
            </div>
          </div>

          {loading && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              <div className="text-sm text-blue-300 font-medium">Generating priority actions from forecast gates...</div>
              <div className="text-xs text-slate-400">Mapping each unresolved gate to an executable action</div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="text-sm text-slate-300">{error}</div>
            </div>
          )}

          {data && actions.length > 0 && (
            <div className="space-y-3">
              {actions.map((action, idx) => {
                const colors = priorityColor(action.priorityScore);
                const isExpanded = expandedAction === idx;
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border ${colors.border} bg-card overflow-hidden transition-all duration-200`}
                  >
                    <button
                      onClick={() => setExpandedAction(isExpanded ? null : idx)}
                      className="w-full flex items-center gap-4 px-5 py-4 text-left cursor-pointer hover:bg-white/[0.02] transition"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 border border-white/10">
                        <span className={`text-sm font-bold ${colors.text}`}>{idx + 1}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">{action.requiredAction}</div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-muted-foreground">{action.gateName}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${colors.badge}`}>
                            <Gauge className="w-2.5 h-2.5" />
                            {priorityLabel(action.priorityScore)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <User className="w-3 h-3" />
                            {action.owner}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                            <Clock className="w-3 h-3" />
                            {action.timeline}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-red-400/80 mb-1.5">Blocking Condition</div>
                            <div className="text-[12px] text-slate-300 leading-relaxed">{action.blockingCondition}</div>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80 mb-1.5">Resolution Metric</div>
                            <div className="text-[12px] text-slate-300 leading-relaxed">{action.resolutionMetric}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <User className="w-3 h-3 text-blue-400/70" />
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/80">Owner</span>
                            </div>
                            <div className="text-[12px] text-foreground font-medium">{action.owner}</div>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Clock className="w-3 h-3 text-amber-400/70" />
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">Timeline</span>
                            </div>
                            <div className="text-[12px] text-foreground font-medium">{action.timeline}</div>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <BarChart3 className="w-3 h-3 text-violet-400/70" />
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80">Forecast Effect</span>
                            </div>
                            <div className="text-[12px] text-foreground/80 leading-relaxed">{action.forecastImpact}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {data && actions.length === 0 && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
              <Target className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              {data.mode === "forecast_derived" && fc && fc.gate_count > 0 ? (
                <>
                  <div className="text-sm text-emerald-300 font-semibold">All gates are strong</div>
                  <div className="text-xs text-slate-400 mt-1">No blocking conditions detected — the forecast is unconstrained.</div>
                </>
              ) : (
                <>
                  <div className="text-sm text-slate-300 font-semibold">No forecast gates available</div>
                  <div className="text-xs text-slate-400 mt-1">Run the forecast from the Judge step first to generate gate-derived actions.</div>
                </>
              )}
            </div>
          )}

          {data && (
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
