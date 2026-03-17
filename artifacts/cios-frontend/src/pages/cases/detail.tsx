import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useRunForecast, useGetCase, useListSignals } from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { cn } from "@/lib/cn";
import { Card, Badge, ProbabilityGauge, Button } from "@/components/ui-components";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Radio,
  Users,
  Compass,
  Layers,
  Target,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  Activity,
  Lightbulb,
  ShieldAlert,
  Zap,
} from "lucide-react";

type PanelId = "forecast" | "drivers" | "signals" | "scenario" | "recommendation";

const PANELS: { id: PanelId; label: string; icon: React.FC<any> }[] = [
  { id: "forecast", label: "Probability Forecast", icon: TrendingUp },
  { id: "drivers", label: "Key Drivers", icon: Users },
  { id: "signals", label: "Signals", icon: Radio },
  { id: "scenario", label: "Scenario Simulation", icon: Compass },
  { id: "recommendation", label: "Strategic Recommendation", icon: Layers },
];

function formatPct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

function DirectionIcon({ dir }: { dir: string }) {
  if (dir === "Positive") return <TrendingUp className="w-3.5 h-3.5 text-success" />;
  if (dir === "Negative") return <TrendingDown className="w-3.5 h-3.5 text-destructive" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

export default function QuestionDetail() {
  const [, params] = useRoute("/cases/:caseId");
  const caseId = params?.caseId ?? "";
  const [activePanel, setActivePanel] = useState<PanelId>("forecast");

  const { data: caseData, isLoading: loadingCase } = useGetCase(caseId);
  const { data: forecast, isLoading: loadingForecast } = useRunForecast(caseId);
  const { data: signals, isLoading: loadingSignals } = useListSignals(caseId);

  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const scenarioMutation = useMutation({
    mutationFn: async (excluded: string[]) => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/cases/${caseId}/scenario-simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludeSignalIds: excluded }),
      });
      if (!res.ok) throw new Error("Scenario simulation failed");
      return res.json();
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

  const fc = forecast as any;
  const cd = caseData as any;
  const allSignals = (signals || []) as any[];

  const drivers = useMemo(() => {
    if (!fc?.signalDetails) return [];
    return (fc.signalDetails as any[])
      .map((s: any) => ({
        name: s.signalDescription || s.signalType || "Unknown",
        direction: s.direction,
        lr: s.likelihoodRatio ?? 1,
        actorReaction: s.weightedActorReaction ?? 0,
      }))
      .sort((a: any, b: any) => Math.abs(b.lr - 1) - Math.abs(a.lr - 1));
  }, [fc]);

  const recommendation = useMemo(() => {
    if (!fc || !cd) return null;
    const prob = fc.currentProbability ?? 0;
    const confidence = fc.confidenceLevel ?? "Low";
    const question = cd.strategicQuestion ?? "";

    let outlook: string;
    let actionItems: string[];

    if (prob >= 0.7) {
      outlook = "The evidence strongly supports a positive outcome. Current probability is well above baseline.";
      actionItems = [
        "Continue monitoring for disconfirming signals that could shift the trajectory.",
        "Consider expanding stakeholder engagement to lock in momentum.",
        "Document the evidence chain for internal alignment.",
      ];
    } else if (prob >= 0.5) {
      outlook = "Evidence is moderately supportive. The question is trending favorably but key uncertainties remain.";
      actionItems = [
        "Identify the 1-2 signals that would move probability above 70% and prioritize acquisition.",
        "Engage key opinion leaders to validate the current signal pattern.",
        "Prepare contingency plans for downside scenarios.",
      ];
    } else if (prob >= 0.3) {
      outlook = "Evidence is mixed. The outcome is uncertain and could go either way.";
      actionItems = [
        "Focus signal collection on the highest-leverage evidence gaps.",
        "Re-examine the strategic question framing — are we asking the right question?",
        "Consider whether the prior probability reflects current market reality.",
      ];
    } else {
      outlook = "Evidence suggests a challenging path forward. Current signals do not support a positive outcome.";
      actionItems = [
        "Assess whether the strategic question should be reformulated.",
        "Identify what would need to change for the probability to meaningfully shift.",
        "Consider pivoting strategy based on the current evidence pattern.",
      ];
    }

    if (confidence === "Low" || confidence === "Developing") {
      actionItems.push("Confidence is limited — adding more validated signals will improve forecast reliability.");
    }

    return { outlook, actionItems, prob, confidence, question };
  }, [fc, cd]);

  if (loadingCase || loadingForecast) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <Target className="w-10 h-10 text-primary animate-pulse" />
          <div className="text-muted-foreground">Loading question detail…</div>
        </div>
      </AppLayout>
    );
  }

  if (!cd) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">
          <p>Question not found.</p>
          <Link href="/">
            <Button variant="ghost" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
            </Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header>
          <Link href="/">
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
              <ArrowLeft className="w-3 h-3" /> Back to Questions
            </button>
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Question Detail</span>
          </div>
          <h1 className="text-xl font-bold text-foreground leading-snug">{cd.strategicQuestion}</h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="primary">{(cd as any).therapeuticArea || "General"}</Badge>
            <span className="text-xs text-muted-foreground">{(cd as any).assetName || cd.primaryBrand}</span>
            {fc && (
              <Badge variant={fc.confidenceLevel === "High" ? "success" : fc.confidenceLevel === "Moderate" ? "warning" : "default"}>
                {fc.confidenceLevel}
              </Badge>
            )}
          </div>
        </header>

        <div className="flex gap-1 bg-card/50 border border-border rounded-xl p-1">
          {PANELS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePanel(p.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center",
                activePanel === p.id
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              <p.icon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{p.label}</span>
            </button>
          ))}
        </div>

        {activePanel === "forecast" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="flex flex-col items-center justify-center py-8 relative overflow-hidden">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-semibold">Current Probability</div>
                <ProbabilityGauge value={fc?.currentProbability ?? 0} label="" />
                <div className="text-2xl font-bold text-primary mt-2">{formatPct(fc?.currentProbability ?? 0)}</div>
              </Card>
              <Card className="flex flex-col items-center justify-center py-8">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-semibold">Prior Probability</div>
                <div className="text-4xl font-bold text-foreground/70">{formatPct(cd.priorProbability ?? 0)}</div>
                <div className="text-xs text-muted-foreground mt-2">Starting point before evidence</div>
              </Card>
              <Card className="flex flex-col items-center justify-center py-8">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-semibold">Confidence Level</div>
                <div className={cn(
                  "text-3xl font-bold",
                  fc?.confidenceLevel === "High" ? "text-success" : fc?.confidenceLevel === "Moderate" ? "text-warning" : "text-muted-foreground"
                )}>
                  {fc?.confidenceLevel ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {fc?.confidenceLevel === "High" ? "Strong evidence coverage" : fc?.confidenceLevel === "Moderate" ? "Adequate evidence" : "More signals needed"}
                </div>
              </Card>
            </div>
            {fc?.rawProbability != null && fc.rawProbability !== fc.currentProbability && (
              <Card>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Activity className="w-3.5 h-3.5" />
                  <span>Calibration applied: raw {formatPct(fc.rawProbability)} → calibrated {formatPct(fc.currentProbability)}</span>
                </div>
              </Card>
            )}
          </div>
        )}

        {activePanel === "drivers" && (
          <Card>
            <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-primary" />
              Key Drivers
            </h3>
            {drivers.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No signals registered yet. Add signals to see key drivers.
              </div>
            ) : (
              <div className="space-y-3">
                {drivers.map((d: any, i: number) => {
                  const impact = Math.abs(d.lr - 1);
                  const isPositive = d.direction === "Positive";
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/10 border border-border/30">
                      <DirectionIcon dir={d.direction} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium line-clamp-1">{d.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Evidence weight: {d.lr.toFixed(2)}x
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-2 rounded-full",
                          isPositive ? "bg-success" : "bg-destructive"
                        )} style={{ width: `${Math.min(impact * 60, 120)}px` }} />
                        <Badge variant={isPositive ? "success" : "danger"}>
                          {isPositive ? "Supporting" : "Opposing"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {activePanel === "signals" && (
          <Card noPadding>
            <div className="p-6 pb-3">
              <h3 className="text-base font-semibold flex items-center gap-2 mb-1">
                <Radio className="w-4 h-4 text-primary" />
                Validated Signals
              </h3>
              <p className="text-xs text-muted-foreground">{allSignals.length} signal{allSignals.length !== 1 ? "s" : ""} registered</p>
            </div>
            {allSignals.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8 px-6">
                No signals yet. <Link href={`/cases/${caseId}/signals`}><span className="text-primary underline cursor-pointer">Add signals</span></Link> to begin building the evidence base.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider">
                      <th className="text-left py-2.5 px-6 font-semibold">Signal</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Direction</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Strength</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Reliability</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allSignals.map((s: any) => (
                      <tr key={s.signalId} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="py-3 px-6">
                          <div className="font-medium line-clamp-1">{s.signalDescription || s.signalType}</div>
                          <div className="text-[11px] text-muted-foreground">{s.signalType}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <DirectionIcon dir={s.direction} />
                            <span className={cn(
                              "text-xs font-medium",
                              s.direction === "Positive" ? "text-success" : s.direction === "Negative" ? "text-destructive" : "text-muted-foreground"
                            )}>{s.direction}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${(s.strengthScore ?? 0) * 20}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{s.strengthScore ?? 0}/5</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-accent rounded-full" style={{ width: `${(s.reliabilityScore ?? 0) * 20}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{s.reliabilityScore ?? 0}/5</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-muted-foreground whitespace-nowrap">
                          {s.createdAt ? new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {activePanel === "scenario" && (
          <div className="space-y-6">
            <Card>
              <h3 className="text-base font-semibold flex items-center gap-2 mb-1">
                <Compass className="w-4 h-4 text-primary" />
                Scenario Simulation
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Toggle signals on/off to see how probability changes. The recomputation runs through the full engine on the backend.
              </p>

              {allSignals.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Add signals first to run scenario simulations.
                </div>
              ) : (
                <>
                  <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
                    {allSignals.map((s: any) => {
                      const isExcluded = excludedIds.has(s.signalId);
                      return (
                        <button
                          key={s.signalId}
                          onClick={() => toggleSignal(s.signalId)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                            isExcluded
                              ? "bg-muted/5 border-border/20 opacity-50"
                              : "bg-muted/10 border-border/40 hover:bg-muted/20"
                          )}
                        >
                          {isExcluded ? (
                            <ToggleLeft className="w-5 h-5 text-muted-foreground shrink-0" />
                          ) : (
                            <ToggleRight className="w-5 h-5 text-primary shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium line-clamp-1">{s.signalDescription || s.signalType}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <DirectionIcon dir={s.direction} />
                              <span className="text-[11px] text-muted-foreground">{s.direction} · LR {(s.likelihoodRatio ?? 1).toFixed(2)}</span>
                            </div>
                          </div>
                          <span className={cn("text-[10px] font-medium", isExcluded ? "text-destructive" : "text-success")}>
                            {isExcluded ? "EXCLUDED" : "INCLUDED"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <Button onClick={runScenario} disabled={scenarioMutation.isPending} className="w-full gap-2">
                    {scenarioMutation.isPending ? (
                      <>
                        <Activity className="w-4 h-4 animate-spin" />
                        Computing scenario…
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Run Scenario ({excludedIds.size} signal{excludedIds.size !== 1 ? "s" : ""} excluded)
                      </>
                    )}
                  </Button>
                </>
              )}
            </Card>

            {scenarioMutation.data && (
              <Card>
                <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-primary" />
                  Scenario Result
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-muted/10 rounded-xl border border-border/30 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Base Probability</div>
                    <div className="text-2xl font-bold text-foreground">{formatPct(scenarioMutation.data.baseProbability)}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">All {scenarioMutation.data.totalSignals} signals</div>
                  </div>
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Scenario Probability</div>
                    <div className="text-2xl font-bold text-primary">{formatPct(scenarioMutation.data.scenarioProbability)}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">{scenarioMutation.data.scenarioSignals} signals active</div>
                  </div>
                  <div className="p-4 bg-muted/10 rounded-xl border border-border/30 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Delta</div>
                    <div className={cn(
                      "text-2xl font-bold",
                      scenarioMutation.data.delta > 0 ? "text-success" : scenarioMutation.data.delta < 0 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {scenarioMutation.data.delta > 0 ? "+" : ""}{(scenarioMutation.data.delta * 100).toFixed(1)}pp
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {scenarioMutation.data.excludedCount} excluded
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {activePanel === "recommendation" && (
          <Card>
            <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
              <Lightbulb className="w-4 h-4 text-primary" />
              Strategic Recommendation
            </h3>
            {recommendation ? (
              <div className="space-y-4">
                <div className="p-4 bg-primary/5 rounded-xl border border-primary/15">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Outlook</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{recommendation.outlook}</p>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span className="text-sm font-semibold text-foreground">Recommended Actions</span>
                  </div>
                  <div className="space-y-2">
                    {recommendation.actionItems.map((item, i) => (
                      <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/10 border border-border/30">
                        <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-sm text-muted-foreground">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/5 border border-warning/15 text-xs text-muted-foreground">
                  <ShieldAlert className="w-4 h-4 text-warning shrink-0" />
                  Recommendations are system-generated based on current probability ({formatPct(recommendation.prob)}),
                  confidence level ({recommendation.confidence}), and active evidence patterns.
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                Run a forecast first to generate recommendations.
              </div>
            )}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
