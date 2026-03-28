import { useState, useEffect } from "react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  FlaskConical,
} from "lucide-react";
import { Link } from "wouter";

interface RespondResult {
  strategic_recommendation: string;
  why_this_matters: string;
  priority_actions: string[];
  success_measures: string[];
  execution_focus: string;
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
        const raw = JSON.parse(cached);
        const normalized = normalizeResult(raw);
        if (normalized) {
          setData(normalized);
          return;
        }
        localStorage.removeItem(`cios.respondResult:${caseId}`);
      } catch {
        localStorage.removeItem(`cios.respondResult:${caseId}`);
      }
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

      let signals: any[] = [];
      try {
        const sigRaw = localStorage.getItem(`cios.signals:${caseId}`);
        if (sigRaw) {
          const allSigs = JSON.parse(sigRaw);
          signals = (allSigs || [])
            .filter((s: any) => s.accepted && !s.dismissed)
            .map((s: any) => ({
              text: s.text,
              direction: s.direction,
              importance: s.importance,
              confidence: s.confidence,
              source: s.source,
              signal_source: s.signal_source,
            }));
        }
      } catch {}

      const payload = {
        subject: activeQuestion.subject || activeQuestion.text,
        questionText: activeQuestion.text,
        outcome: activeQuestion.outcome || "adoption",
        timeHorizon: activeQuestion.timeHorizon || "12 months",
        probability,
        constrainedProbability,
        signals,
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
                Executive brief derived from your decision analysis.
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
              <p className="text-sm text-muted-foreground">Generating executive brief...</p>
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
            <div className="space-y-6">
              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Strategic Recommendation</h2>
                <p className="text-[15px] text-foreground leading-relaxed">{data.strategic_recommendation}</p>
              </section>

              <div className="border-t border-border/40" />

              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Why This Matters</h2>
                <p className="text-[15px] text-foreground leading-relaxed">{data.why_this_matters}</p>
              </section>

              <div className="border-t border-border/40" />

              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Priority Actions</h2>
                <ul className="space-y-2">
                  {data.priority_actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-3 text-[15px] text-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 mt-2" />
                      {action}
                    </li>
                  ))}
                </ul>
              </section>

              <div className="border-t border-border/40" />

              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Success Measures</h2>
                <ul className="space-y-2">
                  {data.success_measures.map((measure, i) => (
                    <li key={i} className="flex items-start gap-3 text-[15px] text-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-2" />
                      {measure}
                    </li>
                  ))}
                </ul>
              </section>

              <div className="border-t border-border/40" />

              <section>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Execution Focus</h2>
                <p className="text-[15px] text-foreground leading-relaxed">{data.execution_focus}</p>
              </section>

              <div className="border-t border-border/40 pt-2" />

              <Link
                href="/simulate"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
              >
                Continue to Simulate
                <FlaskConical className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function normalizeResult(raw: any): RespondResult | null {
  if (!raw || typeof raw !== "object") return null;

  const sr = raw.strategic_recommendation;
  const strategic_recommendation = typeof sr === "string"
    ? sr
    : (sr?.headline || sr?.text || "");
  if (!strategic_recommendation) return null;

  const wm = raw.why_this_matters;
  const why_this_matters = typeof wm === "string"
    ? wm
    : (wm?.summary || wm?.text || "");

  const pa = raw.priority_actions;
  const priority_actions = Array.isArray(pa)
    ? pa.map((a: any) => typeof a === "string" ? a : (a?.action || a?.text || "")).filter(Boolean)
    : [];

  const sm = raw.success_measures;
  const success_measures = Array.isArray(sm)
    ? sm.map((m: any) => typeof m === "string" ? m : (m?.metric || m?.text || "")).filter(Boolean)
    : [];

  const ef = raw.execution_focus;
  const execution_focus = typeof ef === "string"
    ? ef
    : (ef?.primary_focus || ef?.text || "");

  return { strategic_recommendation, why_this_matters, priority_actions, success_measures, execution_focus };
}

function formatAsText(data: RespondResult): string {
  const lines: string[] = [];

  lines.push("STRATEGIC RECOMMENDATION");
  lines.push(data.strategic_recommendation);
  lines.push("");

  lines.push("WHY THIS MATTERS");
  lines.push(data.why_this_matters);
  lines.push("");

  lines.push("PRIORITY ACTIONS");
  data.priority_actions.forEach(a => lines.push(`• ${a}`));
  lines.push("");

  lines.push("SUCCESS MEASURES");
  data.success_measures.forEach(m => lines.push(`• ${m}`));
  lines.push("");

  lines.push("EXECUTION FOCUS");
  lines.push(data.execution_focus);

  return lines.join("\n");
}
