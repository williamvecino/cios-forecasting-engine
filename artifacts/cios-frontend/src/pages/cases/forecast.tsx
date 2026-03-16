import { useRoute } from "wouter";
import { useRunForecast, useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { cn } from "@/lib/cn";
import { Card, Badge, ProbabilityGauge, Button } from "@/components/ui-components";
import {
  ArrowRight,
  BrainCircuit,
  Users,
  CheckCircle2,
  AlertOctagon,
  Download,
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Zap,
  ChevronUp,
  ChevronDown,
  Minus,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

function BayesianChain({
  prior,
  lr,
  actors,
  posterior,
}: {
  prior: number;
  lr: number;
  actors: number;
  posterior: number;
}) {
  return (
    <div className="flex items-center justify-between bg-background border border-border rounded-2xl p-6 relative overflow-x-auto gap-4">
      <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-border via-primary/20 to-border -translate-y-1/2 z-0" />
      {[
        { label: "Starting Point", val: prior.toFixed(3), desc: "Prior probability", highlight: false },
        { label: "Evidence Strength", val: `× ${lr.toFixed(3)}`, desc: "Signal weight", highlight: true },
        { label: "Stakeholder Response", val: `× ${actors.toFixed(3)}`, desc: "Behavioral influence", highlight: true },
        { label: "Overall Outlook", val: posterior.toFixed(3), desc: "Posterior odds", highlight: false },
      ].map((step, i) => (
        <div
          key={i}
          className={cn(
            "relative z-10 flex flex-col items-center bg-card p-4 rounded-xl border shadow-md min-w-[130px]",
            step.highlight ? "border-primary/30" : "border-border"
          )}
        >
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            {step.label}
          </span>
          <span
            className={cn(
              "text-xl font-display font-bold",
              step.highlight ? "text-primary" : "text-foreground"
            )}
          >
            {step.val}
          </span>
          <span className="text-[10px] text-muted-foreground mt-1">{step.desc}</span>
        </div>
      ))}
    </div>
  );
}

function StanceChip({ stance }: { stance: string }) {
  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    "Strongly supportive": {
      color: "bg-success/15 text-success border-success/25",
      icon: <ChevronUp className="w-3 h-3" />,
    },
    Supportive: {
      color: "bg-success/8 text-success/80 border-success/15",
      icon: <ChevronUp className="w-3 h-3 opacity-60" />,
    },
    Neutral: {
      color: "bg-muted/30 text-muted-foreground border-border",
      icon: <Minus className="w-3 h-3" />,
    },
    Resistive: {
      color: "bg-destructive/8 text-destructive/80 border-destructive/15",
      icon: <ChevronDown className="w-3 h-3 opacity-60" />,
    },
    "Strongly resistive": {
      color: "bg-destructive/15 text-destructive border-destructive/25",
      icon: <ChevronDown className="w-3 h-3" />,
    },
  };
  const c = config[stance] ?? config["Neutral"];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border",
        c.color
      )}
    >
      {c.icon}
      {stance}
    </span>
  );
}

export default function ForecastResults() {
  const [, params] = useRoute("/cases/:caseId/forecast");
  const caseId = params?.caseId || "";

  const { data: caseData } = useGetCase(caseId);
  const { data: forecast, isLoading } = useRunForecast(caseId);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <BrainCircuit className="w-12 h-12 text-primary animate-pulse" />
          <div className="text-lg font-display text-muted-foreground">
            Calculating your forecast…
          </div>
          <div className="text-xs text-muted-foreground/60">
            Weighing evidence and stakeholder signals
          </div>
        </div>
      </AppLayout>
    );
  }
  if (!forecast) {
    return (
      <AppLayout>
        <div className="p-8 text-destructive">
          Failed to generate forecast. Ensure the case has at least one active signal.
        </div>
      </AppLayout>
    );
  }

  const actorData =
    forecast.actorAggregation?.map((a) => ({
      name: a.actor,
      value: a.netActorEffect,
      stance: (a as any).stance ?? "Neutral",
    })) || [];

  const delta = forecast.currentProbability - forecast.priorProbability;
  const cd = caseData as any;
  const sa = (forecast as any).sensitivityAnalysis as {
    upwardSignals: any[];
    downwardSignals: any[];
    swingFactor: any | null;
    stabilityNote: string;
  } | undefined;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <header className="flex justify-between items-start">
          <div>
            <div className="flex items-center flex-wrap gap-2 mb-2">
              <Badge variant="primary">
                <FlaskConical className="w-3 h-3 mr-1 inline" />
                {cd?.assetName || caseData?.primaryBrand || caseId}
              </Badge>
              {cd?.assetType && <Badge variant="default">{cd.assetType}</Badge>}
              {cd?.therapeuticArea && <Badge variant="default">{cd.therapeuticArea}</Badge>}
              {cd?.diseaseState && (
                <span className="text-xs text-muted-foreground">· {cd.diseaseState}</span>
              )}
              {cd?.geography && (
                <span className="text-xs text-muted-foreground">· {cd.geography}</span>
              )}
              {cd?.isDemo === "true" && <Badge variant="default">Demo case</Badge>}
            </div>
            <h1 className="text-2xl font-bold">{caseData?.strategicQuestion}</h1>
            {cd?.outcomeDefinition && (
              <p className="text-sm text-muted-foreground mt-1">
                Outcome: {cd.outcomeDefinition}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>Horizon: {caseData?.timeHorizon || "—"}</span>
              {cd?.specialty && <span>· Specialty: {cd.specialty}</span>}
              <span>· Profile: {caseData?.primarySpecialtyProfile}</span>
            </div>
          </div>
          <Button variant="outline" className="gap-2 shrink-0">
            <Download className="w-4 h-4" /> Export
          </Button>
        </header>

        {/* Main output row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="flex flex-col items-center justify-center py-8 relative overflow-hidden">
            <div className="absolute top-3 right-3">
              <Badge
                variant={forecast.confidenceLevel === "High" ? "success" : "warning"}
              >
                {forecast.confidenceLevel} Conf
              </Badge>
            </div>
            <ProbabilityGauge
              value={forecast.currentProbability}
              label="Posterior Probability"
              size={220}
            />
            <div className="flex items-center gap-4 mt-6 text-sm">
              <div className="text-muted-foreground">
                Prior:{" "}
                <span className="text-foreground font-medium">
                  {(forecast.priorProbability * 100).toFixed(0)}%
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
              <div className="text-muted-foreground">
                Delta:{" "}
                <span
                  className={
                    delta >= 0 ? "text-success font-bold" : "text-destructive font-bold"
                  }
                >
                  {delta >= 0 ? "+" : ""}
                  {(delta * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-2 bg-gradient-to-br from-card to-card/50 border-primary/15">
            <h3 className="text-base font-semibold flex items-center gap-2 mb-5">
              <BrainCircuit className="w-4 h-4 text-primary" />
              Strategic Interpretation
            </h3>
            <div className="space-y-5">
              <div>
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">
                  Primary synthesis
                </div>
                <div className="text-lg font-medium leading-relaxed">
                  {forecast.interpretation?.primaryStatement}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-success/5 border border-success/15 p-4 rounded-xl">
                  <div className="text-xs text-success font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Top Enabler
                  </div>
                  <div className="font-medium text-sm">
                    {forecast.topSupportiveActor || "None identified"}
                  </div>
                </div>
                <div className="bg-destructive/5 border border-destructive/15 p-4 rounded-xl">
                  <div className="text-xs text-destructive font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                    <AlertOctagon className="w-3 h-3" /> Top Constrainer
                  </div>
                  <div className="font-medium text-sm">
                    {forecast.topConstrainingActor || "None identified"}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">
                  Recommended action
                </div>
                <div className="bg-muted/30 p-3 rounded-lg border border-border/50 text-sm font-medium">
                  {forecast.interpretation?.recommendedAction || "Monitor signals."}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Bayesian computation chain */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
            How this forecast was built — Evidence × Stakeholder Response
          </h3>
          <BayesianChain
            prior={forecast.priorOdds || 0}
            lr={forecast.signalLrProduct || 1}
            actors={forecast.actorAdjustmentFactor || 1}
            posterior={forecast.posteriorOdds || 0}
          />
        </div>

        {/* Actor Reaction Layer */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />
            Stakeholder Response — Expected Behavioral Influence
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar chart */}
            <Card>
              <div className="text-xs text-muted-foreground mb-4">
                Net influence (positive = supportive, negative = resistant)
              </div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={actorData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 10, bottom: 4 }}
                  >
                    <XAxis type="number" domain={[-1, 1]} hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={155}
                      tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        borderColor: "var(--color-border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(val: number) => [val.toFixed(3), "Net influence"]}
                    />
                    <ReferenceLine x={0} stroke="var(--color-border)" />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {actorData.map((entry, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={
                            entry.value > 0.05
                              ? "var(--color-success)"
                              : entry.value < -0.05
                                ? "var(--color-destructive)"
                                : "var(--color-muted-foreground)"
                          }
                          opacity={Math.min(1, 0.4 + Math.abs(entry.value) * 1.5)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Stance cards */}
            <div className="space-y-2.5">
              {forecast.actorAggregation?.map((actor) => {
                const a = actor as any;
                return (
                  <div
                    key={actor.actor}
                    className="p-3.5 bg-background border border-border rounded-xl flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold truncate">{actor.actor}</span>
                        {a.influenceWeight !== undefined && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {(a.influenceWeight * 100).toFixed(0)}% weight
                          </span>
                        )}
                      </div>
                      <StanceChip stance={a.stance ?? actor.interpretation} />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {a.expectedBehavior ?? actor.interpretation}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sensitivity Analysis */}
        {sa && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" />
              Forecast Sensitivity Analysis
            </h3>

            {/* Stability note */}
            <div className="mb-4 px-4 py-2.5 bg-muted/20 border border-border rounded-lg text-xs text-muted-foreground">
              {sa.stabilityNote}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
              {/* Upward forces */}
              <Card className="border-success/20">
                <h4 className="text-sm font-semibold text-success flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4" />
                  Signals Pushing Forecast Up
                </h4>
                <div className="space-y-2">
                  {sa.upwardSignals.length === 0 && (
                    <div className="text-xs text-muted-foreground py-3 text-center">
                      No positive signals registered.
                    </div>
                  )}
                  {sa.upwardSignals.map((sig: any) => (
                    <div
                      key={sig.signalId}
                      className="flex items-start justify-between gap-3 p-2.5 bg-success/5 border border-success/15 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono text-muted-foreground mb-0.5">
                          {sig.signalId}
                        </div>
                        <div className="text-xs font-medium leading-snug">{sig.description}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-bold text-success">LR {sig.likelihoodRatio.toFixed(2)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          −{(sig.deltaIfRemoved * 100).toFixed(1)}pp if removed
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Downward forces */}
              <Card className="border-destructive/20">
                <h4 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-4">
                  <TrendingDown className="w-4 h-4" />
                  Signals Pushing Forecast Down
                </h4>
                <div className="space-y-2">
                  {sa.downwardSignals.length === 0 && (
                    <div className="text-xs text-muted-foreground py-3 text-center">
                      No negative signals registered.
                    </div>
                  )}
                  {sa.downwardSignals.map((sig: any) => (
                    <div
                      key={sig.signalId}
                      className="flex items-start justify-between gap-3 p-2.5 bg-destructive/5 border border-destructive/15 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono text-muted-foreground mb-0.5">
                          {sig.signalId}
                        </div>
                        <div className="text-xs font-medium leading-snug">{sig.description}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-bold text-destructive">
                          LR {sig.likelihoodRatio.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          +{(sig.deltaIfRemoved * 100).toFixed(1)}pp if removed
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Swing factor */}
            {sa.swingFactor && (
              <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-5">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">
                      Highest-Leverage Swing Factor
                    </span>
                    <Badge variant="primary" className="ml-auto text-[10px]">
                      {sa.swingFactor.direction}
                    </Badge>
                  </div>
                  <div className="text-sm font-semibold mb-1">{sa.swingFactor.description}</div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    {sa.swingFactor.interpretation}
                  </p>
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                        Current forecast
                      </div>
                      <div className="text-lg font-bold">
                        {(forecast.currentProbability * 100).toFixed(1)}%
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                        If reversed
                      </div>
                      <div
                        className={cn(
                          "text-lg font-bold",
                          sa.swingFactor.probabilityDeltaIfReversed > 0
                            ? "text-success"
                            : "text-destructive"
                        )}
                      >
                        {(sa.swingFactor.currentProbabilityIfReversed * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                        Swing
                      </div>
                      <div
                        className={cn(
                          "text-lg font-bold",
                          sa.swingFactor.probabilityDeltaIfReversed > 0
                            ? "text-success"
                            : "text-destructive"
                        )}
                      >
                        {sa.swingFactor.probabilityDeltaIfReversed >= 0 ? "+" : ""}
                        {(sa.swingFactor.probabilityDeltaIfReversed * 100).toFixed(1)}pp
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Driving signals */}
        <Card>
          <h3 className="text-base font-semibold mb-4">All Driving Signals</h3>
          <div className="space-y-2.5">
            {forecast.signalDetails?.slice(0, 6).map((sig) => (
              <div
                key={sig.signalId}
                className="flex items-center justify-between p-3 bg-background border border-border rounded-lg gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-mono mb-0.5">
                    {sig.signalId}
                  </div>
                  <div
                    className="text-sm font-medium truncate"
                    title={sig.description}
                  >
                    {sig.description}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <Badge variant={sig.direction === "Positive" ? "success" : "danger"}>
                    LR {sig.likelihoodRatio.toFixed(2)}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    Stakeholder: {sig.weightedActorReaction?.toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
            {(!forecast.signalDetails || forecast.signalDetails.length === 0) && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No signals yet — add signals via the Signal Register.
              </div>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
