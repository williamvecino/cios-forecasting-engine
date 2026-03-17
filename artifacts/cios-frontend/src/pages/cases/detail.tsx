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
  Target,
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  Activity,
  Lightbulb,
  ShieldAlert,
  Zap,
  BookOpen,
  Clock,
  Eye,
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

export default function QuestionDetail() {
  const [, params] = useRoute("/cases/:caseId");
  const caseId = params?.caseId ?? "";

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

  const runPreset = (preset: "best" | "base" | "risk") => {
    const sigs = allSignals;
    if (preset === "base") {
      setExcludedIds(new Set());
      scenarioMutation.mutate([]);
    } else if (preset === "best") {
      const negIds = sigs.filter((s: any) => s.direction === "Negative").map((s: any) => s.signalId);
      setExcludedIds(new Set(negIds));
      scenarioMutation.mutate(negIds);
    } else {
      const posIds = sigs.filter((s: any) => s.direction === "Positive").map((s: any) => s.signalId);
      setExcludedIds(new Set(posIds));
      scenarioMutation.mutate(posIds);
    }
  };

  const fc = forecast as any;
  const cd = caseData as any;
  const allSignals = (signals || []) as any[];

  const drivers = useMemo(() => {
    if (!fc?.signalDetails) return { positive: [], negative: [] };
    const all = (fc.signalDetails as any[])
      .map((s: any) => ({
        name: s.signalDescription || s.signalType || "Unknown",
        direction: s.direction,
        lr: s.likelihoodRatio ?? 1,
        signalType: s.signalType ?? "",
      }))
      .sort((a: any, b: any) => Math.abs(b.lr - 1) - Math.abs(a.lr - 1));
    return {
      positive: all.filter((d) => d.direction === "Positive").slice(0, 5),
      negative: all.filter((d) => d.direction === "Negative").slice(0, 4),
    };
  }, [fc]);

  const recommendation = useMemo(() => {
    if (!fc || !cd) return null;
    const prob = fc.currentProbability ?? 0;
    const confidence = fc.confidenceLevel ?? "Low";
    const priorProb = cd.priorProbability ?? 0;
    const change = prob - priorProb;

    let headline: string;
    let rationale: string;
    let riskNote: string;
    let monitorNext: string[];

    if (prob >= 0.7) {
      headline = "Accelerate execution. Evidence supports forward momentum.";
      rationale = `The forecast is currently at ${formatPct(prob)} (${formatPts(change)} pts from prior), supported by favorable signals. This advantage window may compress if competitive dynamics shift or key evidence is contradicted.`;
      riskNote = "Primary risk: complacency. High-probability outcomes can reverse quickly if disconfirming evidence emerges.";
      monitorNext = [
        "Competitor clinical or regulatory readouts",
        "Payer policy changes in priority accounts",
        "New guideline commentary or society updates",
      ];
    } else if (prob >= 0.5) {
      headline = "Selectively invest. Evidence is favorable but not yet decisive.";
      rationale = `At ${formatPct(prob)}, the forecast is above baseline but not yet in the high-conviction zone. The 1-2 signals that would push probability above 70% should be the primary acquisition targets.`;
      riskNote = "Moderate uncertainty remains. Avoid over-committing resources until confidence strengthens.";
      monitorNext = [
        "Pending evidence that could shift probability above 70%",
        "KOL validation of the current signal pattern",
        "Competitive landscape evolution",
      ];
    } else if (prob >= 0.3) {
      headline = "Reassess assumptions. Evidence is mixed and outcome uncertain.";
      rationale = `The forecast at ${formatPct(prob)} reflects a balanced evidence base. Neither supporting nor opposing signals are dominant. Focus on identifying the highest-leverage gaps.`;
      riskNote = "The question may need reframing. Consider whether the strategic question itself is well-calibrated.";
      monitorNext = [
        "Highest-leverage evidence gaps",
        "Whether the prior probability still reflects market reality",
        "Stakeholder sentiment shifts",
      ];
    } else {
      headline = "Consider strategic pivot. Current evidence does not support a positive outcome.";
      rationale = `At ${formatPct(prob)}, signals are predominantly opposing. Continuing the current strategy without new supporting evidence is unlikely to change the trajectory.`;
      riskNote = "Continued investment without evidence reversal carries significant opportunity cost.";
      monitorNext = [
        "What would need to change for probability to meaningfully shift",
        "Alternative strategic framings",
        "Exit or pivot timing considerations",
      ];
    }

    if (confidence === "Low" || confidence === "Developing") {
      riskNote += " Note: confidence is limited — forecast reliability will improve with more validated signals.";
    }

    return { headline, rationale, riskNote, monitorNext, prob, confidence };
  }, [fc, cd]);

  const currentProb = fc?.currentProbability ?? 0;
  const priorProb = cd?.priorProbability ?? 0;
  const changePts = currentProb - priorProb;

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

  const interpretation = currentProb >= 0.6
    ? "Current signals support a favorable outcome within the forecast window."
    : currentProb >= 0.4
    ? "Signals are mixed. The outcome is within a zone of genuine uncertainty."
    : "Current signals suggest the outcome faces material headwinds.";

  return (
    <AppLayout>
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* ── Panel 1: Question Header — compact, anchoring ─────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Link href="/">
              <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-2">
                <ArrowLeft className="w-3 h-3" /> Back to Questions
              </button>
            </Link>
            <h1 className="text-lg font-bold text-foreground leading-snug">{cd.strategicQuestion}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="primary">{cd.therapeuticArea || "General"}</Badge>
              <span className="text-xs text-muted-foreground">{cd.assetName || cd.primaryBrand}</span>
              <span className="text-xs text-muted-foreground/40">|</span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {cd.timeHorizon || "12 months"}
              </span>
              <span className="text-xs text-muted-foreground/40">|</span>
              <Badge variant={fc?.confidenceLevel === "High" ? "success" : fc?.confidenceLevel === "Moderate" ? "warning" : "default"}>
                {fc?.confidenceLevel || "Pending"}
              </Badge>
              {cd.lastUpdate && (
                <>
                  <span className="text-xs text-muted-foreground/40">|</span>
                  <span className="text-[11px] text-muted-foreground">
                    Updated {new Date(cd.lastUpdate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0 pt-5">
            <Link href={`/cases/${caseId}/signals`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Radio className="w-3.5 h-3.5" /> Add Signals
              </Button>
            </Link>
            <Link href="/case-library">
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
                    fc?.confidenceLevel === "High" ? "text-success" : fc?.confidenceLevel === "Moderate" ? "text-warning" : "text-muted-foreground"
                  )}>
                    {fc?.confidenceLevel ?? "—"}
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-border/20">
                <p className="text-sm text-muted-foreground leading-relaxed">{interpretation}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Panel 3: Key Drivers — sidebar companion, compact ─────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2">
            <Card className="h-full">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-primary" />
                Key Drivers
              </div>
              {drivers.positive.length === 0 && drivers.negative.length === 0 ? (
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
                              <span className="text-[12px] flex-1 line-clamp-1">{d.name}</span>
                              <Badge variant={impactBadgeVariant(impact)} className="text-[9px] px-1.5 py-0">{impact}</Badge>
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
                              <span className="text-[12px] flex-1 line-clamp-1">{d.name}</span>
                              <Badge variant={impactBadgeVariant(impact)} className="text-[9px] px-1.5 py-0">{impact}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                    <span>Scenario only</span>
                  </div>
                </div>

                {allSignals.length === 0 ? (
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
                            <span className="flex-1 line-clamp-1">{s.signalDescription || s.signalType}</span>
                          </button>
                        );
                      })}
                    </div>

                    <Button onClick={runScenario} disabled={scenarioMutation.isPending} className="w-full gap-2 h-9 text-sm">
                      {scenarioMutation.isPending ? (
                        <><Activity className="w-3.5 h-3.5 animate-spin" /> Computing…</>
                      ) : (
                        <><Zap className="w-3.5 h-3.5" /> Run Scenario</>
                      )}
                    </Button>

                    {scenarioMutation.data && (
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
              <span className="text-[10px] text-muted-foreground/60">{allSignals.length} validated</span>
            </div>
            <Link href={`/cases/${caseId}/signals`}>
              <button className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                <Eye className="w-3 h-3" /> Manage
              </button>
            </Link>
          </div>
          {allSignals.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6 px-5">
              No signals yet. <Link href={`/cases/${caseId}/signals`}><span className="text-primary underline cursor-pointer">Add signals</span></Link> to begin.
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
                  {allSignals.map((s: any, idx: number) => (
                    <tr key={s.signalId} className="border-t border-border/15 hover:bg-muted/5 transition-colors">
                      <td className="py-1.5 px-5">
                        <div className="text-[12px] font-medium line-clamp-1">{s.signalDescription || s.signalType}</div>
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
                        <span className="text-[10px] text-success">Valid</span>
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
            {recommendation ? (
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Recommended Action</div>
                <div className="text-sm font-semibold text-foreground leading-snug">{recommendation.headline}</div>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">{recommendation.rationale}</p>
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
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-2">
                Run a forecast first to generate recommendations.
              </div>
            )}
          </div>
        </Card>

      </div>
    </AppLayout>
  );
}
