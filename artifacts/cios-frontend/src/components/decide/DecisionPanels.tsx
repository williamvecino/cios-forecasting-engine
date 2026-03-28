import { useState, useEffect, useRef } from "react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  Users,
  ShieldAlert,
  Clock,
  Swords,
  TrendingUp,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Target,
  Zap,
  Link2,
  Eye,
  ArrowRight,
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
} from "lucide-react";
import { exportToExcel, exportToPDF, exportToJSON } from "@/lib/forecast-export";

interface SegmentGroup {
  segments: string[];
  reason: string;
}

interface DecisionItem {
  decision_id: string;
  decision_type: string;
  title: string;
  rationale: string;
  source_gate_id: string;
  source_gate_label: string;
  source_gate_status: string;
  forecast_dependency: string;
  severity_or_priority: string;
  derived_from_forecast: boolean;
}

interface DerivedDecisions {
  barriers: DecisionItem[];
  actions: DecisionItem[];
  segments: DecisionItem[];
  trigger_events: DecisionItem[];
  monitoring: DecisionItem[];
}

interface IntegrityViolation {
  rule: string;
  severity: "error" | "warning";
  detail: string;
  decision_id?: string;
  gate_id?: string;
}

interface IntegrityReport {
  valid: boolean;
  violations: IntegrityViolation[];
  gate_coverage: Record<string, { has_barrier: boolean; has_action: boolean; gate_status: string }>;
  derivation_chain_complete: boolean;
}

interface ForecastContext {
  brand_outlook: number | null;
  constrained_probability: number | null;
  gate_count: number;
  weak_gate_count: number;
}

interface DecideResponse {
  mode: "forecast_derived" | "standalone";
  derived_decisions: DerivedDecisions | null;
  integrity: IntegrityReport | null;
  adoption_segmentation: {
    early_adopters: SegmentGroup;
    persuadables: SegmentGroup;
    late_movers: SegmentGroup;
    resistant: SegmentGroup;
  } | null;
  readiness_timeline: {
    near_term_readiness: string;
    trigger_events: string[];
    dependencies: string[];
    timing_risks: string[];
  } | null;
  competitive_risk: {
    incumbent_defense: string;
    fast_follower_risk: string;
    evidence_response: string;
    access_response: string;
  } | null;
  growth_feasibility: {
    segment_size: string;
    access_expansion: string;
    operational_scalability: string;
    revenue_translation: string;
  } | null;
  forecast_context: ForecastContext | null;
}

interface ForecastGate {
  gate_id: string;
  gate_label: string;
  description: string;
  status: string;
  reasoning: string;
  constrains_probability_to: number;
}

function levelColor(level: string) {
  const l = level?.toLowerCase();
  if (l === "low") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (l === "moderate" || l === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  if (l === "high" || l === "critical") return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  if (l === "large") return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  if (l === "small") return "text-slate-400 bg-slate-500/10 border-slate-500/20";
  return "text-slate-400 bg-slate-500/10 border-slate-500/20";
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${levelColor(level)}`}>
      {level}
    </span>
  );
}

function gateStatusColor(status: string) {
  if (status === "strong") return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  if (status === "moderate") return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  if (status === "weak") return "text-red-400 border-red-500/30 bg-red-500/10";
  return "text-slate-400 border-slate-500/30 bg-slate-500/10";
}

function DerivedByTag({ gateLabel, gateStatus }: { gateLabel: string; gateStatus: string }) {
  return (
    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
      <Link2 className="w-3 h-3" />
      <span>Derived from:</span>
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wider ${gateStatusColor(gateStatus)}`}>
        {gateLabel}
      </span>
    </div>
  );
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

export default function DecisionPanels() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [data, setData] = useState<DecideResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedRef = useRef<string | null>(null);

  const subject = activeQuestion?.subject || "";
  const questionText = activeQuestion?.rawInput || activeQuestion?.text || activeQuestion?.question || "";
  const caseId = activeQuestion?.caseId || "unknown";
  const contextKey = `${subject}|${questionText}|${caseId}`;

  useEffect(() => {
    if (!subject || !questionText) return;
    if (requestedRef.current === contextKey) return;
    requestedRef.current = contextKey;

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
        console.error("[CIOS Decide] AI analysis failed:", err);
        setError("Decision analysis unavailable. The analysis will appear once the AI service responds.");
      })
      .finally(() => setLoading(false));
  }, [contextKey, caseId]);

  const isForecastDerived = data?.mode === "forecast_derived";
  const dd = data?.derived_decisions;
  const integrity = data?.integrity;
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
              What action should we take?
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {isForecastDerived
                ? "Decision layer — every barrier, action, and segment is derived from the forecast gates."
                : "Commercial decision layer — segmentation, barriers, readiness, competitive risk, and growth feasibility."}
            </p>
            <div className="mt-3 flex items-center justify-between">
              {isForecastDerived && fc ? (
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>Gates: {fc.gate_count}</span>
                  <span>Weak/Unresolved: {fc.weak_gate_count}</span>
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
              <div className="text-sm text-blue-300 font-medium">Deriving decisions from forecast...</div>
              <div className="text-xs text-slate-400">Mapping gates to barriers, actions, and segments</div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="text-sm text-slate-300">{error}</div>
            </div>
          )}

          {data && (
            <>
              {integrity && !integrity.valid && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-amber-300">Decision Integrity Warning</div>
                      <div className="text-xs text-amber-200/70 mt-1">
                        {integrity.violations.filter(v => v.severity === "error").length} error(s), {integrity.violations.filter(v => v.severity === "warning").length} warning(s) detected in the derivation chain.
                      </div>
                      <details className="mt-2">
                        <summary className="text-[10px] text-amber-300/60 cursor-pointer">Show details</summary>
                        <div className="mt-2 space-y-1">
                          {integrity.violations.map((v, i) => (
                            <div key={i} className="text-[10px] text-slate-400 flex items-start gap-1.5">
                              <span className={v.severity === "error" ? "text-red-400" : "text-amber-400"}>
                                {v.severity === "error" ? "ERR" : "WARN"}
                              </span>
                              <span>[{v.rule}] {v.detail}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              )}

              {isForecastDerived && dd && (
                <>
                  {dd.barriers.length > 0 && (
                    <div className="rounded-2xl border border-red-500/20 bg-card p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                        <div className="text-sm font-semibold text-foreground">Barrier Diagnosis</div>
                        <span className="ml-auto text-[10px] font-medium text-slate-500 uppercase tracking-wider">Gate-derived</span>
                      </div>
                      <div className="space-y-3">
                        {dd.barriers.map((b) => (
                          <div key={b.decision_id} className="rounded-xl border border-border/50 bg-muted/5 p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="text-xs font-semibold text-foreground/90">{b.title}</div>
                              <LevelBadge level={b.severity_or_priority} />
                            </div>
                            <div className="text-[11px] text-muted-foreground">{b.rationale}</div>
                            <div className="text-[10px] text-slate-500 mt-1.5 italic">{b.forecast_dependency}</div>
                            <DerivedByTag gateLabel={b.source_gate_label} gateStatus={b.source_gate_status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dd.actions.length > 0 && (
                    <div className="rounded-2xl border border-emerald-500/20 bg-card p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Target className="w-4 h-4 text-emerald-400" />
                        <div className="text-sm font-semibold text-emerald-300">Required Actions</div>
                        <span className="ml-auto text-[10px] font-medium text-slate-500 uppercase tracking-wider">Gate-derived</span>
                      </div>
                      <div className="space-y-3">
                        {dd.actions.map((a) => (
                          <div key={a.decision_id} className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <div className="text-sm font-semibold text-slate-200">{a.title}</div>
                              </div>
                              <LevelBadge level={a.severity_or_priority} />
                            </div>
                            <div className="text-[11px] text-slate-300">{a.rationale}</div>
                            <div className="text-[10px] text-slate-500 mt-1.5 italic">{a.forecast_dependency}</div>
                            <DerivedByTag gateLabel={a.source_gate_label} gateStatus={a.source_gate_status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dd.segments.length > 0 && (
                    <div className="rounded-2xl border border-blue-500/20 bg-card p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Users className="w-4 h-4 text-blue-400" />
                        <div className="text-sm font-semibold text-foreground">Segment Assignments</div>
                        <span className="ml-auto text-[10px] font-medium text-slate-500 uppercase tracking-wider">Gate-profile derived</span>
                      </div>
                      <div className="space-y-3">
                        {dd.segments.map((s) => {
                          const tierColor = s.title.toLowerCase().includes("early") ? "text-emerald-400"
                            : s.title.toLowerCase().includes("persuad") ? "text-blue-400"
                            : s.title.toLowerCase().includes("late") ? "text-amber-400"
                            : "text-rose-400";
                          return (
                            <div key={s.decision_id} className="rounded-xl border border-border/50 bg-muted/5 p-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className={`text-xs font-semibold ${tierColor}`}>{s.title}</div>
                                <LevelBadge level={s.severity_or_priority} />
                              </div>
                              <div className="text-[11px] text-muted-foreground">{s.rationale}</div>
                              <DerivedByTag gateLabel={s.source_gate_label} gateStatus={s.source_gate_status} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {dd.trigger_events.length > 0 && (
                    <div className="rounded-2xl border border-indigo-500/20 bg-card p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Zap className="w-4 h-4 text-indigo-400" />
                        <div className="text-sm font-semibold text-foreground">Trigger Events to Watch</div>
                        <span className="ml-auto text-[10px] font-medium text-slate-500 uppercase tracking-wider">Gate-derived</span>
                      </div>
                      <div className="space-y-3">
                        {dd.trigger_events.map((t) => (
                          <div key={t.decision_id} className="rounded-xl border border-indigo-500/10 bg-indigo-500/5 p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Eye className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <div className="text-sm text-slate-200">{t.title}</div>
                            </div>
                            <div className="text-[11px] text-slate-400">{t.rationale}</div>
                            <div className="text-[10px] text-slate-500 mt-1 italic">{t.forecast_dependency}</div>
                            <DerivedByTag gateLabel={t.source_gate_label} gateStatus={t.source_gate_status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dd.monitoring.length > 0 && (
                    <div className="rounded-2xl border border-border bg-card p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <div className="text-sm font-semibold text-foreground">Monitoring (Strong Gates)</div>
                      </div>
                      <div className="space-y-2">
                        {dd.monitoring.map((m) => (
                          <div key={m.decision_id} className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              <div className="text-[11px] text-slate-300">{m.title}</div>
                            </div>
                            <DerivedByTag gateLabel={m.source_gate_label} gateStatus={m.source_gate_status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {data.adoption_segmentation && (
                <AdoptionSegmentationPanel data={data.adoption_segmentation} />
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {data.readiness_timeline && (
                  <ReadinessTimelinePanel data={data.readiness_timeline} />
                )}
                {data.competitive_risk && (
                  <CompetitiveRiskPanel data={data.competitive_risk} />
                )}
              </div>

              {data.growth_feasibility && (
                <GrowthFeasibilityPanel data={data.growth_feasibility} />
              )}
            </>
          )}
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function AdoptionSegmentationPanel({ data }: { data: NonNullable<DecideResponse["adoption_segmentation"]> }) {
  const groups = [
    { key: "early_adopters", label: "Early Adopters", icon: CheckCircle2, color: "text-emerald-400", data: data.early_adopters },
    { key: "persuadables", label: "Persuadables", icon: Target, color: "text-blue-400", data: data.persuadables },
    { key: "late_movers", label: "Late Movers", icon: Clock, color: "text-amber-400", data: data.late_movers },
    { key: "resistant", label: "Resistant", icon: XCircle, color: "text-rose-400", data: data.resistant },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-blue-400" />
        <div className="text-sm font-semibold text-foreground">Adoption Segmentation</div>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.key} className="rounded-xl border border-border/50 bg-muted/5 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <g.icon className={`w-3.5 h-3.5 ${g.color}`} />
              <div className={`text-xs font-semibold ${g.color}`}>{g.label}</div>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {g.data.segments.map((seg, i) => (
                <span key={i} className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[11px] text-slate-200">
                  {seg}
                </span>
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground">{g.data.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadinessTimelinePanel({ data }: { data: NonNullable<DecideResponse["readiness_timeline"]> }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-blue-400" />
        <div className="text-sm font-semibold text-foreground">Readiness Timeline</div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="text-xs text-muted-foreground">Near-term readiness:</div>
        <LevelBadge level={data.near_term_readiness} />
      </div>

      <div className="space-y-3">
        {data.trigger_events?.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-muted/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">Trigger Events</div>
            <div className="space-y-1">
              {data.trigger_events.map((ev, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Zap className="w-3 h-3 text-emerald-400/70 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-slate-300">{ev}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.dependencies?.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-muted/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-1.5">Dependencies</div>
            <div className="space-y-1">
              {data.dependencies.map((dep, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400/60 mt-1 shrink-0" />
                  <div className="text-[11px] text-slate-300">{dep}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.timing_risks?.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-muted/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400 mb-1.5">Timing Risks</div>
            <div className="space-y-1">
              {data.timing_risks.map((risk, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 text-rose-400/70 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-slate-300">{risk}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CompetitiveRiskPanel({ data }: { data: NonNullable<DecideResponse["competitive_risk"]> }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Swords className="w-4 h-4 text-rose-400" />
        <div className="text-sm font-semibold text-foreground">Competitive Risk</div>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-border/50 bg-muted/5 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-semibold text-foreground/90">Fast Follower Risk</div>
            <LevelBadge level={data.fast_follower_risk} />
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Incumbent Defense</div>
          <div className="text-[11px] text-slate-300">{data.incumbent_defense}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Evidence Response</div>
          <div className="text-[11px] text-slate-300">{data.evidence_response}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Access Response</div>
          <div className="text-[11px] text-slate-300">{data.access_response}</div>
        </div>
      </div>
    </div>
  );
}

function GrowthFeasibilityPanel({ data }: { data: NonNullable<DecideResponse["growth_feasibility"]> }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-emerald-400" />
        <div className="text-sm font-semibold text-foreground">Growth Feasibility</div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/50 bg-muted/5 p-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Segment Size</div>
          <LevelBadge level={data.segment_size} />
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/5 p-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Scalability</div>
          <LevelBadge level={data.operational_scalability} />
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/5 p-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Revenue</div>
          <LevelBadge level={data.revenue_translation} />
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Access Expansion</div>
          <div className="text-[11px] text-slate-300">{data.access_expansion}</div>
        </div>
      </div>
    </div>
  );
}
