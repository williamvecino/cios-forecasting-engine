import { useState, useMemo } from "react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { Loader2, Play, TrendingUp, TrendingDown, Minus, Users } from "lucide-react";
import { detectCaseType } from "@/lib/case-type-utils";

const API = import.meta.env.VITE_API_URL || "";

// All 30 signal types from the precedent library
const SIGNAL_TYPES = [
  "Phase III clinical",
  "Guideline inclusion",
  "KOL endorsement",
  "Field intelligence",
  "Operational friction",
  "Competitor counteraction",
  "Access / commercial",
  "Regulatory / clinical",
  "Access friction",
  "Experience infrastructure",
  "Payer / coverage",
  "Market adoption / utilization",
  "Capacity / infrastructure",
  "Competitor countermove",
  "Safety / tolerability",
  "Guideline consensus",
  "Epidemiology / population",
  "Prescriber behavior",
  "Access / reimbursement",
  "Real-world evidence",
  "Phase II clinical",
  "Guideline / SOC",
  "Policy / regulatory",
  "Advocacy / patient",
  "Competitive intelligence",
  "Operational / manufacturing",
  "Operational constraint",
  "Operational milestone",
  "Clinical workflow",
  "Development timeline",
  "Health economics / cost offset",
];

const SEGMENTS = [
  { value: "Early Adopters", label: "Early Adopters", multiplier: 1.15 },
  { value: "Persuadables", label: "Persuadables (baseline)", multiplier: 1.0 },
  { value: "Late Movers", label: "Late Movers", multiplier: 0.75 },
  { value: "Resistant", label: "Resistant", multiplier: 0.50 },
  { value: "Risk Gatekeepers", label: "Risk Gatekeepers", multiplier: 0.85 },
];

interface ScenarioResult {
  caseId: string;
  prior: number;
  segment: string;
  segmentMultiplier: number;
  signalCount: number;
  base: {
    posterior: number;
    segmentAdjusted: number;
    signalCount: number;
  };
  bull: {
    posterior: number;
    segmentAdjusted: number;
    addedSignal: { type: string; direction: string; lr: number };
    signalCount: number;
    delta: number;
  } | null;
  bear: {
    posterior: number;
    segmentAdjusted: number;
    addedSignal: { type: string; direction: string; lr: number };
    signalCount: number;
    delta: number;
  } | null;
}

function pct(v: number | null | undefined): string {
  if (v == null) return "-";
  return `${Math.round(v * 100)}%`;
}

function deltaPct(v: number | null | undefined): string {
  if (v == null) return "";
  const pp = Math.round(v * 100);
  return pp >= 0 ? `+${pp}pp` : `${pp}pp`;
}

function probColor(v: number): string {
  if (v >= 0.6) return "text-emerald-400";
  if (v >= 0.4) return "text-amber-400";
  return "text-rose-400";
}

export default function SimulatePage() {
  const { activeQuestion } = useActiveQuestion();
  const caseId = activeQuestion?.caseId || activeQuestion?.id || "";
  const questionText = activeQuestion?.text || "";
  const caseTypeInfo = useMemo(() => detectCaseType(questionText), [questionText]);

  const [bullSignalType, setBullSignalType] = useState("");
  const [bearSignalType, setBearSignalType] = useState("");
  const [segment, setSegment] = useState("Persuadables");

  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = !!(bullSignalType || bearSignalType);

  async function runScenario() {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API}/api/cases/${caseId}/scenario-forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bullSignalType: bullSignalType || undefined,
          bearSignalType: bearSignalType || undefined,
          segment,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Scenario forecast failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <WorkflowLayout currentStep="simulate" caseId={caseId}>
      <QuestionGate>
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Scenario Simulation</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Add hypothetical signals to see how the Bayesian posterior changes. Engine computes — not GPT.
            </p>
          </div>

          {/* ── SCENARIO INPUTS ── */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Scenario Definition</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Bull signal */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5" />
                  What positive signal would change this forecast?
                </label>
                <select
                  value={bullSignalType}
                  onChange={e => setBullSignalType(e.target.value)}
                  className="w-full rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-sm text-foreground"
                >
                  <option value="">None — no bull scenario</option>
                  {SIGNAL_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {bullSignalType && (
                  <p className="text-[10px] text-emerald-400/70">
                    Adds a hypothetical positive "{bullSignalType}" signal with precedent-library LR, recomputes posterior.
                  </p>
                )}
              </div>

              {/* Bear signal */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-rose-400 uppercase tracking-wider">
                  <TrendingDown className="w-3.5 h-3.5" />
                  What negative signal threatens this forecast?
                </label>
                <select
                  value={bearSignalType}
                  onChange={e => setBearSignalType(e.target.value)}
                  className="w-full rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2.5 text-sm text-foreground"
                >
                  <option value="">None — no bear scenario</option>
                  {SIGNAL_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {bearSignalType && (
                  <p className="text-[10px] text-rose-400/70">
                    Adds a hypothetical negative "{bearSignalType}" signal with precedent-library LR, recomputes posterior.
                  </p>
                )}
              </div>
            </div>

            {/* Segment selector */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Users className="w-3.5 h-3.5" />
                Segment
              </label>
              <div className="flex flex-wrap gap-2">
                {SEGMENTS.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSegment(s.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      segment === s.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                    <span className="ml-1 text-[10px] text-muted-foreground">×{s.multiplier}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Run button */}
            <button
              onClick={runScenario}
              disabled={loading || !canRun}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {loading ? "Computing posteriors..." : "Run Scenario Simulation"}
            </button>

            {!canRun && !result && (
              <p className="text-xs text-muted-foreground text-center">
                Select at least one hypothetical signal (bull or bear) to run a scenario.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
              {error}
            </div>
          )}

          {/* ── THREE-POSTERIOR COMPARISON ── */}
          {result && !loading && (
            <div className="space-y-6">
              {/* Summary bar */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Prior: {pct(result.prior)}</span>
                  <span>Signals: {result.signalCount}</span>
                  <span>Segment: {result.segment} (×{result.segmentMultiplier})</span>
                </div>
              </div>

              {/* Three columns */}
              <div className={`grid gap-4 ${result.bull && result.bear ? "grid-cols-3" : result.bull || result.bear ? "grid-cols-2" : "grid-cols-1"}`}>
                {/* Base case */}
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Minus className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Base Case</span>
                  </div>
                  <div>
                    <div className={`text-4xl font-bold ${probColor(result.base.posterior)}`}>
                      {pct(result.base.posterior)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">Raw posterior</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-foreground">
                      {pct(result.base.segmentAdjusted)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Segment-adjusted ({result.segment})</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Current signal stack — {result.base.signalCount} signals, no modifications.
                  </div>
                </div>

                {/* Bull case */}
                {result.bull && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Bull Case</span>
                    </div>
                    <div>
                      <div className={`text-4xl font-bold ${probColor(result.bull.posterior)}`}>
                        {pct(result.bull.posterior)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Raw posterior
                        <span className="ml-2 font-semibold text-emerald-400">{deltaPct(result.bull.delta)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-foreground">
                        {pct(result.bull.segmentAdjusted)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Segment-adjusted ({result.segment})</div>
                    </div>
                    <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs">
                      <div className="font-semibold text-emerald-400">+ {result.bull.addedSignal.type}</div>
                      <div className="text-muted-foreground mt-0.5">
                        Direction: {result.bull.addedSignal.direction} | LR: {result.bull.addedSignal.lr?.toFixed(3)} | Signals: {result.bull.signalCount}
                      </div>
                    </div>
                  </div>
                )}

                {/* Bear case */}
                {result.bear && (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-rose-400" />
                      <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Bear Case</span>
                    </div>
                    <div>
                      <div className={`text-4xl font-bold ${probColor(result.bear.posterior)}`}>
                        {pct(result.bear.posterior)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Raw posterior
                        <span className="ml-2 font-semibold text-rose-400">{deltaPct(result.bear.delta)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-foreground">
                        {pct(result.bear.segmentAdjusted)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Segment-adjusted ({result.segment})</div>
                    </div>
                    <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs">
                      <div className="font-semibold text-rose-400">+ {result.bear.addedSignal.type}</div>
                      <div className="text-muted-foreground mt-0.5">
                        Direction: {result.bear.addedSignal.direction} | LR: {result.bear.addedSignal.lr?.toFixed(3)} | Signals: {result.bear.signalCount}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Computation disclosure */}
              <div className="rounded-xl border border-border/40 bg-muted/5 p-4">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  All posteriors computed by runForecastEngine with Bayesian signal decomposition, precedent-locked LRs, correlation compression, and actor adjustment.
                  Segment multipliers represent adoption rate within that segment, not overall market probability.
                  No GPT was used for probability computation.
                </p>
              </div>
            </div>
          )}
        </div>
      </QuestionGate>
    </WorkflowLayout>
  );
}
