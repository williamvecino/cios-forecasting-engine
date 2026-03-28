import { useState, useEffect } from "react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  Loader2,
  Target,
  AlertTriangle,
  Zap,
  BarChart3,
  Crosshair,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";

interface PriorityAction {
  sequence: number;
  action: string;
  rationale: string;
}

interface SuccessMeasure {
  metric: string;
  target: string;
  timeframe: string;
}

interface RespondResult {
  strategic_recommendation: {
    headline: string;
    rationale: string;
  };
  why_this_matters: {
    key_drivers: string[];
    key_risks: string[];
    summary: string;
  };
  priority_actions: PriorityAction[];
  success_measures: SuccessMeasure[];
  execution_focus: {
    primary_focus: string;
    secondary_focus: string;
    avoid: string;
  };
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export default function RespondPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [data, setData] = useState<RespondResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const caseId = activeQuestion?.caseId || activeQuestion?.id || "";

  useEffect(() => {
    if (!caseId) return;

    const cached = localStorage.getItem(`cios.respondResult:${caseId}`);
    if (cached) {
      try {
        setData(JSON.parse(cached));
        return;
      } catch {}
    }

    generate();
  }, [caseId]);

  async function generate() {
    if (!activeQuestion) return;
    setLoading(true);
    setError(null);

    try {
      const decideRaw = localStorage.getItem(`cios.decideResult:${caseId}`);
      const decideData = decideRaw ? JSON.parse(decideRaw) : null;

      let probability: number | null = null;
      let constrainedProbability: number | null = null;
      try {
        const decomp = localStorage.getItem(`cios.eventDecomposition:${caseId}`);
        if (decomp) {
          const parsed = JSON.parse(decomp);
          probability = parsed.brand_outlook_probability ?? null;
          constrainedProbability = parsed.constrained_probability ?? null;
        }
      } catch {}

      const payload = {
        subject: activeQuestion.subject || activeQuestion.text,
        questionText: activeQuestion.text,
        outcome: activeQuestion.outcome || "adoption",
        timeHorizon: activeQuestion.timeHorizon || "12 months",
        probability,
        constrainedProbability,
        derived_decisions: decideData?.derived_decisions || null,
        adoption_segmentation: decideData?.adoption_segmentation || null,
        readiness_timeline: decideData?.readiness_timeline || null,
        competitive_risk: decideData?.competitive_risk || null,
      };

      const res = await fetch(`${getApiBase()}/ai-respond/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }

      const result = await res.json();
      setData(result);
      localStorage.setItem(`cios.respondResult:${caseId}`, JSON.stringify(result));
    } catch (err: any) {
      setError(err.message || "Failed to generate response");
    } finally {
      setLoading(false);
    }
  }

  function handleCopyAll() {
    if (!data) return;
    const text = formatAsText(data);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleRegenerate() {
    if (caseId) {
      localStorage.removeItem(`cios.respondResult:${caseId}`);
    }
    setData(null);
    generate();
  }

  return (
    <WorkflowLayout currentStep="respond" activeQuestion={activeQuestion} onClearQuestion={clearQuestion}>
      <QuestionGate activeQuestion={activeQuestion}>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">Respond</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Client-ready response derived from your decision analysis.
              </p>
            </div>
            {data && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRegenerate}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Regenerate
                </button>
                <button
                  onClick={handleCopyAll}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy All"}
                </button>
              </div>
            )}
          </div>

          {loading && (
            <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Generating executive response...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-rose-400">Generation failed</p>
                <p className="text-xs text-rose-400/70 mt-1">{error}</p>
                <button
                  onClick={generate}
                  className="mt-2 text-xs font-medium text-rose-400 underline hover:text-rose-300"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {data && !loading && (
            <div className="space-y-5">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-start gap-3">
                  <Target className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-sm font-bold text-primary uppercase tracking-wider mb-2">Strategic Recommendation</h2>
                    <p className="text-base font-semibold text-foreground">{data.strategic_recommendation.headline}</p>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{data.strategic_recommendation.rationale}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="w-full">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Why This Matters</h2>
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{data.why_this_matters.summary}</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Key Drivers</h3>
                        <ul className="space-y-1.5">
                          {data.why_this_matters.key_drivers.map((d, i) => (
                            <li key={i} className="text-sm text-foreground flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Key Risks</h3>
                        <ul className="space-y-1.5">
                          {data.why_this_matters.key_risks.map((r, i) => (
                            <li key={i} className="text-sm text-foreground flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0 mt-1.5" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div className="w-full">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Priority Actions</h2>
                    <div className="space-y-3">
                      {data.priority_actions.map((a) => (
                        <div key={a.sequence} className="flex items-start gap-3">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold shrink-0">
                            {a.sequence}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{a.action}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{a.rationale}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <BarChart3 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="w-full">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Success Measures</h2>
                    <div className="space-y-2">
                      {data.success_measures.map((m, i) => (
                        <div key={i} className="rounded-lg border border-border/50 bg-muted/10 px-4 py-3 grid grid-cols-3 gap-3">
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Metric</p>
                            <p className="text-sm text-foreground mt-0.5">{m.metric}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Target</p>
                            <p className="text-sm text-foreground mt-0.5">{m.target}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Timeframe</p>
                            <p className="text-sm text-foreground mt-0.5">{m.timeframe}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <Crosshair className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                  <div className="w-full">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Execution Focus</h2>
                    <div className="space-y-3">
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                        <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Primary Focus</p>
                        <p className="text-sm text-foreground mt-1">{data.execution_focus.primary_focus}</p>
                      </div>
                      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                        <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Secondary Focus</p>
                        <p className="text-sm text-foreground mt-1">{data.execution_focus.secondary_focus}</p>
                      </div>
                      <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3">
                        <p className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">Avoid</p>
                        <p className="text-sm text-foreground mt-1">{data.execution_focus.avoid}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function formatAsText(data: RespondResult): string {
  const lines: string[] = [];

  lines.push("STRATEGIC RECOMMENDATION");
  lines.push(data.strategic_recommendation.headline);
  lines.push(data.strategic_recommendation.rationale);
  lines.push("");

  lines.push("WHY THIS MATTERS");
  lines.push(data.why_this_matters.summary);
  lines.push("");
  lines.push("Key Drivers:");
  data.why_this_matters.key_drivers.forEach(d => lines.push(`  • ${d}`));
  lines.push("Key Risks:");
  data.why_this_matters.key_risks.forEach(r => lines.push(`  • ${r}`));
  lines.push("");

  lines.push("PRIORITY ACTIONS");
  data.priority_actions.forEach(a => {
    lines.push(`  ${a.sequence}. ${a.action}`);
    lines.push(`     ${a.rationale}`);
  });
  lines.push("");

  lines.push("SUCCESS MEASURES");
  data.success_measures.forEach(m => {
    lines.push(`  • ${m.metric}: ${m.target} (${m.timeframe})`);
  });
  lines.push("");

  lines.push("EXECUTION FOCUS");
  lines.push(`  Primary: ${data.execution_focus.primary_focus}`);
  lines.push(`  Secondary: ${data.execution_focus.secondary_focus}`);
  lines.push(`  Avoid: ${data.execution_focus.avoid}`);

  return lines.join("\n");
}
