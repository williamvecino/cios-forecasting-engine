import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import { Link } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useRunForecast, useGetCase, useListCases } from "@workspace/api-client-react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { ProbabilityGauge } from "@/components/ui-components";
import { ForecastComparisonCircles } from "@/components/forecast/ForecastComparisonCircles";
import { EventGatesPanel } from "@/components/forecast/EventGatesPanel";
import { ForecastMeaningPanel } from "@/components/forecast/ForecastMeaningPanel";
import { DecisionLabSummary } from "@/components/forecast/DecisionLabSummary";
import { ExecutiveJudgment } from "@/components/forecast/ExecutiveJudgment";
import { ExplainBox } from "@/components/forecast/ExplainBox";
import { generateExecutiveJudgment } from "@/lib/judgment-engine";
import { RecalculateForecastButton } from "@/components/recalculate-forecast-button";
import { computeDistributionForecast, probabilityOfThreshold, computeReadinessScore, computeAchievableCeiling, type GateConstraint, type GateDominationDiagnostic } from "@/lib/adoption-distribution";
import { CaseComparatorPanel } from "@/components/forecast/CaseComparatorPanel";
import { IntegrityPanel } from "@/components/forecast/IntegrityPanel";
import { CalibrationChecksPanel } from "@/components/forecast/CalibrationChecksPanel";
import EvidenceHealthPanel from "@/components/forecast/EvidenceHealthPanel";
import { ConsistencyPanel } from "@/components/forecast/ConsistencyPanel";
import {
  ArrowRight,
  BookOpen,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Zap,
  CircleAlert,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  computeDriverInputHash,
  getDriverCache,
  setDriverCache,
  clearDriverCache,
  deduplicateSignals,
  enforceDriverLimit,
  logForecastRun,
} from "@/lib/forecast-performance";
import SavedQuestionsPanel from "@/components/question/SavedQuestionsPanel";

interface IntegrityData {
  runId: string;
  passed: number;
  failed: number;
  totalTests: number;
  coreFailures: string[];
  stabilityWarning: boolean;
  unreliableFlag: boolean;
  results: Array<{ invariantName: string; passed: boolean; expectedBehavior: string; actualBehavior: string }>;
}

function IntegrityBadge({ integrity }: { integrity?: IntegrityData | null }) {
  const [open, setOpen] = useState(false);

  if (!integrity) return <div />;

  const status = integrity.unreliableFlag
    ? "Unreliable"
    : integrity.stabilityWarning
      ? "Warning"
      : "Stable";

  const color = status === "Stable"
    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20"
    : status === "Warning"
      ? "text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20"
      : "text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20";

  const panelColor = status === "Stable"
    ? "border-emerald-500/20"
    : status === "Warning"
      ? "border-amber-500/20"
      : "border-red-500/20";

  const Icon = status === "Stable" ? CheckCircle2 : status === "Warning" ? AlertTriangle : ShieldAlert;

  const tooltip = status === "Stable"
    ? "Core logic checks passed"
    : status === "Warning"
      ? "One important logic check failed"
      : "Multiple core logic checks failed";

  let runTimestamp = "";
  const tsMatch = integrity.runId?.match(/INTEG-(\d+)/);
  if (tsMatch) {
    const d = new Date(Number(tsMatch[1]));
    runTimestamp = d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div>
      <div className="relative group inline-block">
        <button
          onClick={() => setOpen(!open)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${color}`}
        >
          <Icon className="w-3.5 h-3.5" />
          <span>Integrity: {integrity.passed}/{integrity.totalTests} passed</span>
          <span className="opacity-60">·</span>
          <span>{status}</span>
        </button>
        <div className="absolute left-0 top-full mt-1.5 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div className="rounded-md bg-slate-800 border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 whitespace-nowrap shadow-lg">
            {tooltip}
          </div>
        </div>
      </div>

      {open && (
        <div className={`mt-3 rounded-xl border ${panelColor} bg-slate-900/80 backdrop-blur-sm p-4 space-y-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${status === "Stable" ? "text-emerald-400" : status === "Warning" ? "text-amber-400" : "text-red-400"}`} />
              <span className="text-sm font-semibold text-slate-100">Forecast Integrity</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 text-xs cursor-pointer">Close</button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Status</div>
              <div className={`text-sm font-semibold ${status === "Stable" ? "text-emerald-400" : status === "Warning" ? "text-amber-400" : "text-red-400"}`}>
                {status}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Checks Passed</div>
              <div className="text-sm font-semibold text-slate-100">
                {integrity.passed} of {integrity.totalTests}
              </div>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Last Run</div>
              <div className="text-sm font-semibold text-slate-100">{runTimestamp || "—"}</div>
            </div>
          </div>

          {integrity.coreFailures.length > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-red-400/70 mb-1">Core Check Issues</div>
              <div className="text-xs text-red-300">
                {integrity.coreFailures.length === 1
                  ? "One core logic check did not pass. The forecast may not fully reflect the underlying evidence."
                  : `${integrity.coreFailures.length} core logic checks did not pass. Treat this forecast with caution until issues are resolved.`}
              </div>
            </div>
          )}

          {integrity.failed > 0 && integrity.coreFailures.length === 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <div className="text-xs text-amber-300/80">
                {integrity.failed} supplementary {integrity.failed === 1 ? "check" : "checks"} flagged — these do not affect forecast reliability but may indicate areas for review.
              </div>
            </div>
          )}

          {integrity.failed === 0 && (
            <div className="text-xs text-emerald-400/70">
              All logic checks passed. The forecast is internally consistent and responsive to evidence changes.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  contributionPoints: number;
  watchSignal: string;
  interpretation?: string;
  affectedGate?: string;
  confidence?: number;
};

interface GateScenario {
  id: string;
  name: string;
  description: string;
  gateChanges: { gate_id: string; from: string; to: string }[];
  newProbability: number;
  baseProbability: number;
  delta: number;
  primaryDriver: string;
}

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
              Judge
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              What is the most likely outcome?
            </h1>
            <p className="mt-2 max-w-3xl text-base text-slate-300">
              Review the executive judgment, understand what is driving the call,
              see the closest historical analog, and identify what would change this outcome.
            </p>

            {activeQuestion?.caseId && (
              <div className="mt-4">
                <SavedQuestionsPanel caseId={activeQuestion.caseId} />
              </div>
            )}

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

const DriverContributionBreakdown = memo(function DriverContributionBreakdown({ drivers, totalShift, upsideTotal, downsideTotal }: {
  drivers: Driver[];
  totalShift: number;
  upsideTotal: number;
  downsideTotal: number;
}) {
  const netContribution = upsideTotal - downsideTotal;
  const isReconciled = netContribution === totalShift;
  const maxAbs = Math.max(...drivers.map(d => Math.abs(d.contributionPoints)), 1);

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Driver Contribution Breakdown</div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-emerald-400">Upward: +{upsideTotal} pts</span>
          <span className="text-rose-400">Downward: -{downsideTotal} pts</span>
          <span className={isReconciled ? "text-blue-400" : "text-amber-400"}>
            Net: {netContribution >= 0 ? "+" : ""}{netContribution} pts
            {isReconciled ? " = Shift" : ` (shift: ${totalShift >= 0 ? "+" : ""}${totalShift})`}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {drivers.map((d) => (
          <div key={d.id} className="flex items-center gap-3">
            <div className="w-[45%] min-w-0">
              <div className="text-xs text-slate-200 truncate">{d.name}</div>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden relative">
                <div
                  className={cn(
                    "h-full rounded-full",
                    d.direction === "Upward" ? "bg-emerald-500" : "bg-rose-500"
                  )}
                  style={{ width: `${Math.min(100, (Math.abs(d.contributionPoints) / maxAbs) * 100)}%` }}
                />
              </div>
              <div className={cn(
                "text-xs font-bold w-16 text-right shrink-0",
                d.direction === "Upward" ? "text-emerald-400" : "text-rose-400"
              )}>
                {d.contributionPoints > 0 ? "+" : ""}{d.contributionPoints} pts
              </div>
            </div>
          </div>
        ))}
      </div>
      {!isReconciled && totalShift !== 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-[10px] bg-slate-500/10 border border-slate-500/20 rounded-xl px-3 py-2">
            <span className="text-slate-300">Unattributed adjustment: {(totalShift - netContribution) >= 0 ? "+" : ""}{totalShift - netContribution} pts</span>
            <span className="text-slate-500">(actor behavioral adjustments)</span>
          </div>
        </div>
      )}
    </div>
  );
});

function largestRemainderDistribute(weights: number[], total: number): number[] {
  const absTotal = Math.abs(total);
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (sumW === 0 || absTotal === 0) return weights.map(() => 0);
  const raw = weights.map(w => (w / sumW) * absTotal);
  const floored = raw.map(v => Math.floor(v));
  let rem = Math.round(absTotal) - floored.reduce((s, v) => s + v, 0);
  const fracs = raw.map((v, i) => ({ i, frac: v - floored[i] })).sort((a, b) => b.frac - a.frac);
  for (const f of fracs) {
    if (rem <= 0) break;
    floored[f.i]++;
    rem--;
  }
  return floored;
}

function useDriversFromForecast(forecast: any, activeCaseId: string) {
  const prevCaseRef = useRef<string>(activeCaseId);
  if (prevCaseRef.current !== activeCaseId) {
    clearDriverCache();
    prevCaseRef.current = activeCaseId;
  }

  return useMemo(() => {
    if (!forecast) return [];
    const f = forecast as any;
    if (f.caseId && f.caseId !== activeCaseId) return [];
    const sa = f.sensitivityAnalysis;
    const signalDetails = f.signalDetails || [];
    const totalShift = Math.round(((f.currentProbability ?? 0) - (f.priorProbability ?? 0)) * 100);

    const rawSignals: Array<{
      id: string;
      name: string;
      logLr: number;
      lr: number;
      signalType: string;
      confidence: number;
    }> = [];

    const saUp = (sa?.upwardSignals || []) as any[];
    const saDown = (sa?.downwardSignals || []) as any[];
    const allSa = [
      ...saUp.map((s: any) => ({ ...s, _isUp: true })),
      ...saDown.map((s: any) => ({ ...s, _isUp: false })),
    ];

    if (allSa.length > 0) {
      for (const sig of allSa) {
        const detail = signalDetails.find((d: any) => d.signalId === sig.signalId);
        const lr = sig.likelihoodRatio ?? detail?.likelihoodRatio ?? 1;
        const logLr = lr > 0 && lr !== 1 ? Math.log(lr) : (sig._isUp ? 0.01 : -0.01);
        rawSignals.push({
          id: sig.signalId,
          name: sig.description || detail?.description || detail?.signalDescription || sig.signalId,
          logLr,
          lr,
          signalType: detail?.signalType || "",
          confidence: detail?.translationConfidence ?? 1,
        });
      }
    } else if (signalDetails.length > 0) {
      for (const sig of signalDetails) {
        const lr = sig.likelihoodRatio ?? sig.effectiveLR ?? 1;
        const isUp = sig.direction === "Positive" || lr > 1;
        const logLr = lr > 0 && lr !== 1 ? Math.log(lr) : (isUp ? 0.01 : -0.01);
        rawSignals.push({
          id: sig.signalId,
          name: sig.description || sig.signalDescription || sig.signalId,
          logLr,
          lr,
          signalType: sig.signalType || "",
          confidence: sig.translationConfidence ?? 1,
        });
      }
    }

    if (rawSignals.length === 0) return [];

    const { unique: dedupedSignals } = deduplicateSignals(rawSignals);
    const signals = enforceDriverLimit(dedupedSignals);

    const stateHash = computeDriverInputHash(signals, totalShift, activeCaseId);
    const cache = getDriverCache();
    if (cache.hash === stateHash && cache.result) {
      return cache.result;
    }

    const polarityViolationIds = new Set(
      signals.filter(s => s.direction === "Negative" && s.logLr >= 0).map(s => s.id)
    );
    const upSignals = signals.filter(s => s.logLr > 0 && !polarityViolationIds.has(s.id));
    const downSignals = signals.filter(s => s.logLr < 0);
    for (const pv of signals.filter(s => polarityViolationIds.has(s.id))) {
      downSignals.push({ ...pv, logLr: -0.01, lr: 0.99 });
    }

    const totalPosLogLr = upSignals.reduce((s, sig) => s + sig.logLr, 0);
    const totalNegLogLr = downSignals.reduce((s, sig) => s + Math.abs(sig.logLr), 0);
    const totalAbsLogLr = totalPosLogLr + totalNegLogLr;

    let grossUp: number;
    let grossDown: number;

    if (totalAbsLogLr > 0) {
      if (totalShift >= 0) {
        grossUp = Math.max(Math.abs(totalShift), Math.round((totalPosLogLr / totalAbsLogLr) * (Math.abs(totalShift) + totalNegLogLr / totalAbsLogLr * Math.abs(totalShift))));
        grossDown = grossUp - totalShift;
      } else {
        grossDown = Math.max(Math.abs(totalShift), Math.round((totalNegLogLr / totalAbsLogLr) * (Math.abs(totalShift) + totalPosLogLr / totalAbsLogLr * Math.abs(totalShift))));
        grossUp = grossDown + totalShift;
      }
    } else {
      grossUp = Math.max(totalShift, 0);
      grossDown = Math.max(-totalShift, 0);
    }

    if (upSignals.length > 0 && grossUp < upSignals.length) grossUp = upSignals.length;
    if (downSignals.length > 0 && grossDown < downSignals.length) grossDown = downSignals.length;
    const adjustedShift = grossUp - grossDown;
    if (adjustedShift !== totalShift) {
      if (totalShift >= 0) {
        grossDown = grossUp - totalShift;
      } else {
        grossUp = grossDown + totalShift;
      }
      if (grossUp < 0) grossUp = 0;
      if (grossDown < 0) grossDown = 0;
    }

    const upWeights = upSignals.map(s => s.logLr);
    const downWeights = downSignals.map(s => Math.abs(s.logLr));

    const upContribs = largestRemainderDistribute(upWeights, grossUp);
    const downContribs = largestRemainderDistribute(downWeights, grossDown);

    for (let i = 0; i < upContribs.length; i++) {
      if (upContribs[i] === 0 && upWeights[i] > 0) upContribs[i] = 1;
    }
    for (let i = 0; i < downContribs.length; i++) {
      if (downContribs[i] === 0 && downWeights[i] > 0) downContribs[i] = 1;
    }

    const actualUp = upContribs.reduce((s, v) => s + v, 0);
    const actualDown = downContribs.reduce((s, v) => s + v, 0);
    const actualNet = actualUp - actualDown;
    if (actualNet !== totalShift && totalShift !== 0) {
      const diff = actualNet - totalShift;
      if (diff > 0) {
        if (upContribs.length > 0) {
          const maxIdx = upContribs.reduce((mi, v, i) => v > upContribs[mi] ? i : mi, 0);
          upContribs[maxIdx] = Math.max(0, upContribs[maxIdx] - diff);
        } else if (downContribs.length > 0) {
          const maxIdx = downContribs.reduce((mi, v, i) => v > downContribs[mi] ? i : mi, 0);
          downContribs[maxIdx] += diff;
        }
      } else {
        if (downContribs.length > 0) {
          const maxIdx = downContribs.reduce((mi, v, i) => v > downContribs[mi] ? i : mi, 0);
          downContribs[maxIdx] = Math.max(0, downContribs[maxIdx] + diff);
        } else if (upContribs.length > 0) {
          const maxIdx = upContribs.reduce((mi, v, i) => v > upContribs[mi] ? i : mi, 0);
          upContribs[maxIdx] -= diff;
        }
      }
    }

    const drivers: Driver[] = [];

    for (let i = 0; i < upSignals.length; i++) {
      const sig = upSignals[i];
      const pts = upContribs[i];
      drivers.push({
        id: sig.id,
        name: sig.name,
        direction: "Upward",
        strength: sig.lr >= 2 ? "High" : sig.lr >= 1.3 ? "Medium" : "Low",
        probabilityImpact: pts,
        contributionPoints: pts,
        watchSignal: sig.signalType || "Monitor for changes",
        interpretation: sig.signalType ? `${sig.signalType} signal contributing to upward pressure.` : undefined,
        confidence: sig.confidence,
      });
    }

    for (let i = 0; i < downSignals.length; i++) {
      const sig = downSignals[i];
      const pts = downContribs[i];
      drivers.push({
        id: sig.id,
        name: sig.name,
        direction: "Downward",
        strength: sig.lr <= 0.5 ? "High" : sig.lr <= 0.75 ? "Medium" : "Low",
        probabilityImpact: -pts,
        contributionPoints: -pts,
        watchSignal: sig.signalType || "Monitor for changes",
        interpretation: sig.signalType ? `${sig.signalType} signal contributing to downward pressure.` : undefined,
        confidence: sig.confidence,
      });
    }

    const sorted = [...drivers].sort((a, b) => {
      const diff = Math.abs(b.contributionPoints) - Math.abs(a.contributionPoints);
      return diff !== 0 ? diff : strengthWeight(b.strength) - strengthWeight(a.strength);
    });

    setDriverCache(stateHash, sorted);

    const largestShift = sorted.length > 0 ? Math.abs(sorted[0].contributionPoints) : 0;
    logForecastRun(sorted.length, largestShift, f.currentProbability ?? 0);

    return sorted;
  }, [forecast, activeCaseId]);
}

type EventGate = {
  gate_id: string;
  gate_label: string;
  description: string;
  status: string;
  reasoning: string;
  constrains_probability_to: number;
};

function computeConstrainedProbability(
  gates: EventGate[],
  brandOutlook: number,
  outcomeThresholdRaw?: string | null,
  confidenceLevel?: string,
  signalCount?: number,
): number {
  const distGates: GateConstraint[] = gates.map(g => ({
    gate_id: g.gate_id,
    gate_label: g.gate_label,
    status: (g.status as "unresolved" | "weak" | "moderate" | "strong") ?? "moderate",
    constrains_probability_to: g.constrains_probability_to,
  }));
  const result = computeDistributionForecast(
    brandOutlook,
    confidenceLevel ?? "Moderate",
    signalCount ?? 5,
    0.5,
    distGates,
    outcomeThresholdRaw ?? null,
  );
  return result.thresholdProbability;
}

const GATE_STATUS_ORDER = ["unresolved", "weak", "moderate", "strong"] as const;
const GATE_STATUS_CAP_BAND: Record<string, [number, number]> = {
  unresolved: [0.10, 0.45],
  weak: [0.30, 0.55],
  moderate: [0.50, 0.75],
  strong: [0.70, 0.95],
};

function gateStatusUpgrade(status: string): string {
  const idx = GATE_STATUS_ORDER.indexOf(status as any);
  if (idx < 0 || idx >= GATE_STATUS_ORDER.length - 1) return "strong";
  return GATE_STATUS_ORDER[idx + 1];
}

function gateStatusDowngrade(status: string): string {
  const idx = GATE_STATUS_ORDER.indexOf(status as any);
  if (idx <= 0) return "unresolved";
  return GATE_STATUS_ORDER[idx - 1];
}

function gateCapForStatus(gate: EventGate, newStatus: string): number {
  const band = GATE_STATUS_CAP_BAND[newStatus];
  if (!band) return gate.constrains_probability_to;
  const currentBand = GATE_STATUS_CAP_BAND[gate.status];
  if (!currentBand) return Math.min(Math.max(gate.constrains_probability_to, band[0]), band[1]);
  const positionInBand = currentBand[1] > currentBand[0]
    ? (gate.constrains_probability_to - currentBand[0]) / (currentBand[1] - currentBand[0])
    : 0.5;
  const clampedPosition = Math.max(0, Math.min(1, positionInBand));
  return band[0] + clampedPosition * (band[1] - band[0]);
}

function generateGateScenarios(gates: EventGate[], brandOutlook: number, outcomeThreshold?: string | null, confidenceLevel?: string, signalCount?: number): GateScenario[] {
  if (gates.length === 0) return [];

  const baseProbability = computeConstrainedProbability(gates, brandOutlook, outcomeThreshold, confidenceLevel, signalCount);
  const basePct = Math.round(baseProbability * 100);
  const scenarios: GateScenario[] = [];

  const nonStrongGates = gates.filter(g => g.status !== "strong");
  for (const gate of nonStrongGates) {
    const upgradedStatus = gateStatusUpgrade(gate.status);
    const upgradedCap = gateCapForStatus(gate, upgradedStatus);
    const modifiedGates = gates.map(g =>
      g.gate_id === gate.gate_id
        ? { ...g, status: upgradedStatus, constrains_probability_to: upgradedCap }
        : g
    );
    const newProb = computeConstrainedProbability(modifiedGates, brandOutlook, outcomeThreshold, confidenceLevel, signalCount);
    const newPct = Math.round(newProb * 100);
    const delta = newPct - basePct;

    if (delta !== 0) {
      scenarios.push({
        id: `upgrade_${gate.gate_id}`,
        name: `${gate.gate_label}: ${gate.status} → ${upgradedStatus}`,
        description: `If "${gate.gate_label}" improves from ${gate.status} to ${upgradedStatus}, the forecast changes.`,
        gateChanges: [{ gate_id: gate.gate_id, from: gate.status, to: upgradedStatus }],
        newProbability: newPct,
        baseProbability: basePct,
        delta,
        primaryDriver: gate.gate_label,
      });
    }
  }

  const strongGates = gates.filter(g => g.status === "strong");
  for (const gate of strongGates) {
    const downgradedStatus = gateStatusDowngrade(gate.status);
    const downgradedCap = gateCapForStatus(gate, downgradedStatus);
    const modifiedGates = gates.map(g =>
      g.gate_id === gate.gate_id
        ? { ...g, status: downgradedStatus, constrains_probability_to: downgradedCap }
        : g
    );
    const newProb = computeConstrainedProbability(modifiedGates, brandOutlook, outcomeThreshold, confidenceLevel, signalCount);
    const newPct = Math.round(newProb * 100);
    const delta = newPct - basePct;

    if (delta !== 0) {
      scenarios.push({
        id: `regress_${gate.gate_id}`,
        name: `${gate.gate_label}: strong → ${downgradedStatus}`,
        description: `If "${gate.gate_label}" regresses from strong to ${downgradedStatus}, the forecast declines.`,
        gateChanges: [{ gate_id: gate.gate_id, from: "strong", to: downgradedStatus }],
        newProbability: newPct,
        baseProbability: basePct,
        delta,
        primaryDriver: gate.gate_label,
      });
    }
  }

  if (nonStrongGates.length >= 2) {
    const modifiedGates = gates.map(g => {
      if (g.status === "strong") return g;
      const upgraded = gateStatusUpgrade(g.status);
      return { ...g, status: upgraded, constrains_probability_to: gateCapForStatus(g, upgraded) };
    });
    const newProb = computeConstrainedProbability(modifiedGates, brandOutlook, outcomeThreshold, confidenceLevel, signalCount);
    const newPct = Math.round(newProb * 100);
    const delta = newPct - basePct;

    if (delta !== 0) {
      scenarios.push({
        id: "upgrade_all",
        name: "All weak gates improve one level",
        description: `All non-strong gates upgrade one status level simultaneously.`,
        gateChanges: nonStrongGates.map(g => ({ gate_id: g.gate_id, from: g.status, to: gateStatusUpgrade(g.status) })),
        newProbability: newPct,
        baseProbability: basePct,
        delta,
        primaryDriver: nonStrongGates.map(g => g.gate_label).join(", "),
      });
    }
  }

  if (gates.length >= 2) {
    const modifiedGates = gates.map(g => {
      if (g.status === "strong") {
        const ds = gateStatusDowngrade(g.status);
        return { ...g, status: ds, constrains_probability_to: gateCapForStatus(g, ds) };
      }
      return g;
    });
    const downgradeCount = strongGates.length;
    if (downgradeCount > 0) {
      const newProb = computeConstrainedProbability(modifiedGates, brandOutlook, outcomeThreshold, confidenceLevel, signalCount);
      const newPct = Math.round(newProb * 100);
      const delta = newPct - basePct;

      if (delta !== 0) {
        scenarios.push({
          id: "regress_all",
          name: "All strong gates regress",
          description: `All strong gates drop to moderate simultaneously.`,
          gateChanges: strongGates.map(g => ({ gate_id: g.gate_id, from: "strong", to: gateStatusDowngrade("strong") })),
          newProbability: newPct,
          baseProbability: basePct,
          delta,
          primaryDriver: strongGates.map(g => g.gate_label).join(", "),
        });
      }
    }
  }

  scenarios.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return scenarios;
}

interface SignalReadiness {
  confirmedDrivers: number;
  confirmedSupporting: number;
  totalConfirmed: number;
  hasDirection: boolean;
  questionType: string;
  entities: string[];
  updatedAt: number;
  coveredFamilies?: number;
  totalFamilies?: number;
  missingFamilies?: string[];
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
          {readiness?.coveredFamilies !== undefined && (
            <ReadinessItem
              label="Signal Families"
              value={readiness.coveredFamilies}
              needed={4}
            />
          )}
          {readiness?.questionType === "comparative" && (
            <ReadinessItem
              label="Groups Mapped"
              value={readiness?.entities?.length ?? 0}
              needed={2}
            />
          )}
        </div>
        {readiness?.missingFamilies && readiness.missingFamilies.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 mt-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-[11px] text-amber-300">
              <span className="font-semibold">Coverage gaps:</span> {readiness.missingFamilies.join(", ")}
            </div>
          </div>
        )}
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

  return <ForecastContent activeQuestion={activeQuestion} />;
}

const STRENGTH_LABEL: Record<number, string> = { 1: "Low", 2: "Low", 3: "Medium", 4: "High", 5: "High" };

async function tryLoadSignalsFromApi(caseId: string): Promise<boolean> {
  try {
    const baseUrl = import.meta.env.BASE_URL || "/";
    const res = await fetch(`${baseUrl}api/cases/${caseId}/signals`);
    if (!res.ok) return false;
    const apiSignals = await res.json();
    if (!Array.isArray(apiSignals) || apiSignals.length === 0) return false;

    const signals = apiSignals.map((s: any) => ({
      id: s.signalId || s.id,
      text: s.signalDescription || s.text || "",
      direction: (s.direction || "neutral").toLowerCase(),
      strength: STRENGTH_LABEL[s.strengthScore] || s.strength || "Medium",
      reliability: s.reliabilityScore >= 4 ? "Confirmed" : s.reliabilityScore >= 3 ? "Probable" : "Preliminary",
      accepted: s.status === "active",
      category: s.signalType || "general",
      source: "api",
      impact: s.absoluteImpact || undefined,
      caveat: "",
    }));

    localStorage.setItem(`cios.signals:${caseId}`, JSON.stringify(signals));
    localStorage.setItem(`cios.signalsLocked:${caseId}`, "true");
    return true;
  } catch {
    return false;
  }
}

function checkForecastGate(caseId: string): { ready: boolean; failures: string[] } {
  const failures: string[] = [];
  try {
    const locked = localStorage.getItem(`cios.signalsLocked:${caseId}`);
    if (locked !== "true") {
      const hasSignals = localStorage.getItem(`cios.signals:${caseId}`);
      if (hasSignals) {
        try {
          const parsed = JSON.parse(hasSignals);
          const accepted = Array.isArray(parsed) ? parsed.filter((s: any) => s.accepted) : [];
          if (accepted.length > 0) {
            localStorage.setItem(`cios.signalsLocked:${caseId}`, "true");
          } else {
            failures.push("No accepted signals found. Go to the Add Information step to review and accept signals.");
          }
        } catch {
          failures.push("Signals must be locked before running a forecast.");
        }
      } else {
        failures.push("__NEEDS_API_LOAD__");
      }
    }
    let scenario = localStorage.getItem(`cios.scenarioName:${caseId}`);
    if (!scenario || !scenario.trim()) {
      localStorage.setItem(`cios.scenarioName:${caseId}`, "Baseline");
      scenario = "Baseline";
    }
  } catch {}
  return { ready: failures.length === 0, failures };
}

function ForecastContent({ activeQuestion }: { activeQuestion: any }) {
  const caseId = activeQuestion?.caseId || "";
  const queryClient = useQueryClient();
  const prevCaseIdRef = useRef<string>("");
  const [, forceRender] = useState(0);
  useEffect(() => {
    if (prevCaseIdRef.current && prevCaseIdRef.current !== caseId) {
      queryClient.removeQueries({ queryKey: [`/api/cases/${prevCaseIdRef.current}/forecast`] });
      queryClient.removeQueries({ queryKey: [`/api/cases/${prevCaseIdRef.current}`] });
    }
    prevCaseIdRef.current = caseId;
  }, [caseId, queryClient]);

  useEffect(() => {
    const onFocus = () => forceRender((n) => n + 1);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const interval = setInterval(onFocus, 1000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(interval);
    };
  }, []);

  const [viewMode, setViewMode] = useState<"minimal" | "full">("full");
  const prevViewModeCaseRef = useRef(caseId);
  if (prevViewModeCaseRef.current !== caseId) {
    prevViewModeCaseRef.current = caseId;
    setViewMode("full");
  }
  const [apiLoadAttempted, setApiLoadAttempted] = useState(false);
  const [apiLoadDone, setApiLoadDone] = useState(false);
  const gate = checkForecastGate(caseId);

  useEffect(() => {
    if (gate.failures.includes("__NEEDS_API_LOAD__") && !apiLoadAttempted && caseId) {
      setApiLoadAttempted(true);
      tryLoadSignalsFromApi(caseId).then(() => {
        setApiLoadDone(true);
        forceRender((n) => n + 1);
      });
    }
  }, [gate.failures, apiLoadAttempted, caseId]);

  const hasAcceptedSignals = (() => {
    try {
      const raw = localStorage.getItem(`cios.signals:${caseId}`);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.some((s: any) => s.accepted);
    } catch { return false; }
  })();

  function lockSignalsNow() {
    if (!caseId) return;
    localStorage.setItem(`cios.signalsLocked:${caseId}`, "true");
    forceRender((n) => n + 1);
  }

  const needsApiLoad = gate.failures.includes("__NEEDS_API_LOAD__") && !apiLoadDone;
  const { data: forecast, isLoading } = useRunForecast(caseId);
  useGetCase(caseId);
  const drivers = useDriversFromForecast(forecast, caseId);

  const { data: analogContext, isLoading: analogLoading } = useQuery({
    queryKey: [`/api/cases/${caseId}/analog-context`],
    queryFn: () => fetch(`/api/cases/${caseId}/analog-context`).then((r) => r.ok ? r.json() : null),
    enabled: !!caseId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: snapshotsData } = useQuery({
    queryKey: [`/api/cases/${caseId}/snapshots`],
    queryFn: () => fetch(`/api/cases/${caseId}/snapshots`).then((r) => r.ok ? r.json() : null),
    enabled: !!caseId,
    staleTime: 30 * 1000,
  });

  if (needsApiLoad) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-muted-foreground">Loading case signals...</div>
        </div>
      </div>
    );
  }

  if (!gate.ready) {
    const isOnlyLockMissing = gate.failures.length === 1 && gate.failures[0].includes("locked") && hasAcceptedSignals;

    return (
      <>
        <div className="rounded-3xl border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.06] to-[#0A1736] p-8 space-y-5">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-amber-400" />
            <div>
              <h3 className="text-white font-semibold text-sm">Forecast Readiness Check Failed</h3>
              <p className="text-xs text-slate-400 mt-0.5">The following inputs are required before the forecast can run.</p>
            </div>
          </div>
          <div className="space-y-2">
            {gate.failures.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-sm text-amber-200">{f}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-2">
            {isOnlyLockMissing && (
              <button
                onClick={lockSignalsNow}
                className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition"
              >
                Lock Signals Now
              </button>
            )}
            <Link href="/signals" className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">
              Return to Add Information
            </Link>
          </div>
        </div>
        <BottomLinks />
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-12 flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
        <div className="text-sm text-slate-300">Computing forecast...</div>
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
  const delta = (f.currentProbability ?? 0) - (f.priorProbability ?? 0);
  const confidence: Confidence = (f.confidenceLevel ?? "Moderate") as Confidence;
  const interpretation = f.interpretation;
  const summary = interpretation?.primaryStatement || "Current signals support a favorable outcome within the forecast window.";

  const topDriver = drivers[0];
  const upsideTotal = drivers.filter((d) => d.direction === "Upward").reduce((s, d) => s + d.contributionPoints, 0);
  const downsideTotal = drivers.filter((d) => d.direction === "Downward").reduce((s, d) => s + Math.abs(d.contributionPoints), 0);
  const totalShiftPts = Math.round(delta * 100);

  if (viewMode === "minimal") {
    const signalDetails: Array<{ signalId: string; description: string; direction: string; likelihoodRatio: number; effectiveLikelihoodRatio: number; correlationDampened?: boolean; signalType?: string }> = f.signalDetails || [];
    const rawProb = f.rawProbability ?? f.currentProbability ?? 0;
    const finalProb = f.currentProbability ?? 0;
    const priorProb = f.priorProbability ?? 0.5;
    const shift = finalProb - priorProb;
    const topContributors = drivers.slice(0, 8);

    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Minimal View — Core Engine Only</div>
          <button
            onClick={() => setViewMode("full")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition"
          >
            Switch to Full View
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-5 space-y-4">
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Question</div>
          <div className="text-base text-white font-medium">{activeQuestion?.text || "No question defined"}</div>
          {activeQuestion?.subject && (
            <div className="text-xs text-slate-400">Subject: {activeQuestion.subject}</div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-5">
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-4">Prior &rarr; Final Forecast</div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Prior</div>
              <div className="text-2xl font-bold text-slate-300">{Math.round(priorProb * 100)}%</div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-600" />
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Engine Output</div>
              <div className="text-lg font-semibold text-slate-400">{Math.round(rawProb * 100)}%</div>
              <div className="text-[10px] text-slate-600">pre-distribution</div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-600" />
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Final Forecast</div>
              <div className="text-3xl font-bold text-white">{Math.round(finalProb * 100)}%</div>
              <div className={cn("text-sm font-semibold", shift >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {shift >= 0 ? "+" : ""}{(shift * 100).toFixed(1)} pts from prior
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span>Confidence: {confidence}</span>
            {f.outcomeThreshold && <span>Threshold: {f.outcomeThreshold}</span>}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Accepted Signals ({signalDetails.length})</div>
          </div>
          {signalDetails.length === 0 ? (
            <div className="text-xs text-slate-500">No signals in engine output.</div>
          ) : (
            <div className="space-y-1.5">
              {signalDetails.map((sig) => (
                <div key={sig.signalId} className="flex items-start gap-3 py-1.5 border-b border-white/5 last:border-0">
                  <span className={cn(
                    "shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full",
                    sig.direction === "Positive" ? "bg-emerald-400" : sig.direction === "Negative" ? "bg-rose-400" : "bg-slate-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 truncate">{sig.description}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {sig.direction} &middot; LR {sig.effectiveLikelihoodRatio.toFixed(2)}
                      {sig.correlationDampened && " (dampened)"}
                      {sig.signalType && ` \u00B7 ${sig.signalType}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeQuestion?.caseId && (
          <EvidenceHealthPanel caseId={activeQuestion.caseId} />
        )}

        {topContributors.length > 0 && (
          <DriverContributionBreakdown drivers={topContributors} totalShift={totalShiftPts} upsideTotal={upsideTotal} downsideTotal={downsideTotal} />
        )}

        <div className="rounded-2xl border border-dashed border-white/10 bg-transparent p-4 text-center">
          <div className="text-[10px] text-slate-600 uppercase tracking-wider">
            Minimal mode: showing engine pipeline only. No gates, narratives, readiness, or scenarios.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <IntegrityBadge integrity={f?._integrity} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("minimal")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200 transition"
          >
            Minimal View
          </button>
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
      </div>

      {(() => {
        const caseKey = activeQuestion?.caseId || "unknown";
        let decomp: { event_gates: { gate_id: string; gate_label: string; description: string; status: string; reasoning: string; constrains_probability_to: number }[]; brand_outlook_probability: number; constrained_probability: number; constraint_explanation: string } | null = null;
        try {
          const raw = localStorage.getItem(`cios.eventDecomposition:${caseKey}`);
          if (raw) decomp = JSON.parse(raw);
        } catch {}

        let hasGates = decomp && decomp.event_gates && decomp.event_gates.length > 0;

        if (!hasGates) {
          const currentProb = f.currentProbability ?? 0.5;
          const defaultGates = [
            {
              gate_id: "clinical_evidence",
              gate_label: "Clinical Evidence Strength",
              description: "Adequacy of clinical data to support the forecasted outcome.",
              status: currentProb >= 0.65 ? "strong" : currentProb >= 0.45 ? "moderate" : "weak",
              reasoning: "Based on the strength and direction of accepted clinical signals.",
              constrains_probability_to: Math.min(0.95, currentProb + 0.15),
            },
            {
              gate_id: "market_access",
              gate_label: "Market Access & Reimbursement",
              description: "Payer coverage, formulary positioning, and reimbursement pathway clarity.",
              status: currentProb >= 0.60 ? "moderate" : "weak",
              reasoning: "Payer access signals determine achievable uptake ceiling.",
              constrains_probability_to: Math.min(0.90, currentProb + 0.10),
            },
            {
              gate_id: "competitive_landscape",
              gate_label: "Competitive Barrier Clearance",
              description: "Degree to which competitive dynamics constrain or enable the outcome.",
              status: currentProb >= 0.55 ? "strong" : currentProb >= 0.35 ? "moderate" : "weak",
              reasoning: "Competitive positioning relative to alternatives in the market.",
              constrains_probability_to: Math.min(0.90, currentProb + 0.20),
            },
            {
              gate_id: "adoption_readiness",
              gate_label: "HCP Adoption Readiness",
              description: "Prescriber willingness and behavioral readiness to change practice.",
              status: currentProb >= 0.60 ? "moderate" : currentProb >= 0.40 ? "weak" : "unresolved",
              reasoning: "Based on behavioral barrier signals and adoption driver strength.",
              constrains_probability_to: Math.min(0.85, currentProb + 0.05),
            },
          ];
          decomp = {
            event_gates: defaultGates,
            brand_outlook_probability: currentProb,
            constrained_probability: computeConstrainedProbability(defaultGates, currentProb, activeQuestion?.threshold || (f as any).outcomeThreshold || null, (f as any).confidenceLevel ?? "Moderate", (f as any).signalDetails?.length ?? 5),
            constraint_explanation: "Default gates generated from signal evidence.",
          };
          hasGates = true;
          try {
            localStorage.setItem(`cios.eventDecomposition:${caseKey}`, JSON.stringify(decomp));
          } catch {}
        }
        const brandOutlookProb = hasGates ? decomp!.brand_outlook_probability : null;
        const outcomeThresholdStr = activeQuestion?.threshold || (f as any).outcomeThreshold || null;
        const confidenceLvl = (f as any).confidenceLevel ?? "Moderate";
        const sigCount = (f as any).signalDetails?.length ?? 5;
        const displayProb = f.currentProbability ?? 0.5;
        const displayProbPct = Math.round(displayProb * 100);

        const distGatesForDiag: GateConstraint[] = hasGates
          ? decomp!.event_gates.map((g: any) => ({
              gate_id: g.gate_id,
              gate_label: g.gate_label,
              status: g.status as "unresolved" | "weak" | "moderate" | "strong",
              constrains_probability_to: g.constrains_probability_to,
            }))
          : [];
        const localDistResult = hasGates
          ? computeDistributionForecast(
              brandOutlookProb ?? f.currentProbability ?? 0.5,
              confidenceLvl,
              sigCount,
              0.5,
              distGatesForDiag,
              outcomeThresholdStr,
            )
          : null;
        const gateDomination = (f?.distributionForecast?.gateDomination as GateDominationDiagnostic | undefined) ?? localDistResult?.gateDomination ?? null;
        const readinessScore = (f?.distributionForecast?.readinessScore as number | undefined) ?? localDistResult?.readinessScore ?? 1.0;

        return (
          <>
            {hasGates && (() => {
              const brandPct = Math.round((brandOutlookProb ?? f.currentProbability ?? 0.5) * 100);
              const finalPct = displayProbPct;
              const priorPct = Math.round((f.priorProbability ?? 0.5) * 100);
              const minGateCapPct = displayProbPct;
              const executionGapPts = Math.abs(brandPct - finalPct);

              const gateScenarios = generateGateScenarios(decomp!.event_gates, brandOutlookProb ?? f.currentProbability ?? 0.5, outcomeThresholdStr, confidenceLvl, sigCount);
              const individualScenarios = gateScenarios.filter(s => !s.id.startsWith("upgrade_all") && !s.id.startsWith("regress_all"));
              const gateUpside = individualScenarios.filter(s => s.delta > 0).reduce((sum, s) => sum + s.delta, 0);
              const gateDownside = individualScenarios.filter(s => s.delta < 0).reduce((sum, s) => sum + Math.abs(s.delta), 0);
              const topGateDriver = gateScenarios.length > 0
                ? [...gateScenarios].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
                : null;

              const judgmentResult = generateExecutiveJudgment({
                priorPct,
                brandOutlookPct: brandPct,
                finalForecastPct: finalPct,
                minGateCapPct,
                executionGapPts,
                gates: decomp!.event_gates,
                drivers,
                analogContext: analogContext ?? null,
                questionText: activeQuestion?.text || "",
                outcomeDefinition: activeQuestion?.outcome ? activeQuestion.outcome.charAt(0).toUpperCase() + activeQuestion.outcome.slice(1) : undefined,
                outcomeThreshold: activeQuestion?.threshold || (f as any).outcomeThreshold || undefined,
                subject: activeQuestion?.subject || undefined,
                timeHorizon: activeQuestion?.timeHorizon || undefined,
                compositeScenarios: activeQuestion?.compositeScenarios?.map(s => ({
                  id: s.id,
                  label: s.label,
                  dimensions: s.dimensions,
                })),
              });

              let priorProbability: number | null = null;
              try {
                const cid = activeQuestion?.caseId || "unknown";
                const prev = localStorage.getItem(`cios.judgmentResult:${cid}`);
                if (prev) {
                  const parsed = JSON.parse(prev);
                  if (typeof parsed.probability === "number") priorProbability = parsed.probability;
                }
                localStorage.setItem(`cios.judgmentResult:${cid}`, JSON.stringify(judgmentResult));
              } catch {}

              const audit = judgmentResult._audit;

              const caseCtxForExplain = {
                questionText: activeQuestion?.text || "",
                gates: decomp!.event_gates.map(g => {
                  const upgradeScenario = gateScenarios.find(s => s.id === `upgrade_${g.gate_id}`);
                  const downgradeScenario = gateScenarios.find(s => s.id === `regress_${g.gate_id}`);
                  return {
                    gateLabel: g.gate_label,
                    gateStatus: g.status,
                    upgradedProbability: upgradeScenario ? upgradeScenario.newProbability : null,
                    downgradedProbability: downgradeScenario ? downgradeScenario.newProbability : null,
                    baseProbability: finalPct,
                    delta: upgradeScenario ? upgradeScenario.delta : null,
                  };
                }),
                drivers: drivers.map(d => ({
                  name: d.name,
                  direction: d.direction as "Upward" | "Downward",
                  strength: d.strength,
                  contributionPoints: d.contributionPoints,
                })),
              };

              return (
                <>
                  <ExplainBox judgment={judgmentResult} caseContext={caseCtxForExplain} />
                  <ExecutiveJudgment judgment={judgmentResult} isLoading={analogLoading} priorProbability={priorProbability} />

                  {activeQuestion?.caseId && (
                    <EvidenceHealthPanel caseId={activeQuestion.caseId} />
                  )}

                  <ConsistencyPanel
                    consistency={f._consistency ?? null}
                    drift={f._drift ?? null}
                    snapshots={snapshotsData?.snapshots ?? []}
                  />

                  <ForecastComparisonCircles
                    brandOutlookProb={brandOutlookProb ?? f.currentProbability ?? 0.5}
                    finalForecastProb={displayProb}
                    priorProbability={f.priorProbability}
                    delta={delta}
                    confidence={confidence}
                  />

                  <EventGatesPanel gates={decomp!.event_gates} />

                  {gateDomination && gateDomination.gateDominated && (
                    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/[0.08] to-amber-600/[0.04] p-4 flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-amber-200">Constraint Domination Detected</div>
                        <div className="text-xs text-amber-200/70">
                          Constraint status accounts for {Math.round(gateDomination.gateImpactRatio * 100)}% of probability movement ({(Math.abs(gateDomination.unconstrainedProbability - gateDomination.constrainedProbability) * 100).toFixed(1)}pp).
                          The forecast is primarily shaped by constraint resolution rather than signal evidence.
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Signal-only probability:</span>
                            <span className="font-semibold text-cyan-300">{Math.round(gateDomination.unconstrainedProbability * 100)}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">After constraints:</span>
                            <span className="font-semibold text-amber-300">{Math.round(gateDomination.constrainedProbability * 100)}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Readiness:</span>
                            <span className="font-semibold text-emerald-300">{Math.round(readinessScore * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!gateDomination?.gateDominated && readinessScore < 1.0 && (
                    <div className="rounded-2xl border border-white/10 bg-[#0A1736]/40 p-4 flex items-center gap-3">
                      <div className="text-xs text-slate-400">
                        <span className="font-medium text-slate-300">Readiness Score:</span>{" "}
                        <span className={readinessScore >= 0.7 ? "text-emerald-400" : readinessScore >= 0.4 ? "text-amber-400" : "text-red-400"}>
                          {Math.round(readinessScore * 100)}%
                        </span>
                        <span className="ml-2 text-slate-500">
                          {readinessScore >= 0.7 ? "Constraints largely resolved" : readinessScore >= 0.4 ? "Some constraints remain" : "Significant constraints unresolved"}
                        </span>
                      </div>
                    </div>
                  )}

                  <details className="rounded-2xl border border-white/10 bg-[#0A1736]/60 overflow-hidden" data-testid="judgment-audit-block">
                    <summary className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-200 select-none">
                      Judgment Audit Trail
                    </summary>
                    <div className="px-5 pb-4 space-y-4 text-xs text-slate-300">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Prior</div>
                          <div className="text-base font-bold text-slate-100">{audit.inputs.priorPct}%</div>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Brand Outlook (Pre-Gate)</div>
                          <div className="text-base font-bold text-cyan-300">{audit.inputs.brandOutlookPct}%</div>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Min Gate Cap</div>
                          <div className="text-base font-bold text-amber-300">{audit.inputs.minGateCapPct}%</div>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Final Forecast</div>
                          <div className="text-base font-bold text-emerald-300">{audit.inputs.finalForecastPct}%</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Constraint Gap</div>
                          <div className="text-base font-bold text-red-300">{audit.inputs.executionGapPts} pts</div>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Confidence</div>
                          <div className="text-base font-bold">{confidence}</div>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Upward Drivers</div>
                          <div className="text-base font-bold text-green-300">{audit.inputs.upwardDriverCount}</div>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Downward Drivers</div>
                          <div className="text-base font-bold text-red-300">{audit.inputs.downwardDriverCount}</div>
                        </div>
                      </div>

                      {audit.inputs.topPositiveDrivers.length > 0 && (
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Top Positive Drivers</div>
                          <div className="text-sm text-green-300">{audit.inputs.topPositiveDrivers.join(", ")}</div>
                        </div>
                      )}
                      {audit.inputs.topNegativeDrivers.length > 0 && (
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Top Negative Drivers</div>
                          <div className="text-sm text-red-300">{audit.inputs.topNegativeDrivers.join(", ")}</div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {audit.inputs.gateStates.map((g) => (
                          <div key={g.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{g.label}</div>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${g.status === "strong" ? "text-green-400" : g.status === "moderate" ? "text-amber-400" : "text-red-400"}`}>
                                {g.status.toUpperCase()}
                              </span>
                              <span className="text-slate-400">→ caps at ≤{g.capPct}%</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Confidence Breakdown</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                          <div>Gate Resolution: <span className="font-bold text-slate-100">+{audit.confidenceAudit.gateResolutionScore}</span></div>
                          <div>Analog Evidence: <span className="font-bold text-slate-100">+{audit.confidenceAudit.analogScore}</span></div>
                          <div>Convergence: <span className="font-bold text-slate-100">+{audit.confidenceAudit.convergenceScore}</span></div>
                          <div>Gate Count: <span className="font-bold text-slate-100">+{audit.confidenceAudit.gateCountScore}</span></div>
                          {audit.confidenceAudit.gapPenalty > 0 && <div>Gap Penalty: <span className="font-bold text-red-400">-{audit.confidenceAudit.gapPenalty}</span></div>}
                          {audit.confidenceAudit.conflictPenalty > 0 && <div>Conflict Penalty: <span className="font-bold text-red-400">-{audit.confidenceAudit.conflictPenalty}</span></div>}
                          <div>Raw Total: <span className="font-bold text-slate-100">{audit.confidenceAudit.rawTotal}</span> → <span className="font-bold">{audit.confidenceAudit.finalLevel}</span></div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Outcome Rule</div>
                        <div className="text-xs">
                          <span className="text-slate-400">Category:</span> <span className="text-slate-100">{audit.outcomeAudit.questionCategory}</span>
                          <span className="mx-2 text-slate-600">|</span>
                          <span className="text-slate-400">Band:</span> <span className="text-slate-100">{audit.outcomeAudit.probabilityBand}</span>
                          <span className="mx-2 text-slate-600">|</span>
                          <span className="text-slate-400">Rule:</span> <span className="text-slate-100">{audit.outcomeAudit.ruleTriggered}</span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Decision Posture Rule</div>
                        <div className="text-xs">
                          <span className="text-slate-400">Case Type:</span> <span className="text-slate-100">{audit.postureAudit.caseType}</span>
                          <span className="mx-2 text-slate-600">|</span>
                          <span className="text-slate-400">Rule:</span> <span className="text-slate-100">{audit.postureAudit.ruleTriggered}</span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">Integrity Checks</div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${audit.integrityPassed ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
                            {audit.integrityPassed ? "ALL PASSED" : "CORRECTIONS APPLIED"}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {audit.integrityChecks.map((check, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className={check.passed ? "text-green-400" : "text-red-400"}>{check.passed ? "✓" : "✗"}</span>
                              <span className="text-slate-400">{check.rule.replace(/_/g, " ")}</span>
                              {!check.passed && <span className="text-red-300 text-[10px]">— {check.detail}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>

                  <ForecastMeaningPanel
                    interpretation={judgmentResult.reasoning}
                    weakestGate={decomp!.event_gates.sort((a, b) => {
                      const rank: Record<string, number> = { unresolved: 0, weak: 1, moderate: 2, strong: 3 };
                      return (rank[a.status] ?? 0) - (rank[b.status] ?? 0);
                    })[0]}
                    strongestUnresolved={(() => {
                      const uw = decomp!.event_gates.filter(g => g.status === "unresolved" || g.status === "weak");
                      return uw.length > 0
                        ? [...uw].sort((a, b) => (b.constrains_probability_to ?? 0) - (a.constrains_probability_to ?? 0))[0]
                        : decomp!.event_gates.find(g => g.status === "moderate") || decomp!.event_gates[0];
                    })()}
                    brandPct={brandPct}
                  />

                  {drivers.length > 0 && (
                    <DriverContributionBreakdown drivers={drivers} totalShift={totalShiftPts} upsideTotal={upsideTotal} downsideTotal={downsideTotal} />
                  )}

                  <div className="grid grid-cols-12 gap-4">
                    <InfoCard
                      title="Most Sensitive Gate"
                      value={topGateDriver?.primaryDriver || "\u2014"}
                      body={topGateDriver ? `${topGateDriver.name}: ${topGateDriver.delta > 0 ? "+" : ""}${topGateDriver.delta} pts potential impact` : "No gate scenarios identified."}
                    />
                    <InfoCard
                      title="Total Upward Pressure"
                      value={`+${gateUpside} pts`}
                      body="Combined estimated upside if constraining gates are resolved."
                    />
                    <InfoCard
                      title="Total Downward Pressure"
                      value={`-${gateDownside} pts`}
                      body="Combined estimated downside if strong gates regress."
                    />
                  </div>

                  <DecisionLabSummary
                    brandOutlookPct={brandPct}
                    finalForecastPct={finalPct}
                    executionGap={executionGapPts}
                    gates={decomp!.event_gates}
                    drivers={drivers}
                    upsideTotal={upsideTotal}
                    downsideTotal={downsideTotal}
                    topGateDriverName={topGateDriver?.primaryDriver || null}
                    topGateDriverDelta={topGateDriver?.delta || 0}
                  />
                </>
              );
            })()}

            {!hasGates && ( <>
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
                      <div className="mt-2 text-[10px] text-slate-600">Engine v1 · Probability Model</div>
                    </div>
                  </div>

                  <div className="col-span-12 xl:col-span-8 space-y-4">
                    <div className="grid grid-cols-12 gap-4">
                      <InfoCard
                        title="Most Sensitive Driver"
                        value={topDriver?.name || "—"}
                        body={topDriver ? `Largest estimated movement: ${topDriver.contributionPoints > 0 ? "+" : ""}${topDriver.contributionPoints} points` : "No drivers identified yet."}
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
                  </div>
                </div>
              </div>

              {drivers.length > 0 && (
                <DriverContributionBreakdown drivers={drivers} totalShift={totalShiftPts} upsideTotal={upsideTotal} downsideTotal={downsideTotal} />
              )}
            </> )}

            <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-5">
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

            <CalibrationChecksPanel data={(f as any)._calibrationChecks} />
          </>
        );
      })()}

      {interpretation && (
        <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
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

      <CaseComparatorPanel
        question={activeQuestion?.text || ""}
        brand={activeQuestion?.subject}
        therapeuticArea={typeof window !== "undefined" ? localStorage.getItem("cios.therapeuticArea") || undefined : undefined}
        signals={f?.signals?.map((s: any) => ({ text: s.name || s.text, direction: s.direction || "neutral" }))}
        context={`Therapeutic area: ${activeQuestion?.subject || "unspecified"}. Current probability: ${f?.currentProbability ? Math.round(f.currentProbability * 100) : "unknown"}%.`}
      />

      <IntegrityPanel
        question={activeQuestion?.text || ""}
        probability={f?.currentProbability ? Math.round(f.currentProbability * 100) : undefined}
        signals={f?.signals?.map((s: any) => ({
          text: s.name || s.text,
          direction: s.direction || "neutral",
          strength: s.strength || "Medium",
          confidence: s.reliability || s.confidence || "Probable",
        }))}
        gates={f?.eventDecomposition?.event_gates?.map((g: any) => ({
          label: g.gate_label || g.label,
          status: g.status || "open",
          constrains_to: typeof g.constrains_probability_to === "number" ? Math.round(g.constrains_probability_to * 100) : 100,
        }))}
        judgment={f?.judgment ? {
          headline: f.judgment.headline,
          narrative: f.judgment.narrative,
          recommendation: f.judgment.recommendation,
          confidenceLevel: f.judgment.confidence_level,
        } : undefined}
      />

      <BottomLinks forecastData={f} />
    </>
  );
}

function ScenarioPlanningTab({ activeQuestion }: { activeQuestion: any }) {
  const caseId = activeQuestion?.caseId || "";

  if (!activeQuestion || !caseId) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <h3 className="text-2xl font-semibold tracking-tight text-white">Scenario Planning</h3>
        <p className="mt-2 text-slate-300">Link a case and run the forecast to generate gate-driven scenarios.</p>
      </div>
    );
  }

  let decomp: { event_gates: EventGate[]; brand_outlook_probability: number; constrained_probability: number } | null = null;
  try {
    const raw = localStorage.getItem(`cios.eventDecomposition:${caseId}`);
    if (raw) decomp = JSON.parse(raw);
  } catch {}

  if (!decomp || !decomp.event_gates || decomp.event_gates.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <h3 className="text-2xl font-semibold tracking-tight text-white">Scenario Planning</h3>
        <p className="mt-2 text-slate-300">
          Run the forecast on the Current Forecast tab first. Scenarios are generated from forecast event gates.
        </p>
      </div>
    );
  }

  const gates = decomp.event_gates;
  const brandOutlook = decomp.brand_outlook_probability ?? 0.5;
  const thresholdStr = activeQuestion?.threshold || null;
  const baseProbability = computeConstrainedProbability(gates, brandOutlook, thresholdStr);
  const basePct = Math.round(baseProbability * 100);
  const scenarios = generateGateScenarios(gates, brandOutlook, thresholdStr);

  const gateStatusColor: Record<string, string> = {
    strong: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
    moderate: "text-amber-400 bg-amber-500/15 border-amber-500/30",
    weak: "text-red-400 bg-red-500/15 border-red-500/30",
    unresolved: "text-slate-400 bg-slate-500/15 border-slate-500/30",
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <h3 className="text-2xl font-semibold tracking-tight text-white">Scenario Planning</h3>
        <p className="mt-2 text-slate-300">
          Each scenario modifies one or more gate states and recalculates the forecast. No narratives — only gate-driven forecast changes.
        </p>

        <div className="mt-5 flex items-center gap-4 text-xs text-slate-400">
          <span>Base Forecast: <span className="text-white font-semibold">{basePct}%</span></span>
          <span>Gates: {gates.length}</span>
          <span>Brand Outlook: {Math.round(brandOutlook * 100)}%</span>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-4">Current Gate Profile</div>
        <div className="flex flex-wrap gap-3">
          {gates.map(gate => (
            <div key={gate.gate_id} className={`rounded-xl border px-3 py-2 ${gateStatusColor[gate.status] || gateStatusColor.unresolved}`}>
              <div className="text-xs font-semibold">{gate.gate_label}</div>
              <div className="text-[10px] opacity-80 uppercase font-bold mt-0.5">{gate.status} · caps at {Math.round(gate.constrains_probability_to * 100)}%</div>
            </div>
          ))}
        </div>
      </div>

      {scenarios.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6 text-center">
          <p className="text-sm text-slate-400">No counterfactual scenarios available — all gates are at the same status level.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {scenarios.map(scenario => {
            const isUpside = scenario.delta > 0;
            const borderColor = isUpside ? "border-emerald-500/20" : "border-red-500/20";
            const deltaColor = isUpside ? "text-emerald-400" : "text-red-400";
            const bgColor = isUpside ? "bg-emerald-500/5" : "bg-red-500/5";
            const isComposite = scenario.gateChanges.length > 1;

            return (
              <div key={scenario.id} className={`rounded-3xl border ${borderColor} bg-[#0A1736] p-5`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-white">{scenario.name}</div>
                      {isComposite && (
                        <span className="rounded-full bg-blue-500/10 border border-blue-400/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                          COMPOSITE
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{scenario.description}</div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-center">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Base</div>
                      <div className="text-lg font-semibold text-slate-400">{scenario.baseProbability}%</div>
                    </div>
                    <div className="text-slate-600">→</div>
                    <div className="text-center">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">New</div>
                      <div className="text-lg font-semibold text-white">{scenario.newProbability}%</div>
                    </div>
                    <div className={`rounded-xl ${bgColor} border ${borderColor} px-3 py-2 text-center min-w-[70px]`}>
                      <div className={`text-lg font-bold ${deltaColor}`}>
                        {isUpside ? "+" : ""}{scenario.delta}
                      </div>
                      <div className="text-[10px] text-slate-500">pts</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {scenario.gateChanges.map(change => {
                    const fromColor = gateStatusColor[change.from] || gateStatusColor.unresolved;
                    const toColor = gateStatusColor[change.to] || gateStatusColor.unresolved;
                    const gateObj = gates.find(g => g.gate_id === change.gate_id);
                    return (
                      <div key={change.gate_id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                        <span className="text-xs text-slate-300 font-medium">{gateObj?.gate_label || change.gate_id}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${fromColor}`}>{change.from}</span>
                        <span className="text-slate-600 text-xs">→</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${toColor}`}>{change.to}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
                  <span>Driver:</span>
                  <span className="text-slate-300 font-medium">{scenario.primaryDriver}</span>
                </div>
              </div>
            );
          })}
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
  const drivers = useDriversFromForecast(forecast, caseId);

  const topDriver = drivers[0];

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-12 flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
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
              <div className="col-span-4 md:col-span-2 text-sm font-semibold text-white" title={`This signal ${driver.probabilityImpact > 0 ? "adds" : "removes"} ${Math.abs(driver.probabilityImpact)} percentage points ${driver.probabilityImpact > 0 ? "to" : "from"} the forecast because of its strength (${driver.strength}) and direction (${driver.direction})`}>
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
              This driver has the biggest effect on where the forecast lands. If this factor changes — positively or negatively — the probability will move more than from any other single signal.
            </p>
          </div>
        </div>

        <div className="col-span-12 xl:col-span-7 rounded-3xl border border-white/10 bg-[#0A1736] p-6">
          <div className="text-sm font-medium text-slate-300">Driver Summary</div>
          <div className="mt-4 space-y-3">
            {drivers.slice(0, 5).map(d => (
              <div key={d.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="text-sm text-white font-medium">{d.name}</div>
                <div className="flex items-center gap-3">
                  <span className={cn("text-sm font-medium", directionTextClass[d.direction])}>
                    {directionArrow[d.direction]} {d.probabilityImpact > 0 ? "+" : ""}{d.probabilityImpact} pts
                  </span>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", strengthBadgeClass[d.strength])}>
                    {d.strength}
                  </span>
                </div>
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
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
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

const InfoCard = memo(function InfoCard({ title, value, body }: { title: string; value: string; body: string }) {
  return (
    <div className="col-span-12 rounded-3xl border border-white/10 bg-white/[0.02] p-5 md:col-span-4">
      <div className="text-sm font-medium text-slate-300">{title}</div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-white">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
});

function BottomLinks({ forecastData }: { forecastData?: any }) {
  const gl = forecastData?._guardrailLog;
  const stateHash = forecastData?._stateHash;
  return (
    <>
      <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
        <div className="text-sm font-semibold text-white">What comes next</div>
        <div className="mt-2 text-sm text-slate-300">
          Once the forecast is visible, the next layer converts each unresolved gate into an executable action
          with an owner, timeline, resolution metric, and forecast effect.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Priority Actions", "Owner Assignment", "Timeline", "Resolution Metrics", "Forecast Impact"].map((item) => (
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
          <Link href="/reference-cases" className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.05]">Reference Cases</Link>
          <Link href="/calibration" className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.05]">Calibration</Link>
          <Link href="/adoption-segments" className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.05]">Adoption Segments</Link>
          <Link href="/barrier-diagnosis" className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.05]">Progress Blockers</Link>
          <Link href="/case-feedback" className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.05]">Case Feedback</Link>
          <Link href="/readiness-timeline" className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.05]">Readiness Timeline</Link>
          <Link href="/workbench" className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 hover:bg-white/[0.05]">Workbench</Link>
        </div>
      </div>

      {gl && (() => {
        const d = gl.diagnostics;
        return (
          <details className="rounded-3xl border border-slate-700/50 bg-[#060E24] p-4">
            <summary className="cursor-pointer text-xs font-mono text-slate-500 select-none">Engine Diagnostics</summary>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono">
              <div className="text-slate-500">Drivers</div>
              <div className="text-slate-300">{d?.driver_count ?? "—"}</div>
              <div className="text-slate-500">Duplicates detected</div>
              <div className={`${(d?.duplicate_drivers_detected ?? 0) > 0 ? "text-amber-400" : "text-slate-300"}`}>{d?.duplicate_drivers_detected ?? 0}</div>
              <div className="text-slate-500">Largest single shift</div>
              <div className={`${(d?.largest_single_shift ?? 0) > 15 ? "text-red-400" : "text-slate-300"}`}>{d?.largest_single_shift ?? 0} pp</div>
              <div className="text-slate-500">Total shift</div>
              <div className={`${(d?.total_shift ?? 0) > 40 ? "text-red-400" : "text-slate-300"}`}>{d?.total_shift ?? 0} pp</div>
              <div className="text-slate-500">Shift capped</div>
              <div className="text-slate-300">{gl.driver_shift_capped?.length > 0 ? `Yes (${gl.driver_shift_capped.length} drivers)` : "No"}</div>
              <div className="text-slate-500">Total shift normalized</div>
              <div className={`${gl.total_shift_normalized ? "text-amber-400" : "text-slate-300"}`}>{gl.total_shift_normalized ? "Yes" : "No"}</div>
              <div className="text-slate-500">Gate constraints triggered</div>
              <div className={`${gl.probability_limited_by_gate ? "text-red-400" : "text-slate-300"}`}>
                {gl.probability_limited_by_gate ? `Yes (${(d?.gating_constraints_triggered ?? []).join(", ")})` : "No"}
              </div>
              <div className="text-slate-500">Relevance penalties</div>
              <div className="text-slate-300">{gl.relevance_penalty_applied?.length > 0 ? `${gl.relevance_penalty_applied.length} signals` : "None"}</div>
              <div className="text-slate-500">Recalc skipped (cached)</div>
              <div className="text-slate-300">{gl.recalculation_skipped ? "Yes" : "No"}</div>
              <div className="text-slate-500">State hash</div>
              <div className="text-slate-400 truncate">{stateHash ?? "—"}</div>
              {d?.final_probability_limit_reason && (
                <>
                  <div className="text-slate-500">Limit reason</div>
                  <div className="text-red-400 col-span-1">{d.final_probability_limit_reason}</div>
                </>
              )}
              {gl.input_validation_errors?.length > 0 && (
                <>
                  <div className="text-slate-500">Validation errors</div>
                  <div className="text-red-400 col-span-1">{gl.input_validation_errors.join("; ")}</div>
                </>
              )}
            </div>
          </details>
        );
      })()}
    </>
  );
}
