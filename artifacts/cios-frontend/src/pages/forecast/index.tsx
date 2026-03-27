import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useRunForecast, useGetCase, useListCases } from "@workspace/api-client-react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { ProbabilityGauge } from "@/components/ui-components";
import { RecalculateForecastButton } from "@/components/recalculate-forecast-button";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  AlertTriangle,
  ShieldAlert,
  Zap,
  CircleAlert,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type Tab = "forecast" | "scenarios" | "drivers" | "library";
type Strength = "Low" | "Medium" | "High";
type Direction = "Upward" | "Downward";
type Confidence = "Low" | "Moderate" | "High";

type Driver = {
  id: string;
  name: string;
  direction: Direction;
  strength: Strength;
  probabilityImpact: number;
  watchSignal: string;
  interpretation?: string;
};

type Scenario = {
  id: string;
  name: string;
  probability: number;
  confidence: Confidence;
  summary: string;
  changedDrivers: string[];
  triggerSignals: string[];
  recommendedAction: string;
};

type AdoptionSegment = {
  id: string;
  name: string;
  adoptionLikelihood: number;
  timing: "Early" | "Middle" | "Late";
  rationale: string;
  blockers: string[];
};

const strengthBadgeClass: Record<Strength, string> = {
  Low: "bg-slate-700/70 text-slate-200 border border-slate-600",
  Medium: "bg-blue-500/15 text-blue-200 border border-blue-400/30",
  High: "bg-amber-500/15 text-amber-200 border border-amber-400/30",
};

const confidenceBadgeClass: Record<Confidence, string> = {
  Low: "bg-rose-500/15 text-rose-200 border border-rose-400/30",
  Moderate: "bg-blue-500/15 text-blue-200 border border-blue-400/30",
  High: "bg-emerald-500/15 text-emerald-200 border border-emerald-400/30",
};

const timingBadgeClass: Record<AdoptionSegment["timing"], string> = {
  Early: "bg-emerald-500/15 text-emerald-200 border border-emerald-400/30",
  Middle: "bg-blue-500/15 text-blue-200 border border-blue-400/30",
  Late: "bg-slate-700/70 text-slate-200 border border-slate-600",
};

const directionTextClass: Record<Direction, string> = {
  Upward: "text-emerald-300",
  Downward: "text-rose-300",
};

const directionArrow: Record<Direction, string> = {
  Upward: "↗",
  Downward: "↘",
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function strengthWeight(s: Strength): number {
  return s === "High" ? 3 : s === "Medium" ? 2 : 1;
}

export default function ForecastPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [tab, setTab] = useState<Tab>("forecast");

  return (
    <WorkflowLayout
      currentStep="forecast"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <QuestionGate activeQuestion={activeQuestion}>
        <section className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
              Step 3
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              What is likely to happen?
            </h1>
            <p className="mt-2 max-w-3xl text-base text-slate-300">
              Review the forecast, see what is driving movement, understand which stakeholders
              are likely to adopt first, and identify what would change the trajectory.
            </p>

            <div className="mt-5 border-b border-white/10">
              <div className="flex flex-wrap gap-6">
                {(
                  [
                    { id: "forecast", label: "Current Forecast" },
                    { id: "scenarios", label: "Scenario Planning" },
                    { id: "drivers", label: "Driver Impact" },
                    { id: "library", label: "Case Library" },
                  ] as { id: Tab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "border-b-2 pb-3 text-sm font-medium transition",
                      tab === t.id
                        ? "border-blue-400 text-blue-300"
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {tab === "forecast" && <CurrentForecastTab activeQuestion={activeQuestion} />}
          {tab === "scenarios" && <ScenarioPlanningTab activeQuestion={activeQuestion} />}
          {tab === "drivers" && <DriverImpactTab activeQuestion={activeQuestion} />}
          {tab === "library" && <CaseLibraryTab />}
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function useDriversFromForecast(forecast: any) {
  return useMemo(() => {
    if (!forecast) return [];
    const f = forecast as any;
    const sa = f.sensitivityAnalysis;
    const signalDetails = f.signalDetails || [];
    const drivers: Driver[] = [];

    if (sa?.upwardSignals) {
      for (const sig of sa.upwardSignals) {
        const detail = signalDetails.find((d: any) => d.signalId === sig.signalId);
        const lr = sig.likelihoodRatio ?? detail?.likelihoodRatio ?? 1;
        const impact = sig.deltaIfRemoved ? Math.round(sig.deltaIfRemoved * 100) : Math.round((lr - 1) * 15);
        drivers.push({
          id: sig.signalId,
          name: sig.description || detail?.description || sig.signalId,
          direction: "Upward",
          strength: lr >= 2 ? "High" : lr >= 1.3 ? "Medium" : "Low",
          probabilityImpact: Math.abs(impact),
          watchSignal: detail?.signalType || "Monitor for changes",
          interpretation: detail?.signalType ? `${detail.signalType} signal contributing to upward pressure.` : undefined,
        });
      }
    }

    if (sa?.downwardSignals) {
      for (const sig of sa.downwardSignals) {
        const detail = signalDetails.find((d: any) => d.signalId === sig.signalId);
        const lr = sig.likelihoodRatio ?? detail?.likelihoodRatio ?? 1;
        const impact = sig.deltaIfRemoved ? Math.round(sig.deltaIfRemoved * 100) : Math.round((1 - lr) * 15);
        drivers.push({
          id: sig.signalId,
          name: sig.description || detail?.description || sig.signalId,
          direction: "Downward",
          strength: lr <= 0.5 ? "High" : lr <= 0.75 ? "Medium" : "Low",
          probabilityImpact: -Math.abs(impact),
          watchSignal: detail?.signalType || "Monitor for changes",
          interpretation: detail?.signalType ? `${detail.signalType} signal contributing to downward pressure.` : undefined,
        });
      }
    }

    if (drivers.length === 0 && signalDetails.length > 0) {
      for (const sig of signalDetails) {
        const lr = sig.likelihoodRatio ?? sig.effectiveLR ?? 1;
        const isUp = sig.direction === "Positive" || lr > 1;
        drivers.push({
          id: sig.signalId,
          name: sig.description || sig.signalId,
          direction: isUp ? "Upward" : "Downward",
          strength: (lr > 1.5 || lr < 0.6) ? "High" : (lr > 1.2 || lr < 0.8) ? "Medium" : "Low",
          probabilityImpact: isUp ? Math.round((lr - 1) * 15) : -Math.round((1 - lr) * 15),
          watchSignal: sig.signalType || "Monitor for changes",
        });
      }
    }

    return [...drivers].sort((a, b) => {
      const diff = Math.abs(b.probabilityImpact) - Math.abs(a.probabilityImpact);
      return diff !== 0 ? diff : strengthWeight(b.strength) - strengthWeight(a.strength);
    });
  }, [forecast]);
}

function useScenariosFromForecast(forecast: any, drivers: Driver[]) {
  return useMemo(() => {
    const f = forecast as any;
    if (!f) return [];

    const sim = f.scenarioSimulation;
    if (sim?.bestCase?.probability != null && sim?.baseCase?.probability != null && sim?.riskCase?.probability != null) {
      const upDriverIds = drivers.filter((d) => d.direction === "Upward").map((d) => d.id);
      const downDriverIds = drivers.filter((d) => d.direction === "Downward").map((d) => d.id);
      return [
        {
          id: "base",
          name: "Base Case",
          probability: Math.round(sim.baseCase.probability * 100),
          confidence: (f.confidenceLevel ?? "Moderate") as Confidence,
          summary: sim.baseCase.narrative || sim.baseCase.description || "Current signal balance produces this baseline outlook.",
          changedDrivers: [...upDriverIds, ...downDriverIds],
          triggerSignals: drivers.slice(0, 3).map((d) => `${d.name}: ${d.direction === "Upward" ? "maintains" : "persists as"} current trajectory`),
          recommendedAction: f.interpretation?.recommendedAction || "Monitor signal evolution and reassess.",
        },
        {
          id: "upside",
          name: "Upside Scenario",
          probability: Math.round(sim.bestCase.probability * 100),
          confidence: (f.confidenceLevel === "High" ? "Moderate" : "Low") as Confidence,
          summary: sim.bestCase.narrative || sim.bestCase.description || "Favorable drivers strengthen.",
          changedDrivers: upDriverIds,
          triggerSignals: drivers.filter((d) => d.direction === "Upward").slice(0, 3).map((d) => `${d.name} strengthens materially`),
          recommendedAction: "Accelerate targeted activation in highest-conviction segments.",
        },
        {
          id: "downside",
          name: "Downside Scenario",
          probability: Math.round(sim.riskCase.probability * 100),
          confidence: (f.confidenceLevel === "High" ? "Moderate" : "Low") as Confidence,
          summary: sim.riskCase.narrative || sim.riskCase.description || "Resistance drivers intensify.",
          changedDrivers: downDriverIds,
          triggerSignals: drivers.filter((d) => d.direction === "Downward").slice(0, 3).map((d) => `${d.name} intensifies`),
          recommendedAction: "Shift resources to barrier removal and proof-generation.",
        },
      ] as Scenario[];
    }

    const prob = Math.round((f.currentProbability ?? 0.5) * 100);
    const upDriverIds = drivers.filter((d) => d.direction === "Upward").map((d) => d.id);
    const downDriverIds = drivers.filter((d) => d.direction === "Downward").map((d) => d.id);
    const upsideShift = drivers.filter((d) => d.direction === "Upward").reduce((s, d) => s + d.probabilityImpact, 0);
    const downsideShift = drivers.filter((d) => d.direction === "Downward").reduce((s, d) => s + d.probabilityImpact, 0);

    const confLevel = f.confidenceLevel === "High" ? "Moderate" : "Low";

    const scenarios: Scenario[] = [
      {
        id: "base",
        name: "Base Case",
        probability: prob,
        confidence: (f.confidenceLevel ?? "Moderate") as Confidence,
        summary: f.interpretation?.primaryStatement || "Current signal balance produces this baseline outlook.",
        changedDrivers: [...upDriverIds, ...downDriverIds],
        triggerSignals: drivers.slice(0, 3).map((d) => `${d.name}: ${d.direction === "Upward" ? "maintains" : "persists as"} current trajectory`),
        recommendedAction: f.interpretation?.recommendedAction || "Monitor signal evolution and reassess when new evidence arrives.",
      },
      {
        id: "upside",
        name: "Upside Scenario",
        probability: Math.min(95, prob + Math.max(upsideShift, 12)),
        confidence: confLevel as Confidence,
        summary: "Favorable drivers strengthen while constraining forces stabilize or weaken.",
        changedDrivers: upDriverIds,
        triggerSignals: drivers.filter((d) => d.direction === "Upward").slice(0, 3).map((d) => `${d.name} strengthens materially`),
        recommendedAction: "Accelerate targeted activation in highest-conviction segments.",
      },
      {
        id: "downside",
        name: "Downside Scenario",
        probability: Math.max(5, prob + Math.min(downsideShift, -10)),
        confidence: confLevel as Confidence,
        summary: "Resistance drivers intensify while supportive signals fail to convert.",
        changedDrivers: downDriverIds,
        triggerSignals: drivers.filter((d) => d.direction === "Downward").slice(0, 3).map((d) => `${d.name} intensifies`),
        recommendedAction: "Shift resources to barrier removal and proof-generation.",
      },
    ];

    return scenarios;
  }, [forecast, drivers]);
}

function useSegmentsFromCase(caseData: any) {
  return useMemo(() => {
    const segments: AdoptionSegment[] = [
      {
        id: "seg-academic",
        name: "Academic specialist centers",
        adoptionLikelihood: 71,
        timing: "Early",
        rationale: "Highest tolerance for complexity, strongest ability to interpret data, and greater readiness to act on differentiated evidence.",
        blockers: ["Institutional review speed", "Access pathway complexity"],
      },
      {
        id: "seg-highvol",
        name: "High-volume specialists",
        adoptionLikelihood: 61,
        timing: "Early",
        rationale: "Likely to adopt earlier when efficacy is clear and operational burden is manageable.",
        blockers: ["Reimbursement uncertainty", "Existing treatment habits"],
      },
      {
        id: "seg-existing",
        name: "Centers with existing usage",
        adoptionLikelihood: 56,
        timing: "Middle",
        rationale: "Familiarity lowers behavioral resistance, but expanded use still requires confidence in evidence.",
        blockers: ["Label interpretation", "Account policy timing"],
      },
      {
        id: "seg-community",
        name: "Community practitioners",
        adoptionLikelihood: 29,
        timing: "Late",
        rationale: "More likely to wait for social proof, simplification, and operational clarity.",
        blockers: ["Low exposure", "Limited infrastructure", "Higher perceived risk"],
      },
    ];
    return segments;
  }, [caseData]);
}

interface SignalReadiness {
  confirmedDrivers: number;
  confirmedSupporting: number;
  totalConfirmed: number;
  hasDirection: boolean;
  questionType: string;
  entities: string[];
  updatedAt: number;
}

function getSignalReadiness(caseId?: string): SignalReadiness | null {
  try {
    const key = `cios.signalReadiness:${caseId || "unknown"}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function evaluateReadiness(readiness: SignalReadiness | null): {
  ready: boolean;
  missingItems: string[];
  score: number;
  total: number;
} {
  if (!readiness) {
    return { ready: false, missingItems: ["No signals have been reviewed yet"], score: 0, total: 4 };
  }

  const missing: string[] = [];
  let score = 0;
  const total = readiness.questionType === "comparative" ? 4 : 3;

  if (readiness.confirmedDrivers >= 1) {
    score++;
  } else {
    missing.push("At least 1 confirmed primary driver");
  }

  if (readiness.confirmedSupporting >= 1) {
    score++;
  } else {
    missing.push("At least 1 confirmed supporting signal");
  }

  if (readiness.hasDirection) {
    score++;
  } else {
    missing.push("At least 1 signal with a clear direction (positive or negative)");
  }

  if (readiness.questionType === "comparative") {
    if (readiness.entities && readiness.entities.length >= 2) {
      score++;
    } else {
      missing.push("Group-level differences for comparative analysis");
    }
  }

  return { ready: missing.length === 0, missingItems: missing, score, total };
}

function ReadinessGate({ readiness, evaluation }: { readiness: SignalReadiness | null; evaluation: ReturnType<typeof evaluateReadiness> }) {
  const pct = evaluation.total > 0 ? Math.round((evaluation.score / evaluation.total) * 100) : 0;

  return (
    <div className="rounded-3xl border border-amber-500/20 bg-[#0A1736] p-8 space-y-6">
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <CircleAlert className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Forecast not ready</h2>
          <p className="mt-1 text-sm text-slate-400">
            Add at least one primary driver and supporting signal to run the forecast.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Forecast readiness</span>
          <span className="font-semibold text-amber-400">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Inputs Status</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ReadinessItem
            label="Confirmed Drivers"
            value={readiness?.confirmedDrivers ?? 0}
            needed={1}
          />
          <ReadinessItem
            label="Supporting Signals"
            value={readiness?.confirmedSupporting ?? 0}
            needed={1}
          />
          <ReadinessItem
            label="Direction Set"
            value={readiness?.hasDirection ? 1 : 0}
            needed={1}
            isBoolean
          />
          {readiness?.questionType === "comparative" && (
            <ReadinessItem
              label="Groups Mapped"
              value={readiness?.entities?.length ?? 0}
              needed={2}
            />
          )}
        </div>
      </div>

      {evaluation.missingItems.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Missing Required Inputs</div>
          {evaluation.missingItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-slate-300">{item}</span>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/signals"
        className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition"
      >
        <Zap className="w-4 h-4" />
        Go to Add Information
      </Link>
    </div>
  );
}

function ReadinessItem({ label, value, needed, isBoolean }: { label: string; value: number; needed: number; isBoolean?: boolean }) {
  const met = value >= needed;
  return (
    <div className={cn(
      "rounded-xl border p-3",
      met ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"
    )}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        {met ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : (
          <XCircle className="w-4 h-4 text-slate-500" />
        )}
        <span className={cn("text-sm font-semibold", met ? "text-emerald-300" : "text-slate-500")}>
          {isBoolean ? (value >= needed ? "Yes" : "No") : value}
        </span>
      </div>
    </div>
  );
}

function CurrentForecastTab({ activeQuestion }: { activeQuestion: any }) {
  const caseId = activeQuestion?.caseId || "";

  const readiness = getSignalReadiness(caseId);
  const evaluation = evaluateReadiness(readiness);

  if (!activeQuestion || !caseId) {
    return (
      <>
        <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
          <div className="grid grid-cols-12 gap-4">
            <InfoCard title="Probability" value="—" body="Primary forecast output." />
            <InfoCard title="Key Drivers" value="—" body="Main factors moving the forecast." />
            <InfoCard title="Timing" value="—" body="When the shift is likely to occur." />
          </div>
        </div>
        <BottomLinks />
      </>
    );
  }

  if (!evaluation.ready) {
    return (
      <>
        <ReadinessGate readiness={readiness} evaluation={evaluation} />
        <BottomLinks />
      </>
    );
  }

  return <ForecastContent activeQuestion={activeQuestion} />;
}

function ForecastContent({ activeQuestion }: { activeQuestion: any }) {
  const caseId = activeQuestion?.caseId || "";
  const queryClient = useQueryClient();
  const { data: forecast, isLoading } = useRunForecast(caseId);
  const { data: caseData } = useGetCase(caseId);
  const drivers = useDriversFromForecast(forecast);

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-12 flex flex-col items-center gap-3">
        <BrainCircuit className="w-10 h-10 text-blue-400 animate-pulse" />
        <div className="text-sm text-slate-300">Computing Bayesian forecast...</div>
        <div className="text-xs text-slate-500">Weighing evidence and stakeholder dynamics</div>
      </div>
    );
  }

  if (!forecast) {
    return (
      <>
        <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-8 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <div className="text-sm text-white font-semibold">Unable to build assessment</div>
          <div className="text-xs text-slate-400">Ensure the case has at least one registered signal.</div>
          <Link href="/signals" className="inline-flex rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 mt-2">
            Add Signals
          </Link>
        </div>
        <BottomLinks />
      </>
    );
  }

  const f = forecast as any;
  const prob = Math.round((f.currentProbability ?? 0) * 100);
  const delta = (f.currentProbability ?? 0) - (f.priorProbability ?? 0);
  const confidence: Confidence = (f.confidenceLevel ?? "Moderate") as Confidence;
  const interpretation = f.interpretation;
  const summary = interpretation?.primaryStatement || "Current signals support a favorable outcome within the forecast window.";

  const topDriver = drivers[0];
  const upsideTotal = drivers.filter((d) => d.direction === "Upward").reduce((s, d) => s + d.probabilityImpact, 0);
  const downsideTotal = drivers.filter((d) => d.direction === "Downward").reduce((s, d) => s + Math.abs(d.probabilityImpact), 0);

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
        <Link href="/signals" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">
          <Zap className="w-3.5 h-3.5" /> Add Signals
        </Link>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 flex flex-col items-center">
              <div className="text-sm font-medium text-slate-300 self-start">Current Probability</div>
              <div className="mt-4">
                <ProbabilityGauge value={f.currentProbability} label="Likelihood Assessment" size={200} />
              </div>
              <div className="flex items-center gap-4 mt-4 text-sm">
                <div className="text-slate-400">
                  PRIOR{" "}
                  <span className="text-white font-medium">{(f.priorProbability * 100).toFixed(1)}%</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600" />
                <div className="text-slate-400">
                  SHIFT{" "}
                  <span className={delta >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                    {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)} pts
                  </span>
                </div>
              </div>
              <div className={cn(
                "mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                confidenceBadgeClass[confidence]
              )}>
                Confidence: {confidence}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300 text-center">{summary}</p>
              <div className="mt-2 text-[10px] text-slate-600">Engine v1 · Bayesian</div>
            </div>
          </div>

          <div className="col-span-12 xl:col-span-8 space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <InfoCard
                title="Most Sensitive Driver"
                value={topDriver?.name || "—"}
                body={topDriver ? `Largest estimated movement: ${topDriver.probabilityImpact > 0 ? "+" : ""}${topDriver.probabilityImpact} points` : "No drivers identified yet."}
              />
              <InfoCard
                title="Total Upward Pressure"
                value={`+${upsideTotal} pts`}
                body="Combined estimated upside effect if favorable drivers strengthen."
              />
              <InfoCard
                title="Total Downward Pressure"
                value={`-${downsideTotal} pts`}
                body="Combined estimated downside effect if resistance drivers intensify."
              />
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-medium text-slate-300">System Interpretation</div>
              <p className="mt-3 text-base leading-7 text-slate-200">
                {topDriver ? (
                  <>
                    This forecast is currently most sensitive to{" "}
                    <span className="font-semibold text-white">{topDriver.name}</span>. The model is not
                    saying only one thing matters. It is saying this driver is the fastest lever for
                    changing the trajectory meaningfully.
                  </>
                ) : (
                  "Confirm drivers in Step 2 to generate a sensitivity analysis."
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {interpretation && (
        <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <BrainCircuit className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Recommended Action</div>
              <div className="text-base font-semibold text-white">
                {interpretation.recommendedAction || "Monitor signals and reassess."}
              </div>
              <div className="flex flex-wrap gap-2">
                {interpretation.confidenceTags?.map((tag: string, i: number) => (
                  <span key={i} className="rounded-full bg-blue-500/10 border border-blue-400/20 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300">{tag}</span>
                ))}
                {interpretation.forecastInterpretation && (
                  <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[10px] text-slate-400">{interpretation.forecastInterpretation}</span>
                )}
              </div>
              <div className="text-sm text-slate-300 leading-relaxed">
                {interpretation.primaryStatement}
              </div>

              {f.confidenceLevel === "Low" && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-2xl border border-amber-400/30 bg-amber-400/5">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-300 leading-relaxed">
                    Low confidence — this forecast has limited signal support. Treat all outputs as preliminary and avoid high-commitment decisions until the evidence base strengthens.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {interpretation.suggestedNextSteps?.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Next Actions
                    </div>
                    {interpretation.suggestedNextSteps.map((step: string, i: number) => (
                      <div key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                        <span className="text-emerald-400 shrink-0">&gt;</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                )}
                {interpretation.questionRefinements?.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Question Refinement
                    </div>
                    {interpretation.questionRefinements.map((q: string, i: number) => (
                      <div key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                        <span className="text-blue-400 shrink-0">&gt;</span>
                        <span>{q}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {interpretation.monitorItems?.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Monitor</div>
                    {interpretation.monitorItems.map((item: string, i: number) => (
                      <div key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                        <span className="text-amber-400 shrink-0">&gt;</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
                {interpretation.riskStatement && (
                  <div className="space-y-2">
                    <div className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider">Risk</div>
                    <div className="text-xs text-slate-400 leading-relaxed">{interpretation.riskStatement}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-white/10 flex items-center gap-2 text-[10px] text-slate-500">
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

function ScenarioPlanningTab({ activeQuestion }: { activeQuestion: any }) {
  const caseId = activeQuestion?.caseId || "";
  const readiness = getSignalReadiness(caseId);
  const evaluation = evaluateReadiness(readiness);

  if (!activeQuestion || !caseId) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <h3 className="text-2xl font-semibold tracking-tight text-white">Scenario Planning</h3>
        <p className="mt-2 text-slate-300">Link a case and add signals to generate scenarios.</p>
      </div>
    );
  }

  if (!evaluation.ready) {
    return <ReadinessGate readiness={readiness} evaluation={evaluation} />;
  }

  return <ScenarioPlanningContent activeQuestion={activeQuestion} />;
}

function ScenarioPlanningContent({ activeQuestion }: { activeQuestion: any }) {
  const caseId = activeQuestion?.caseId || "";
  const { data: forecast, isLoading, isError } = useRunForecast(caseId);
  const { data: caseData } = useGetCase(caseId);
  const drivers = useDriversFromForecast(forecast);
  const scenarios = useScenariosFromForecast(forecast, drivers);
  const segments = useSegmentsFromCase(caseData);
  const [selectedScenarioId, setSelectedScenarioId] = useState("base");

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) ?? scenarios[0];
  const scenarioDrivers = useMemo(() => {
    if (!selectedScenario) return [];
    return selectedScenario.changedDrivers
      .map((did) => drivers.find((d) => d.id === did))
      .filter(Boolean) as Driver[];
  }, [selectedScenario, drivers]);

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-12 flex flex-col items-center gap-3">
        <BrainCircuit className="w-10 h-10 text-blue-400 animate-pulse" />
        <div className="text-sm text-slate-300">Computing scenarios...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-8 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <div className="text-sm text-white font-semibold">Unable to load scenario data</div>
        <div className="text-xs text-slate-400">Check that the case has signals and try again.</div>
      </div>
    );
  }

  if (scenarios.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <h3 className="text-2xl font-semibold tracking-tight text-white">Scenario Planning</h3>
        <p className="mt-2 text-slate-300">Confirm drivers in Step 2 to generate scenario projections.</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <h3 className="text-2xl font-semibold tracking-tight text-white">Scenario Planning</h3>
        <p className="mt-2 text-slate-300">Each scenario is a driver configuration, not just a probability label.</p>

        <div className="mt-6 grid grid-cols-12 gap-4">
          {scenarios.map((scenario) => {
            const active = scenario.id === selectedScenarioId;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => setSelectedScenarioId(scenario.id)}
                className={cn(
                  "col-span-12 rounded-3xl border p-5 text-left transition xl:col-span-4",
                  active
                    ? "border-blue-400/50 bg-blue-500/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                )}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {scenario.name}
                </div>
                <div className="mt-3 text-5xl font-semibold tracking-tight text-white">
                  {scenario.probability}%
                </div>
                <div className={cn(
                  "mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                  confidenceBadgeClass[scenario.confidence]
                )}>
                  {scenario.confidence} confidence
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-300">{scenario.summary}</p>
              </button>
            );
          })}
        </div>
      </div>

      {selectedScenario && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-7 rounded-3xl border border-white/10 bg-[#0A1736] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Selected Scenario
                </div>
                <h4 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {selectedScenario.name}
                </h4>
                <p className="mt-2 text-slate-300">{selectedScenario.summary}</p>
              </div>
              <div className="text-right">
                <div className="text-5xl font-semibold tracking-tight text-white">
                  {selectedScenario.probability}%
                </div>
                <div className={cn(
                  "mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                  confidenceBadgeClass[selectedScenario.confidence]
                )}>
                  {selectedScenario.confidence}
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                <div className="text-sm font-medium text-slate-300">Driver Changes</div>
                <div className="mt-4 space-y-3">
                  {scenarioDrivers.map((driver) => (
                    <div
                      key={driver.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-[#0B1839] px-4 py-3 md:flex-row md:items-center"
                    >
                      <div>
                        <div className="font-medium text-white">{driver.name}</div>
                        <div className="mt-1 text-sm text-slate-400">
                          {driver.direction === "Upward" ? "Supports" : "Suppresses"} forecast by{" "}
                          {driver.probabilityImpact > 0 ? "+" : ""}{driver.probabilityImpact} points
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-medium", directionTextClass[driver.direction])}>
                          {directionArrow[driver.direction]} {driver.direction}
                        </span>
                        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", strengthBadgeClass[driver.strength])}>
                          {driver.strength}
                        </span>
                      </div>
                    </div>
                  ))}
                  {scenarioDrivers.length === 0 && (
                    <div className="text-sm text-slate-500 text-center py-4">No driver changes for this scenario.</div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 xl:col-span-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="text-sm font-medium text-slate-300">Trigger Signals</div>
                  <ul className="mt-4 space-y-3">
                    {selectedScenario.triggerSignals.map((signal) => (
                      <li key={signal} className="rounded-2xl border border-white/10 bg-[#0B1839] px-4 py-3 text-sm leading-6 text-slate-200">
                        {signal}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="col-span-12 xl:col-span-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="text-sm font-medium text-slate-300">Recommended Action</div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-[#0B1839] px-4 py-4 text-sm leading-6 text-slate-200">
                    {selectedScenario.recommendedAction}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 xl:col-span-5 rounded-3xl border border-white/10 bg-[#0A1736] p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Adoption Segments
            </div>
            <h4 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Who is likely to adopt first?
            </h4>
            <p className="mt-2 text-slate-300">
              The question is segmental, so the forecast surface should show likely adopters, not probability alone.
            </p>

            <div className="mt-6 space-y-4">
              {segments
                .slice()
                .sort((a, b) => b.adoptionLikelihood - a.adoptionLikelihood)
                .map((segment) => (
                  <div key={segment.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{segment.name}</div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", timingBadgeClass[segment.timing])}>
                            {segment.timing} adopter
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-semibold tracking-tight text-white">
                          {segment.adoptionLikelihood}%
                        </div>
                        <div className="text-xs text-slate-400">likelihood</div>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-300">{segment.rationale}</p>
                    <div className="mt-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Key blockers</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {segment.blockers.map((b) => (
                          <span key={b} className="rounded-full border border-white/10 bg-[#0B1839] px-3 py-1 text-xs text-slate-300">{b}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DriverImpactTab({ activeQuestion }: { activeQuestion: any }) {
  const caseId = activeQuestion?.caseId || "";
  const readiness = getSignalReadiness(caseId);
  const evaluation = evaluateReadiness(readiness);

  if (!activeQuestion || !caseId) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <h3 className="text-2xl font-semibold tracking-tight text-white">Key Driver Impact</h3>
        <p className="mt-2 text-slate-300">Link a case and add signals to see driver analysis.</p>
      </div>
    );
  }

  if (!evaluation.ready) {
    return <ReadinessGate readiness={readiness} evaluation={evaluation} />;
  }

  return <DriverImpactContent activeQuestion={activeQuestion} />;
}

function DriverImpactContent({ activeQuestion }: { activeQuestion: any }) {
  const caseId = activeQuestion?.caseId || "";
  const { data: forecast, isLoading, isError } = useRunForecast(caseId);
  const { data: caseData } = useGetCase(caseId);
  const drivers = useDriversFromForecast(forecast);
  const segments = useSegmentsFromCase(caseData);

  const topDriver = drivers[0];

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-12 flex flex-col items-center gap-3">
        <BrainCircuit className="w-10 h-10 text-blue-400 animate-pulse" />
        <div className="text-sm text-slate-300">Analyzing driver impact...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-8 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <div className="text-sm text-white font-semibold">Unable to load driver data</div>
        <div className="text-xs text-slate-400">Check that the case has signals and try again.</div>
      </div>
    );
  }

  if (drivers.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <h3 className="text-2xl font-semibold tracking-tight text-white">Key Driver Impact</h3>
        <p className="mt-2 text-slate-300">Add signals to see driver impact analysis.</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <h3 className="text-2xl font-semibold tracking-tight text-white">Key Driver Impact</h3>
        <p className="mt-2 text-slate-300">
          Forces pushing the forecast higher or lower, with estimated sensitivity and real-world signals to watch.
        </p>

        <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
          <div className="grid grid-cols-12 gap-4 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <div className="col-span-12 md:col-span-4">Driver</div>
            <div className="col-span-4 md:col-span-2">Direction</div>
            <div className="col-span-4 md:col-span-2">Strength</div>
            <div className="col-span-4 md:col-span-2">Probability Impact</div>
            <div className="col-span-12 md:col-span-2">What to Watch</div>
          </div>

          {drivers.map((driver) => (
            <div
              key={driver.id}
              className="grid grid-cols-12 gap-4 border-b border-white/10 bg-[#0B1839] px-4 py-4 last:border-b-0"
            >
              <div className="col-span-12 md:col-span-4">
                <div className="font-medium text-white">{driver.name}</div>
                {driver.interpretation && (
                  <div className="mt-1 text-sm leading-6 text-slate-400">{driver.interpretation}</div>
                )}
              </div>
              <div className={cn("col-span-4 md:col-span-2 text-sm font-medium", directionTextClass[driver.direction])}>
                {directionArrow[driver.direction]} {driver.direction}
              </div>
              <div className="col-span-4 md:col-span-2">
                <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", strengthBadgeClass[driver.strength])}>
                  {driver.strength}
                </span>
              </div>
              <div className="col-span-4 md:col-span-2 text-sm font-semibold text-white">
                {driver.probabilityImpact > 0 ? "+" : ""}{driver.probabilityImpact} pts
              </div>
              <div className="col-span-12 md:col-span-2 text-sm leading-6 text-slate-300">
                {driver.watchSignal}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-5 rounded-3xl border border-white/10 bg-[#0A1736] p-6">
          <div className="text-sm font-medium text-slate-300">Current Sensitivity Summary</div>
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Most Sensitive Driver</div>
            <div className="mt-2 text-2xl font-semibold text-white">{topDriver?.name ?? "—"}</div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              This is currently the single largest modeled lever for changing forecast direction. It should be visible everywhere scenario movement is displayed.
            </p>
          </div>
        </div>

        <div className="col-span-12 xl:col-span-7 rounded-3xl border border-white/10 bg-[#0A1736] p-6">
          <div className="text-sm font-medium text-slate-300">Segment Interpretation</div>
          <div className="mt-4 grid grid-cols-12 gap-4">
            {segments.map((segment) => (
              <div key={segment.id} className="col-span-12 rounded-3xl border border-white/10 bg-white/[0.02] p-4 md:col-span-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium text-white">{segment.name}</div>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", timingBadgeClass[segment.timing])}>
                    {segment.timing}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{segment.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CaseLibraryTab() {
  const { createQuestion } = useActiveQuestion();
  const { data: casesData, isLoading, isError } = useListCases();
  const cases = (casesData as any[]) || [];

  function handleOpenCase(item: any) {
    const cid = item.caseId || item.id;
    createQuestion({
      text: item.strategicQuestion || "Untitled",
      caseId: cid,
      timeHorizon: item.timeHorizon || "12 months",
    });
    window.location.href = "/forecast";
  }

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-12 flex flex-col items-center gap-3">
        <BrainCircuit className="w-10 h-10 text-blue-400 animate-pulse" />
        <div className="text-sm text-slate-300">Loading cases...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-8 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <div className="text-sm text-white font-semibold">Unable to load cases</div>
        <div className="text-xs text-slate-400">Check your connection and try again.</div>
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-12 text-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <BookOpen className="w-8 h-8 opacity-20" />
          <p>No cases yet. Define a question to begin.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
      <h3 className="text-2xl font-semibold tracking-tight text-white">Case Library</h3>
      <p className="mt-2 text-slate-300">
        Select a case to open it as your active question and begin forecasting.
      </p>

      <div className="mt-6 space-y-4">
        {cases.map((item: any) => {
          const prob = item.currentProbability != null
            ? Math.round(item.currentProbability * 100)
            : item.priorProbability != null
            ? Math.round(item.priorProbability * 100)
            : null;
          return (
            <button
              key={item.id || item.caseId}
              type="button"
              onClick={() => handleOpenCase(item)}
              className="w-full rounded-3xl border border-white/10 bg-white/[0.02] p-5 text-left transition hover:border-blue-400/40 hover:bg-blue-500/5"
            >
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <div className="font-medium text-white">{item.strategicQuestion || "Untitled"}</div>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-400">
                    <span>ID: {item.caseId || item.id}</span>
                    <span>Horizon: {item.timeHorizon || "—"}</span>
                    <span>Status: {item.status || "Open"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-4xl font-semibold tracking-tight text-white">
                      {prob != null ? `${prob}%` : "—"}
                    </div>
                    <div className="text-xs text-slate-400">current probability</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-500" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function InfoCard({ title, value, body }: { title: string; value: string; body: string }) {
  return (
    <div className="col-span-12 rounded-3xl border border-white/10 bg-white/[0.02] p-5 md:col-span-4">
      <div className="text-sm font-medium text-slate-300">{title}</div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-white">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

function BottomLinks() {
  return (
    <>
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <div className="text-sm font-semibold text-white">What comes next</div>
        <div className="mt-2 text-sm text-slate-300">
          Once the forecast is visible, the next layer helps convert that output into action:
          who to target, what blocks movement, when to act, and what competitive risks to watch.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Adoption Segmentation", "Barrier Diagnosis", "Readiness Timeline", "Competitive Risk", "Growth Feasibility"].map((item) => (
            <span key={item} className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-slate-400">{item}</span>
          ))}
        </div>
        <Link href="/decide" className="mt-5 inline-flex rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500">
          Go to Decide
        </Link>
      </div>
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <div className="text-sm font-semibold text-white">Advanced forecast tools</div>
        <div className="mt-2 text-sm text-slate-300">Keep these accessible without crowding the main workflow.</div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/forecast-ledger" className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.05]">Forecast Ledger</Link>
          <Link href="/calibration" className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.05]">Calibration</Link>
          <Link href="/workbench" className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.05]">Workbench</Link>
        </div>
      </div>
    </>
  );
}
