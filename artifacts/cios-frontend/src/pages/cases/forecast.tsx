import { useRoute } from "wouter";
import { useRunForecast, useGetCase } from "@workspace/api-client-react";
import { AppLayout, cn } from "@/components/layout";
import { Card, Badge, ProbabilityGauge, Button } from "@/components/ui-components";
import { ArrowRight, BrainCircuit, Users, CheckCircle2, AlertOctagon, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

function BayesianChain({ prior, lr, actors, posterior }: { prior: number, lr: number, actors: number, posterior: number }) {
  return (
    <div className="flex items-center justify-between bg-background border border-border rounded-2xl p-6 relative">
      <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-border via-primary/30 to-border -translate-y-1/2 z-0" />
      
      {[
        { label: "Prior Odds", val: prior.toFixed(2), desc: "Baseline" },
        { label: "Signal LR", val: `× ${lr.toFixed(2)}`, desc: "Evidence Multiplier", highlight: true },
        { label: "Actor Adj.", val: `× ${actors.toFixed(2)}`, desc: "Behavioral Factor", highlight: true },
        { label: "Posterior Odds", val: posterior.toFixed(2), desc: "Final Odds" }
      ].map((step, i) => (
        <div key={i} className="relative z-10 flex flex-col items-center bg-card p-4 rounded-xl border border-border shadow-lg min-w-[120px]">
          <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{step.label}</span>
          <span className={cn("text-2xl font-display font-bold", step.highlight ? "text-primary" : "text-foreground")}>{step.val}</span>
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

  if (isLoading) return <AppLayout><div className="flex flex-col items-center justify-center h-[60vh] space-y-4"><BrainCircuit className="w-12 h-12 text-primary animate-pulse" /><div className="text-lg font-display text-muted-foreground">Engine calculating Bayesian posterior...</div></div></AppLayout>;
  if (!forecast) return <AppLayout><div className="p-8 text-destructive">Failed to generate forecast. Ensure case has active signals.</div></AppLayout>;

  const actorData = forecast.actorAggregation?.map(a => ({
    name: a.actor,
    value: a.netActorEffect,
    fill: a.netActorEffect >= 0 ? 'var(--color-success)' : 'var(--color-destructive)'
  })) || [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="primary">FCAST ENGINE</Badge>
              <span className="text-sm font-medium text-muted-foreground">{caseId} | {caseData?.primaryBrand}</span>
            </div>
            <h1 className="text-3xl font-bold">{caseData?.strategicQuestion}</h1>
          </div>
          <Button variant="outline" className="gap-2"><Download className="w-4 h-4"/> Export Report</Button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Output Gauge */}
          <Card className="flex flex-col items-center justify-center py-8 relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <Badge variant={forecast.confidenceLevel === 'High' ? 'success' : 'warning'}>{forecast.confidenceLevel} Conf</Badge>
            </div>
            <ProbabilityGauge value={forecast.currentProbability} label="Posterior Probability" size={240} />
            
            <div className="flex items-center gap-4 mt-8 text-sm">
              <div className="text-muted-foreground">Prior: <span className="text-foreground font-medium">{(forecast.priorProbability * 100).toFixed(0)}%</span></div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/50" />
              <div className="text-muted-foreground">Delta: <span className={forecast.currentProbability >= forecast.priorProbability ? "text-success font-bold" : "text-destructive font-bold"}>
                {((forecast.currentProbability - forecast.priorProbability) * 100) > 0 ? '+' : ''}{((forecast.currentProbability - forecast.priorProbability) * 100).toFixed(1)}%
              </span></div>
            </div>
          </Card>

          {/* Interpretation Block */}
          <Card className="lg:col-span-2 bg-gradient-to-br from-card to-card/50 border-primary/20">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
              <BrainCircuit className="w-5 h-5 text-primary" />
              Strategic Interpretation
            </h3>
            
            <div className="space-y-6">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Primary Synthesis</div>
                <div className="text-xl font-medium leading-relaxed">{forecast.interpretation?.primaryStatement}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-success/5 border border-success/10 p-4 rounded-xl">
                  <div className="text-xs text-success font-semibold uppercase tracking-wider mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Top Supporter</div>
                  <div className="font-medium">{forecast.topSupportiveActor || 'None identified'}</div>
                </div>
                <div className="bg-destructive/5 border border-destructive/10 p-4 rounded-xl">
                  <div className="text-xs text-destructive font-semibold uppercase tracking-wider mb-1 flex items-center gap-1"><AlertOctagon className="w-3 h-3"/> Top Constrainer</div>
                  <div className="font-medium">{forecast.topConstrainingActor || 'None identified'}</div>
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-1">Recommended Action</div>
                <div className="bg-muted/30 p-3 rounded-lg border border-border/50 text-sm font-medium">
                  {forecast.interpretation?.recommendedAction || 'Monitor signals.'}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Bayesian Math Visualization */}
        <div className="py-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-2">Bayesian Computation Chain</h3>
          <BayesianChain 
            prior={forecast.priorOdds || 0} 
            lr={forecast.signalLrProduct || 1} 
            actors={forecast.actorAdjustmentFactor || 1} 
            posterior={forecast.posteriorOdds || 0} 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Actor Breakdown */}
          <Card>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
              <Users className="w-5 h-5 text-accent" />
              Actor Reaction Profile
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={actorData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <XAxis type="number" domain={[-1, 1]} hide />
                  <YAxis dataKey="name" type="category" width={140} tick={{fill: 'var(--color-muted-foreground)', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                    formatter={(val: number) => [val.toFixed(3), 'Net Effect']}
                  />
                  <ReferenceLine x={0} stroke="var(--color-border)" />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {actorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Top Signals */}
          <Card>
            <h3 className="text-lg font-semibold mb-4">Driving Signals</h3>
            <div className="space-y-3">
              {forecast.signalDetails?.slice(0, 4).map(sig => (
                <div key={sig.signalId} className="flex items-center justify-between p-3 bg-background border border-border rounded-lg">
                  <div className="flex-1 truncate pr-4">
                    <div className="text-xs text-muted-foreground font-mono mb-0.5">{sig.signalId}</div>
                    <div className="text-sm font-medium truncate" title={sig.description}>{sig.description}</div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <Badge variant={sig.direction === 'Positive' ? 'success' : 'danger'}>LR: {sig.likelihoodRatio.toFixed(2)}</Badge>
                    <span className="text-[10px] text-muted-foreground">Actor Adj: {sig.weightedActorReaction?.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
