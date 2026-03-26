import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import WorkflowLayout from "@/components/workflow-layout";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { MOCK_CASE } from "@/lib/mock-case";
import { enrichCase } from "@/lib/case-library";
import type { CaseCardData } from "@/lib/case-library";
import CaseCard from "@/components/case-library/case-card";
import { ProbabilityGauge } from "@/components/ui-components";
import {
  ArrowUpRight,
  ArrowDownRight,
  BookOpen,
  Target,
  Layers,
  TrendingUp,
  TrendingDown,
  BrainCircuit,
  RefreshCcw,
  Loader2,
  Minus,
  Zap,
  Activity,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

type Tab = "forecast" | "scenarios" | "drivers" | "library";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "forecast", label: "Current Forecast", icon: <Target className="w-4 h-4" /> },
  { key: "scenarios", label: "Scenario Planning", icon: <Layers className="w-4 h-4" /> },
  { key: "drivers", label: "Driver Impact", icon: <TrendingUp className="w-4 h-4" /> },
  { key: "library", label: "Case Library", icon: <BookOpen className="w-4 h-4" /> },
];

export default function ForecastPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [tab, setTab] = useState<Tab>("forecast");

  return (
    <WorkflowLayout
      currentStep="forecast"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <section className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Step 3
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            What is likely to happen?
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Review forecasts, explore scenarios, understand driver impact,
            and browse all cases in one place.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 border-b border-border pb-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  "inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition",
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                ].join(" ")}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "forecast" && <CurrentForecastTab activeQuestion={activeQuestion} />}
        {tab === "scenarios" && <ScenarioPlanningTab activeQuestion={activeQuestion} />}
        {tab === "drivers" && <DriverImpactTab activeQuestion={activeQuestion} />}
        {tab === "library" && <CaseLibraryTab />}
      </section>
    </WorkflowLayout>
  );
}

function CurrentForecastTab({ activeQuestion }: { activeQuestion: any }) {
  const caseId = activeQuestion?.caseId;
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fetchForecast() {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/cases/${caseId}/forecast`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch forecast");
        return r.json();
      })
      .then((data) => setForecast(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchForecast();
  }, [caseId]);

  if (!activeQuestion) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard label="Probability" value="—" sub="Primary forecast output." />
            <StatCard label="Key Drivers" value="—" sub="Main factors moving the forecast." />
            <StatCard label="Timing" value="—" sub="When the shift is likely to occur." />
          </div>
        </div>
        <BottomLinks />
      </>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center gap-3">
        <BrainCircuit className="w-10 h-10 text-primary animate-pulse" />
        <div className="text-sm text-muted-foreground">Computing Bayesian forecast...</div>
      </div>
    );
  }

  if (error || !forecast) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard label="Probability" value={MOCK_CASE.forecast.probability} sub="From prior estimate" highlight />
            <StatCard label="Key Drivers" value={MOCK_CASE.forecast.keyDrivers.join(", ")} sub="Main factors moving the forecast." />
            <StatCard label="Timing" value={MOCK_CASE.forecast.timing} sub="When the shift is likely to occur." />
          </div>
        </div>
        <BottomLinks />
      </>
    );
  }

  const currentPct = (forecast.currentProbability * 100).toFixed(1);
  const priorPct = (forecast.priorProbability * 100).toFixed(1);
  const delta = forecast.currentProbability - forecast.priorProbability;
  const deltaPts = (delta * 100).toFixed(1);

  const signalDetails = forecast.signalDetails || [];
  const positiveDrivers = signalDetails.filter((s: any) => s.effectiveLR > 1);
  const negativeDrivers = signalDetails.filter((s: any) => s.effectiveLR < 1);
  const interpretation = forecast.interpretation;
  const simulation = forecast.scenarioSimulation;

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center justify-center">
          <ProbabilityGauge value={forecast.currentProbability} size={200} />
          <div className="mt-4 text-center space-y-1">
            <div className="text-3xl font-bold text-emerald-400">{currentPct}%</div>
            <div className="text-xs text-muted-foreground">Current probability</div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs">
            <div className="text-muted-foreground">
              PRIOR <span className="text-foreground font-semibold">{priorPct}%</span>
            </div>
            <div className="text-muted-foreground">
              CHANGE{" "}
              <span className={delta >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {delta >= 0 ? "+" : ""}{deltaPts} pts
              </span>
            </div>
            <div className="text-muted-foreground">
              CONFIDENCE{" "}
              <span className="text-foreground font-semibold">{forecast.confidenceLevel || "—"}</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground text-center max-w-[260px]">
            {interpretation?.primaryStatement || "Current signals support a favorable outcome within the forecast window."}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground/50">Engine v1 · Bayesian</div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Key Drivers
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Positive</div>
                {positiveDrivers.length === 0 ? (
                  <div className="text-xs text-muted-foreground">None</div>
                ) : (
                  positiveDrivers.map((d: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-foreground/90">
                        <ArrowUpRight className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="truncate">{d.description || d.signalId}</span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${d.effectiveLR > 1.5 ? "bg-amber-500/15 text-amber-300" : d.effectiveLR > 1.2 ? "bg-blue-500/15 text-blue-300" : "bg-muted/30 text-muted-foreground"}`}>
                        {d.effectiveLR > 1.5 ? "High" : d.effectiveLR > 1.2 ? "Medium" : "Low"}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Negative</div>
                {negativeDrivers.length === 0 ? (
                  <div className="text-xs text-muted-foreground">None</div>
                ) : (
                  negativeDrivers.map((d: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-foreground/90">
                        <ArrowDownRight className="w-3 h-3 text-red-400 shrink-0" />
                        <span className="truncate">{d.description || d.signalId}</span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${d.effectiveLR < 0.6 ? "bg-amber-500/15 text-amber-300" : d.effectiveLR < 0.8 ? "bg-blue-500/15 text-blue-300" : "bg-muted/30 text-muted-foreground"}`}>
                        {d.effectiveLR < 0.6 ? "High" : d.effectiveLR < 0.8 ? "Medium" : "Low"}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="pt-2 border-t border-border text-[10px] text-muted-foreground/60">
                Ranked by likelihood ratio impact · {signalDetails.length} drivers shown
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Scenario Simulator
              </div>
              <div className="text-[10px] text-muted-foreground/60">Scenario output · backend computed</div>
              {simulation ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {["bestCase", "baseCase", "riskCase"].map((key) => {
                    const s = simulation[key];
                    if (!s) return null;
                    const label = key === "bestCase" ? "Best case" : key === "baseCase" ? "Base case" : "Risk case";
                    return (
                      <div key={key} className="rounded-lg border border-border bg-muted/10 p-3 space-y-1">
                        <div className="text-[10px] text-muted-foreground">{label}</div>
                        <div className="text-sm text-foreground/80 leading-snug line-clamp-3">
                          {s.description || s.narrative || "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {MOCK_CASE.scenarios.map((s) => (
                    <div key={s.name} className="rounded-lg border border-border bg-muted/10 p-3 space-y-1">
                      <div className="text-[10px] text-muted-foreground">{s.name}</div>
                      <div className="text-lg font-bold text-foreground">{s.probability}</div>
                      <div className="text-[11px] text-muted-foreground leading-snug line-clamp-3">{s.description}</div>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={fetchForecast}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 flex items-center justify-center gap-2"
              >
                <RefreshCcw className="w-4 h-4" />
                Run Scenario
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Signal Stack
            <span className="text-foreground ml-1">{signalDetails.length} validated</span>
          </div>
          <Link href="/signals" className="text-xs text-primary hover:text-primary/80">
            Manage
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 pr-4 font-semibold">SIGNAL</th>
                <th className="text-center py-2 px-2 font-semibold w-12">DIR</th>
                <th className="text-center py-2 px-2 font-semibold w-12">STR</th>
                <th className="text-center py-2 px-2 font-semibold w-12">REL</th>
                <th className="text-center py-2 px-2 font-semibold w-20">STATUS</th>
                <th className="text-right py-2 pl-2 font-semibold w-16">DATE</th>
              </tr>
            </thead>
            <tbody>
              {signalDetails.map((sig: any, i: number) => {
                const isUp = sig.effectiveLR > 1;
                return (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2.5 pr-4 text-foreground/90 leading-snug max-w-[400px]">
                      {sig.description || sig.signalId}
                    </td>
                    <td className="text-center py-2.5 px-2">
                      {isUp ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                      ) : sig.effectiveLR < 1 ? (
                        <ArrowDownRight className="w-3.5 h-3.5 text-red-400 mx-auto" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <StrengthDots value={sig.effectiveLR > 1.5 || sig.effectiveLR < 0.6 ? 5 : sig.effectiveLR > 1.2 || sig.effectiveLR < 0.8 ? 4 : 3} />
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <StrengthDots value={sig.reliability === "Confirmed" ? 5 : sig.reliability === "Probable" ? 4 : 3} />
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                        Validated
                      </span>
                    </td>
                    <td className="text-right py-2.5 pl-2 text-muted-foreground">
                      {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                );
              })}
              {signalDetails.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No signals registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {interpretation && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <BrainCircuit className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Recommended Action</div>
              <div className="text-base font-semibold text-foreground">{interpretation.recommendedAction || "Selectively invest. Evidence is favorable but not yet decisive."}</div>
              <div className="text-sm text-muted-foreground leading-relaxed">
                {interpretation.primaryStatement}
              </div>
              {interpretation.suggestedNextSteps && interpretation.suggestedNextSteps.length > 0 && (
                <div className="grid grid-cols-1 gap-3 mt-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-[10px] text-primary font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      Next Actions
                    </div>
                    {interpretation.suggestedNextSteps.map((step: string, i: number) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary shrink-0">&gt;</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                  {interpretation.monitorItems && interpretation.monitorItems.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Monitor</div>
                      {interpretation.monitorItems.map((item: string, i: number) => (
                        <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-amber-400 shrink-0">&gt;</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <BottomLinks />
    </>
  );
}

function StrengthDots({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5 justify-center">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= value ? "bg-primary" : "bg-muted/30"}`}
        />
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${highlight ? "border-primary/30 bg-primary/5" : "border-border bg-muted/10"}`}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-2 font-semibold text-foreground ${value.length > 30 ? "text-sm" : "text-2xl"}`}>{value}</div>
      <div className="mt-2 text-sm text-muted-foreground/70">{sub}</div>
    </div>
  );
}

function BottomLinks() {
  return (
    <>
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="text-sm font-semibold text-foreground">What comes next</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Once the forecast is visible, the next layer helps convert that output into action:
          who to target, what blocks movement, when to act, and what competitive risks to watch.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Adoption Segmentation", "Barrier Diagnosis", "Readiness Timeline", "Competitive Risk", "Growth Feasibility"].map((item) => (
            <span key={item} className="rounded-full bg-muted/20 px-3 py-1 text-xs text-muted-foreground">{item}</span>
          ))}
        </div>
        <Link href="/decide" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500">
          Go to Decide
        </Link>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="text-sm font-semibold text-foreground">Advanced forecast tools</div>
        <div className="mt-2 text-sm text-muted-foreground">Keep these accessible without crowding the main workflow.</div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/forecast-ledger" className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20">Forecast Ledger</Link>
          <Link href="/calibration" className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20">Calibration</Link>
          <Link href="/workbench" className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20">Workbench</Link>
        </div>
      </div>
    </>
  );
}

function ScenarioPlanningTab({ activeQuestion }: { activeQuestion: any }) {
  const [forecast, setForecast] = useState<any>(null);
  const caseId = activeQuestion?.caseId;

  useEffect(() => {
    if (!caseId) return;
    fetch(`${API_BASE}/cases/${caseId}/forecast`)
      .then((r) => r.json())
      .then(setForecast)
      .catch(() => {});
  }, [caseId]);

  const scenarios = forecast?.scenarioSimulation
    ? [
        { name: "Best Case", probability: forecast.scenarioSimulation.bestCase?.probability, description: forecast.scenarioSimulation.bestCase?.narrative || forecast.scenarioSimulation.bestCase?.description },
        { name: "Base Case", probability: forecast.scenarioSimulation.baseCase?.probability, description: forecast.scenarioSimulation.baseCase?.narrative || forecast.scenarioSimulation.baseCase?.description },
        { name: "Risk Case", probability: forecast.scenarioSimulation.riskCase?.probability, description: forecast.scenarioSimulation.riskCase?.narrative || forecast.scenarioSimulation.riskCase?.description },
      ].filter((s) => s.probability != null)
    : MOCK_CASE.scenarios;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
      <div>
        <div className="text-sm font-semibold text-foreground">Scenario Planning</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Three strategic scenarios with probability estimates under different assumptions.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {scenarios.map((s: any) => {
          const pctStr = typeof s.probability === "number"
            ? `${(s.probability * 100).toFixed(0)}%`
            : s.probability;
          return (
            <div key={s.name} className="rounded-xl border border-border bg-muted/10 p-5 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.name}</div>
              <div className="text-3xl font-bold text-foreground">{pctStr}</div>
              <div className="text-sm text-muted-foreground">{s.description}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-muted/10 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Scenario Comparison</div>
        <div className="space-y-3">
          {scenarios.map((s: any) => {
            const pct = typeof s.probability === "number" ? s.probability * 100 : parseInt(s.probability);
            const pctStr = typeof s.probability === "number" ? `${(s.probability * 100).toFixed(0)}%` : s.probability;
            return (
              <div key={s.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground/90">{s.name}</span>
                  <span className="font-semibold text-foreground">{pctStr}</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className={["h-full rounded-full transition-all", s.name.includes("Best") || s.name.includes("Upside") ? "bg-emerald-500" : s.name.includes("Risk") || s.name.includes("Downside") ? "bg-red-400" : "bg-primary"].join(" ")}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DriverImpactTab({ activeQuestion }: { activeQuestion: any }) {
  const [forecast, setForecast] = useState<any>(null);
  const caseId = activeQuestion?.caseId;

  useEffect(() => {
    if (!caseId) return;
    fetch(`${API_BASE}/cases/${caseId}/forecast`)
      .then((r) => r.json())
      .then(setForecast)
      .catch(() => {});
  }, [caseId]);

  const drivers = forecast?.signalDetails
    ? forecast.signalDetails.map((s: any) => ({
        name: s.description || s.signalId,
        direction: s.effectiveLR > 1 ? "up" as const : "down" as const,
        strength: (s.effectiveLR > 1.5 || s.effectiveLR < 0.6) ? "High" as const : (s.effectiveLR > 1.2 || s.effectiveLR < 0.8) ? "Medium" as const : "Low" as const,
        lr: s.effectiveLR,
      }))
    : MOCK_CASE.driverImpact;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
      <div>
        <div className="text-sm font-semibold text-foreground">Key Driver Impact</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Forces pushing the forecast higher or lower, with estimated strength.
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="flex-1">Driver</div>
          <div className="w-28 text-center">Direction</div>
          <div className="w-24 text-center">Strength</div>
        </div>
        {drivers.map((d: any, i: number) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-border bg-muted/10 px-4 py-3">
            <div className="flex-1 text-sm text-foreground/90">{d.name}</div>
            <div className="w-28 flex items-center justify-center gap-1.5">
              {d.direction === "up" ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}
              <span className={["text-sm font-semibold", d.direction === "up" ? "text-emerald-400" : "text-red-400"].join(" ")}>
                {d.direction === "up" ? "Upward" : "Downward"}
              </span>
            </div>
            <div className="w-24 text-center">
              <span className={["inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", d.strength === "High" ? "bg-amber-500/15 text-amber-300" : d.strength === "Medium" ? "bg-blue-500/15 text-blue-300" : "bg-muted/30 text-muted-foreground"].join(" ")}>
                {d.strength}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseLibraryTab() {
  const [cards, setCards] = useState<CaseCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/cases`)
      .then((r) => r.json())
      .then((data: any[]) => setCards(data.map((c, i) => enrichCase(c, i))))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, []);

  const handleUpdate = useCallback(
    (caseId: string, updates: Partial<CaseCardData>) => {
      setCards((prev) => prev.map((c) => (c.caseId === caseId ? { ...c, ...updates } : c)));
    },
    []
  );

  if (loading) return <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">Loading cases...</div>;
  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <BookOpen className="w-8 h-8 opacity-20" />
          <p>No cases yet. Ask a strategic question to begin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Case Library
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Strategic case board. Hover any card to edit. System values are suggestions — override anything.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">{cards.length} case{cards.length !== 1 ? "s" : ""}</div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((c) => <CaseCard key={c.caseId} data={c} onUpdate={handleUpdate} />)}
      </div>
    </div>
  );
}
