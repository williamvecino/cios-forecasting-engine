import { useState } from "react";
import { useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  BookMarked,
  Send,
  ChevronRight,
  Library,
  Lightbulb,
  ShieldAlert,
  AlertTriangle,
  ThumbsDown,
  ThumbsUp,
  EyeOff,
  Crosshair,
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
  const queryClient = useQueryClient();

  const [showOutcome, setShowOutcome] = useState(false);
  const [outcomeRate, setOutcomeRate] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [outcomeSaved, setOutcomeSaved] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  const { mutate: saveOutcome, isPending: savingOutcome } = useMutation({
    mutationFn: () =>
      fetch(`/api/cases/${caseId}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualAdoptionRate: outcomeRate ? Number(outcomeRate) : undefined, actualOutcomeNotes: outcomeNotes }),
      }).then((r) => r.json()),
    onSuccess: () => { setOutcomeSaved(true); queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}`] }); },
  });

  const { mutate: publishToLibrary, isPending: publishing } = useMutation({
    mutationFn: () =>
      fetch(`/api/cases/${caseId}/publish-to-library`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => setPublishMsg("Published to Case Library — this case is now available as an analog for future forecasts."),
    onError: () => setPublishMsg("Publish failed. Please try again."),
  });

  const { data: analogContext } = useQuery<any>({
    queryKey: [`/api/cases/${caseId}/analog-context`],
    queryFn: () => fetch(`/api/cases/${caseId}/analog-context`).then((r) => r.json()),
    enabled: Boolean(caseId),
    staleTime: 60_000,
  });

  const { data: simulation } = useQuery<any>({
    queryKey: [`/api/cases/${caseId}/simulation`],
    queryFn: () => fetch(`/api/cases/${caseId}/simulation`).then((r) => r.json()),
    enabled: Boolean(caseId),
    staleTime: 60_000,
  });

  const { data: questions } = useQuery<any>({
    queryKey: [`/api/cases/${caseId}/questions`],
    queryFn: () => fetch(`/api/cases/${caseId}/questions`).then((r) => r.json()),
    enabled: Boolean(caseId),
    staleTime: 60_000,
    retry: false,
  });

  const { data: challenge } = useQuery<any>({
    queryKey: [`/api/cases/${caseId}/challenge`],
    queryFn: () => fetch(`/api/cases/${caseId}/challenge`).then((r) => r.json()),
    enabled: Boolean(caseId),
    staleTime: 60_000,
    retry: false,
  });

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

        {/* Analog Context */}
        {analogContext && (analogContext.matchCount > 0 || analogContext.calibratedCount > 0) && (
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <BookMarked className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Analog Case Context</span>
              <Badge variant="default" className="ml-auto text-[10px]">
                {analogContext.matchCount} analog{analogContext.matchCount !== 1 ? "s" : ""} · {analogContext.derivedEvidenceType}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Historical cases matched on therapy area, specialty, product type, and evidence profile.
              {analogContext.calibratedCount > 0
                ? ` ${analogContext.calibratedCount} calibrated analog${analogContext.calibratedCount !== 1 ? "s" : ""} with observed outcomes inform the scenario range.`
                : " No calibrated outcome data yet — scenario frames will populate as outcomes are recorded."}
            </p>

            {/* Scenario frames */}
            {(analogContext.scenarios?.optimistic || analogContext.scenarios?.base || analogContext.scenarios?.pessimistic) && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { key: "optimistic", label: "Optimistic", color: "text-success", bg: "bg-success/8 border-success/20" },
                  { key: "base", label: "Base Case", color: "text-primary", bg: "bg-primary/5 border-primary/20" },
                  { key: "pessimistic", label: "Pessimistic", color: "text-amber-500", bg: "bg-amber-500/8 border-amber-500/20" },
                ].map(({ key, label, color, bg }) => {
                  const frame = analogContext.scenarios[key];
                  if (!frame) return (
                    <div key={key} className={cn("border rounded-xl p-3.5", bg)}>
                      <p className={cn("text-[10px] uppercase tracking-wider font-semibold mb-1", color)}>{label}</p>
                      <p className="text-xs text-muted-foreground/60 italic">No calibrated data yet</p>
                    </div>
                  );
                  return (
                    <div key={key} className={cn("border rounded-xl p-3.5", bg)}>
                      <p className={cn("text-[10px] uppercase tracking-wider font-semibold mb-1", color)}>{label}</p>
                      <p className={cn("text-2xl font-display font-bold", color)}>
                        {frame.probability?.toFixed(0) ?? "—"}%
                      </p>
                      {frame.analogCaseId && (
                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          from {frame.analogCaseId} · {frame.similarityScore?.toFixed(0)}pts match
                        </p>
                      )}
                      {frame.sampleSize && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {frame.sampleSize} analog{frame.sampleSize !== 1 ? "s" : ""}
                        </p>
                      )}
                      {frame.rationale && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed mt-2 line-clamp-3">
                          {frame.rationale}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Top analog matches */}
            {analogContext.topMatches?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                  Top Matched Analogs
                </p>
                {analogContext.topMatches.map((m: any) => (
                  <div key={m.caseId} className="flex items-start justify-between gap-3 p-3 bg-background border border-border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-semibold">{m.caseId}</span>
                        <Badge variant={m.confidenceBand === "High" ? "success" : m.confidenceBand === "Moderate" ? "warning" : "default"} className="text-[9px]">
                          {m.confidenceBand}
                        </Badge>
                        {m.therapyArea && <span className="text-[10px] text-muted-foreground">{m.therapyArea}</span>}
                      </div>
                      {m.matchedDimensions?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {m.matchedDimensions.slice(0, 3).map((dim: string, i: number) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-success/8 text-success border border-success/15">
                              ✓ {dim}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground leading-relaxed mt-1.5 line-clamp-2">
                        {m.adoptionLesson}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-display font-bold text-primary">{m.similarityScore.toFixed(0)}</div>
                      <div className="text-[10px] text-muted-foreground">/ 100 pts</div>
                      {m.finalProbability !== null && m.finalProbability !== undefined && (
                        <div className="text-xs font-semibold mt-1">{(Number(m.finalProbability) * 100).toFixed(0)}% final</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Stakeholder Dynamics */}
        {simulation && simulation.agentResults?.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Stakeholder Dynamics</span>
              {simulation.agentDerivedActorTranslation !== undefined && (
                <Badge variant="default" className="ml-auto text-[10px]">
                  Agent translation: ×{simulation.agentDerivedActorTranslation.toFixed(3)}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Cross-stakeholder influence dynamics from the last agent simulation. Peer-stakeholder effects are applied on top of signal-driven stances.
            </p>

            {/* Bayesian vs Agent translation comparison */}
            {simulation.agentDerivedActorTranslation !== undefined && forecast.bayesianActorFactor !== undefined && (
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="border border-border rounded-xl p-3.5 bg-background">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Bayesian actor translation</p>
                  <p className="text-2xl font-display font-bold">×{Number(forecast.bayesianActorFactor).toFixed(3)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">From signal-weighted actor reactions</p>
                  {forecast.actorSource === "bayesian-static" && (
                    <span className="inline-block mt-2 text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold">
                      ← Used in posterior
                    </span>
                  )}
                </div>
                <div className={cn(
                  "border rounded-xl p-3.5",
                  simulation.agentDerivedActorTranslation > Number(forecast.bayesianActorFactor)
                    ? "border-success/30 bg-success/5"
                    : simulation.agentDerivedActorTranslation < Number(forecast.bayesianActorFactor) * 0.95
                    ? "border-amber-400/30 bg-amber-400/5"
                    : "border-border bg-background"
                )}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Agent-derived translation</p>
                  <p className="text-2xl font-display font-bold">×{simulation.agentDerivedActorTranslation.toFixed(3)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {simulation.agentDerivedActorTranslation > Number(forecast.bayesianActorFactor) + 0.01
                      ? "Agent dynamics suggest upward pressure on adoption"
                      : simulation.agentDerivedActorTranslation < Number(forecast.bayesianActorFactor) - 0.01
                      ? "Agent dynamics suggest headwinds not captured by signals alone"
                      : "Agent dynamics broadly confirm signal-based forecast"}
                  </p>
                  {forecast.actorSource === "agent-simulation" && (
                    <span className="inline-block mt-2 text-[9px] px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-semibold">
                      ← Used in posterior
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Agent stances summary — prescribers only */}
            <div className="space-y-2">
              {simulation.agentResults
                .filter((a: any) => ["academic_specialist", "community_specialist", "inpatient_prescriber"].includes(a.agentId))
                .map((agent: any) => {
                  const hasInfluence = (agent.influenceAnnotations ?? []).length > 0;
                  const delta = agent.baseReactionScore !== undefined
                    ? agent.reactionScore - agent.baseReactionScore
                    : 0;
                  return (
                    <div key={agent.agentId} className="flex items-start justify-between gap-3 p-3 bg-background border border-border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{agent.label}</span>
                          {hasInfluence && Math.abs(delta) > 0.01 && (
                            <span className={cn(
                              "text-[10px] font-mono font-semibold",
                              delta > 0 ? "text-success" : "text-amber-500"
                            )}>
                              {delta > 0 ? "↑" : "↓"} {delta > 0 ? "+" : ""}{delta.toFixed(2)} from peers
                            </span>
                          )}
                        </div>
                        {(agent.influenceAnnotations ?? []).slice(0, 2).map((ann: any, i: number) => (
                          <p key={i} className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                            {ann.fromLabel}: {ann.label}
                          </p>
                        ))}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-semibold">
                          {agent.reactionScore > 0 ? "+" : ""}{agent.reactionScore.toFixed(2)}
                        </span>
                        <p className="text-[10px] text-muted-foreground capitalize">
                          {agent.stance.replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        )}

        {/* Strategic Questions */}
        {questions && questions.questions?.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold">Strategic Questions</span>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {questions.questions.length} questions generated
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Next-step intelligence questions derived from this forecast. Each is generated from a specific pattern in the model — not general prompts.
            </p>
            <div className="space-y-3">
              {questions.questions.map((q: any, i: number) => (
                <div key={i} className={cn(
                  "p-4 rounded-xl border",
                  q.urgency === "high"
                    ? "border-amber-400/40 bg-amber-400/5"
                    : "border-border bg-background"
                )}>
                  <div className="flex items-start gap-2 mb-2">
                    <span className={cn(
                      "shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border mt-0.5",
                      q.urgency === "high"
                        ? "bg-amber-400/15 border-amber-400/30 text-amber-600"
                        : "bg-muted border-border text-muted-foreground"
                    )}>
                      {q.urgency}
                    </span>
                    <p className="text-sm font-medium leading-snug">{q.question}</p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-10">{q.why}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Forecast Challenge */}
        {challenge && !challenge.error && (
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-destructive" />
              <span className="text-sm font-semibold">Forecast Challenge</span>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {(challenge.forecastProbability * 100).toFixed(0)}% challenged
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Structured challenge of the current forecast. Read both sides before acting on the number.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Too Optimistic */}
              <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <ThumbsDown className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-xs font-semibold text-destructive uppercase tracking-wider">Case: Too Optimistic</span>
                </div>
                <p className="text-xs font-medium mb-3 leading-snug">{challenge.tooOptimistic?.claim}</p>
                <ul className="space-y-1.5">
                  {(challenge.tooOptimistic?.evidence ?? []).map((e: string, i: number) => (
                    <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <span className="shrink-0 text-destructive mt-0.5">•</span>
                      {e}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Too Pessimistic */}
              <div className="p-4 rounded-xl border border-success/20 bg-success/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <ThumbsUp className="w-3.5 h-3.5 text-success" />
                  <span className="text-xs font-semibold text-success uppercase tracking-wider">Case: Too Pessimistic</span>
                </div>
                <p className="text-xs font-medium mb-3 leading-snug">{challenge.tooPessimistic?.claim}</p>
                <ul className="space-y-1.5">
                  {(challenge.tooPessimistic?.evidence ?? []).map((e: string, i: number) => (
                    <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <span className="shrink-0 text-success mt-0.5">•</span>
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Missing Evidence */}
            {challenge.missingEvidence?.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Missing Evidence</span>
                </div>
                <div className="space-y-2">
                  {challenge.missingEvidence.map((me: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg border border-border bg-background">
                      <p className="text-xs font-semibold mb-0.5">{me.domain}</p>
                      <p className="text-[11px] text-muted-foreground">{me.reason}</p>
                      {me.estimatedImpact && (
                        <p className="text-[11px] text-amber-600 mt-1 font-medium">{me.estimatedImpact}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fragile Assumption */}
            {challenge.fragileAssumption && (
              <div className="p-4 rounded-xl border border-amber-400/30 bg-amber-400/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Crosshair className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Most Fragile Assumption</span>
                </div>
                <p className="text-xs font-medium mb-1">{challenge.fragileAssumption.assumption}</p>
                <p className="text-[11px] text-muted-foreground mb-1">
                  <span className="font-semibold">Breaking condition:</span> {challenge.fragileAssumption.breakingCondition}
                </p>
                <p className="text-[11px] text-amber-700 font-medium">{challenge.fragileAssumption.probabilityShiftIfBroken}</p>
              </div>
            )}
          </Card>
        )}

        {/* Outcome Recording */}
        <Card>
          <button
            onClick={() => setShowOutcome((v) => !v)}
            className="w-full flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="text-sm font-semibold">Record Outcome</span>
              <span className="text-xs text-muted-foreground">Log actual results and publish to Case Library</span>
            </div>
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", showOutcome && "rotate-90")} />
          </button>

          {showOutcome && (
            <div className="mt-4 pt-4 border-t border-border space-y-4">
              {publishMsg && (
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs border",
                  publishMsg.includes("failed")
                    ? "bg-destructive/10 border-destructive/30 text-destructive"
                    : "bg-success/10 border-success/30 text-success"
                )}>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  {publishMsg}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Actual adoption rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="e.g. 62"
                    value={outcomeRate}
                    onChange={(e) => setOutcomeRate(e.target.value)}
                    className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Forecast accuracy note</label>
                  <input
                    type="text"
                    placeholder="e.g. Faster uptake than expected in community"
                    value={outcomeNotes}
                    onChange={(e) => setOutcomeNotes(e.target.value)}
                    className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={() => saveOutcome()}
                  disabled={savingOutcome || (!outcomeRate && !outcomeNotes)}
                  className="gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {outcomeSaved ? "Outcome saved" : savingOutcome ? "Saving…" : "Save Outcome"}
                </Button>
                {outcomeSaved && !publishMsg && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => publishToLibrary()}
                    disabled={publishing}
                    className="gap-1.5"
                  >
                    <BookMarked className="w-3.5 h-3.5" />
                    {publishing ? "Publishing…" : "Publish to Case Library"}
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  Publishing saves this case as an analog for future forecasts.
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
