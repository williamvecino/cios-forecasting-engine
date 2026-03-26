import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRunForecast, useGetCase } from "@workspace/api-client-react";
import WorkflowLayout from "@/components/workflow-layout";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { MOCK_CASE } from "@/lib/mock-case";
import { enrichCase } from "@/lib/case-library";
import type { CaseCardData } from "@/lib/case-library";
import CaseCard from "@/components/case-library/case-card";
import { ProbabilityGauge, Badge } from "@/components/ui-components";
import { RecalculateForecastButton } from "@/components/recalculate-forecast-button";
import {
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  Target,
  Layers,
  TrendingUp,
  TrendingDown,
  BrainCircuit,
  RefreshCcw,
  Minus,
  Zap,
  Activity,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

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
  const caseId = activeQuestion?.caseId || "";
  const queryClient = useQueryClient();
  const { data: forecast, isLoading } = useRunForecast(caseId);
  const { data: caseData } = useGetCase(caseId);

  if (!activeQuestion || !caseId) {
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

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center gap-3">
        <BrainCircuit className="w-10 h-10 text-primary animate-pulse" />
        <div className="text-sm text-muted-foreground">Computing Bayesian forecast...</div>
        <div className="text-xs text-muted-foreground/60">Weighing evidence and stakeholder dynamics</div>
      </div>
    );
  }

  if (!forecast) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <div className="text-sm text-foreground font-semibold">Unable to build assessment</div>
          <div className="text-xs text-muted-foreground">Ensure the case has at least one registered signal.</div>
          <Link href="/signals" className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 mt-2">
            Add Signals
          </Link>
        </div>
        <BottomLinks />
      </>
    );
  }

  const f = forecast as any;
  const delta = f.currentProbability - f.priorProbability;
  const signalDetails = f.signalDetails || [];
  const interpretation = f.interpretation;
  const sa = f.sensitivityAnalysis as { upwardSignals: any[]; downwardSignals: any[]; swingFactor: any | null; stabilityNote: string } | undefined;
  const cd = caseData as any;

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <RecalculateForecastButton
          caseId={caseId}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/forecast`] });
            queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}`] });
          }}
        />
        <Link href="/signals" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/20">
          <Zap className="w-3.5 h-3.5" /> Add Signals
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-3 right-3">
            <ConfidenceBadge level={f.confidenceLevel} />
          </div>
          <ProbabilityGauge value={f.currentProbability} label="Likelihood Assessment" size={220} />
          <div className="flex items-center gap-4 mt-6 text-sm">
            <div className="text-muted-foreground">
              PRIOR{" "}
              <span className="text-foreground font-medium">{(f.priorProbability * 100).toFixed(1)}%</span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
            <div className="text-muted-foreground">
              CHANGE{" "}
              <span className={delta >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)} pts
              </span>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground text-center max-w-[260px]">
            {interpretation?.primaryStatement
              ? interpretation.primaryStatement.slice(0, 120) + (interpretation.primaryStatement.length > 120 ? "..." : "")
              : "Signals are mixed. The outcome is within a zone of genuine uncertainty."}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground/50">Engine v1 · Bayesian</div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-primary/15 bg-gradient-to-br from-card to-card/50 p-6 space-y-5">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-primary" />
            Strategic Interpretation
          </h3>
          <div>
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Primary synthesis</div>
            <div className="text-sm font-medium leading-relaxed">
              {interpretation?.primaryStatement || "Current signals support a favorable outcome within the forecast window."}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 border border-emerald-500/15 p-4 rounded-xl">
              <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Top Enabler
              </div>
              <div className="font-medium text-sm">{f.topSupportiveActor || "None identified"}</div>
            </div>
            <div className="bg-red-500/5 border border-red-500/15 p-4 rounded-xl">
              <div className="text-xs text-red-400 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                <AlertOctagon className="w-3 h-3" /> Top Constrainer
              </div>
              <div className="font-medium text-sm">{f.topConstrainingActor || "None identified"}</div>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Recommended action</div>
            <div className="bg-muted/30 p-3 rounded-lg border border-border/50 text-sm font-medium">
              {interpretation?.recommendedAction || "Monitor signals."}
            </div>
          </div>
        </div>
      </div>

      {signalDetails.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Signal Stack
              <span className="text-foreground ml-1">{signalDetails.length} validated</span>
            </div>
            <Link href="/signals" className="text-xs text-primary hover:text-primary/80">Manage</Link>
          </div>
          <div className="space-y-2">
            {signalDetails.slice(0, 6).map((sig: any) => (
              <div key={sig.signalId} className="flex items-center justify-between p-3 bg-background border border-border rounded-lg gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-mono mb-0.5">{sig.signalId}</div>
                  <div className="text-sm font-medium truncate" title={sig.description}>{sig.description}</div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sig.direction === "Positive" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                    LR {sig.likelihoodRatio?.toFixed(2) ?? sig.effectiveLR?.toFixed(2) ?? "—"}
                  </span>
                  {sig.weightedActorReaction !== undefined && (
                    <span className="text-[10px] text-muted-foreground">Actor: {sig.weightedActorReaction?.toFixed(3)}</span>
                  )}
                </div>
              </div>
            ))}
            {signalDetails.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No signals yet. <Link href="/signals" className="text-primary">Add signals</Link> to begin.
              </div>
            )}
          </div>
        </div>
      )}

      {sa && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Sensitivity Analysis
          </div>
          {sa.stabilityNote && (
            <div className="px-4 py-2.5 bg-muted/20 border border-border rounded-lg text-xs text-muted-foreground">
              {sa.stabilityNote}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-500/20 bg-card p-4 space-y-2">
              <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Signals Pushing Up
              </h4>
              {sa.upwardSignals.length === 0 ? (
                <div className="text-xs text-muted-foreground py-3 text-center">No positive signals registered.</div>
              ) : sa.upwardSignals.map((sig: any) => (
                <div key={sig.signalId} className="flex items-start justify-between gap-3 p-2.5 bg-emerald-500/5 border border-emerald-500/15 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono text-muted-foreground mb-0.5">{sig.signalId}</div>
                    <div className="text-xs font-medium leading-snug">{sig.description}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-bold text-emerald-400">LR {sig.likelihoodRatio?.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">−{(sig.deltaIfRemoved * 100).toFixed(1)}pp if removed</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-red-500/20 bg-card p-4 space-y-2">
              <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" /> Signals Pushing Down
              </h4>
              {sa.downwardSignals.length === 0 ? (
                <div className="text-xs text-muted-foreground py-3 text-center">No negative signals registered.</div>
              ) : sa.downwardSignals.map((sig: any) => (
                <div key={sig.signalId} className="flex items-start justify-between gap-3 p-2.5 bg-red-500/5 border border-red-500/15 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono text-muted-foreground mb-0.5">{sig.signalId}</div>
                    <div className="text-xs font-medium leading-snug">{sig.description}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-bold text-red-400">LR {sig.likelihoodRatio?.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">+{(sig.deltaIfRemoved * 100).toFixed(1)}pp if removed</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {sa.swingFactor && (
            <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Highest-Leverage Swing Factor</span>
              </div>
              <div className="text-sm font-semibold mb-1">{sa.swingFactor.description}</div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{sa.swingFactor.interpretation}</p>
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Current</div>
                  <div className="text-lg font-bold">{(f.currentProbability * 100).toFixed(1)}%</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">If reversed</div>
                  <div className={`text-lg font-bold ${sa.swingFactor.probabilityDeltaIfReversed > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {(sa.swingFactor.currentProbabilityIfReversed * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Swing</div>
                  <div className={`text-lg font-bold ${sa.swingFactor.probabilityDeltaIfReversed > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {sa.swingFactor.probabilityDeltaIfReversed >= 0 ? "+" : ""}{(sa.swingFactor.probabilityDeltaIfReversed * 100).toFixed(1)}pp
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {interpretation && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <BrainCircuit className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="text-[10px] text-primary font-semibold uppercase tracking-wider">Recommended Action</div>
              <div className="text-base font-semibold text-foreground">
                {interpretation.recommendedAction || "Selectively invest. Evidence is favorable but not yet decisive."}
              </div>
              <div className="flex flex-wrap gap-2">
                {interpretation.confidenceTags?.map((tag: string, i: number) => (
                  <span key={i} className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[10px] font-semibold text-primary">{tag}</span>
                ))}
                {interpretation.forecastInterpretation && (
                  <span className="rounded-full bg-muted/30 border border-border px-2.5 py-0.5 text-[10px] text-muted-foreground">{interpretation.forecastInterpretation}</span>
                )}
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed">
                {interpretation.primaryStatement}
              </div>

              {f.confidenceLevel === "Low" && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-400/30 bg-amber-400/5">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-300 leading-relaxed">
                    Low confidence — this forecast has limited signal support. Treat all outputs as preliminary and avoid high-commitment decisions until the evidence base strengthens.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {interpretation.suggestedNextSteps && interpretation.suggestedNextSteps.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Next Actions
                    </div>
                    {interpretation.suggestedNextSteps.map((step: string, i: number) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-emerald-400 shrink-0">&gt;</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                )}
                {interpretation.questionRefinements && interpretation.questionRefinements.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] text-primary font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Question Refinement
                    </div>
                    {interpretation.questionRefinements.map((q: string, i: number) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary shrink-0">&gt;</span>
                        <span>{q}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                {interpretation.riskStatement && (
                  <div className="space-y-2">
                    <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Risk</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{interpretation.riskStatement}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-border flex items-center gap-2 text-[10px] text-muted-foreground/50">
            <span>Derived from probability band</span>
            <span>·</span>
            <span>{f.confidenceLevel} confidence</span>
            <span>·</span>
            <span>adapter v1</span>
          </div>
        </div>
      )}

      <BottomLinks />
    </>
  );
}

function ConfidenceBadge({ level }: { level?: string }) {
  if (!level) return null;
  const cls = level === "High" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : level === "Moderate" ? "bg-blue-500/15 text-blue-300 border-blue-500/25" : "bg-amber-500/15 text-amber-300 border-amber-500/25";
  return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls}`}>{level}</span>;
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
  const caseId = activeQuestion?.caseId || "";
  const { data: forecast } = useRunForecast(caseId);
  const f = forecast as any;

  const scenarios = f?.scenarioSimulation
    ? [
        { name: "Best Case", probability: f.scenarioSimulation.bestCase?.probability, description: f.scenarioSimulation.bestCase?.narrative || f.scenarioSimulation.bestCase?.description },
        { name: "Base Case", probability: f.scenarioSimulation.baseCase?.probability, description: f.scenarioSimulation.baseCase?.narrative || f.scenarioSimulation.baseCase?.description },
        { name: "Risk Case", probability: f.scenarioSimulation.riskCase?.probability, description: f.scenarioSimulation.riskCase?.narrative || f.scenarioSimulation.riskCase?.description },
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
          const pctStr = typeof s.probability === "number" ? `${(s.probability * 100).toFixed(0)}%` : s.probability;
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
  const caseId = activeQuestion?.caseId || "";
  const { data: forecast } = useRunForecast(caseId);
  const f = forecast as any;

  const drivers = f?.signalDetails
    ? f.signalDetails.map((s: any) => ({
        name: s.description || s.signalId,
        direction: (s.direction === "Positive" || s.effectiveLR > 1) ? "up" as const : "down" as const,
        strength: (s.likelihoodRatio > 1.5 || s.likelihoodRatio < 0.6 || s.effectiveLR > 1.5 || s.effectiveLR < 0.6) ? "High" as const : (s.likelihoodRatio > 1.2 || s.likelihoodRatio < 0.8 || s.effectiveLR > 1.2 || s.effectiveLR < 0.8) ? "Medium" as const : "Low" as const,
        lr: s.likelihoodRatio ?? s.effectiveLR,
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
    fetch("/api/cases")
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
