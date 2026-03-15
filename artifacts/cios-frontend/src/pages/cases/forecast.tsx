import { useRoute } from "wouter";
import { useRunForecast, useGetCase } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { cn } from "@/lib/cn";
import { Card, Badge, ProbabilityGauge, Button } from "@/components/ui-components";
import { ArrowRight, BrainCircuit, Users, CheckCircle2, AlertOctagon, Download, FlaskConical } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

function BayesianChain({ prior, lr, actors, posterior }: { prior: number; lr: number; actors: number; posterior: number }) {
  return (
    <div className="flex items-center justify-between bg-background border border-border rounded-2xl p-6 relative overflow-x-auto gap-4">
      <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-border via-primary/20 to-border -translate-y-1/2 z-0" />
      {[
        { label: "Prior Odds", val: prior.toFixed(3), desc: "Baseline belief", highlight: false },
        { label: "Signal LR", val: `× ${lr.toFixed(3)}`, desc: "Evidence multiplier", highlight: true },
        { label: "Actor Adj.", val: `× ${actors.toFixed(3)}`, desc: "Behavioral factor", highlight: true },
        { label: "Posterior Odds", val: posterior.toFixed(3), desc: "Final odds", highlight: false },
      ].map((step, i) => (
        <div
          key={i}
          className={cn(
            "relative z-10 flex flex-col items-center bg-card p-4 rounded-xl border shadow-md min-w-[130px]",
            step.highlight ? "border-primary/30" : "border-border"
          )}
        >
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{step.label}</span>
          <span className={cn("text-xl font-display font-bold", step.highlight ? "text-primary" : "text-foreground")}>
            {step.val}
          </span>
          <span className="text-[10px] text-muted-foreground mt-1">{step.desc}</span>
        </div>
      ))}
    </div>
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
          <div className="text-lg font-display text-muted-foreground">Computing Bayesian posterior…</div>
          <div className="text-xs text-muted-foreground/60">Applying signal LRs × actor adjustments</div>
        </div>
      </AppLayout>
    );
  }
  if (!forecast) {
    return (
      <AppLayout>
        <div className="p-8 text-destructive">Failed to generate forecast. Ensure the case has at least one active signal.</div>
      </AppLayout>
    );
  }

  const actorData =
    forecast.actorAggregation?.map(a => ({
      name: a.actor,
      value: a.netActorEffect,
      fill: a.netActorEffect >= 0 ? "var(--color-success)" : "var(--color-destructive)",
    })) || [];

  const delta = forecast.currentProbability - forecast.priorProbability;
  const cd = caseData as any;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <header className="flex justify-between items-start">
          <div>
            {/* Asset context breadcrumb */}
            <div className="flex items-center flex-wrap gap-2 mb-2">
              <Badge variant="primary">
                <FlaskConical className="w-3 h-3 mr-1 inline" />
                {cd?.assetName || caseData?.primaryBrand || caseId}
              </Badge>
              {cd?.assetType && <Badge variant="default">{cd.assetType}</Badge>}
              {cd?.therapeuticArea && <Badge variant="default">{cd.therapeuticArea}</Badge>}
              {cd?.diseaseState && <span className="text-xs text-muted-foreground">· {cd.diseaseState}</span>}
              {cd?.geography && <span className="text-xs text-muted-foreground">· {cd.geography}</span>}
              {cd?.isDemo === "true" && <Badge variant="default">Demo case</Badge>}
            </div>
            <h1 className="text-2xl font-bold">{caseData?.strategicQuestion}</h1>
            {cd?.outcomeDefinition && (
              <p className="text-sm text-muted-foreground mt-1">Outcome: {cd.outcomeDefinition}</p>
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
          {/* Gauge */}
          <Card className="flex flex-col items-center justify-center py-8 relative overflow-hidden">
            <div className="absolute top-3 right-3">
              <Badge variant={forecast.confidenceLevel === "High" ? "success" : "warning"}>
                {forecast.confidenceLevel} Conf
              </Badge>
            </div>
            <ProbabilityGauge value={forecast.currentProbability} label="Posterior Probability" size={220} />
            <div className="flex items-center gap-4 mt-6 text-sm">
              <div className="text-muted-foreground">
                Prior: <span className="text-foreground font-medium">{(forecast.priorProbability * 100).toFixed(0)}%</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
              <div className="text-muted-foreground">
                Delta:{" "}
                <span className={delta >= 0 ? "text-success font-bold" : "text-destructive font-bold"}>
                  {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </Card>

          {/* Interpretation */}
          <Card className="lg:col-span-2 bg-gradient-to-br from-card to-card/50 border-primary/15">
            <h3 className="text-base font-semibold flex items-center gap-2 mb-5">
              <BrainCircuit className="w-4 h-4 text-primary" />
              Strategic Interpretation
            </h3>
            <div className="space-y-5">
              <div>
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Primary synthesis</div>
                <div className="text-lg font-medium leading-relaxed">{forecast.interpretation?.primaryStatement}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-success/5 border border-success/15 p-4 rounded-xl">
                  <div className="text-xs text-success font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Top Enabler
                  </div>
                  <div className="font-medium text-sm">{forecast.topSupportiveActor || "None identified"}</div>
                </div>
                <div className="bg-destructive/5 border border-destructive/15 p-4 rounded-xl">
                  <div className="text-xs text-destructive font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                    <AlertOctagon className="w-3 h-3" /> Top Constrainer
                  </div>
                  <div className="font-medium text-sm">{forecast.topConstrainingActor || "None identified"}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Recommended action</div>
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
            Bayesian Computation Chain — Prior Odds × Signal LR Product × Actor Adjustment = Posterior Odds
          </h3>
          <BayesianChain
            prior={forecast.priorOdds || 0}
            lr={forecast.signalLrProduct || 1}
            actors={forecast.actorAdjustmentFactor || 1}
            posterior={forecast.posteriorOdds || 0}
          />
        </div>

        {/* Actor breakdown + signals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-base font-semibold flex items-center gap-2 mb-5">
              <Users className="w-4 h-4 text-accent" />
              Actor Reaction Profile
            </h3>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={actorData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <XAxis type="number" domain={[-1, 1]} hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={150}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "8px" }}
                    formatter={(val: number) => [val.toFixed(3), "Net actor effect"]}
                  />
                  <ReferenceLine x={0} stroke="var(--color-border)" />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {actorData.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h3 className="text-base font-semibold mb-4">Driving Signals</h3>
            <div className="space-y-2.5">
              {forecast.signalDetails?.slice(0, 5).map(sig => (
                <div
                  key={sig.signalId}
                  className="flex items-center justify-between p-3 bg-background border border-border rounded-lg gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-muted-foreground font-mono mb-0.5">{sig.signalId}</div>
                    <div className="text-sm font-medium truncate" title={sig.description}>{sig.description}</div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <Badge variant={sig.direction === "Positive" ? "success" : "danger"}>
                      LR {sig.likelihoodRatio.toFixed(2)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      Actor adj: {sig.weightedActorReaction?.toFixed(3)}
                    </span>
                  </div>
                </div>
              ))}
              {(!forecast.signalDetails || forecast.signalDetails.length === 0) && (
                <div className="text-center py-6 text-muted-foreground text-sm">No signals yet — add signals via the Signal Register.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
