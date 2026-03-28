import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useRunForecast, useGetCase, useListSignals } from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { RecalculateForecastButton } from "@/components/recalculate-forecast-button";
import type { CaseSummary, ForecastDetailResponse, SignalDetail, ScenarioSimulationResponse, ScenarioSimulationRequest } from "@workspace/contracts";
import { AppLayout } from "@/components/layout";
import { cn } from "@/lib/cn";
import { Card, Badge, ProbabilityGauge, Button } from "@/components/ui-components";
import { deriveRecommendation, deriveInterpretation, deriveForecastInterpretation } from "@/lib/recommendation-adapter";
import type { ForecastInterpretation } from "@/lib/recommendation-adapter";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Radio,
  Users,
  Compass,
  Target,
  ArrowLeft,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Activity,
  Lightbulb,
  ShieldAlert,
  Zap,
  BookOpen,
  Clock,
  Eye,
  AlertCircle,
  Loader2,
} from "lucide-react";

function formatPct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

function formatPts(v: number) {
  const pts = (v * 100).toFixed(1);
  return v >= 0 ? `+${pts}` : pts;
}

function DirectionIcon({ dir }: { dir: string }) {
  if (dir === "Positive") return <TrendingUp className="w-3.5 h-3.5 text-success" />;
  if (dir === "Negative") return <TrendingDown className="w-3.5 h-3.5 text-destructive" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function impactLabel(lr: number): string {
  const abs = Math.abs(lr - 1);
  if (abs >= 0.4) return "High";
  if (abs >= 0.15) return "Medium";
  return "Low";
}

function impactBadgeVariant(label: string): "success" | "warning" | "default" {
  if (label === "High") return "success";
  if (label === "Medium") return "warning";
  return "default";
}

function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2 py-4 justify-center text-xs text-destructive/80">
      <AlertCircle className="w-3.5 h-3.5" />
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="underline hover:text-destructive transition-colors">Retry</button>
      )}
    </div>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function bandLabelColor(label: string): string {
  if (label === "Strong momentum") return "bg-success/15 text-success";
  if (label === "Favorable") return "bg-success/10 text-success/80";
  if (label === "Uncertain / developing") return "bg-warning/15 text-warning";
  if (label === "At-risk") return "bg-orange-500/15 text-orange-400";
  return "bg-destructive/15 text-destructive";
}

function ForecastInterpretationPanel({ interpretation }: { interpretation: ForecastInterpretation }) {
  return (
    <div className="mt-4 pt-3 border-t border-border/20 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className={cn(
          "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
          interpretation.priorityLabel === "execute" ? "bg-success/15 text-success" :
          interpretation.priorityLabel === "reduce-uncertainty" ? "bg-warning/15 text-warning" :
          "bg-destructive/15 text-destructive"
        )}>
          {interpretation.priority}
        </div>
        <div className={cn(
          "px-2 py-0.5 rounded text-[10px] font-medium tracking-wider",
          bandLabelColor(interpretation.probabilityBandLabel)
        )}>
          {interpretation.probabilityBandLabel}
        </div>
        <span className="text-[10px] text-muted-foreground/50">Forecast interpretation</span>
      </div>

      <p className="text-[12px] text-muted-foreground/80 leading-relaxed">{interpretation.interpretationSummary}</p>

      {interpretation.cautionNote && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-warning/8 border border-warning/15">
          <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
          <p className="text-[11px] text-warning/90 leading-relaxed">{interpretation.cautionNote}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1">
            <Zap className="w-3 h-3 text-primary" /> Next Actions
          </div>
          <div className="space-y-1">
            {interpretation.nextActions.map((action, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <ChevronRight className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                <span className="text-[11px] text-muted-foreground">{action}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1">
            <Activity className="w-3 h-3 text-accent" /> Question Refinement
          </div>
          <div className="space-y-1">
            {interpretation.questionRefinementSuggestions.map((suggestion, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <ChevronRight className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                <span className="text-[11px] text-muted-foreground">{suggestion}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuestionDetail() {
  const [, params] = useRoute("/case/:caseId/question");
  const caseId = params?.caseId ?? "";

  const { data: caseData, isLoading: loadingCase, isError: errorCase, refetch: refetchCase } = useGetCase(caseId);
  const { data: forecast, isLoading: loadingForecast, isError: errorForecast, refetch: refetchForecast } = useRunForecast(caseId);
  const { data: signals, isLoading: loadingSignals, isError: errorSignals, refetch: refetchSignals } = useListSignals(caseId);

  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const scenarioMutation = useMutation<ScenarioSimulationResponse, Error, string[]>({
    mutationFn: async (excluded) => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const body: ScenarioSimulationRequest = { excludeSignalIds: excluded };
      const res = await fetch(`${base}/api/cases/${caseId}/scenario-simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Scenario simulation failed");
      return res.json() as Promise<ScenarioSimulationResponse>;
    },
  });

  const toggleSignal = (signalId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(signalId)) next.delete(signalId);
      else next.add(signalId);
      return next;
    });
  };

  const runScenario = () => {
    scenarioMutation.mutate(Array.from(excludedIds));
  };

  const runPreset = (preset: "best" | "base" | "risk") => {
    if (preset === "base") {
      setExcludedIds(new Set());
      scenarioMutation.mutate([]);
    } else if (preset === "best") {
      const negIds = allSignals.filter((s) => s.direction === "Negative").map((s) => s.signalId);
      setExcludedIds(new Set(negIds));
      scenarioMutation.mutate(negIds);
    } else {
      const posIds = allSignals.filter((s) => s.direction === "Positive").map((s) => s.signalId);
      setExcludedIds(new Set(posIds));
      scenarioMutation.mutate(posIds);
    }
  };

  const fc = forecast as ForecastDetailResponse | undefined;
  const cd = caseData as CaseSummary | undefined;
  const allSignals = (signals || []) as SignalDetail[];

  const drivers = useMemo(() => {
    if (!fc?.signalDetails) return { positive: [] as { name: string; direction: string; lr: number; signalType: string }[], negative: [] as { name: string; direction: string; lr: number; signalType: string }[] };
    const all = fc.signalDetails
      .map((s) => ({
        name: s.signalDescription || s.signalType || "Unknown",
        direction: s.direction,
        lr: s.likelihoodRatio ?? 1,
        signalType: s.signalType ?? "",
      }))
      .sort((a, b) => Math.abs(b.lr - 1) - Math.abs(a.lr - 1));
    return {
      positive: all.filter((d) => d.direction === "Positive").slice(0, 5),
      negative: all.filter((d) => d.direction === "Negative").slice(0, 4),
    };
  }, [fc]);

  const currentProb = fc?.currentProbability ?? 0;
  const priorProb = cd?.priorProbability ?? 0;
  const changePts = currentProb - priorProb;
  const confidenceLevel = fc?.confidenceLevel ?? "Pending";

  const recommendation = useMemo(() => {
    if (!fc || !cd) return null;
    return deriveRecommendation(currentProb, priorProb, confidenceLevel);
  }, [fc, cd, currentProb, priorProb, confidenceLevel]);

  const interpretation = useMemo(() => deriveInterpretation(currentProb), [currentProb]);

  const forecastInterpretation = useMemo<ForecastInterpretation | null>(() => {
    if (!fc || !cd) return null;
    const allDrivers = [
      ...(drivers.positive || []),
      ...(drivers.negative || []),
    ];
    return deriveForecastInterpretation({
      probability: currentProb,
      prior: priorProb,
      confidence: confidenceLevel,
      keyDrivers: allDrivers,
      signalCount: allSignals.length,
      target: (cd as any).targetType ?? "market",
      timeHorizon: cd.timeHorizon || "12 months",
      geography: (cd as any).geography ?? null,
    });
  }, [fc, cd, currentProb, priorProb, confidenceLevel, drivers, allSignals.length]);

  if (loadingCase) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <Target className="w-10 h-10 text-primary animate-pulse" />
          <div className="text-muted-foreground">Loading question…</div>
        </div>
      </AppLayout>
    );
  }

  if (errorCase && !cd) {
    return (
      <AppLayout>
        <div className="text-center py-20 space-y-3">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-muted-foreground">Failed to load question.</p>
          <Button variant="ghost" onClick={() => refetchCase()}>Retry</Button>
        </div>
      </AppLayout>
    );
  }

  if (!cd) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">
          <p>Question not found.</p>
          <Link href="/dashboard">
            <Button variant="ghost" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
            </Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  const lastUpdated = cd.lastUpdate || cd.updatedAt || cd.createdAt;

  return (
    <AppLayout>
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* ── Panel 1: Question Header — compact, anchoring ─────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <nav className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
              <Link href="/dashboard">
                <button className="hover:text-foreground transition-colors">Dashboard</button>
              </Link>
              <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/40" />
              <Link href="/cases">
                <button className="hover:text-foreground transition-colors">Questions</button>
              </Link>
              <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/40" />
              <span className="text-foreground/60 line-clamp-1 max-w-[200px]">Detail</span>
            </nav>
            <h1 className="text-lg font-bold text-foreground leading-snug">{cd.strategicQuestion}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="primary">{cd.therapeuticArea || "General"}</Badge>
              <span className="text-xs text-muted-foreground">{cd.assetName || cd.primaryBrand}</span>
              {(cd as any).targetType && (cd as any).targetType !== "market" && (
                <>
                  <span className="text-xs text-muted-foreground/40">|</span>
                  <Badge variant="default">
                    <Target className="w-2.5 h-2.5 mr-0.5" />
                    {(cd as any).targetType === "specialty" ? `${(cd as any).specialty || "Specialty"}` :
                     (cd as any).targetType === "subspecialty" ? `${(cd as any).subspecialty || "Subspecialty"}` :
                     (cd as any).targetType === "institution" ? `${(cd as any).institutionName || "Institution"}` :
                     (cd as any).targetType === "physician" ? `Physician${(cd as any).targetId ? ` (${(cd as any).targetId})` : ""}` :
                     (cd as any).targetType}
                  </Badge>
                </>
              )}
              {((cd as any).institutionName && (cd as any).targetType === "physician") && (
                <span className="text-[11px] text-muted-foreground">@ {(cd as any).institutionName}</span>
              )}
              <span className="text-xs text-muted-foreground/40">|</span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {cd.timeHorizon || "12 months"}
              </span>
              <span className="text-xs text-muted-foreground/40">|</span>
              <Badge variant={confidenceLevel === "High" ? "success" : confidenceLevel === "Moderate" ? "warning" : "default"}>
                {confidenceLevel}
              </Badge>
              {lastUpdated && (
                <>
                  <span className="text-xs text-muted-foreground/40">|</span>
                  <span className="text-[11px] text-muted-foreground">
                    Updated {new Date(lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0 pt-5 flex-wrap items-start">
            <RecalculateForecastButton
              caseId={caseId}
              onComplete={() => { refetchForecast(); }}
            />
            <Link href={`/case/${caseId}/signals`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Radio className="w-3.5 h-3.5" /> Add Signals
              </Button>
            </Link>
            <Link href={`/case/${caseId}/ledger`}>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> Ledger
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Panel 2: Primary Forecast Card — HERO, biggest panel ──────────── */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-primary/6 rounded-full blur-[100px] -translate-y-1/3 translate-x-1/4 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/4 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />
          {errorForecast ? (
            <PanelError message="Failed to load forecast" onRetry={() => refetchForecast()} />
          ) : !fc ? (
            <PanelLoading label="Computing forecast…" />
          ) : (
            <div className="relative flex items-center gap-10 py-4">
              <div className="shrink-0 scale-125 origin-center">
                <ProbabilityGauge value={currentProb} label="" />
              </div>
              <div className="flex-1 space-y-4 min-w-0">
                <div>
                  <div className="text-5xl font-bold text-primary tracking-tight leading-none">{formatPct(currentProb)}</div>
                  <div className="text-sm text-muted-foreground mt-1.5">Current probability</div>
                </div>
                <div className="flex gap-8">
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Prior</div>
                    <div className="text-lg font-semibold text-foreground/70 mt-0.5">{formatPct(priorProb)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Change</div>
                    <div className={cn("text-lg font-semibold mt-0.5", changePts >= 0 ? "text-success" : "text-destructive")}>
                      {formatPts(changePts)} pts
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Confidence</div>
                    <div className={cn(
                      "text-lg font-semibold mt-0.5",
                      confidenceLevel === "High" ? "text-success" : confidenceLevel === "Moderate" ? "text-warning" : "text-muted-foreground"
                    )}>
                      {confidenceLevel}
                    </div>
                  </div>
                </div>
                <div className="pt-3 border-t border-border/20 flex items-start justify-between gap-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{interpretation}</p>
                  <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap shrink-0">
                    Engine v1 · Probability Model
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* ── Panel 3 + 5: Key Drivers (compact) + Scenario Simulator (strategic) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2">
            <Card className="h-full">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-primary" />
                Key Drivers
              </div>
              {errorForecast ? (
                <PanelError message="Could not load drivers" onRetry={() => refetchForecast()} />
              ) : !fc ? (
                <PanelLoading label="Loading drivers…" />
              ) : drivers.positive.length === 0 && drivers.negative.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-6">
                  Add signals to see key drivers.
                </div>
              ) : (
                <div className="space-y-3">
                  {drivers.positive.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-success uppercase tracking-wider mb-1.5">Positive</div>
                      <div className="space-y-1">
                        {drivers.positive.map((d, i) => {
                          const impact = impactLabel(d.lr);
                          return (
                            <div key={i} className="flex items-center gap-1.5 py-1">
                              <TrendingUp className="w-3 h-3 text-success shrink-0" />
                              <span className="text-[12px] flex-1">{d.name}</span>
                              <Badge variant={impactBadgeVariant(impact)} className="text-[9px] px-1.5 py-0 shrink-0">{impact}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {drivers.negative.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-destructive uppercase tracking-wider mb-1.5">Negative</div>
                      <div className="space-y-1">
                        {drivers.negative.map((d, i) => {
                          const impact = impactLabel(d.lr);
                          return (
                            <div key={i} className="flex items-center gap-1.5 py-1">
                              <TrendingDown className="w-3 h-3 text-destructive shrink-0" />
                              <span className="text-[12px] flex-1">{d.name}</span>
                              <Badge variant={impactBadgeVariant(impact)} className="text-[9px] px-1.5 py-0">{impact}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="pt-2 border-t border-border/20">
                    <span className="text-[10px] text-muted-foreground/40">
                      Ranked by evidence impact · {drivers.positive.length + drivers.negative.length} drivers shown
                    </span>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* ── Panel 5: Scenario Simulator — SECOND BIGGEST, strategic ─────── */}
          <div className="lg:col-span-3">
            <Card className="h-full relative overflow-hidden">
              <div className="absolute bottom-0 right-0 w-40 h-40 bg-accent/5 rounded-full blur-[60px] translate-y-1/3 translate-x-1/4 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-primary" />
                    Scenario Simulator
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-warning/70">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Scenario output · backend computed</span>
                  </div>
                </div>

                {loadingSignals ? (
                  <PanelLoading label="Loading signals…" />
                ) : errorSignals ? (
                  <PanelError message="Could not load signals" onRetry={() => refetchSignals()} />
                ) : allSignals.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    Add signals first to run scenario simulations.
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 mb-4">
                      <Button variant="outline" size="sm" onClick={() => runPreset("best")} disabled={scenarioMutation.isPending} className="flex-1 text-[11px] h-8">
                        Best case
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => runPreset("base")} disabled={scenarioMutation.isPending} className="flex-1 text-[11px] h-8">
                        Base case
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => runPreset("risk")} disabled={scenarioMutation.isPending} className="flex-1 text-[11px] h-8">
                        Risk case
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4 max-h-36 overflow-y-auto pr-1">
                      {allSignals.map((s: any) => {
                        const isExcluded = excludedIds.has(s.signalId);
                        return (
                          <button
                            key={s.signalId}
                            onClick={() => toggleSignal(s.signalId)}
                            className={cn(
                              "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-left text-[11px]",
                              isExcluded
                                ? "bg-muted/5 border-border/15 opacity-35"
                                : "bg-muted/10 border-border/25 hover:bg-muted/20"
                            )}
                          >
                            {isExcluded ? (
                              <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            ) : (
                              <ToggleRight className="w-3.5 h-3.5 text-primary shrink-0" />
                            )}
                            <DirectionIcon dir={s.direction} />
                            <span className="flex-1 text-wrap">{s.signalDescription || s.signalType}</span>
                          </button>
                        );
                      })}
                    </div>

                    <Button onClick={runScenario} disabled={scenarioMutation.isPending} className="w-full gap-2 h-9 text-sm">
                      {scenarioMutation.isPending ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Computing…</>
                      ) : (
                        <><Zap className="w-3.5 h-3.5" /> Run Scenario</>
                      )}
                    </Button>

                    {scenarioMutation.isError && (
                      <div className="mt-3">
                        <PanelError message="Scenario computation failed" onRetry={runScenario} />
                      </div>
                    )}

                    {scenarioMutation.data && !scenarioMutation.isError && (
                      <div className="mt-4 pt-4 border-t border-border/30">
                        <div className="flex items-stretch gap-4">
                          <div className="flex-1 text-center p-3 rounded-xl bg-muted/10 border border-border/20">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Base</div>
                            <div className="text-xl font-bold text-foreground">{formatPct(scenarioMutation.data.baseProbability)}</div>
                          </div>
                          <div className="flex items-center text-muted-foreground/30">
                            <ChevronRight className="w-5 h-5" />
                          </div>
                          <div className="flex-1 text-center p-3 rounded-xl bg-primary/8 border border-primary/20">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Scenario</div>
                            <div className="text-xl font-bold text-primary">{formatPct(scenarioMutation.data.scenarioProbability)}</div>
                          </div>
                          <div className="flex items-center text-muted-foreground/30">
                            <ChevronRight className="w-5 h-5" />
                          </div>
                          <div className="flex-1 text-center p-3 rounded-xl bg-muted/10 border border-border/20">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Delta</div>
                            <div className={cn(
                              "text-xl font-bold",
                              scenarioMutation.data.delta > 0 ? "text-success" : scenarioMutation.data.delta < 0 ? "text-destructive" : "text-muted-foreground"
                            )}>
                              {formatPts(scenarioMutation.data.delta)} pts
                            </div>
                          </div>
                        </div>
                        <div className="text-[10px] text-muted-foreground text-center mt-2">
                          {scenarioMutation.data.scenarioSignals} of {scenarioMutation.data.totalSignals} signals active
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* ── Panel 4: Signal Stack — dense, operational, compressed rows ───── */}
        <Card noPadding>
          <div className="px-5 py-3 flex items-center justify-between border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-primary" />
                Signal Stack
              </div>
              <span className="text-[10px] text-muted-foreground/60">
                {loadingSignals ? "…" : `${allSignals.length} validated`}
              </span>
            </div>
            <Link href={`/case/${caseId}/signals`}>
              <button className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                <Eye className="w-3 h-3" /> Manage
              </button>
            </Link>
          </div>
          {loadingSignals ? (
            <PanelLoading label="Loading signals…" />
          ) : errorSignals ? (
            <PanelError message="Failed to load signals" onRetry={() => refetchSignals()} />
          ) : allSignals.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6 px-5">
              No signals yet. <Link href={`/case/${caseId}/signals`}><span className="text-primary underline cursor-pointer">Add signals</span></Link> to begin.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                    <th className="text-left py-2 px-5 font-medium">Signal</th>
                    <th className="text-left py-2 px-3 font-medium w-20">Dir</th>
                    <th className="text-left py-2 px-3 font-medium w-16">Str</th>
                    <th className="text-left py-2 px-3 font-medium w-16">Rel</th>
                    <th className="text-left py-2 px-3 font-medium w-16">Status</th>
                    <th className="text-right py-2 px-5 font-medium w-24">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {allSignals.map((s: any) => (
                    <tr key={s.signalId} className="border-t border-border/15 hover:bg-muted/5 transition-colors">
                      <td className="py-1.5 px-5">
                        <div className="text-[12px] font-medium">{s.signalDescription || s.signalType}</div>
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="flex items-center gap-1">
                          <DirectionIcon dir={s.direction} />
                          <span className={cn(
                            "text-[11px]",
                            s.direction === "Positive" ? "text-success" : s.direction === "Negative" ? "text-destructive" : "text-muted-foreground"
                          )}>{s.direction === "Positive" ? "+" : s.direction === "Negative" ? "−" : "~"}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="flex items-center gap-1">
                          <div className="w-8 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${(s.strengthScore ?? 0) * 20}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{s.strengthScore ?? 0}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="flex items-center gap-1">
                          <div className="w-8 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-accent rounded-full" style={{ width: `${(s.reliabilityScore ?? 0) * 20}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{s.reliabilityScore ?? 0}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3">
                        <span className="text-[10px] text-success">Validated</span>
                      </td>
                      <td className="py-1.5 px-5 text-right">
                        <span className="text-[10px] text-muted-foreground/60">
                          {s.createdAt ? new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Panel 6: Recommended Action — compact, decisive ──────────────── */}
        <Card>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <Lightbulb className="w-4 h-4 text-primary" />
            </div>
            {errorForecast ? (
              <PanelError message="Cannot generate recommendation without forecast" onRetry={() => refetchForecast()} />
            ) : !recommendation ? (
              <PanelLoading label="Generating recommendation…" />
            ) : (
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Recommended Action</div>
                <div className="text-sm font-semibold text-foreground leading-snug">{recommendation.headline}</div>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">{recommendation.rationale}</p>

                {forecastInterpretation && (
                  <ForecastInterpretationPanel interpretation={forecastInterpretation} />
                )}

                <div className="flex items-start gap-4 mt-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Monitor</div>
                    <div className="space-y-0.5">
                      {recommendation.monitorNext.map((item, i) => (
                        <div key={i} className="flex gap-1.5 items-start">
                          <ChevronRight className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                          <span className="text-[11px] text-muted-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="w-px bg-border/30 self-stretch mx-2" />
                  <div className="shrink-0 max-w-[200px]">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Risk</div>
                    <p className="text-[11px] text-warning/80 leading-relaxed">{recommendation.riskNote}</p>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-border/15">
                  <span className="text-[10px] text-muted-foreground/40">
                    Derived from probability band · {confidenceLevel} confidence · adapter v1
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>

      </div>
    </AppLayout>
  );
}
