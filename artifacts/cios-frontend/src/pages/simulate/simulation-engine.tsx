import { useState, useEffect } from "react";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  Loader2,
  AlertTriangle,
  Play,
  ArrowUp,
  ArrowDown,
  Minus,
  TrendingUp,
  TrendingDown,
  BarChart3,
  History,
  ChevronDown,
  ChevronRight,
  Zap,
  Shield,
  Target,
  Activity,
  Layers,
  Scale,
  Users,
} from "lucide-react";

interface ScenarioOption {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface ModifiedVariable {
  variableName: string;
  originalValue: number;
  simulatedValue: number;
  modificationReason: string;
}

interface FeasibilitySnapshot {
  score: number;
  tier: string;
  nearTermPotential: number;
  mediumTermPotential: number;
}

interface ReadinessSnapshot {
  overallScore: number;
  blockedCount: number;
  onTrackCount: number;
}

interface SegmentShift {
  segmentName: string;
  segmentType: string;
  baselineAdoption: number;
  simulatedAdoption: number;
  baselineTier: string;
  simulatedTier: string;
  movementDirection: "upward" | "stable" | "decline" | "newly_activated";
  shiftMagnitude: number;
}

interface SimulationResponse {
  simulation: {
    simulationId: string;
    scenarioName: string;
    scenarioCategory: string;
    confidenceLevel: string;
    impactDirection: string;
    impactMagnitude: number;
    rationaleSummary: string;
    primaryShiftDrivers: string[];
    primaryShiftConstraints: string[];
  };
  baseline: {
    posterior: number;
    feasibility: FeasibilitySnapshot;
    readiness: ReadinessSnapshot;
    segmentCount: number;
    barrierCount: number;
    readinessMilestoneCount: number;
    competitiveRiskCount: number;
  };
  simulated: {
    posterior: number;
    feasibility: FeasibilitySnapshot;
    readiness: ReadinessSnapshot;
  };
  deltas: {
    posteriorDelta: number;
    feasibilityDelta: number;
    readinessDelta: number;
  };
  segmentShifts: SegmentShift[];
  modifiedVariables: ModifiedVariable[];
}

interface HistoryEntry {
  id: string;
  simulationId: string;
  scenarioName: string;
  scenarioType: string;
  scenarioCategory: string;
  baselinePosterior: number;
  simulatedPosterior: number;
  impactDirection: string;
  impactMagnitude: number;
  createdAt: string;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

const CATEGORY_ICONS: Record<string, typeof Zap> = {
  access: Shield,
  workflow: Activity,
  guideline: Target,
  kol: Users,
  competitive: Scale,
  barrier: Layers,
  segment: BarChart3,
};

const CATEGORY_COLORS: Record<string, string> = {
  access: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  workflow: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  guideline: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  kol: "text-violet-400 bg-violet-400/10 border-violet-400/30",
  competitive: "text-rose-400 bg-rose-400/10 border-rose-400/30",
  barrier: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  segment: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
};

function tierLabel(tier: string): string {
  return tier.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function tierColor(tier: string): string {
  if (tier.includes("high")) return "text-emerald-400";
  if (tier.includes("moderate")) return "text-amber-400";
  if (tier.includes("constrained")) return "text-orange-400";
  if (tier.includes("blocked")) return "text-rose-400";
  return "text-muted-foreground";
}

function directionIcon(dir: string) {
  if (dir === "upward" || dir === "newly_activated") return <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (dir === "decline") return <ArrowDown className="w-3.5 h-3.5 text-rose-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground/50" />;
}

function directionBadge(dir: string) {
  const styles: Record<string, string> = {
    upward: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    newly_activated: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
    decline: "text-rose-400 bg-rose-400/10 border-rose-400/30",
    stable: "text-muted-foreground/60 bg-muted/10 border-muted/30",
  };
  const labels: Record<string, string> = {
    upward: "Upward",
    newly_activated: "Newly Activated",
    decline: "Decline",
    stable: "Stable",
  };
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${styles[dir] || styles.stable}`}>
      {labels[dir] || dir}
    </span>
  );
}

function DeltaIndicator({ value, suffix = "pp", invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const display = (value * 100).toFixed(1);
  const isPositive = invert ? value < 0 : value > 0;
  const isNegative = invert ? value > 0 : value < 0;
  return (
    <span className={`text-sm font-bold ${isPositive ? "text-emerald-400" : isNegative ? "text-rose-400" : "text-muted-foreground/60"}`}>
      {value > 0 ? "+" : ""}{display}{suffix}
    </span>
  );
}

function BarComparison({ label, baseline, simulated, format = "pct" }: {
  label: string;
  baseline: number;
  simulated: number;
  format?: "pct" | "score";
}) {
  const bPct = Math.max(0, Math.min(100, baseline * 100));
  const sPct = Math.max(0, Math.min(100, simulated * 100));
  const delta = simulated - baseline;
  const displayBase = format === "pct" ? `${bPct.toFixed(1)}%` : baseline.toFixed(3);
  const displaySim = format === "pct" ? `${sPct.toFixed(1)}%` : simulated.toFixed(3);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
        <DeltaIndicator value={delta} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground/60 w-14 shrink-0">Baseline</span>
          <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden">
            <div className="h-full bg-muted-foreground/30 rounded-full" style={{ width: `${bPct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground w-12 text-right">{displayBase}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground/60 w-14 shrink-0">Simulated</span>
          <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${delta > 0.005 ? "bg-emerald-500" : delta < -0.005 ? "bg-rose-500" : "bg-muted-foreground/40"}`}
              style={{ width: `${sPct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground w-12 text-right">{displaySim}</span>
        </div>
      </div>
    </div>
  );
}

export default function SimulationEnginePage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(true);

  const caseId = activeQuestion?.caseId || activeQuestion?.id || "";

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${getApiBase()}/simulation/scenarios`);
        if (res.ok) {
          const data = await res.json();
          setScenarios(data.scenarios || []);
        }
      } catch {}
      setLoadingScenarios(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!caseId) return;
    async function loadHistory() {
      try {
        const res = await fetch(`${getApiBase()}/simulation/cases/${caseId}/history`);
        if (res.ok) {
          const data = await res.json();
          setHistory(data.simulations || []);
        }
      } catch {}
    }
    loadHistory();
  }, [caseId]);

  async function runSimulation() {
    if (!caseId || !selectedScenario) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${getApiBase()}/simulation/cases/${caseId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: selectedScenario }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }

      const data: SimulationResponse = await res.json();
      setResult(data);

      const histRes = await fetch(`${getApiBase()}/simulation/cases/${caseId}/history`);
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData.simulations || []);
      }
    } catch (err: any) {
      setError(err.message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setSelectedScenario(null);
    setError(null);
    setShowVariables(false);
  }

  const categories = Array.from(new Set(scenarios.map(s => s.category)));
  const scenariosByCategory = categories.map(cat => ({
    category: cat,
    scenarios: scenarios.filter(s => s.category === cat),
  }));

  const selectedScenarioObj = scenarios.find(s => s.id === selectedScenario);

  return (
    <WorkflowLayout currentStep="simulate" activeQuestion={activeQuestion} onClearQuestion={clearQuestion}>
      <QuestionGate activeQuestion={activeQuestion}>
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Simulation Engine</p>
              <h1 className="text-xl font-bold text-foreground">Scenario Simulation</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Recompute forecast outcomes under controlled scenario changes. Baseline data is never modified.
              </p>
            </div>
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition"
              >
                <History className="w-3.5 h-3.5" />
                History ({history.length})
              </button>
            )}
          </div>

          {showHistory && history.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border/50">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Simulation History</span>
              </div>
              <div className="divide-y divide-border/30">
                {history.slice().reverse().slice(0, 10).map((h) => (
                  <div key={h.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{h.scenarioName}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(h.createdAt).toLocaleString()} · {h.simulationId}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold ${
                        h.impactDirection === "positive" ? "text-emerald-400" :
                        h.impactDirection === "negative" ? "text-rose-400" : "text-muted-foreground/60"
                      }`}>
                        {h.impactDirection === "positive" ? "+" : ""}{((h.simulatedPosterior - h.baselinePosterior) * 100).toFixed(1)}pp
                      </span>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${CATEGORY_COLORS[h.scenarioCategory] || ""}`}>
                        {h.scenarioCategory}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!result && !loading && (
            <div className="space-y-6">
              {loadingScenarios ? (
                <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading scenarios...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Select Scenario</h2>
                  {scenariosByCategory.map(({ category, scenarios: catScenarios }) => {
                    const Icon = CATEGORY_ICONS[category] || Zap;
                    const colorClass = CATEGORY_COLORS[category] || "";
                    return (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={`w-3.5 h-3.5 ${colorClass.split(" ")[0]}`} />
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${colorClass.split(" ")[0]}`}>
                            {category}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {catScenarios.map(sc => {
                            const selected = selectedScenario === sc.id;
                            return (
                              <button
                                key={sc.id}
                                onClick={() => setSelectedScenario(sc.id)}
                                className={`text-left rounded-xl border px-4 py-3 transition ${
                                  selected
                                    ? `border-primary bg-primary/10`
                                    : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                                }`}
                              >
                                <p className={`text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>
                                  {sc.name}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                                  {sc.description}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedScenarioObj && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold text-primary">{selectedScenarioObj.name}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${CATEGORY_COLORS[selectedScenarioObj.category] || ""}`}>
                      {selectedScenarioObj.category}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">{selectedScenarioObj.description}</p>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-400">{error}</p>
                </div>
              )}

              <button
                onClick={runSimulation}
                disabled={!selectedScenario || !caseId}
                className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  selectedScenario && caseId
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted/20 text-muted-foreground cursor-not-allowed"
                }`}
              >
                <Play className="w-4 h-4" />
                Run Simulation
              </button>
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Running {selectedScenarioObj?.name || "scenario"} simulation...
              </p>
              <p className="text-[11px] text-muted-foreground/60">
                Modifying variables, recomputing feasibility, and detecting segment shifts
              </p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-foreground">{result.simulation.scenarioName}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${CATEGORY_COLORS[result.simulation.scenarioCategory] || ""}`}>
                    {result.simulation.scenarioCategory}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${
                    result.simulation.impactDirection === "positive" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" :
                    result.simulation.impactDirection === "negative" ? "text-rose-400 bg-rose-400/10 border-rose-400/30" :
                    "text-muted-foreground/60 bg-muted/10 border-muted/30"
                  }`}>
                    {result.simulation.impactDirection}
                  </span>
                </div>
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition"
                >
                  New Simulation
                </button>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-widest font-bold mb-3">Impact Summary</p>
                <p className="text-[13px] text-foreground leading-relaxed">{result.simulation.rationaleSummary}</p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5 rounded-lg bg-muted/10 px-3 py-1.5">
                    <span className="text-[10px] text-muted-foreground">Confidence:</span>
                    <span className={`text-[11px] font-bold ${
                      result.simulation.confidenceLevel === "High" ? "text-emerald-400" :
                      result.simulation.confidenceLevel === "Moderate" ? "text-amber-400" : "text-rose-400"
                    }`}>
                      {result.simulation.confidenceLevel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-muted/10 px-3 py-1.5">
                    <span className="text-[10px] text-muted-foreground">Variables Modified:</span>
                    <span className="text-[11px] font-bold text-foreground">{result.modifiedVariables.length}</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-muted/10 px-3 py-1.5">
                    <span className="text-[10px] text-muted-foreground">Segments Affected:</span>
                    <span className="text-[11px] font-bold text-foreground">
                      {result.segmentShifts.filter(s => s.movementDirection !== "stable").length} / {result.segmentShifts.length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold mb-1">Probability</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">
                      {(result.simulated.posterior * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground/60">from {(result.baseline.posterior * 100).toFixed(1)}%</span>
                    <DeltaIndicator value={result.deltas.posteriorDelta} />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold mb-1">Feasibility</p>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xl font-bold ${tierColor(result.simulated.feasibility.tier)}`}>
                      {tierLabel(result.simulated.feasibility.tier)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground/60">
                      from {tierLabel(result.baseline.feasibility.tier)}
                    </span>
                    <DeltaIndicator value={result.deltas.feasibilityDelta} />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold mb-1">Readiness</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold text-foreground">
                      {(result.simulated.readiness.overallScore * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground/60">
                      from {(result.baseline.readiness.overallScore * 100).toFixed(1)}%
                    </span>
                    <DeltaIndicator value={result.deltas.readinessDelta} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold">Baseline vs Simulated</p>
                  <BarComparison
                    label="Probability"
                    baseline={result.baseline.posterior}
                    simulated={result.simulated.posterior}
                  />
                  <BarComparison
                    label="Feasibility Score"
                    baseline={result.baseline.feasibility.score}
                    simulated={result.simulated.feasibility.score}
                  />
                  <BarComparison
                    label="Near-Term Potential"
                    baseline={result.baseline.feasibility.nearTermPotential}
                    simulated={result.simulated.feasibility.nearTermPotential}
                  />
                  <BarComparison
                    label="Medium-Term Potential"
                    baseline={result.baseline.feasibility.mediumTermPotential}
                    simulated={result.simulated.feasibility.mediumTermPotential}
                  />
                  <BarComparison
                    label="Readiness"
                    baseline={result.baseline.readiness.overallScore}
                    simulated={result.simulated.readiness.overallScore}
                  />
                </div>

                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold">Drivers & Constraints</p>

                  {result.simulation.primaryShiftDrivers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Drivers</span>
                      </div>
                      {result.simulation.primaryShiftDrivers.map((d, i) => (
                        <p key={i} className="text-[12px] text-foreground leading-relaxed ml-5 mb-1">{d}</p>
                      ))}
                    </div>
                  )}

                  {result.simulation.primaryShiftConstraints.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Constraints</span>
                      </div>
                      {result.simulation.primaryShiftConstraints.map((c, i) => (
                        <p key={i} className="text-[12px] text-foreground leading-relaxed ml-5 mb-1">{c}</p>
                      ))}
                    </div>
                  )}

                  {result.simulation.primaryShiftDrivers.length === 0 && result.simulation.primaryShiftConstraints.length === 0 && (
                    <p className="text-[12px] text-muted-foreground/60 italic">No significant drivers or constraints detected</p>
                  )}

                  <div className="border-t border-border/30 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/10 p-3">
                        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">Blocked Milestones</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-bold text-rose-400">{result.simulated.readiness.blockedCount}</span>
                          <span className="text-[10px] text-muted-foreground/40">
                            (was {result.baseline.readiness.blockedCount})
                          </span>
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/10 p-3">
                        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">On-Track Milestones</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-bold text-emerald-400">{result.simulated.readiness.onTrackCount}</span>
                          <span className="text-[10px] text-muted-foreground/40">
                            (was {result.baseline.readiness.onTrackCount})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Segment Shifts
                    </span>
                    <div className="flex items-center gap-3">
                      {result.segmentShifts.filter(s => s.movementDirection === "upward" || s.movementDirection === "newly_activated").length > 0 && (
                        <span className="text-[10px] text-emerald-400">
                          {result.segmentShifts.filter(s => s.movementDirection === "upward" || s.movementDirection === "newly_activated").length} up
                        </span>
                      )}
                      {result.segmentShifts.filter(s => s.movementDirection === "decline").length > 0 && (
                        <span className="text-[10px] text-rose-400">
                          {result.segmentShifts.filter(s => s.movementDirection === "decline").length} down
                        </span>
                      )}
                      {result.segmentShifts.filter(s => s.movementDirection === "stable").length > 0 && (
                        <span className="text-[10px] text-muted-foreground/50">
                          {result.segmentShifts.filter(s => s.movementDirection === "stable").length} stable
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-border/30">
                  {result.segmentShifts
                    .sort((a, b) => Math.abs(b.shiftMagnitude) - Math.abs(a.shiftMagnitude))
                    .map((seg, i) => (
                    <div key={i} className="px-5 py-3 flex items-center gap-4">
                      <div className="shrink-0">{directionIcon(seg.movementDirection)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{seg.segmentName}</span>
                          {directionBadge(seg.movementDirection)}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-muted-foreground/60">
                            {(seg.baselineAdoption * 100).toFixed(1)}% → {(seg.simulatedAdoption * 100).toFixed(1)}%
                          </span>
                          {seg.shiftMagnitude > 0.001 && (
                            <DeltaIndicator value={seg.simulatedAdoption - seg.baselineAdoption} />
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 w-24">
                        <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden relative">
                          <div
                            className="absolute h-full bg-muted-foreground/30 rounded-full"
                            style={{ width: `${seg.baselineAdoption * 100}%` }}
                          />
                          <div
                            className={`absolute h-full rounded-full ${
                              seg.movementDirection === "upward" || seg.movementDirection === "newly_activated"
                                ? "bg-emerald-500"
                                : seg.movementDirection === "decline"
                                ? "bg-rose-500"
                                : "bg-muted-foreground/40"
                            }`}
                            style={{ width: `${seg.simulatedAdoption * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {result.modifiedVariables.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setShowVariables(!showVariables)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/10 transition"
                  >
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Modified Variables ({result.modifiedVariables.length})
                    </span>
                    {showVariables ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {showVariables && (
                    <div className="px-5 pb-4 space-y-1.5 max-h-80 overflow-y-auto">
                      {result.modifiedVariables.map((mv, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 bg-muted/5">
                          <span className="text-[11px] text-foreground font-mono truncate flex-1 mr-3">
                            {mv.variableName}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-muted-foreground">{(mv.originalValue * 100).toFixed(1)}%</span>
                            <span className="text-[10px] text-muted-foreground/40">→</span>
                            <span className={`text-[10px] font-semibold ${
                              mv.simulatedValue > mv.originalValue ? "text-emerald-400" : mv.simulatedValue < mv.originalValue ? "text-rose-400" : "text-muted-foreground"
                            }`}>
                              {(mv.simulatedValue * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </QuestionGate>
    </WorkflowLayout>
  );
}
