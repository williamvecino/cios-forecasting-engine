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
} from "lucide-react";

interface SegmentGroup {
  segments: string[];
  reason: string;
}

interface BarrierItem {
  readiness: string;
  barrier: string;
  detail: string;
  level?: string;
}

interface DecideData {
  adoption_segmentation: {
    early_adopters: SegmentGroup;
    persuadables: SegmentGroup;
    late_movers: SegmentGroup;
    resistant: SegmentGroup;
  };
  barrier_diagnosis: {
    evidence: BarrierItem;
    access: BarrierItem;
    workflow: BarrierItem;
    competitive: BarrierItem;
  };
  readiness_timeline: {
    near_term_readiness: string;
    trigger_events: string[];
    dependencies: string[];
    timing_risks: string[];
  };
  competitive_risk: {
    incumbent_defense: string;
    fast_follower_risk: string;
    evidence_response: string;
    access_response: string;
  };
  growth_feasibility: {
    segment_size: string;
    access_expansion: string;
    operational_scalability: string;
    revenue_translation: string;
  };
  recommended_actions: string[];
}

function levelColor(level: string) {
  const l = level?.toLowerCase();
  if (l === "low") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (l === "moderate") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  if (l === "high") return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  if (l === "large") return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  if (l === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
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

export default function DecisionPanels() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [data, setData] = useState<DecideData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedRef = useRef<string | null>(null);

  const subject = activeQuestion?.subject || "";
  const questionText = activeQuestion?.rawInput || activeQuestion?.text || activeQuestion?.question || "";
  const contextKey = `${subject}|${questionText}`;

  useEffect(() => {
    if (!subject || !questionText) return;
    if (requestedRef.current === contextKey) return;
    requestedRef.current = contextKey;

    setLoading(true);
    setError(null);

    const API = import.meta.env.VITE_API_URL || "";
    const therapeuticArea = localStorage.getItem("cios.therapeuticArea") || "general";

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
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((result) => {
        setData(result);
      })
      .catch((err) => {
        console.error("[CIOS Decide] AI analysis failed:", err);
        setError("Decision analysis unavailable. The analysis will appear once the AI service responds.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [contextKey]);

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
              Step 4
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              What action should we take?
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Commercial decision layer — segmentation, barriers, readiness, competitive risk, and growth feasibility.
            </p>
          </div>

          {loading && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              <div className="text-sm text-blue-300 font-medium">Generating decision analysis...</div>
              <div className="text-xs text-slate-400">Analyzing market segments, barriers, and competitive dynamics</div>
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
              {data.recommended_actions && data.recommended_actions.length > 0 && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <div className="text-sm font-semibold text-emerald-300">Recommended Actions</div>
                  </div>
                  <div className="space-y-2">
                    {data.recommended_actions.map((action, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Zap className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                        <div className="text-sm text-slate-200">{action}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AdoptionSegmentationPanel data={data.adoption_segmentation} />
                <BarrierDiagnosisPanel data={data.barrier_diagnosis} />
                <ReadinessTimelinePanel data={data.readiness_timeline} />
                <CompetitiveRiskPanel data={data.competitive_risk} />
              </div>

              <GrowthFeasibilityPanel data={data.growth_feasibility} />
            </>
          )}
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function AdoptionSegmentationPanel({ data }: { data: DecideData["adoption_segmentation"] }) {
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

function BarrierDiagnosisPanel({ data }: { data: DecideData["barrier_diagnosis"] }) {
  const domains = [
    { key: "evidence", label: "Evidence", data: data.evidence },
    { key: "access", label: "Access", data: data.access },
    { key: "workflow", label: "Workflow", data: data.workflow },
    { key: "competitive", label: "Competitive", data: data.competitive },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="w-4 h-4 text-amber-400" />
        <div className="text-sm font-semibold text-foreground">Barrier Diagnosis</div>
      </div>
      <div className="space-y-3">
        {domains.map((d) => {
          const readiness = d.data.readiness || d.data.level || "—";
          const barrier = d.data.barrier || (d.data.level ? ({ High: "Low", Moderate: "Moderate", Low: "High" }[d.data.level] || "—") : "—");
          return (
            <div key={d.key} className="rounded-xl border border-border/50 bg-muted/5 p-3">
              <div className="text-xs font-semibold text-foreground/90 mb-2">{d.label}</div>
              <div className="flex items-center gap-3 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Readiness</span>
                  <LevelBadge level={readiness} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Barrier</span>
                  <BarrierBadge level={barrier} />
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">{d.data.detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarrierBadge({ level }: { level: string }) {
  const color =
    level === "High" ? "border-red-500/40 text-red-400 bg-red-500/10" :
    level === "Low" ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" :
    "border-amber-500/40 text-amber-400 bg-amber-500/10";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      {level}
    </span>
  );
}

function ReadinessTimelinePanel({ data }: { data: DecideData["readiness_timeline"] }) {
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
      </div>
    </div>
  );
}

function CompetitiveRiskPanel({ data }: { data: DecideData["competitive_risk"] }) {
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

function GrowthFeasibilityPanel({ data }: { data: DecideData["growth_feasibility"] }) {
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
